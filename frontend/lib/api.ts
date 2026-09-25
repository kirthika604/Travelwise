// ---------------------------------------------------------------------------
// API client. Talks to the FastAPI backend through the Next proxy (/api/*).
// On any network/HTTP error it transparently falls back to built-in mock data
// so the UI never dead-ends. Force mock with NEXT_PUBLIC_USE_MOCK=1.
// ---------------------------------------------------------------------------

import type {
  CombinationRequest,
  CombinationResponse,
  DiscoveryRequest,
  DiscoveryResponse,
  PlaceResult,
  PlaceSummary,
  RoutingRequest,
  RoutingResponse,
} from "./types";
import { mockCombination, mockDiscovery, mockPlaces, mockRouting } from "./mock";

const API_BASE = "/api";
const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export type Source = "live" | "mock";
export interface ApiResult<T> {
  data: T;
  source: Source;
  error?: string;
}

async function postJSON<T>(path: string, body: unknown, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getJSON<T>(path: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// The deployed backend runs on a free tier that spins down after a few
// minutes idle — the next request has to wait 30-50s for a cold start
// before it even starts doing real work. The default 12s timeout was
// cutting these off mid-wake, silently falling back to mock data (which
// has real photos for only a couple of seed places) — looking like a
// random per-user bug when it was really just "whoever's request landed
// first after an idle period." 60s comfortably covers a cold start plus
// these endpoints' own (otherwise sub-second) query time.
const COLD_START_TIMEOUT_MS = 60000;

export async function discover(req: DiscoveryRequest): Promise<ApiResult<DiscoveryResponse>> {
  if (FORCE_MOCK) return { data: mockDiscovery(req), source: "mock" };
  try {
    return { data: await postJSON<DiscoveryResponse>("/discovery", req, COLD_START_TIMEOUT_MS), source: "live" };
  } catch (e) {
    return { data: mockDiscovery(req), source: "mock", error: msg(e) };
  }
}

// Every place with full detail (tags, cuisines, time needed…), loaded once
// and kept in memory so the Discover search bar can match instantly on each
// keystroke instead of round-tripping to a backend that may be cold-starting.
// Discovery caps a request at 100 rows, so POIs and food are fetched
// separately. If either half falls back to mock, use mock for both — mixing
// live and seed ids in one list would break selection/check-ins later.
let catalogCache: ApiResult<PlaceResult[]> | null = null;
let catalogInflight: Promise<ApiResult<PlaceResult[]>> | null = null;

export function loadCatalog(): Promise<ApiResult<PlaceResult[]>> {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!catalogInflight) {
    catalogInflight = (async () => {
      const [poi, food] = await Promise.all([
        discover({ source: "poi", limit: 100 }),
        discover({ source: "food", limit: 100 }),
      ]);
      const live = poi.source === "live" && food.source === "live";
      const result: ApiResult<PlaceResult[]> = live
        ? { data: [...poi.data.places, ...food.data.places], source: "live" }
        : {
            data: mockDiscovery({ limit: 500 }).places,
            source: "mock",
            error: poi.error ?? food.error,
          };
      // Only remember a live result — a mock one should retry next time.
      if (live || FORCE_MOCK) catalogCache = result;
      return result;
    })().finally(() => {
      catalogInflight = null;
    });
  }
  return catalogInflight;
}

// Full places catalog (id/name/lat/lon), used by the Explorer Passport's
// "fog of war" map. Must come from the same source discover() used, so a
// visit's stored place_id (a live-backend row id or a mock seed id) always
// matches an id in this catalog — otherwise a checked-in place can never be
// found here and its dot never lights up.
export async function listPlaces(): Promise<ApiResult<PlaceSummary[]>> {
  if (FORCE_MOCK) return { data: mockPlaces(), source: "mock" };
  try {
    return { data: await getJSON<PlaceSummary[]>("/places?limit=200", COLD_START_TIMEOUT_MS), source: "live" };
  } catch (e) {
    return { data: mockPlaces(), source: "mock", error: msg(e) };
  }
}

export async function combine(req: CombinationRequest): Promise<ApiResult<CombinationResponse>> {
  if (FORCE_MOCK) return { data: mockCombination(req), source: "mock" };
  try {
    return { data: await postJSON<CombinationResponse>("/combination", req, COLD_START_TIMEOUT_MS), source: "live" };
  } catch (e) {
    return { data: mockCombination(req), source: "mock", error: msg(e) };
  }
}

export async function route(req: RoutingRequest): Promise<ApiResult<RoutingResponse>> {
  if (FORCE_MOCK) return { data: mockRouting(req), source: "mock" };
  try {
    // Multimodal pathfinding across the full GTFS graph is genuinely
    // heavier than a discovery/combination lookup — a long cross-city
    // request with several transfers can measure ~90s on this free-tier
    // instance's 0.1 CPU even when already warm (verified directly). Add
    // the cold-start wake-up window on top of that for a request that's
    // also the first one after idle, and 2 minutes is a realistic worst
    // case — long, but the alternative was this endpoint silently handing
    // back the mock's much cruder same-distance estimate almost every time.
    return { data: await postJSON<RoutingResponse>("/routing", req, 120000), source: "live" };
  } catch (e) {
    return { data: mockRouting(req), source: "mock", error: msg(e) };
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
