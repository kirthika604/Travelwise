// ---------------------------------------------------------------------------
// Explorer Passport API client. Same live→mock-fallback shape as lib/api.ts,
// kept as its own file (not importing lib/api.ts) so this whole feature stays
// a single removable unit rather than being woven into the trip-planning API.
// ---------------------------------------------------------------------------

import type { CheckInRequest, CheckInResult, VisitRecord } from "./explorer-types";
import { mockCheckIn } from "./explorer-mock";

const API_BASE = "/api";
const FORCE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export type Source = "live" | "mock";
export interface ExplorerApiResult<T> {
  data: T;
  source: Source;
  error?: string;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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

// Note: on a live-backend failure that's actually a proximity rejection (not a
// network error), the mock fallback below re-validates distance and throws
// the same kind of error — so the user still sees "you're too far away"
// rather than a confusing generic network message.
export async function checkIn(
  req: CheckInRequest,
  existingVisits: VisitRecord[],
): Promise<ExplorerApiResult<CheckInResult>> {
  if (FORCE_MOCK) return { data: mockCheckIn(req, existingVisits), source: "mock" };
  try {
    const data = await postJSON<CheckInResult>("/memories/check-in", req);
    return { data, source: "live" };
  } catch (e) {
    return { data: mockCheckIn(req, existingVisits), source: "mock", error: msg(e) };
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
