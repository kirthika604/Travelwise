// ---------------------------------------------------------------------------
// View-models that normalise the two backend shapes — routing RouteResult.steps
// and combination ItineraryResult.legs — into one "unified step" the Routes
// timeline can render the same way.
// ---------------------------------------------------------------------------

import type { ItineraryResult, RouteResult } from "./types";
import { modeMeta, type ModeDef } from "./constants";
import { pathDistanceKm } from "./geo";

export interface UnifiedStep {
  mode: ModeDef;
  modeLabel: string;
  fromName: string;
  toName: string;
  routeName?: string | null; // bus / train / metro line or service no.
  departAt?: string | null;
  arriveAt?: string | null;
  durationMin?: number | null;
  distanceKm?: number | null;
  waitMin?: number | null;
  boardStop?: string | null; // "platform" / boarding stop
  alightStop?: string | null;
  fare?: number | null;
  instruction?: string | null;
  isWalk: boolean;
}

export interface UnifiedRoute {
  steps: UnifiedStep[];
  totalDurationMin: number;
  departAt?: string | null;
  arriveAt?: string | null;
  transfers: number;
  walkingMin?: number | null;
  transitMin?: number | null;
  waitMin?: number | null;
  modesUsed: string[];
  totalFare?: number | null;
  approxDistanceKm: number; // for the CO₂-vs-driving estimate
}

const isWalkMode = (m: string) => /^walk$/i.test((m || "").trim());

export function routeToUnified(r: RouteResult): UnifiedRoute {
  const steps: UnifiedStep[] = r.steps.map((s) => {
    const mode = modeMeta(s.mode, s.route_type);
    const walk = isWalkMode(s.mode);
    return {
      mode,
      modeLabel: s.mode_label || s.mode,
      fromName: s.from_name,
      toName: s.to_name,
      routeName: s.route_name,
      departAt: s.departure_time ?? null,
      arriveAt: s.arrival_time ?? null,
      durationMin: s.duration_minutes ?? null,
      distanceKm: s.distance_km ?? null,
      waitMin: s.wait_time_minutes ?? null,
      boardStop: walk ? null : (s.board_stop || s.from_name),
      alightStop: walk ? null : (s.alight_stop || s.to_name),
      fare: null,
      instruction: s.instruction,
      isWalk: walk,
    };
  });
  return {
    steps,
    totalDurationMin: r.total_duration_minutes,
    departAt: r.departure_time,
    arriveAt: r.arrival_time,
    transfers: r.transfers,
    walkingMin: r.total_walking_minutes,
    transitMin: r.total_transit_minutes,
    waitMin: r.total_wait_minutes ?? steps.reduce((sum, s) => sum + (s.waitMin ?? 0), 0),
    modesUsed: r.modes_used,
    totalFare: null,
    approxDistanceKm: steps.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0),
  };
}

export function itineraryToUnified(it: ItineraryResult): UnifiedRoute {
  const steps: UnifiedStep[] = it.legs.map((leg) => {
    const mode = modeMeta(leg.mode, leg.route_type);
    const walk = isWalkMode(leg.mode);
    return {
      mode,
      modeLabel: leg.mode_label || leg.mode,
      fromName: leg.from_place_name,
      toName: leg.to_place_name,
      routeName: leg.route_name,
      departAt: leg.depart_at,
      arriveAt: leg.arrive_at,
      durationMin: leg.travel_duration_minutes,
      distanceKm: leg.walking_distance_km || null,
      waitMin: leg.wait_time_minutes,
      boardStop: leg.board_stop,
      alightStop: leg.alight_stop,
      fare: leg.fare_total || null,
      instruction: leg.steps_summary?.join(" · ") || null,
      isWalk: walk,
    };
  });
  return {
    steps,
    totalDurationMin: Math.round(it.total_travel_time_hr * 60),
    departAt: it.start_time,
    arriveAt: it.end_time,
    transfers: it.legs.reduce((n, l) => n + (l.transfers || 0), 0),
    walkingMin: Math.round(it.total_walking_time_hr * 60),
    transitMin: Math.round(it.total_transit_time_hr * 60),
    waitMin: steps.reduce((sum, s) => sum + (s.waitMin ?? 0), 0),
    modesUsed: Array.from(new Set(it.legs.map((l) => l.mode))),
    totalFare: it.total_fare,
    approxDistanceKm: pathDistanceKm(
      it.places.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    ),
  };
}
