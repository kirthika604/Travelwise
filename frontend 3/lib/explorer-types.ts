// ---------------------------------------------------------------------------
// Explorer Passport — types for the check-in / memory-map feature.
// Deliberately separate from lib/types.ts: this module has no dependency on
// the Discovery/Combination/Routing types and can be lifted out wholesale.
// ---------------------------------------------------------------------------

export interface VisitRecord {
  id: string;
  placeId: number;
  placeName: string;
  category: string;
  latitude: number;
  longitude: number;
  note: string;
  photoDataUrl: string | null;
  createdAt: string; // ISO
}

export interface ExplorerScore {
  score: number;
  placesVisited: number;
  categoriesExplored: number;
  totalDistanceKm: number;
}

export interface CheckInRequest {
  deviceId: string;
  placeId: number;
  placeName: string;
  category: string;
  placeLatitude: number;
  placeLongitude: number;
  userLatitude: number | null;
  userLongitude: number | null;
  note: string;
  photoDataUrl: string | null;
}

export interface CheckInResult {
  visit: VisitRecord;
  score: ExplorerScore;
  isNewPlace: boolean;
}
