// ---------------------------------------------------------------------------
// Explorer Passport — pure check-in / scoring logic. Same "always works
// offline" role as lib/mock.ts plays for the other three engines: this is
// what lib/explorer-api.ts falls back to when the backend is unreachable,
// and what mirrors the (future) backend scoring formula.
// ---------------------------------------------------------------------------

import { CHENNAI_CENTER } from "./constants";
import { haversineKm } from "./geo";
import type { CheckInRequest, CheckInResult, ExplorerScore, VisitRecord } from "./explorer-types";

// Generous on purpose — phone GPS drifts, especially indoors at a demo venue.
// This is the "proof of visit" radius: within this of the place's real
// coordinates counts as a legitimate check-in.
export const MAX_CHECKIN_DISTANCE_KM = 2;

const POINTS_PER_NEW_PLACE = 10;
const POINTS_PER_REVISIT = 2;
const POINTS_PER_NEW_CATEGORY = 5;

export function scoreFromVisits(visits: VisitRecord[]): ExplorerScore {
  const placeIds = new Set<number>();
  const categories = new Set<string>();
  let revisits = 0;

  for (const v of visits) {
    if (placeIds.has(v.placeId)) revisits += 1;
    placeIds.add(v.placeId);
    categories.add(v.category);
  }

  const placesVisited = placeIds.size;
  const categoriesExplored = categories.size;
  const score = placesVisited * POINTS_PER_NEW_PLACE + revisits * POINTS_PER_REVISIT + categoriesExplored * POINTS_PER_NEW_CATEGORY;

  // Proxy for "how much of the city you've covered": round-trip distance from
  // city centre to each unique place visited. Not a tracked path — a flex
  // number, not a precise odometer.
  let totalDistanceKm = 0;
  const seen = new Set<number>();
  for (const v of visits) {
    if (seen.has(v.placeId)) continue;
    seen.add(v.placeId);
    totalDistanceKm += haversineKm(CHENNAI_CENTER, { latitude: v.latitude, longitude: v.longitude }) * 2;
  }

  return {
    score,
    placesVisited,
    categoriesExplored,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
  };
}

export function mockCheckIn(req: CheckInRequest, existingVisits: VisitRecord[]): CheckInResult {
  if (req.userLatitude != null && req.userLongitude != null) {
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

  const isNewPlace = !existingVisits.some((v) => v.placeId === req.placeId);
  const visit: VisitRecord = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    placeId: req.placeId,
    placeName: req.placeName,
    category: req.category,
    latitude: req.placeLatitude,
    longitude: req.placeLongitude,
    note: req.note,
    photoDataUrl: req.photoDataUrl,
    createdAt: new Date().toISOString(),
  };

  const score = scoreFromVisits([...existingVisits, visit]);
  return { visit, score, isNewPlace };
}
