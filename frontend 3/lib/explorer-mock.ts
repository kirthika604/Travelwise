// ---------------------------------------------------------------------------
// Explorer Passport — pure scoring / leveling logic. Given a list of visits
// (now sourced from Supabase, see lib/explorer-store.ts), computes the score,
// streak, and level. Kept as pure functions of VisitRecord[] so this math
// doesn't care where the visits actually came from.
//
// Level is a single, universal progression driven purely by points — it does
// NOT vary by vibe/category. Which category you've leaned into is separate,
// informational data (topCategory/categoryBreakdown), shown alongside the
// level rather than baked into its name or its own leveling track.
// ---------------------------------------------------------------------------

import { haversineKm } from "./geo";
import type { ExplorerScore, VisitRecord } from "./explorer-types";

// Generous on purpose — phone GPS drifts, especially indoors at a demo venue.
// This is the "proof of visit" radius: within this of the place's real
// coordinates counts as a legitimate check-in.
export const MAX_CHECKIN_DISTANCE_KM = 2;

// Same radius used to auto-detect "you're standing near a known place" during
// a custom check-in (see AddMemorySheet.tsx) — a little tighter than the
// check-in tolerance above since this decides an identity match, not just a
// GPS-drift allowance.
export const NEARBY_KNOWN_PLACE_RADIUS_KM = 1.5;

const POINTS_PER_NEW_PLACE = 10;
const POINTS_PER_REVISIT = 2;
const POINTS_PER_NEW_CATEGORY = 5;

interface LevelDef {
  level: number;
  pointsRequired: number;
  badge: string;
}

// A single generic badge track, purely a function of points. Deliberately a
// slower climb than the earlier draft — a couple of check-ins gets Level 1,
// but reaching "Legend" takes a genuinely broad, repeated exploration
// history rather than a handful of stops.
const LEVELS: LevelDef[] = [
  { level: 1, pointsRequired: 25, badge: "Explorer" },
  { level: 2, pointsRequired: 75, badge: "Adventurer" },
  { level: 3, pointsRequired: 150, badge: "Voyager" },
  { level: 4, pointsRequired: 260, badge: "Trailblazer" },
  { level: 5, pointsRequired: 400, badge: "Globetrotter" },
  { level: 6, pointsRequired: 600, badge: "Legend" },
];
const LEVEL_STEP_POINTS_BEYOND_TABLE = 200;

function levelForPoints(points: number): { level: number; badge: string; pointsToNextLevel: number | null; levelFloorPoints: number; levelCeilPoints: number } {
  let current = { level: 0, pointsRequired: 0, badge: "Newcomer" };
  for (const def of LEVELS) {
    if (points >= def.pointsRequired) current = def;
    else
      return {
        level: current.level,
        badge: current.badge,
        pointsToNextLevel: def.pointsRequired - points,
        levelFloorPoints: current.pointsRequired,
        levelCeilPoints: def.pointsRequired,
      };
  }

  // Past the table: keep leveling formulaically, badge stays "Legend".
  const last = LEVELS[LEVELS.length - 1];
  const stepsBeyond = Math.floor((points - last.pointsRequired) / LEVEL_STEP_POINTS_BEYOND_TABLE);
  const level = last.level + stepsBeyond;
  const floor = last.pointsRequired + stepsBeyond * LEVEL_STEP_POINTS_BEYOND_TABLE;
  const ceil = floor + LEVEL_STEP_POINTS_BEYOND_TABLE;
  return { level, badge: last.badge, pointsToNextLevel: ceil - points, levelFloorPoints: floor, levelCeilPoints: ceil };
}

// Consecutive local-calendar days (by visit createdAt) with a check-in,
// counted backward from the most recent visit's day — a streak stays alive
// until a full day is skipped, it doesn't require checking in "today".
function computeStreakDays(visits: VisitRecord[]): number {
  if (visits.length === 0) return 0;

  const days = new Set(visits.map((v) => v.createdAt.slice(0, 10)));
  const sorted = [...days].sort().reverse(); // "YYYY-MM-DD" strings, most recent first

  // Pure UTC-string arithmetic throughout (explicit "Z" + ms subtraction) —
  // never mixes a UTC-parsed date with local getters, which would otherwise
  // silently miscount near local midnight depending on the runtime's timezone.
  let streak = 1;
  let cursorMs = Date.parse(`${sorted[0]}T00:00:00Z`);
  for (let i = 1; i < sorted.length; i++) {
    cursorMs -= 24 * 60 * 60 * 1000;
    const expected = new Date(cursorMs).toISOString().slice(0, 10);
    if (sorted[i] === expected) streak += 1;
    else break;
  }
  return streak;
}

// A visit's "place identity" for de-duplication: its real catalog id when
// known, or its own visit id when genuinely custom (each custom spot is its
// own distinct place — they must never collapse into a single bucket just
// because they all happen to share a null placeId).
function placeKeyOf(v: VisitRecord): string {
  return v.placeId != null ? `p:${v.placeId}` : `v:${v.id}`;
}

// Each different place actually visited, once, in the order first visited —
// the same de-duplication `scoreFromVisits` uses for its distance math.
// Exported so the passport map can draw the exact path the distance number
// represents, instead of the two silently drifting apart over time.
export function uniqueVisitsInOrder(visits: VisitRecord[]): VisitRecord[] {
  const seenKeys = new Set<string>();
  return [...visits]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter((v) => {
      const key = placeKeyOf(v);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
}

export function scoreFromVisits(visits: VisitRecord[]): ExplorerScore {
  const placeKeys = new Set<string>();
  const categoryBreakdown: Record<string, number> = {};
  let revisits = 0;

  for (const v of visits) {
    const key = placeKeyOf(v);
    if (placeKeys.has(key)) revisits += 1;
    placeKeys.add(key);
    categoryBreakdown[v.category] = (categoryBreakdown[v.category] ?? 0) + 1;
  }

  const placesVisited = placeKeys.size;
  const categoriesExplored = Object.keys(categoryBreakdown).length;
  const score = placesVisited * POINTS_PER_NEW_PLACE + revisits * POINTS_PER_REVISIT + categoriesExplored * POINTS_PER_NEW_CATEGORY;

  let topCategory: string | null = null;
  let topCount = 0;
  for (const [category, count] of Object.entries(categoryBreakdown)) {
    if (count > topCount) {
      topCategory = category;
      topCount = count;
    }
  }

  // "Amount of traveling" — a separate, informational stat (not tied to
  // leveling): the real path length hopping between each different place
  // actually visited, in the order visited. Scales with how many different
  // places were hopped to, not a fixed round-trip from one center point.
  const uniqueInOrder = uniqueVisitsInOrder(visits);
  let totalDistanceKm = 0;
  for (let i = 1; i < uniqueInOrder.length; i++) {
    totalDistanceKm += haversineKm(
      { latitude: uniqueInOrder[i - 1].latitude, longitude: uniqueInOrder[i - 1].longitude },
      { latitude: uniqueInOrder[i].latitude, longitude: uniqueInOrder[i].longitude },
    );
  }

  const streakDays = computeStreakDays(visits);
  const { level, badge, pointsToNextLevel } = levelForPoints(score);

  return {
    score,
    placesVisited,
    categoriesExplored,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    topCategory,
    categoryBreakdown,
    streakDays,
    level,
    levelName: badge,
    pointsToNextLevel,
  };
}

// For the level progress bar: how far score sits between this level's floor
// and the next level's ceiling, as a 0-100 percentage.
export function levelProgressPercent(score: number): number {
  const { levelFloorPoints, levelCeilPoints } = levelForPoints(score);
  if (levelCeilPoints <= levelFloorPoints) return 100;
  const pct = ((score - levelFloorPoints) / (levelCeilPoints - levelFloorPoints)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function isCustomVisit(v: Pick<VisitRecord, "isCustom">): boolean {
  return v.isCustom;
}
