// ---------------------------------------------------------------------------
// Built-in mock data + generators.
// Lets the whole UI (all 4 pages + animations) run before the FastAPI backend
// / Postgres are up. The API layer (lib/api.ts) falls back to these on any
// network error, or always uses them when NEXT_PUBLIC_USE_MOCK=1.
// Ranking / itinerary / routing logic mirrors the backend so results look real.
// ---------------------------------------------------------------------------

import type {
  CombinationRequest,
  CombinationResponse,
  DiscoveryRequest,
  DiscoveryResponse,
  ItineraryLeg,
  ItineraryResult,
  PlaceResult,
  PlaceSummary,
  RouteResult,
  RouteStep,
  RoutingRequest,
  RoutingResponse,
} from "./types";
import { CHENNAI_CENTER } from "./constants";
import { haversineKm, isWeekend } from "./geo";

interface Seed {
  id: number;
  name: string;
  source: "poi" | "food";
  category: string;
  budget_level: "Low" | "Medium" | "High";
  tags: string[];
  cuisines: string[];
  time_min: number | null;
  time_max: number | null;
  best_time_of_day: string[];
  rating: number | null;
  latitude: number;
  longitude: number;
  description: string;
  entry_min: number | null;
  entry_max: number | null;
  exp_min: number | null;
  exp_max: number | null;
  image_url?: string;
  location_url?: string;
}

export const SEED_PLACES: Seed[] = [
  {
    id: 1, name: "Marina Beach", source: "poi", category: "Scenic",
    budget_level: "Low", tags: ["Scenic", "Peaceful", "Relaxing"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Morning", "Evening"], rating: 4.4,
    latitude: 13.05907, longitude: 80.28511,
    description: "India's longest urban beach — sunrise walks, kite flyers, and legendary sundal & bajji stalls.",
    entry_min: 0, entry_max: 0, exp_min: 50, exp_max: 150,
  },
  {
    id: 2, name: "Besant Nagar (Elliot's) Beach", source: "poi", category: "Youthful",
    budget_level: "Medium", tags: ["Youthful", "Foodie", "Peaceful"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening"], rating: 4.5,
    latitude: 12.99596, longitude: 80.26796,
    description: "The city's coolest stretch of sand — cafés, live buskers and a calmer tide than Marina.",
    entry_min: 0, entry_max: 0, exp_min: 200, exp_max: 400,
  },
  {
    id: 3, name: "Kapaleeshwarar Temple", source: "poi", category: "Spiritual",
    budget_level: "Low", tags: ["Spiritual", "Cultural", "Heritage"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning", "Evening"], rating: 4.6,
    latitude: 13.0336, longitude: 80.2698,
    description: "A 7th-century Dravidian temple in Mylapore, its gopuram ablaze with colour above the tank.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 50,
  },
  {
    id: 4, name: "Government Museum, Egmore", source: "poi", category: "Cultural",
    budget_level: "Low", tags: ["Cultural", "Educational", "Historical"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Daytime"], rating: 4.3,
    latitude: 13.0722, longitude: 80.2609,
    description: "One of India's oldest museums — the bronze gallery of Chola-era Natarajas is unmissable.",
    entry_min: 15, entry_max: 250, exp_min: 15, exp_max: 250,
  },
  {
    id: 5, name: "Guindy National Park", source: "poi", category: "Natural",
    budget_level: "Low", tags: ["Natural", "Adventure", "Family"], cuisines: [],
    time_min: 2, time_max: 4, best_time_of_day: ["Morning"], rating: 4.2,
    latitude: 13.0067, longitude: 80.2206,
    description: "A rare forest inside a metro — blackbuck, spotted deer and a snake park in the heart of the city.",
    entry_min: 15, entry_max: 50, exp_min: 15, exp_max: 100,
  },
  {
    id: 6, name: "Fort St. George", source: "poi", category: "Historical",
    budget_level: "Low", tags: ["Historical", "Heritage", "Cultural"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Daytime"], rating: 4.2,
    latitude: 13.0797, longitude: 80.287,
    description: "The first English fortress in India (1644) — now a museum and the seat of the state assembly.",
    entry_min: 15, entry_max: 200, exp_min: 15, exp_max: 200,
  },
  {
    id: 7, name: "San Thome Basilica", source: "poi", category: "Spiritual",
    budget_level: "Low", tags: ["Spiritual", "Historical", "Heritage"], cuisines: [],
    time_min: 1, time_max: 1, best_time_of_day: ["Anytime"], rating: 4.6,
    latitude: 13.0336, longitude: 80.2779,
    description: "A neo-Gothic white basilica built over the tomb of St. Thomas the Apostle.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 0,
  },
  {
    id: 8, name: "Semmozhi Poonga", source: "poi", category: "Peaceful",
    budget_level: "Low", tags: ["Peaceful", "Natural", "Relaxing"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning", "Evening"], rating: 4.3,
    latitude: 13.0569, longitude: 80.2506,
    description: "A manicured botanical garden — 500+ plant species and a welcome hush off Cathedral Road.",
    entry_min: 15, entry_max: 35, exp_min: 15, exp_max: 100,
  },
  {
    id: 9, name: "VGP Universal Kingdom", source: "poi", category: "Fun",
    budget_level: "High", tags: ["Fun", "Adventure", "Family"], cuisines: [],
    time_min: 4, time_max: 6, best_time_of_day: ["Daytime"], rating: 4.0,
    latitude: 12.949, longitude: 80.254,
    description: "A seaside amusement park on ECR — rides, a water park and the iconic snow kingdom.",
    entry_min: 600, entry_max: 1200, exp_min: 600, exp_max: 1500,
  },
  {
    id: 10, name: "Phoenix Marketcity", source: "poi", category: "Shopping",
    budget_level: "Medium", tags: ["Shopping", "Youthful", "Trendy"], cuisines: [],
    time_min: 2, time_max: 4, best_time_of_day: ["Anytime"], rating: 4.4,
    latitude: 12.9916, longitude: 80.2177,
    description: "Chennai's biggest mall — flagship stores, a multiplex and a whole floor of food.",
    entry_min: 0, entry_max: 0, exp_min: 300, exp_max: 1500,
  },
  {
    id: 11, name: "DakshinaChitra Museum", source: "poi", category: "Cultural",
    budget_level: "Medium", tags: ["Cultural", "Heritage", "Offbeat"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Daytime"], rating: 4.5,
    latitude: 12.8207, longitude: 80.2417,
    description: "A living-history village of relocated heritage homes and folk artisans on the ECR.",
    entry_min: 100, entry_max: 350, exp_min: 100, exp_max: 500,
  },
  {
    id: 12, name: "Mahabalipuram Shore Temple", source: "poi", category: "Heritage",
    budget_level: "Low", tags: ["Heritage", "Historical", "Scenic"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Morning"], rating: 4.7,
    latitude: 12.6167, longitude: 80.199,
    description: "A UNESCO 8th-century granite temple standing against the Bay of Bengal surf.",
    entry_min: 40, entry_max: 600, exp_min: 40, exp_max: 700,
  },
  {
    id: 13, name: "Theosophical Society, Adyar", source: "poi", category: "Peaceful",
    budget_level: "Low", tags: ["Peaceful", "Natural", "Offbeat"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning"], rating: 4.5,
    latitude: 13.0102, longitude: 80.256,
    description: "260 acres of riverside calm, home to a 450-year-old banyan with a canopy you can wander under.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 50,
  },
  {
    id: 14, name: "Sin & Tonic", source: "food", category: "Restobar",
    budget_level: "High", tags: ["Trendy", "vibrant", "youthful"], cuisines: ["Modern cocktails", "Global"],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.5,
    latitude: 13.0459, longitude: 80.2397,
    description: "A buzzy Nungambakkam restobar — inventive cocktails and global small plates.",
    entry_min: null, entry_max: null, exp_min: 1200, exp_max: 2500,
  },
  {
    id: 15, name: "Koox", source: "food", category: "Rooftop",
    budget_level: "High", tags: ["Romantic", "Trendy", "luxurious"], cuisines: ["Japanese", "Rooftop dining"],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.6,
    latitude: 13.0301, longitude: 80.2443,
    description: "Japanese plates and skyline views from one of the city's prettiest rooftops.",
    entry_min: null, entry_max: null, exp_min: 1500, exp_max: 3000,
  },
  {
    id: 16, name: "Murugan Idli Shop", source: "food", category: "Restaurant",
    budget_level: "Low", tags: ["Foodie", "Family", "cozy"], cuisines: ["South Indian", "Tiffin"],
    time_min: 1, time_max: 1, best_time_of_day: ["Morning", "Evening"], rating: 4.4,
    latitude: 13.048, longitude: 80.24,
    description: "Feather-soft idlis and endless chutneys — the definitive Chennai tiffin institution.",
    entry_min: null, entry_max: null, exp_min: 150, exp_max: 350,
  },
  {
    id: 17, name: "Amethyst Café", source: "food", category: "Café",
    budget_level: "Medium", tags: ["Relaxing", "Trendy", "artsy"], cuisines: ["Continental", "Café"],
    time_min: 1, time_max: 2, best_time_of_day: ["Afternoon", "Evening"], rating: 4.4,
    latitude: 13.0426, longitude: 80.251,
    description: "A garden café in a restored colonial bungalow — the city's favourite slow afternoon.",
    entry_min: null, entry_max: null, exp_min: 400, exp_max: 900,
  },
  {
    id: 18, name: "MA Chidambaram Stadium (Chepauk)", source: "poi", category: "Cultural",
    budget_level: "Medium", tags: ["Cultural", "Youthful"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Anytime"], rating: 4.3,
    latitude: 13.0632, longitude: 80.2794,
    description: "Chennai's iconic cricket ground at Chepauk, home to Chennai Super Kings — a pilgrimage stop for cricket fans.",
    entry_min: 0, entry_max: 200, exp_min: 0, exp_max: 200,
  },
  {
    id: 19, name: "Valluvar Kottam", source: "poi", category: "Cultural",
    budget_level: "Low", tags: ["Cultural", "Heritage"], cuisines: [],
    time_min: 1, time_max: 1, best_time_of_day: ["Morning", "Evening"], rating: 4.3,
    latitude: 13.0464, longitude: 80.2418,
    description: "A chariot-shaped monument honouring Tamil poet-saint Thiruvalluvar, with the entire Thirukkural inscribed on its walls.",
    entry_min: 0, entry_max: 20, exp_min: 0, exp_max: 50,
  },
  {
    id: 20, name: "Vadapalani Murugan Temple", source: "poi", category: "Spiritual",
    budget_level: "Low", tags: ["Spiritual", "Cultural"], cuisines: [],
    time_min: 1, time_max: 1, best_time_of_day: ["Morning", "Evening"], rating: 4.5,
    latitude: 13.0503, longitude: 80.2121,
    description: "One of Chennai's most-visited temples, dedicated to Lord Murugan, known for its bustling daily crowds and vibrant festivals.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 100,
  },
  {
    id: 21, name: "Marina Lighthouse", source: "poi", category: "Scenic",
    budget_level: "Low", tags: ["Scenic", "Offbeat"], cuisines: [],
    time_min: 1, time_max: 1, best_time_of_day: ["Evening"], rating: 4.2,
    latitude: 13.0396, longitude: 80.2789,
    description: "A working lighthouse powered by an elevator to the top, with sweeping views over Marina Beach and the coastline.",
    entry_min: 10, entry_max: 20, exp_min: 0, exp_max: 50,
  },
  {
    id: 22, name: "Anna Nagar Tower Park", source: "poi", category: "Family",
    budget_level: "Low", tags: ["Family", "Peaceful", "Relaxing"], cuisines: [],
    time_min: 1, time_max: 1, best_time_of_day: ["Evening"], rating: 4.1,
    latitude: 13.085, longitude: 80.2101,
    description: "A well-loved neighbourhood park built around a rocket-shaped tower, popular for evening walks and a musical fountain show.",
    entry_min: 5, entry_max: 10, exp_min: 0, exp_max: 100,
  },
  {
    id: 23, name: "Chennai Rail Museum (ICF)", source: "poi", category: "Offbeat",
    budget_level: "Low", tags: ["Offbeat", "Family", "Historical"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning"], rating: 4.2,
    latitude: 13.1128, longitude: 80.2273,
    description: "An open-air museum by Integral Coach Factory showcasing vintage locomotives and coaches, with a mini train ride for kids.",
    entry_min: 20, entry_max: 30, exp_min: 50, exp_max: 100,
  },
  {
    id: 24, name: "IIT Madras Campus", source: "poi", category: "Peaceful",
    budget_level: "Low", tags: ["Peaceful", "Natural", "Offbeat"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Evening"], rating: 4.6,
    latitude: 12.9915, longitude: 80.2337,
    description: "A sprawling, forested campus inside the city that's genuinely wild — spot deer and blackbuck on a walk or cycle through its shaded roads.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 0,
  },
  {
    id: 25, name: "Muttukadu Boat House", source: "poi", category: "Adventure",
    budget_level: "Medium", tags: ["Adventure", "Scenic"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning"], rating: 4.1,
    latitude: 12.8258, longitude: 80.2445,
    description: "A backwater on ECR known for boating, windsurfing and kayaking against a scenic lagoon backdrop.",
    entry_min: 0, entry_max: 0, exp_min: 200, exp_max: 500,
  },
  {
    id: 26, name: "Madras Crocodile Bank Trust", source: "poi", category: "Natural",
    budget_level: "Low", tags: ["Natural", "Family", "Offbeat"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Morning"], rating: 4.4,
    latitude: 12.8375, longitude: 80.2439,
    description: "A pioneering reptile conservation centre on ECR, home to thousands of crocodiles and a working venom-extraction lab.",
    entry_min: 60, entry_max: 60, exp_min: 100, exp_max: 200,
  },
  {
    id: 27, name: "Neelankarai Beach", source: "poi", category: "Peaceful",
    budget_level: "Low", tags: ["Peaceful", "Relaxing", "Scenic"], cuisines: [],
    time_min: 1, time_max: 2, best_time_of_day: ["Evening"], rating: 4.0,
    latitude: 12.9445, longitude: 80.2531,
    description: "A quieter stretch of ECR coastline than Besant Nagar, popular with joggers and morning walkers.",
    entry_min: 0, entry_max: 0, exp_min: 0, exp_max: 150,
  },
  {
    id: 101, name: "Sathyam Cinemas", source: "poi", category: "Entertainment",
    budget_level: "Medium", tags: ["Entertainment", "Fun", "Youthful"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.4,
    latitude: 13.0569, longitude: 80.2637,
    description: "Popular multiplex in Royapettah known for its big screens and Dolby Atmos halls — a go-to for big releases.",
    entry_min: 150, entry_max: 400, exp_min: 300, exp_max: 700,
  },
  {
    id: 102, name: "PVR Icon, Express Avenue", source: "poi", category: "Entertainment",
    budget_level: "Medium", tags: ["Entertainment", "Fun", "Hangout"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.3,
    latitude: 13.0592, longitude: 80.2635,
    description: "Premium multiplex inside Express Avenue Mall, popular with the mall-and-movie crowd in Royapettah.",
    entry_min: 180, entry_max: 450, exp_min: 300, exp_max: 800,
  },
  {
    id: 103, name: "INOX Citi Centre", source: "poi", category: "Entertainment",
    budget_level: "Medium", tags: ["Entertainment", "Fun", "Youthful"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.2,
    latitude: 13.0367, longitude: 80.2676,
    description: "Long-running multiplex inside Citi Centre mall on RK Salai, close to Mylapore and Alwarpet.",
    entry_min: 150, entry_max: 400, exp_min: 300, exp_max: 700,
  },
  {
    id: 104, name: "Rohini Silver Screens", source: "poi", category: "Entertainment",
    budget_level: "Low", tags: ["Entertainment", "Fun", "Local Life"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.1,
    latitude: 13.0745, longitude: 80.2497,
    description: "Iconic single-screen-turned-multiplex near Egmore, a Chennai cinema landmark since the 1970s.",
    entry_min: 100, entry_max: 250, exp_min: 200, exp_max: 500,
  },
  {
    id: 105, name: "Mayajaal Multiplex", source: "poi", category: "Entertainment",
    budget_level: "Medium", tags: ["Entertainment", "Fun", "Family"], cuisines: [],
    time_min: 2, time_max: 3, best_time_of_day: ["Evening", "Night"], rating: 4.3,
    latitude: 12.931, longitude: 80.252,
    description: "Large multiplex and entertainment complex on ECR near Neelankarai, often paired with a beach evening.",
    entry_min: 150, entry_max: 400, exp_min: 300, exp_max: 700,
  },
];

// ── Real GTFS stop names (nearest to each mock place) ───────────────────────
// Extracted from data/chennai-multimodal-gtfs/stops.txt via haversine distance
const REAL_STOPS: Record<string, { metro: string; rail: string; bus: string }> = {
  "Marina Beach": {
    metro: "M.G.R.CENTRAL METRO R.S",
    rail: "Chennai Beach",
    bus: "Marina Beach",
  },
  "Besant Nagar (Elliot's) Beach": {
    metro: "St. Thomas Mount",
    rail: "Velachery",
    bus: "Besant Nagar",
  },
  "Kapaleeshwarar Temple": {
    metro: "Nandanam Metro",
    rail: "Chennai Beach",
    bus: "Mylapore Police Station",
  },
  "Government Museum, Egmore": {
    metro: "M.G.R.CENTRAL METRO R.S",
    rail: "Egmore",
    bus: "Egmore Court",
  },
  "Guindy National Park": {
    metro: "Guindy Metro Station",
    rail: "Guindy Railway Station",
    bus: "Kannigapuram",
  },
  "Fort St. George": {
    metro: "Mannadi Metro",
    rail: "Fort Railway Station",
    bus: "FORT ST.GEORGE MUSEUM SECRETRAITE",
  },
  "San Thome Basilica": {
    metro: "Nandanam Metro",
    rail: "Santhome Church",
    bus: "Santhome Church",
  },
  "Semmozhi Poonga": {
    metro: "Teynampet Metro",
    rail: "Nungambakkam",
    bus: "Income Tax Office",
  },
  "VGP Universal Kingdom": {
    metro: "Alandur Metro",
    rail: "Velachery",
    bus: "Neelankarai",
  },
  "Phoenix Marketcity": {
    metro: "Taramani Metro Station",
    rail: "Velachery",
    bus: "Guru Nanak College",
  },
  "DakshinaChitra Museum": {
    metro: "Chennai Airport Metro",
    rail: "Tambaram",
    bus: "Muttukadu",
  },
  "Mahabalipuram Shore Temple": {
    metro: "Chennai Airport Metro",
    rail: "Chengalpattu Junction",
    bus: "Mamallapuram",
  },
  "Theosophical Society, Adyar": {
    metro: "St. Thomas Mount",
    rail: "Velachery",
    bus: "Adyar Gandhi Nagar",
  },
  "Sin & Tonic": {
    metro: "Nandanam Metro",
    rail: "Nungambakkam",
    bus: "Thirumali Pillai Road",
  },
  "Koox": {
    metro: "Teynampet Metro",
    rail: "Nungambakkam",
    bus: "Chamiers Road Or Venkateswara Hospital",
  },
  "Murugan Idli Shop": {
    metro: "Nandanam Metro",
    rail: "Nungambakkam",
    bus: "Kamarajar Illam",
  },
  "Amethyst Café": {
    metro: "Ag Dms Metro Station",
    rail: "Nungambakkam",
    bus: "Sterling Road",
  },
};

// Word-set match, not substring: REAL_STOPS' keys are hand-curated against
// an older place-name list and drift from the live catalog's actual names
// (e.g. "Besant Nagar (Elliot's) Beach" here vs. the live DB's "Besant
// Nagar Beach (Elliot's Beach)" — same place, different word order and
// apostrophe style). A plain .includes() check missed that entirely and
// fell through to fabricating a station name instead of using the real,
// curated one that was sitting right there under a slightly different key.
function normalizedWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[’'().,]/g, "")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Get the real GTFS stop name for a given place and mode. Returns null if
 * no curated entry matches closely enough — callers must not invent a
 * specific station name in that case (there's no way to know one really
 * exists nearby at all, let alone its name).
 */
function getStopName(placeName: string, mode: "Metro" | "Train" | "Bus"): string | null {
  const target = normalizedWords(placeName);
  let bestKey: string | null = null;
  let bestRatio = 0;
  for (const k of Object.keys(REAL_STOPS)) {
    const candidate = normalizedWords(k);
    const overlap = [...target].filter((w) => candidate.has(w)).length;
    const ratio = overlap / Math.min(target.size, candidate.size);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestKey = k;
    }
  }
  // Require most of the shorter name's words to be present — enough to
  // survive word-order/punctuation drift, not so loose that an unrelated
  // place with one shared word ("Beach", "Temple") matches by accident.
  if (!bestKey || bestRatio < 0.6) return null;
  const stops = REAL_STOPS[bestKey];
  return mode === "Metro" ? stops.metro : mode === "Train" ? stops.rail : stops.bus;
}

/** Same lookup, but falls back to a generic (still clearly fabricated)
 * label instead of null — kept only for the Combination engine's
 * itinerary-leg mock, which always assumes a transit leg exists and isn't
 * (yet) set up to drop one when no real stop is known. Routing's own mock
 * uses getStopName() directly and skips the mode entirely instead.
 */
function getStopNameOrFallback(placeName: string, mode: "Metro" | "Train" | "Bus"): string {
  return (
    getStopName(placeName, mode) ??
    `${placeName} ${mode === "Metro" ? "Metro Station" : mode === "Train" ? "Railway Station" : "Bus Stop"}`
  );
}

// ── Scoring (mirrors app/engines/discovery/service.py) ──────────────────────
function budgetVal(b?: string | null): number | null {
  return b ? { Low: 1, Medium: 2, High: 3 }[b] ?? null : null;
}
function scoreInterest(interests: string[], cat: string, tags: string[], cuisines: string[]): number {
  if (!interests.length) return 1;
  const hay = [cat.toLowerCase(), ...tags.map((t) => t.toLowerCase()), ...cuisines.map((c) => c.toLowerCase())];
  const req = interests.map((i) => i.toLowerCase().trim()).filter(Boolean);
  if (!req.length) return 1;
  let m = 0;
  for (const i of req) if (hay.some((v) => v.includes(i) || i.includes(v))) m++;
  return m / req.length;
}
function scoreBudget(user?: string | null, place?: string | null): number {
  if (!user || !place) return 1;
  const u = budgetVal(user), p = budgetVal(place);
  if (u == null || p == null) return 0.5;
  const d = Math.abs(u - p);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}
function scoreTime(avail?: number | null, min?: number | null, max?: number | null): number {
  if (avail == null) return 1;
  if (min == null && max == null) return 0.5;
  const req = min != null ? min : max;
  if (req == null) return 0.5;
  if (req > avail) return 0;
  if (max != null && max <= avail) return 1;
  return Math.min(1, req / avail);
}
function scoreDistance(dist?: number | null, radius?: number | null): number {
  if (dist == null || radius == null) return 1;
  if (radius <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - dist / radius));
}
function scoreRating(r?: number | null): number {
  if (r == null) return 0.5;
  return Math.max(0, Math.min(1, r / 5));
}

// Full catalog, mirroring GET /places — used as the mock fallback for the
// Explorer Passport's fog-of-war map so seed ids line up with whatever
// mockDiscovery() also handed out for a check-in.
export function mockPlaces(): PlaceSummary[] {
  return SEED_PLACES.map((s) => ({
    id: s.id,
    source: s.source,
    name: s.name,
    category: s.category,
    budget_level: s.budget_level,
    rating: s.rating,
    image_url: s.image_url ?? null,
    location_url: s.location_url ?? null,
    lat: s.latitude,
    lon: s.longitude,
  }));
}

export function mockDiscovery(req: DiscoveryRequest): DiscoveryResponse {
  const origin =
    req.latitude != null && req.longitude != null
      ? { latitude: req.latitude, longitude: req.longitude }
      : CHENNAI_CENTER;

  let seeds = SEED_PLACES.slice();
  if (req.source) seeds = seeds.filter((s) => s.source === req.source);

  const scored: PlaceResult[] = seeds
    .map((s) => {
      const distance_km = haversineKm(origin, { latitude: s.latitude, longitude: s.longitude });
      const i = scoreInterest(req.interests ?? [], s.category, s.tags, s.cuisines);
      const b = scoreBudget(req.budget, s.budget_level);
      const t = scoreTime(req.available_hours, s.time_min, s.time_max);
      const d = scoreDistance(distance_km, req.radius_km);
      const r = scoreRating(s.rating);
      // Average only over signals we have data for — an unrated POI
      // shouldn't be penalized relative to rated food places just because
      // rating data doesn't exist for its source (mirrors the backend fix
      // in app/engines/discovery/service.py).
      const components = s.rating != null ? [i, b, t, d, r] : [i, b, t, d];
      const final = components.reduce((a, x) => a + x, 0) / components.length;
      return {
        id: s.id, name: s.name, source: s.source, description: s.description, category: s.category,
        budget_level: s.budget_level,
        entry_fee_min: s.entry_min, entry_fee_max: s.entry_max,
        avg_expense_min: s.exp_min, avg_expense_max: s.exp_max,
        time_needed_min_hr: s.time_min, time_needed_max_hr: s.time_max,
        best_time_of_day: s.best_time_of_day,
        rating: s.rating,
        image_url: s.image_url ?? null,
        location_url: s.location_url ?? null,
        latitude: s.latitude, longitude: s.longitude,
        distance_km,
        interest_score: round(i), budget_score: round(b), time_score: round(t),
        distance_score: round(d), rating_score: round(r), final_score: round(final),
        tags: s.tags, cuisines: s.cuisines,
      } as PlaceResult;
    })
    // when a radius is given, keep only what's inside it (backend does this too)
    .filter((p) => (req.radius_km == null ? true : (p.distance_km ?? 0) <= req.radius_km + 0.001))
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, req.limit ?? 20);

  return { total_results: scored.length, places: scored };
}

// ── Combination ─────────────────────────────────────────────────────────────
const MODE_SPEED_KMPH: Record<string, number> = { Walk: 5, Bus: 18, Metro: 32, Train: 40, Auto: 20 };
const FARE: Record<string, { base: number; perKm: number }> = {
  Walk: { base: 0, perKm: 0 },
  Bus: { base: 10, perKm: 2 },
  Metro: { base: 15, perKm: 2.5 },
  Train: { base: 10, perKm: 1.5 },
  Auto: { base: 30, perKm: 15 },
};
// Past this, a "Walk" leg reads as absurd (an hour+ on foot) — same
// threshold the routing engines use to relabel as Auto/Taxi instead.
const MAX_COMFORTABLE_WALK_KM = 1.2;

// Known Chennai metro & railway corridors (simplified from GTFS)
const METRO_CORRIDORS = [
  // Blue Line: Wimco Nagar → Airport
  { lat: 13.1248, lon: 80.2681 }, { lat: 13.0943, lon: 80.2862 },
  { lat: 13.0807, lon: 80.2706 }, { lat: 13.0782, lon: 80.2637 },
  { lat: 13.0678, lon: 80.2465 }, { lat: 13.0536, lon: 80.2530 },
  { lat: 13.0448, lon: 80.2480 }, { lat: 13.0371, lon: 80.2464 },
  { lat: 13.0317, lon: 80.2411 }, { lat: 13.0238, lon: 80.2282 },
  { lat: 13.0140, lon: 80.2232 }, { lat: 13.0093, lon: 80.2130 },
  { lat: 13.0042, lon: 80.2013 }, { lat: 12.9993, lon: 80.1934 },
  { lat: 12.9803, lon: 80.1637 },
  // Green Line: Central → St. Thomas Mount
  { lat: 13.0807, lon: 80.2706 }, { lat: 13.0733, lon: 80.1949 },
];
const RAIL_CORRIDORS = [
  // Suburban: Chennai Beach → Tambaram
  { lat: 13.0822, lon: 80.2824 }, { lat: 13.0779, lon: 80.2622 },
  { lat: 13.0666, lon: 80.2315 }, { lat: 13.0082, lon: 80.2133 },
  { lat: 12.9944, lon: 80.2002 }, { lat: 12.9712, lon: 80.2191 },
  { lat: 12.9255, lon: 80.1170 },
];

function nearestCorridorDist(lat: number, lon: number, corridor: { lat: number; lon: number }[]): number {
  let min = Infinity;
  for (const c of corridor) {
    const d = haversineKm({ latitude: lat, longitude: lon }, { latitude: c.lat, longitude: c.lon });
    if (d < min) min = d;
  }
  return min;
}

function pickMode(distKm: number, idx: number, fromLat?: number, fromLon?: number): string {
  if (distKm < 1.1) return "Walk";
  if (distKm > 9) return "Train";
  // Check what transit is actually near the user's origin
  const metroDist = fromLat != null && fromLon != null ? nearestCorridorDist(fromLat, fromLon, METRO_CORRIDORS) : 999;
  const railDist = fromLat != null && fromLon != null ? nearestCorridorDist(fromLat, fromLon, RAIL_CORRIDORS) : 999;
  const nearMetro = metroDist < 2; // within 2km of a metro station
  const nearRail = railDist < 2;   // within 2km of a railway station
  if (nearMetro && distKm > 3) return "Metro";
  if (nearRail && distKm > 4) return "Train";
  if (distKm > 5) return "Metro";
  if (distKm > 3) return idx % 3 === 0 ? "Train" : "Metro";
  // Short-medium: if near metro, prefer metro; otherwise bus
  if (nearMetro) return idx % 2 === 0 ? "Metro" : "Bus";
  return idx % 2 === 0 ? "Bus" : "Metro";
}

function buildLegs(order: CombinationRequest["places"], departISO: string): { legs: ItineraryLeg[]; arriveByPlace: string[]; departByPlace: string[]; end: Date } {
  const legs: ItineraryLeg[] = [];
  const arriveByPlace: string[] = [];
  const departByPlace: string[] = [];
  let cursor = new Date(departISO);
  // Reduced weekend service — real GTFS headways stretch out on Sat/Sun.
  const weekend = isWeekend(departISO.slice(0, 10));

  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    // arrive at p
    if (i === 0) {
      arriveByPlace.push(iso(cursor));
    } else {
      arriveByPlace.push(iso(cursor));
    }
    // visit
    const visitHr = p.time_needed_min_hr ?? 1.5;
    cursor = addMin(cursor, visitHr * 60);
    departByPlace.push(iso(cursor));

    // leg to next
    if (i < order.length - 1) {
      const n = order[i + 1];
      const dist = haversineKm(
        { latitude: p.latitude, longitude: p.longitude },
        { latitude: n.latitude, longitude: n.longitude },
      );
      let mode = pickMode(dist, i, p.latitude, p.longitude);
      // A picked transit mode needs a real, confidently-matched stop name
      // at both ends — otherwise this used to fabricate a station name
      // like "<place> Metro Station" for places with no metro anywhere
      // near them (e.g. a restaurant getting its own fake "Metro
      // Station"). Downgrade to Walk/Auto instead when no real stop is
      // known, same as the routing mock and both live backend engines.
      if (mode !== "Walk") {
        const hasRealStops =
          getStopName(p.name, mode as "Metro" | "Train" | "Bus") != null &&
          getStopName(n.name, mode as "Metro" | "Train" | "Bus") != null;
        if (!hasRealStops) {
          mode = dist > MAX_COMFORTABLE_WALK_KM ? "Auto" : "Walk";
        }
      }
      const speed = MODE_SPEED_KMPH[mode];
      const isWalk = mode === "Walk";
      const isAuto = mode === "Auto";
      const hasTransit = !isWalk && !isAuto;
      // Bus specifically gets a realistic minimum buffer — a real bus
      // almost never shows up on the scheduled minute (traffic, driver
      // behavior), unlike metro/train on dedicated track/right-of-way.
      // Metro gets a flat assumed wait too — frequent/predictable enough
      // on dedicated track that the exact schedule gap isn't worth
      // trusting either way. Auto/taxi is on-demand — no scheduled wait.
      const wait = !hasTransit ? 0 : mode === "Metro" ? 5 : mode === "Bus" ? (weekend ? 20 : 15) : weekend ? 12 : 7;
      const transitMin = (dist / speed) * 60;
      const walkMin = isWalk ? transitMin : Math.min(12, dist * 4);
      const travelMin = !hasTransit ? transitMin : wait + transitMin + 6;
      const departLeg = new Date(cursor);
      const arriveLeg = addMin(departLeg, travelMin);
      const fareInfo = FARE[mode];
      const fare = isWalk ? 0 : round(fareInfo.base + fareInfo.perKm * dist);
      const modeLabel = isWalk ? "Walk" : isAuto ? "Auto/Taxi" : mode === "Bus" ? `MTC Bus ${routeNo(i)}` : mode === "Metro" ? `CMRL Metro ${metroLine(i)}` : `SR EMU`;
      const agencyName = hasTransit ? (mode === "Bus" ? "MTC" : mode === "Metro" ? "CMRL" : "SR") : "";
      legs.push({
        from_place_name: p.name, to_place_name: n.name,
        from_latitude: p.latitude, from_longitude: p.longitude,
        to_latitude: n.latitude, to_longitude: n.longitude,
        depart_at: iso(departLeg), arrive_at: iso(arriveLeg),
        travel_duration_minutes: round(travelMin),
        mode: isWalk ? "Walk" : isAuto ? "Auto" : `Walk+${mode}`,
        mode_label: modeLabel, agency: agencyName,
        transit_available: hasTransit,
        walking_distance_km: isWalk ? round(dist) : isAuto ? 0 : round(Math.min(1, dist * 0.15)),
        walking_minutes: isWalk ? round(walkMin) : isAuto ? 0 : round(walkMin),
        route_name: hasTransit ? (mode === "Metro" ? metroLine(i) : mode === "Bus" ? routeNo(i) : "EMU") : null,
        route_type: hasTransit ? (mode === "Metro" ? 1 : mode === "Bus" ? 3 : 2) : null,
        trip_id: hasTransit ? `T${1000 + i}` : null,
        service_id: weekend ? "weekend" : "weekday",
        board_stop: hasTransit ? getStopNameOrFallback(p.name, mode as "Metro" | "Train" | "Bus") : null,
        alight_stop: hasTransit ? getStopNameOrFallback(n.name, mode as "Metro" | "Train" | "Bus") : null,
        wait_time_minutes: round(wait),
        transit_time_minutes: round(hasTransit ? transitMin : 0),
        transfers: 0,
        route_steps: !hasTransit
          ? (isAuto
              ? [{ mode: "Auto", mode_label: "Auto/Taxi", instruction: `Take an auto/taxi to ${n.name} (${dist.toFixed(1)} km)`, from_name: p.name, to_name: n.name, distance_km: round(dist), duration_minutes: round(transitMin) }]
              : [])
          : (() => {
          const boardFull = getStopNameOrFallback(p.name, mode as "Metro" | "Train" | "Bus");
          const alightFull = getStopNameOrFallback(n.name, mode as "Metro" | "Train" | "Bus");
          return [
            { mode: "Walk", mode_label: "Walk", instruction: `Walk to ${boardFull}`, from_name: p.name, to_name: boardFull, distance_km: round(0.3), duration_minutes: round(4) },
            { mode, mode_label: modeLabel, instruction: `Take ${modeLabel} from ${boardFull} to ${alightFull}`, from_name: boardFull, to_name: alightFull, route_name: mode === "Bus" ? routeNo(i) : mode === "Metro" ? "M1" : "EMU", route_type: mode === "Bus" ? 3 : mode === "Metro" ? 1 : 2, agency: agencyName, board_stop: boardFull, alight_stop: alightFull, duration_minutes: round(transitMin) },
            { mode: "Walk", mode_label: "Walk", instruction: `Walk to ${n.name}`, from_name: alightFull, to_name: n.name, distance_km: round(0.2), duration_minutes: round(3) },
          ];
        })(),
        steps_summary: !hasTransit
          ? [isAuto ? `Auto/taxi ${dist.toFixed(1)} km to ${n.name}` : `Walk ${dist.toFixed(1)} km to ${n.name}`]
          : (() => {
              const boardFull = getStopNameOrFallback(p.name, mode as "Metro" | "Train" | "Bus");
              const alightFull = getStopNameOrFallback(n.name, mode as "Metro" | "Train" | "Bus");
              return [`Walk to ${boardFull}`, `Take ${modeLabel} to ${alightFull}`, `Walk to ${n.name}`];
            })(),
        fare_total: fare,
        fare_breakdown: hasTransit ? { base: fareInfo.base, distance: round(fareInfo.perKm * dist), total: fare } : isAuto ? { base: fareInfo.base, distance: round(fareInfo.perKm * dist), total: fare } : {},
        fare_notes: isWalk ? ["Walking — no fare"] : isAuto ? ["Estimated auto/taxi fare"] : [`Estimated ${mode} fare`],
      });
      cursor = arriveLeg;
    }
  }
  return { legs, arriveByPlace, departByPlace, end: cursor };
}

function nearestNeighbour(places: CombinationRequest["places"], start?: { latitude: number; longitude: number } | null) {
  const remaining = places.slice();
  const order: typeof places = [];
  let ref = start ?? (remaining[0] ? { latitude: remaining[0].latitude, longitude: remaining[0].longitude } : null);
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = ref ? haversineKm(ref, { latitude: remaining[i].latitude, longitude: remaining[i].longitude }) : 0;
      if (d < bd) { bd = d; bi = i; }
    }
    const [p] = remaining.splice(bi, 1);
    order.push(p);
    ref = { latitude: p.latitude, longitude: p.longitude };
  }
  return order;
}

function assemble(order: CombinationRequest["places"], req: CombinationRequest, n: number): ItineraryResult {
  const { legs, arriveByPlace, departByPlace, end } = buildLegs(order, req.departure_time);
  const start = new Date(req.departure_time);
  const weekend = isWeekend(req.departure_time.slice(0, 10));
  const places = order.map((p, i) => ({
    id: p.id, name: p.name, order: i + 1,
    latitude: p.latitude, longitude: p.longitude,
    visit_duration_hr: p.time_needed_min_hr ?? 1.5,
    score: p.final_score,
    arrive_at: arriveByPlace[i], depart_at: departByPlace[i],
    best_time_of_day: p.best_time_of_day ?? [],
    source: (p.source as "poi" | "food" | undefined) ?? "poi",
  }));

  // Add first leg from start_location to first place
  if (req.start_location && order.length > 0) {
    const first = order[0];
    const dist = haversineKm(req.start_location, { latitude: first.latitude, longitude: first.longitude });
    let mode = pickMode(dist, 0, req.start_location.latitude, req.start_location.longitude);
    // Same real-stop check as buildLegs() — don't fabricate a station
    // name for the first place when no confidently-matched stop exists.
    if (mode !== "Walk" && getStopName(first.name, mode as "Metro" | "Train" | "Bus") == null) {
      mode = dist > MAX_COMFORTABLE_WALK_KM ? "Auto" : "Walk";
    }
    const isWalk = mode === "Walk";
    const isAuto = mode === "Auto";
    const hasTransit = !isWalk && !isAuto;
    const speed = MODE_SPEED_KMPH[mode];
    // Bus gets a realistic minimum buffer — see the matching comment in
    // buildLegs() above. Auto/taxi is on-demand — no scheduled wait.
    const waitMin = !hasTransit
      ? 0
      : mode === "Metro"
      ? 5
      : mode === "Train"
      ? weekend ? 11 : 6
      : weekend ? 20 : 15;
    const walkMin = isWalk ? round((dist / 5) * 60) : isAuto ? 0 : round(Math.min(12, dist * 4));
    const transitMin = !hasTransit ? round((dist / speed) * 60) : round((dist / speed) * 60);
    const totalMin = isAuto ? transitMin : walkMin + waitMin + transitMin + (isWalk ? 0 : 4);
    const depTime = new Date(start);
    const arrTime = addMin(depTime, totalMin);
    const modeLabel = isWalk ? "Walk" : isAuto ? "Auto/Taxi" : mode === "Bus" ? `MTC Bus ${routeNo(0)}` : mode === "Metro" ? `CMRL Metro ${metroLine(0)}` : `SR EMU`;
    const agencyName = hasTransit ? (mode === "Bus" ? "MTC" : mode === "Metro" ? "CMRL" : "SR") : "";
    const boardStopName = hasTransit ? getStopNameOrFallback(first.name, mode as "Metro" | "Train" | "Bus") : "Your Location";
    const routeType = hasTransit ? (mode === "Metro" ? 1 : mode === "Bus" ? 3 : 2) : null;
    const fareInfo = hasTransit || isAuto ? FARE[mode] : { base: 0, perKm: 0 };
    const fare = isWalk ? 0 : round(fareInfo.base + fareInfo.perKm * dist);
    const leg: ItineraryLeg = {
      from_place_name: "Your Location",
      to_place_name: first.name,
      from_latitude: req.start_location.latitude,
      from_longitude: req.start_location.longitude,
      to_latitude: first.latitude,
      to_longitude: first.longitude,
      depart_at: iso(depTime),
      arrive_at: iso(arrTime),
      travel_duration_minutes: round(totalMin),
      mode: isWalk ? "Walk" : isAuto ? "Auto" : `Walk+${mode}`,
      mode_label: modeLabel,
      agency: agencyName,
      transit_available: hasTransit && dist > 0.5,
      walking_distance_km: round(isWalk ? dist : isAuto ? 0 : Math.min(1, dist * 0.15)),
      walking_minutes: walkMin,
      route_name: hasTransit ? (mode === "Metro" ? metroLine(0) : mode === "Bus" ? routeNo(0) : "EMU") : null,
      route_type: routeType,
      trip_id: hasTransit ? "T0" : null,
      service_id: weekend ? "weekend" : "weekday",
      board_stop: hasTransit ? "Your Location" : null,
      alight_stop: hasTransit ? boardStopName : null,
      wait_time_minutes: waitMin,
      transit_time_minutes: hasTransit ? transitMin : 0,
      transfers: 0,
      route_steps: hasTransit && dist > 0.5 ? [
        { mode: "Walk", mode_label: "Walk", instruction: `Walk to ${boardStopName}`, from_name: "Your Location", to_name: boardStopName, distance_km: round(Math.min(0.5, dist * 0.15)), duration_minutes: walkMin },
        { mode, mode_label: modeLabel, instruction: `Take ${modeLabel} from ${boardStopName} to ${first.name}`, from_name: boardStopName, to_name: getStopNameOrFallback(first.name, mode as "Metro" | "Train" | "Bus"), route_name: mode === "Bus" ? routeNo(0) : mode === "Metro" ? "M1" : "EMU", route_type: routeType, agency: agencyName, board_stop: boardStopName, alight_stop: getStopNameOrFallback(first.name, mode as "Metro" | "Train" | "Bus"), duration_minutes: transitMin },
        { mode: "Walk", mode_label: "Walk", instruction: `Walk to ${first.name}`, from_name: getStopNameOrFallback(first.name, mode as "Metro" | "Train" | "Bus"), to_name: first.name, distance_km: round(0.2), duration_minutes: round(3) },
      ] : isAuto ? [
        { mode: "Auto", mode_label: "Auto/Taxi", instruction: `Take an auto/taxi to ${first.name} (${dist.toFixed(1)} km)`, from_name: "Your Location", to_name: first.name, distance_km: round(dist), duration_minutes: transitMin },
      ] : [
        { mode: "Walk", mode_label: "Walk", instruction: `Walk to ${first.name}`, from_name: "Your Location", to_name: first.name, distance_km: round(dist), duration_minutes: walkMin },
      ],
      steps_summary: hasTransit && dist > 0.5
        ? [`Walk to ${boardStopName}`, `Take ${modeLabel} to ${first.name}`, `Walk to ${first.name}`]
        : isAuto
        ? [`Auto/taxi ${dist.toFixed(1)} km to ${first.name}`]
        : [`Walk ${dist.toFixed(1)} km to ${first.name}`],
      fare_total: fare,
      fare_breakdown: !isWalk ? { base: fareInfo.base, distance: round(fareInfo.perKm * dist), total: fare } : {},
      fare_notes: isWalk ? ["Walking — no fare"] : isAuto ? ["Estimated auto/taxi fare"] : [`Estimated ${mode} fare`],
    };
    legs.unshift(leg);
    places.unshift({
      id: 0, name: "Your Location", order: 0,
      latitude: req.start_location.latitude,
      longitude: req.start_location.longitude,
      visit_duration_hr: 0, score: 0,
      arrive_at: iso(depTime), depart_at: iso(depTime),
      best_time_of_day: [],
      source: "poi",
    });
    // Re-number places
    places.forEach((p, i) => { p.order = i; });
  }

  const totalVisit = order.reduce((s, p) => s + (p.time_needed_min_hr ?? 1.5), 0);
  const totalTravelMin = legs.reduce((s, l) => s + l.travel_duration_minutes, 0);
  const totalWalkMin = legs.reduce((s, l) => s + l.walking_minutes, 0);
  const totalTransitMin = legs.reduce((s, l) => s + l.transit_time_minutes, 0);
  const totalWaitMin = legs.reduce((s, l) => s + l.wait_time_minutes, 0);
  const totalFare = legs.reduce((s, l) => s + l.fare_total, 0);
  const withTransit = legs.filter((l) => l.transit_available).length;
  const fareByMode: Record<string, number> = {};
  for (const l of legs) {
    if (!l.transit_available) continue;
    const key = l.route_type === 1 ? "metro" : l.route_type === 3 ? "bus" : "train";
    fareByMode[key] = round((fareByMode[key] ?? 0) + l.fare_total);
  }
  return {
    itinerary_number: n,
    places,
    start_time: iso(start),
    end_time: iso(end),
    total_time_hr: round((end.getTime() - start.getTime()) / 3.6e6),
    legs,
    total_visit_time_hr: round(totalVisit),
    total_travel_time_hr: round(totalTravelMin / 60),
    total_walking_time_hr: round(totalWalkMin / 60),
    total_transit_time_hr: round(totalTransitMin / 60),
    total_wait_time_hr: round(totalWaitMin / 60),
    average_place_score: round(order.reduce((s, p) => s + p.final_score, 0) / (order.length || 1)),
    all_legs_have_transit: legs.length > 0 && withTransit === legs.length,
    transit_availability_summary:
      legs.length === 0 ? "Single stop" : `${withTransit}/${legs.length} legs have transit`,
    total_fare: round(totalFare),
    fare_breakdown: fareByMode,
    fare_notes: ["Fares are estimates based on distance."],
  };
}

export function mockCombination(req: CombinationRequest): CombinationResponse {
  const start = req.start_location ?? null;
  // The frontend now always suggests a food stop rather than auto-inserting
  // one (see app/combination/page.tsx) — this just builds from whatever the
  // user actually selected.
  const places = req.places;
  const optimal = nearestNeighbour(places, start);
  const byScore = places.slice().sort((a, b) => b.final_score - a.final_score);
  const itineraries: ItineraryResult[] = [];
  itineraries.push(assemble(optimal, { ...req, places }, 1));
  if (places.length > 1) itineraries.push(assemble(byScore, { ...req, places }, 2));
  const limited = itineraries.slice(0, req.limit ?? 5);
  return {
    total_itineraries: limited.length,
    available_hours: req.available_hours,
    departure_time: req.departure_time,
    itineraries: limited,
  };
}

// ── Routing ─────────────────────────────────────────────────────────────────
function walkStep(from: string, to: string, distKm: number, dep: Date): { step: RouteStep; end: Date } {
  const min = (distKm / 5) * 60;
  const end = addMin(dep, min);
  return {
    step: {
      mode: "Walk", mode_label: "Walk", agency: "",
      instruction: `Walk to ${to}`, from_name: from, to_name: to,
      departure_time: iso(dep), arrival_time: iso(end),
      duration_minutes: round(min), distance_km: round(distKm),
    },
    end,
  };
}
function transitStep(mode: string, routeType: number, routeName: string, from: string, to: string, distKm: number, dep: Date): { step: RouteStep; end: Date; wait: number } {
  const speed = MODE_SPEED_KMPH[mode] ?? 20;
  const weekend = dep.getDay() === 0 || dep.getDay() === 6;
  // Bus gets a realistic minimum wait — a real bus almost never shows up
  // on the scheduled minute, unlike metro/train on dedicated track.
  const wait = mode === "Metro" ? 5 : mode === "Train" ? (weekend ? 11 : 6) : weekend ? 20 : 15;
  const ride = (distKm / speed) * 60;
  const board = addMin(dep, wait);
  const end = addMin(board, ride);
  const freq = mode === "Metro";
  const modeLabel = mode === "Bus" ? `MTC Bus ${routeName}` : mode === "Metro" ? `CMRL Metro ${routeName}` : `SR ${routeName}`;
  const agency = mode === "Bus" ? "MTC" : mode === "Metro" ? "CMRL" : "SR";
  return {
    step: {
      mode, mode_label: modeLabel, agency,
      instruction: `Take ${modeLabel} from ${from} to ${to}`,
      from_name: from, to_name: to,
      board_stop: from, alight_stop: to,
      departure_time: iso(board), arrival_time: iso(end),
      duration_minutes: round(ride), route_name: routeName, route_type: routeType,
      trip_id: `T${routeName}`, service_id: weekend ? "weekend" : "weekday",
      is_frequency_based: freq, headway_seconds: freq ? 360 : null,
      frequency_window: freq ? "08:00-11:00" : null, wait_time_minutes: round(wait),
    },
    end, wait,
  };
}

function buildRoute(kind: "metro" | "bus" | "train", req: RoutingRequest, distKm: number): RouteResult | null {
  const dep = new Date(req.departure_time);
  const steps: RouteStep[] = [];
  const firstWalk = Math.min(0.7, distKm * 0.08);
  const lastWalk = Math.min(0.6, distKm * 0.07);
  const midDist = Math.max(0.3, distKm - firstWalk - lastWalk);
  let cursor = dep;
  let walkMin = 0, transitMin = 0, waitTotal = 0, transfers = 0;
  const modesUsed: string[] = [];

  const dest = req.destination_name || "destination";
  // Find matching place in SEED_PLACES for real stop names
  const matchedPlace = SEED_PLACES.find((p) => dest.includes(p.name) || p.name.includes(dest.split(",")[0]));
  const placeName = matchedPlace?.name ?? dest.split(",")[0];

  // Real GTFS stop names only — null means no curated stop is confidently
  // known nearby, and this mode must be skipped rather than offered
  // through a made-up station name (that used to read as, e.g., a "Metro
  // Station" existing at a beach with no metro anywhere near it).
  const metroStation = getStopName(placeName, "Metro");
  const railwayStation = getStopName(placeName, "Train");
  const busStop = getStopName(placeName, "Bus");
  const busTerminal = `${placeName} Bus Terminal`;
  const junction = `${placeName} Junction`;

  if (kind === "metro" && !metroStation) return null;
  if (kind === "bus" && !busStop) return null;
  if (kind === "train" && (!railwayStation || !busStop)) return null;

  if (kind === "metro") {
    const metro = metroStation!; // guarded above
    const w1 = walkStep("Your location", metro, firstWalk, cursor);
    steps.push(w1.step); walkMin += w1.step.duration_minutes ?? 0; cursor = w1.end;
    const t = transitStep("Metro", 1, "M1", metro, metro, midDist, cursor);
    steps.push(t.step); transitMin += t.step.duration_minutes ?? 0; waitTotal += t.wait; cursor = t.end;
    modesUsed.push("Metro");
    const w2 = walkStep(metro, "destination", lastWalk, cursor);
    steps.push(w2.step); walkMin += w2.step.duration_minutes ?? 0; cursor = w2.end;
  } else if (kind === "bus") {
    const bus = busStop!; // guarded above
    const w1 = walkStep("Your location", bus, firstWalk, cursor);
    steps.push(w1.step); walkMin += w1.step.duration_minutes ?? 0; cursor = w1.end;
    const t = transitStep("Bus", 3, "51C", bus, bus, midDist, cursor);
    steps.push(t.step); transitMin += t.step.duration_minutes ?? 0; waitTotal += t.wait; cursor = t.end;
    modesUsed.push("Bus");
    const w2 = walkStep(bus, "destination", lastWalk, cursor);
    steps.push(w2.step); walkMin += w2.step.duration_minutes ?? 0; cursor = w2.end;
  } else {
    // Train + Bus: Railway Station → Junction → Bus Terminal → Bus Stop
    const rail = railwayStation!; // guarded above
    const bus = busStop!; // guarded above
    const w1 = walkStep("Your location", rail, firstWalk, cursor);
    steps.push(w1.step); walkMin += w1.step.duration_minutes ?? 0; cursor = w1.end;
    const half = midDist * 0.6;
    const t1 = transitStep("Train", 2, "EMU", rail, junction, half, cursor);
    steps.push(t1.step); transitMin += t1.step.duration_minutes ?? 0; waitTotal += t1.wait; cursor = t1.end;
    const tw = walkStep(junction, busTerminal, 0.2, cursor);
    steps.push(tw.step); walkMin += tw.step.duration_minutes ?? 0; cursor = tw.end;
    const t2 = transitStep("Bus", 3, "21G", busTerminal, bus, midDist - half, cursor);
    steps.push(t2.step); transitMin += t2.step.duration_minutes ?? 0; waitTotal += t2.wait; cursor = t2.end;
    const w2 = walkStep(bus, "destination", lastWalk, cursor);
    steps.push(w2.step); walkMin += w2.step.duration_minutes ?? 0; cursor = w2.end;
    transfers = 1;
    modesUsed.push("Train", "Bus");
  }

  const total = (cursor.getTime() - dep.getTime()) / 60000;
  return {
    total_duration_minutes: round(total),
    departure_time: iso(dep), arrival_time: iso(cursor),
    transfers, steps, modes_used: modesUsed,
    total_walking_minutes: round(walkMin), total_transit_minutes: round(transitMin),
    final_score: round(total + transfers * 8 + walkMin * 0.3),
  };
}

export function mockRouting(req: RoutingRequest): RoutingResponse {
  const distKm = haversineKm(
    { latitude: req.origin.latitude, longitude: req.origin.longitude },
    { latitude: req.destination.latitude, longitude: req.destination.longitude },
  );
  // A mode is dropped entirely (buildRoute returns null) when no real
  // stop is confidently known for it — same as the live backend returning
  // zero routes when it finds no nearby stops, rather than inventing one.
  const routes = [
    buildRoute("metro", req, distKm),
    buildRoute("bus", req, distKm),
    buildRoute("train", req, distKm),
  ]
    .filter((r): r is RouteResult => r !== null)
    .sort((a, b) => (a.final_score ?? 0) - (b.final_score ?? 0));
  const limited = routes.slice(0, req.max_results ?? 10);
  return { total_routes: limited.length, routes: limited };
}

// ── small utils ──────────────────────────────────────────────────────────────
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function addMin(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60000);
}
function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function routeNo(i: number): string {
  const nums = ["51C", "21G", "M45", "5E", "70", "29C"];
  return nums[i % nums.length];
}

function metroLine(i: number): string {
  const lines = ["M1", "M2", "Blue Line", "Green Line"];
  return lines[i % lines.length];
}
