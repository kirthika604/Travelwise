// ---------------------------------------------------------------------------
// Explorer Passport state (Zustand, backed by Supabase's `visits` table —
// see lib/supabase.ts for the client and the `create_visits_table` migration
// for the schema). Visits are tied to the authenticated user (RLS enforces
// this server-side too), not an anonymous device id.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import type { CheckInInput, ExplorerScore, VisitRecord } from "./explorer-types";
import { scoreFromVisits, MAX_CHECKIN_DISTANCE_KM } from "./explorer-mock";
import { haversineKm } from "./geo";
import { supabase } from "./supabase";

type CheckInOutcome = { ok: true; isNewPlace: boolean } | { ok: false; error: string };
type DeleteOutcome = { ok: true } | { ok: false; error: string };

const DEFAULT_SCORE: ExplorerScore = {
  score: 0,
  placesVisited: 0,
  categoriesExplored: 0,
  totalDistanceKm: 0,
  topCategory: null,
  categoryBreakdown: {},
  streakDays: 0,
  level: 0,
  levelName: "Newcomer",
  pointsToNextLevel: 10,
};

interface ExplorerState {
  visits: VisitRecord[];
  score: ExplorerScore;
  isLoaded: boolean;
  isCheckingIn: boolean;
  pendingLevelUp: ExplorerScore | null;
  hasVisited: (placeId: number) => boolean;
  loadVisits: () => Promise<void>;
  checkIn: (req: CheckInInput) => Promise<CheckInOutcome>;
  deleteVisit: (id: string) => Promise<DeleteOutcome>;
  dismissLevelUp: () => void;
  reset: () => void;
}

interface VisitRow {
  id: string;
  place_id: number | null;
  place_name: string;
  category: string;
  latitude: number;
  longitude: number;
  note: string | null;
  photo_data_url: string | null;
  is_custom: boolean;
  created_at: string;
}

// Defense-in-depth on the way into Supabase — nothing here renders via
// dangerouslySetInnerHTML today (note/placeName are always plain React
// text, see app/passport/page.tsx), so this isn't closing an active XSS
// hole, but a free-text field with no cap at all is still worth bounding
// before it becomes a database row.
const MAX_TEXT_LENGTH = 500;

function sanitizeText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, MAX_TEXT_LENGTH);
}

// Only ever produced by CameraCapture.tsx's canvas.toDataURL("image/jpeg", ...)
// — reject anything that doesn't match that shape rather than trust a
// free-form string all the way into a stored column, and cap size so one
// memory can't balloon the table (CameraCapture already downscales to keep
// well under this).
const MAX_PHOTO_DATA_URL_LENGTH = 4_000_000; // ~3MB decoded
const PHOTO_DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

function sanitizePhotoDataUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.length > MAX_PHOTO_DATA_URL_LENGTH) return null;
  if (!PHOTO_DATA_URL_PATTERN.test(url)) return null;
  return url;
}

function rowToVisit(row: VisitRow): VisitRecord {
  return {
    id: row.id,
    placeId: row.place_id,
    placeName: row.place_name,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    note: row.note ?? "",
    photoDataUrl: row.photo_data_url,
    isCustom: row.is_custom,
    createdAt: row.created_at,
  };
}

export const useExplorer = create<ExplorerState>()((set, get) => ({
  visits: [],
  score: DEFAULT_SCORE,
  isLoaded: false,
  isCheckingIn: false,
  pendingLevelUp: null,

  hasVisited: (placeId) => get().visits.some((v) => v.placeId === placeId),

  dismissLevelUp: () => set({ pendingLevelUp: null }),

  reset: () => set({ visits: [], score: DEFAULT_SCORE, isLoaded: false, pendingLevelUp: null }),

  loadVisits: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      set({ visits: [], score: DEFAULT_SCORE, isLoaded: true });
      return;
    }
    const { data, error } = await supabase
      .from("visits")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });

    const visits = !error && data ? (data as VisitRow[]).map(rowToVisit) : [];
    set({ visits, score: scoreFromVisits(visits), isLoaded: true });
  },

  checkIn: async (req) => {
    set({ isCheckingIn: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Sign in to save a memory.");

      // Known-place check-ins still get the proximity check custom spots
      // don't need (their geotag IS the location, nothing to be far from).
      if (!req.isCustom && req.userLatitude != null && req.userLongitude != null) {
        const dist = haversineKm(
          { latitude: req.userLatitude, longitude: req.userLongitude },
          { latitude: req.placeLatitude, longitude: req.placeLongitude },
        );
        if (dist > MAX_CHECKIN_DISTANCE_KM) {
          throw new Error(
            `You're ${dist.toFixed(1)} km away — get within ${MAX_CHECKIN_DISTANCE_KM} km of ${req.placeName} to check in.`,
          );
        }
      }

      const prevLevel = get().score.level;
      const isNewPlace = req.placeId != null ? !get().visits.some((v) => v.placeId === req.placeId) : true;

      const { data, error } = await supabase
        .from("visits")
        .insert({
          user_id: user.id,
          place_id: req.placeId,
          place_name: sanitizeText(req.placeName),
          category: sanitizeText(req.category),
          latitude: req.placeLatitude,
          longitude: req.placeLongitude,
          note: sanitizeText(req.note),
          photo_data_url: sanitizePhotoDataUrl(req.photoDataUrl),
          is_custom: req.isCustom,
        })
        .select()
        .single();
      if (error) throw error;

      const visit = rowToVisit(data as VisitRow);
      const nextVisits = [visit, ...get().visits];
      const nextScore = scoreFromVisits(nextVisits);
      const leveledUp = nextScore.level > prevLevel;
      set({
        visits: nextVisits,
        score: nextScore,
        isCheckingIn: false,
        ...(leveledUp ? { pendingLevelUp: nextScore } : {}),
      });
      return { ok: true, isNewPlace };
    } catch (e) {
      set({ isCheckingIn: false });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  // Removing a memory can only ever bring a place's score/level down, never
  // trigger a level-up celebration — so this just re-scores from what's left.
  deleteVisit: async (id) => {
    const { error } = await supabase.from("visits").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    const nextVisits = get().visits.filter((v) => v.id !== id);
    set({ visits: nextVisits, score: scoreFromVisits(nextVisits) });
    return { ok: true };
  },
}));
