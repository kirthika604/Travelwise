// ---------------------------------------------------------------------------
// Explorer Passport — types for the check-in / memory-map feature.
// Deliberately separate from lib/types.ts: this module has no dependency on
// the Discovery/Combination/Routing types and can be lifted out wholesale.
// Backed by Supabase's `visits` table (see lib/explorer-store.ts for the
// row <-> VisitRecord mapping) — these are the camelCase, app-facing shapes.
// ---------------------------------------------------------------------------

export interface VisitRecord {
  id: string;
  placeId: number | null; // a real catalog id when known (selected or proximity-matched); null when genuinely custom
  placeName: string;
  category: string;
  latitude: number;
  longitude: number;
  note: string;
  photoDataUrl: string | null;
  isCustom: boolean;
  createdAt: string; // ISO
}

export interface ExplorerScore {
  score: number;
  placesVisited: number;
  categoriesExplored: number;
  totalDistanceKm: number;

  // A single, vibe-independent progression — level/badge scale purely with
  // `score`. topCategory/categoryBreakdown are separate, informational only.
  topCategory: string | null;
  categoryBreakdown: Record<string, number>;
  streakDays: number;
  level: number;
  levelName: string;
  pointsToNextLevel: number | null;
}

export interface CheckInInput {
  placeId: number | null;
  placeName: string;
  category: string;
  placeLatitude: number;
  placeLongitude: number;
  userLatitude: number | null;
  userLongitude: number | null;
  note: string;
  photoDataUrl: string | null;
  isCustom: boolean;
}
