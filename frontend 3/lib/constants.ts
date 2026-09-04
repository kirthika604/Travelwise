import type { BudgetLevel } from "./types";

// Chennai — default map center / fallback "you are here" (Marina Beach area).
export const CHENNAI_CENTER = { latitude: 13.0569, longitude: 80.2425 };

// Free, token-free MapLibre style (CARTO dark basemap). Override with
// NEXT_PUBLIC_MAP_STYLE. Looks premium and needs no API key.
export const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ||
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Vibes pulled from the real dataset (Category/Vibe + Ambience columns).
// Each has a lucide icon key (see components/ui/VibeIcon.tsx) + accent so
// the UI can group/colour them consistently.
export interface VibeDef {
  key: string;
  label: string;
  icon: string;
  // tailwind gradient stops for the vibe accent
  from: string;
  to: string;
}

// Each vibe owns a distinct hue so a row of covers reads as a spectrum, not a
// monochrome blur — the accent is how you tell "Scenic" from "Foodie" at a
// glance. Kept entirely to cool tones (teal/blue/indigo/violet/pink/rose),
// with "Nature" the one deliberately green entry.
export const VIBES: VibeDef[] = [
  { key: "Cultural", label: "Cultural", icon: "Landmark", from: "#6366F1", to: "#A855F7" },
  { key: "Peaceful", label: "Peaceful", icon: "Leaf", from: "#2DD4BF", to: "#38BDF8" },
  { key: "Scenic", label: "Scenic", icon: "Mountain", from: "#38BDF8", to: "#818CF8" },
  { key: "Adventure", label: "Adventure", icon: "Tent", from: "#F43F5E", to: "#9F1239" },
  { key: "Foodie", label: "Foodie", icon: "UtensilsCrossed", from: "#FB7185", to: "#C026D3" },
  { key: "Historical", label: "Historical", icon: "Castle", from: "#B79B7E", to: "#6D5240" },
  { key: "Spiritual", label: "Spiritual", icon: "Flower2", from: "#A78BFA", to: "#EC4899" },
  { key: "Youthful", label: "Youthful", icon: "PartyPopper", from: "#38BDF8", to: "#22D3EE" },
  { key: "Shopping", label: "Shopping", icon: "ShoppingBag", from: "#EC4899", to: "#FB7185" },
  { key: "Natural", label: "Nature", icon: "Trees", from: "#22C55E", to: "#84CC16" },
  { key: "Romantic", label: "Romantic", icon: "Heart", from: "#FB7185", to: "#BE123C" },
  { key: "Relaxing", label: "Relaxing", icon: "Waves", from: "#5EEAD4", to: "#99F6E4" },
  { key: "Family", label: "Family", icon: "Users", from: "#7DD3FC", to: "#6366F1" },
  { key: "Trendy", label: "Trendy", icon: "Sparkles", from: "#818CF8", to: "#D946EF" },
  { key: "Heritage", label: "Heritage", icon: "Gem", from: "#94A3B8", to: "#475569" },
  { key: "Offbeat", label: "Offbeat", icon: "Puzzle", from: "#22D3EE", to: "#6366F1" },
  { key: "Entertainment", label: "Entertainment", icon: "Clapperboard", from: "#C026D3", to: "#6366F1" },
];

export const VIBE_BY_KEY: Record<string, VibeDef> = Object.fromEntries(
  VIBES.map((v) => [v.key.toLowerCase(), v]),
);

export function vibeFor(tagOrCategory: string): VibeDef {
  const hit = VIBE_BY_KEY[(tagOrCategory || "").toLowerCase()];
  return hit || VIBES[0];
}

export const BUDGETS: { key: BudgetLevel; label: string; hint: string }[] = [
  { key: "Low", label: "Low", hint: "Free–₹200" },
  { key: "Medium", label: "Medium", hint: "₹200–₹800" },
  { key: "High", label: "High", hint: "₹800+" },
];

export const TIMES_OF_DAY = [
  { key: "Morning", label: "Morning", icon: "Sunrise" },
  { key: "Afternoon", label: "Afternoon", icon: "Sun" },
  { key: "Evening", label: "Evening", icon: "Sunset" },
  { key: "Night", label: "Night", icon: "Moon" },
];

// GTFS route_type → display metadata.
// 0 tram, 1 metro/subway, 2 rail, 3 bus  (+ our own Walk pseudo-mode)
export interface ModeDef {
  label: string;
  color: string; // hex, used for map lines + timeline
  icon: "walk" | "bus" | "metro" | "train" | "tram" | "auto";
}

export const MODE_BY_ROUTE_TYPE: Record<number, ModeDef> = {
  0: { label: "Tram", color: "#7DD3FC", icon: "tram" },
  1: { label: "Metro", color: "#2DD4BF", icon: "metro" },
  2: { label: "Train", color: "#0EA5E9", icon: "train" },
  3: { label: "Bus", color: "#A78BFA", icon: "bus" },
};

export const WALK_MODE: ModeDef = { label: "Walk", color: "#94A3B8", icon: "walk" };

// A "last mile" leg the backend judged too far to walk (see
// MAX_COMFORTABLE_WALK_KM in the routing engine) — an honest "you'll need
// an auto/taxi here" instead of either pretending it's walkable or just
// omitting the trip entirely when no stop sits within easy walking range.
export const AUTO_MODE: ModeDef = { label: "Auto/Taxi", color: "#FBBF24", icon: "auto" };

// Resolve a mode string ("Walk", "Bus", "Metro", "Train", "Walk+Bus"...) or a
// GTFS route_type into display metadata. The *primary* (non-walk) mode wins.
export function modeMeta(mode: string, routeType?: number | null): ModeDef {
  if (routeType != null && MODE_BY_ROUTE_TYPE[routeType]) {
    return MODE_BY_ROUTE_TYPE[routeType];
  }
  const m = (mode || "").toLowerCase();
  if (m.includes("metro")) return MODE_BY_ROUTE_TYPE[1];
  if (m.includes("train") || m.includes("rail")) return MODE_BY_ROUTE_TYPE[2];
  if (m.includes("tram")) return MODE_BY_ROUTE_TYPE[0];
  if (m.includes("bus")) return MODE_BY_ROUTE_TYPE[3];
  if (m.includes("auto") || m.includes("taxi")) return AUTO_MODE;
  return WALK_MODE;
}

export const DEFAULT_RADIUS_KM = 8;
export const DEFAULT_AVAILABLE_HOURS = 6;
