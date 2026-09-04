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

async function getJSON<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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

export async function discover(req: DiscoveryRequest): Promise<ApiResult<DiscoveryResponse>> {
  if (FORCE_MOCK) return { data: mockDiscovery(req), source: "mock" };
  try {
    return { data: await postJSON<DiscoveryResponse>("/discovery", req), source: "live" };
  } catch (e) {
    return { data: mockDiscovery(req), source: "mock", error: msg(e) };
  }
}

// Full places catalog (id/name/lat/lon), used by the Explorer Passport's
// "fog of war" map. Must come from the same source discover() used, so a
// visit's stored place_id (a live-backend row id or a mock seed id) always
// matches an id in this catalog — otherwise a checked-in place can never be
// found here and its dot never lights up.
export async function listPlaces(): Promise<ApiResult<PlaceSummary[]>> {
  if (FORCE_MOCK) return { data: mockPlaces(), source: "mock" };
  try {
    return { data: await getJSON<PlaceSummary[]>("/places?limit=200"), source: "live" };
  } catch (e) {
    return { data: mockPlaces(), source: "mock", error: msg(e) };
  }
}

export async function combine(req: CombinationRequest): Promise<ApiResult<CombinationResponse>> {
  if (FORCE_MOCK) return { data: mockCombination(req), source: "mock" };
  try {
    return { data: await postJSON<CombinationResponse>("/combination", req), source: "live" };
  } catch (e) {
    return { data: mockCombination(req), source: "mock", error: msg(e) };
  }
}

export async function route(req: RoutingRequest): Promise<ApiResult<RoutingResponse>> {
  if (FORCE_MOCK) return { data: mockRouting(req), source: "mock" };
  try {
    // Multimodal pathfinding across the full GTFS graph is genuinely
    // heavier than a discovery/combination lookup — a long cross-city
    // request with several transfers can take 30+ seconds. The shared
    // 12s timeout was cutting these off well before the backend finished,
    // silently falling back to the mock's much cruder same-distance
    // estimate every time.
    return { data: await postJSON<RoutingResponse>("/routing", req, 45000), source: "live" };
  } catch (e) {
    return { data: mockRouting(req), source: "mock", error: msg(e) };
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
