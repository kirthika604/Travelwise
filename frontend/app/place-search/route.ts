// Looks up any place on the map (shops, colleges, hospitals, streets,
// stations — not just the tourist spots in our own catalog) so the Discover
// search can always offer directions. Runs server-side so the browser only
// ever talks to this origin. Backed by OpenStreetMap data via Photon, with
// Nominatim as a fallback; both are free public services, so this stays
// light: one lookup per explicit Search press, short cache, per-IP limit.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "TravelWise/1.0 (+https://github.com/kirthika604/Travelwise)";
// Greater Chennai plus the ECR / Mahabalipuram / Chengalpattu belt.
const BBOX = { west: 79.6, south: 12.4, east: 80.5, north: 13.5 };
const CHENNAI = { lat: 13.0827, lon: 80.2707 };
const MAX_RESULTS = 6;

interface Found {
  name: string;
  subtitle: string;
  kind: string | null;
  latitude: number;
  longitude: number;
}

const cache = new Map<string, { at: number; results: Found[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
const LIMIT_PER_MIN = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) hits.clear();
  return recent.length > LIMIT_PER_MIN;
}

function prettyKind(v?: string | null): string | null {
  if (!v || v === "yes") return null;
  return v.replace(/_/g, " ");
}

async function photon(q: string, lat: number, lon: number): Promise<Found[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("bbox", `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();
  const out: Found[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const [lng, ltd] = f.geometry?.coordinates ?? [];
    if (typeof lng !== "number" || typeof ltd !== "number") continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name || street;
    if (!name) continue;
    const area = p.district || p.locality || p.suburb;
    const subtitle = [p.name ? street : "", area, p.city || p.county].filter(Boolean).join(", ");
    out.push({ name, subtitle, kind: prettyKind(p.osm_value), latitude: ltd, longitude: lng });
  }
  return out;
}

async function nominatim(q: string): Promise<Found[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("viewbox", `${BBOX.west},${BBOX.north},${BBOX.east},${BBOX.south}`);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data: Array<{ display_name: string; name?: string; type?: string; lat: string; lon: string }> = await res.json();
  return data.map((d) => {
    const parts = d.display_name.split(",").map((s) => s.trim());
    return {
      name: d.name || parts[0],
      subtitle: parts.slice(1, 3).join(", "),
      kind: prettyKind(d.type),
      latitude: Number(d.lat),
      longitude: Number(d.lon),
    };
  });
}

function dedupe(list: Found[]): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const f of list) {
    const key = `${f.name.toLowerCase()}|${f.latitude.toFixed(3)}|${f.longitude.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) return NextResponse.json({ results: [], error: "rate_limited" }, { status: 429 });

  // Only a coarse (~1 km) idea of where the user is is needed to rank nearby first.
  const latIn = Number(sp.get("lat"));
  const lonIn = Number(sp.get("lon"));
  const valid = Number.isFinite(latIn) && Number.isFinite(lonIn) && latIn !== 0 && lonIn !== 0;
  const lat = valid ? Math.round(latIn * 100) / 100 : CHENNAI.lat;
  const lon = valid ? Math.round(lonIn * 100) / 100 : CHENNAI.lon;

  const key = `${q.toLowerCase()}|${lat}|${lon}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return NextResponse.json({ results: cached.results });

  let results: Found[] = [];
  try {
    results = dedupe(await photon(q, lat, lon));
  } catch {
    /* fall through to the second provider */
  }
  if (!results.length) {
    try {
      results = dedupe(await nominatim(q));
    } catch {
      return NextResponse.json({ results: [], error: "unavailable" }, { status: 502 });
    }
  }

  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return NextResponse.json({ results });
}
