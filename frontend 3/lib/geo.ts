// Geospatial + formatting helpers (no external deps).

export type Coord = { latitude: number; longitude: number };
export type LngLat = [number, number]; // [lon, lat] — MapLibre order

const R = 6371; // km

export function haversineKm(a: Coord, b: Coord): number {
  const dLat = deg2rad(b.latitude - a.latitude);
  const dLon = deg2rad(b.longitude - a.longitude);
  const lat1 = deg2rad(a.latitude);
  const lat2 = deg2rad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

// ── Point along a polyline ──────────────────────────────────────────────────
// Given a list of [lon,lat] points and a fraction 0..1 of total length,
// returns the interpolated [lon,lat]. Used to animate a vehicle marker.
export function pointAlong(points: LngLat[], fraction: number): LngLat {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversineKm(
      { longitude: points[i][0], latitude: points[i][1] },
      { longitude: points[i + 1][0], latitude: points[i + 1][1] },
    );
    segLens.push(d);
    total += d;
  }
  if (total === 0) return points[0];
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      const t = segLens[i] === 0 ? 0 : (target - acc) / segLens[i];
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    acc += segLens[i];
  }
  return points[points.length - 1];
}

// Build a gently curved great-circle-ish arc between two points, so map paths
// read as "routes" rather than dead-straight lines. Returns [lon,lat][].
export function curveBetween(a: LngLat, b: LngLat, segments = 48, bend = 0.18): LngLat[] {
  const [ax, ay] = a;
  const [bx, by] = b;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // perpendicular offset for the control point
  const dx = bx - ax;
  const dy = by - ay;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  const pts: LngLat[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t ** 2 * bx;
    const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t ** 2 * by;
    pts.push([x, y]);
  }
  return pts;
}

// Fit-bounds helper: [ [minLon,minLat], [maxLon,maxLat] ]
export function boundsOf(points: LngLat[]): [[number, number], [number, number]] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

// ── Formatters ──────────────────────────────────────────────────────────────
export function formatDistance(km?: number | null): string {
  if (km == null) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatDurationMin(min?: number | null): string {
  if (min == null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function formatHours(hr?: number | null): string {
  if (hr == null) return "—";
  return formatDurationMin(hr * 60);
}

// For the "available time" sliders, which now go up to 2 full days —
// reads as "18 hours" under a day, "1 day 4 hours" / "2 days" beyond it.
export function formatAvailableHours(hr: number): string {
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const days = Math.floor(hr / 24);
  const rem = hr % 24;
  const dayPart = `${days} day${days === 1 ? "" : "s"}`;
  return rem ? `${dayPart} ${rem}h` : dayPart;
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatMoney(inr?: number | null): string {
  if (inr == null) return "—";
  if (inr === 0) return "Free";
  return `₹${Math.round(inr)}`;
}

export function expenseRange(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) {
    if (min === 0 && max === 0) return "Free";
    return `₹${Math.round(min)}–₹${Math.round(max)}`;
  }
  return formatMoney(min ?? max);
}

// ── Sustainability ───────────────────────────────────────────────────────────
// Transparent estimate of the CO₂ you avoid by taking public transit instead of
// driving the same distance. Factors are well-known per-km averages (a petrol
// car vs a blended bus/metro passenger-km), so all figures are shown as "~ est".
const CAR_KG_CO2_PER_KM = 0.17;
const TRANSIT_KG_CO2_PER_KM = 0.045;

export function co2SavedKg(distanceKm?: number | null): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  return Math.max(0, (CAR_KG_CO2_PER_KM - TRANSIT_KG_CO2_PER_KM) * distanceKm);
}

export function formatCo2(kg?: number | null): string {
  if (!kg || kg <= 0) return "—";
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${kg.toFixed(1)} kg`;
}

// Straight-line journey length across an ordered list of coordinates (a quick
// lower-bound distance for the CO₂ estimate when a routed distance isn't handy).
export function pathDistanceKm(coords: Coord[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) total += haversineKm(coords[i], coords[i + 1]);
  return total;
}

// Build an ISO datetime for "today at HH:00" (local), used to seed departure.
export function todayAtHour(hour: number): string {
  return dateAndHourToISO(localDateStr(new Date()), hour);
}

// "2026-08-27" style local date string, for <input type="date"> and as a
// stable key for weekday/weekend lookups.
export function localDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Build an ISO datetime for an arbitrary "YYYY-MM-DD" date at HH:00 (local) —
// generalizes todayAtHour to any day, so future plans aren't stuck on "today".
export function dateAndHourToISO(dateStr: string, hour: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, day ?? 1, hour, 0, 0, 0);
  return toLocalISO(d);
}

// Saturday/Sunday check for a "YYYY-MM-DD" date — real transit (and this
// app's mock data) runs a reduced weekend service.
export function isWeekend(dateStr: string): boolean {
  const [y, m, day] = dateStr.split("-").map(Number);
  const dow = new Date(y, (m ?? 1) - 1, day ?? 1).getDay();
  return dow === 0 || dow === 6;
}

// Local ISO WITHOUT timezone suffix — FastAPI parses naive datetimes.
export function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
