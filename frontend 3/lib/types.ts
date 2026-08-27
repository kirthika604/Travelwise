// ---------------------------------------------------------------------------
// TravelWise API types — mirror the FastAPI Pydantic schemas exactly.
// Backend: data/backend_fixed/app/engines/{discovery,combination,routing}
// ---------------------------------------------------------------------------

export type BudgetLevel = "Low" | "Medium" | "High";
export type TimeOfDay =
  | "Morning"
  | "Afternoon"
  | "Evening"
  | "Night"
  | "Sunrise"
  | "Daytime"
  | "Anytime";

export interface LatLng {
  latitude: number;
  longitude: number;
}

// ── Discovery ──────────────────────────────────────────────────────────────
export interface DiscoveryRequest {
  interests?: string[];
  budget?: BudgetLevel | null;
  available_hours?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  radius_km?: number | null;
  preferred_time?: string | null;
  source?: "poi" | "food" | null;
  limit?: number;
}

export interface PlaceResult {
  id: number;
  name: string;
  source: string; // 'poi' | 'food'
  description?: string | null;
  category: string;

  budget_level?: BudgetLevel | null;

  entry_fee_min?: number | null;
  entry_fee_max?: number | null;
  avg_expense_min?: number | null;
  avg_expense_max?: number | null;

  time_needed_min_hr?: number | null;
  time_needed_max_hr?: number | null;

  best_time_of_day: string[];

  rating?: number | null;

  image_url?: string | null;
  location_url?: string | null;

  latitude: number;
  longitude: number;

  distance_km?: number | null;

  interest_score: number;
  budget_score: number;
  time_score: number;
  distance_score: number;
  rating_score: number;
  final_score: number;

  tags: string[];
  cuisines: string[];
}

export interface DiscoveryResponse {
  total_results: number;
  places: PlaceResult[];
}

// ── Combination ──────────────────────────────────────────────────────────────
export interface PlaceInput {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  time_needed_min_hr?: number | null;
  time_needed_max_hr?: number | null;
  final_score: number;
  best_time_of_day?: string[];
  source?: "poi" | "food"; // lets the backend know if this pick is already a food stop
}

export interface ItineraryLeg {
  from_place_name: string;
  to_place_name: string;
  from_latitude: number;
  from_longitude: number;
  to_latitude: number;
  to_longitude: number;

  depart_at: string; // ISO datetime
  arrive_at: string;
  travel_duration_minutes: number;

  mode: string; // Walk, Bus, Metro, Train, Walk+Bus, ...
  mode_label: string; // Friendly label: 'MTC Bus 51C', 'CMRL Metro Blue Line'
  agency: string; // Transit agency: 'MTC', 'CMRL', 'SR'
  transit_available: boolean;

  walking_distance_km: number;
  walking_minutes: number;

  route_name?: string | null;
  route_type?: number | null;
  trip_id?: string | null;
  service_id?: string | null;
  board_stop?: string | null; // Actual GTFS stop name where user boards
  alight_stop?: string | null; // Actual GTFS stop name where user alights
  wait_time_minutes: number;
  transit_time_minutes: number;
  transfers: number;

  route_steps?: RouteStepDetail[]; // Detailed step-by-step breakdown
  steps_summary: string[];

  fare_total: number;
  fare_breakdown: Record<string, number>;
  fare_notes: string[];
}

export interface CombinationPlace {
  id: number;
  name: string;
  order: number;
  latitude: number;
  longitude: number;
  visit_duration_hr: number;
  score: number;
  arrive_at?: string | null;
  depart_at?: string | null;
  best_time_of_day: string[];
  source: "poi" | "food"; // marks the auto-added / picked food stop(s)
}

export interface ItineraryResult {
  itinerary_number: number;
  places: CombinationPlace[];
  start_time: string;
  end_time: string;
  total_time_hr: number;
  legs: ItineraryLeg[];
  total_visit_time_hr: number;
  total_travel_time_hr: number;
  total_walking_time_hr: number;
  total_transit_time_hr: number;
  total_wait_time_hr: number;
  average_place_score: number;
  all_legs_have_transit: boolean;
  transit_availability_summary: string;
  total_fare: number;
  fare_breakdown: Record<string, number>;
  fare_notes: string[];
}

export interface CombinationRequest {
  places: PlaceInput[];
  available_hours: number;
  departure_time: string; // ISO datetime
  start_location?: LatLng | null;
  max_walking_distance_km?: number;
  max_transfers_per_leg?: number;
  fallback_walk_speed_kmph?: number;
  limit?: number;
  include_nearby_food?: boolean; // top up with a nearby food stop if none picked
  food_search_radius_km?: number;
}

export interface CombinationResponse {
  total_itineraries: number;
  available_hours: number;
  departure_time: string;
  itineraries: ItineraryResult[];
}

// ── Routing ──────────────────────────────────────────────────────────────
export interface RoutePreferences {
  prefer_fewer_transfers?: boolean;
  prefer_less_walking?: boolean;
  prefer_modes?: string[];
  avoid_modes?: string[];
  max_walking_minutes?: number | null;
  weight_duration?: number;
  weight_transfers?: number;
  weight_walking?: number;
  weight_mode_preference?: number;
}

export interface RoutingRequest {
  origin: LatLng;
  destination: LatLng;
  departure_time: string; // ISO datetime
  max_walking_distance_km?: number;
  max_results?: number;
  max_transfers?: number;
  preferences?: RoutePreferences;
  destination_name?: string; // Optional human-readable name for display
}

export interface RouteStepDetail {
  mode: string; // Walk, Bus, Metro, Train, Ferry
  mode_label: string; // Friendly label: 'MTC Bus 51C', 'CMRL Metro Blue Line'
  instruction: string;
  from_name: string;
  to_name: string;
  departure_time?: string | null;
  arrival_time?: string | null;
  duration_minutes?: number | null;
  distance_km?: number | null;
  route_name?: string | null;
  route_type?: number | null;
  agency?: string | null; // Transit agency: 'MTC', 'CMRL', 'SR'
  trip_id?: string | null;
  service_id?: string | null;
  board_stop?: string | null; // Actual GTFS stop name where user boards
  alight_stop?: string | null; // Actual GTFS stop name where user alights
}

export interface RouteStep {
  mode: string; // Walk, Bus, Metro, Train, Ferry, Tram
  mode_label: string; // Friendly label: 'MTC Bus 51C', 'CMRL Metro Blue Line'
  agency: string; // Transit agency: 'MTC', 'CMRL', 'SR'
  instruction: string;
  from_name: string;
  to_name: string;
  departure_time?: string | null;
  arrival_time?: string | null;
  duration_minutes?: number | null;
  distance_km?: number | null;
  route_name?: string | null;
  route_type?: number | null;
  trip_id?: string | null;
  service_id?: string | null;
  board_stop?: string | null; // Actual GTFS stop name where user boards
  alight_stop?: string | null; // Actual GTFS stop name where user alights
  is_frequency_based?: boolean;
  headway_seconds?: number | null;
  frequency_window?: string | null;
  wait_time_minutes?: number | null;
}

export interface RouteResult {
  total_duration_minutes: number;
  departure_time: string;
  arrival_time: string;
  transfers: number;
  steps: RouteStep[];
  modes_used: string[];
  total_walking_minutes: number;
  total_transit_minutes: number;
  score_duration?: number | null;
  score_transfers?: number | null;
  score_walking?: number | null;
  score_mode_preference?: number | null;
  final_score?: number | null;
}

export interface RoutingResponse {
  total_routes: number;
  routes: RouteResult[];
}

// ── Places / Transit lookups ──────────────────────────────────────────────────
export interface PlaceSummary {
  id: number;
  source: string;
  name: string;
  category: string;
  budget_level?: BudgetLevel | null;
  rating?: number | null;
  image_url?: string | null;
  location_url?: string | null;
  lat: number;
  lon: number;
  distance_km?: number | null;
}

export interface NearbyStop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
  distance_m: number;
  route_short_names: string[];
  modes: number[];
}
