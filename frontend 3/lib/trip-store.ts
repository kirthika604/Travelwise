// ---------------------------------------------------------------------------
// Cross-page trip state (Zustand + sessionStorage).
// Persists the user's location, filters, selected places, chosen itinerary and
// the routing hand-off so the Login → Discover → Combination → Routes flow
// keeps its context across navigations and reloads (within the tab).
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BudgetLevel, ItineraryResult, PlaceResult } from "./types";
import { DEFAULT_AVAILABLE_HOURS, DEFAULT_RADIUS_KM } from "./constants";

export interface Filters {
  interests: string[];
  budget: BudgetLevel | null;
  available_hours: number | null;
  radius_km: number | null;
  preferred_time: string | null;
}

// How the Routes page was reached.
export type RouteContext =
  | {
      mode: "single";
      origin: { latitude: number; longitude: number };
      destination: { latitude: number; longitude: number };
      destinationName: string;
    }
  | {
      mode: "itinerary";
      itinerary: ItineraryResult;
    }
  | null;

interface TripState {
  // location
  location: { latitude: number; longitude: number } | null;
  locationLabel: string | null;
  locationEnabled: boolean;

  filters: Filters;

  // selection for the combination engine
  selected: PlaceResult[];

  chosenItinerary: ItineraryResult | null;
  routeContext: RouteContext;

  // actions
  setLocation: (loc: { latitude: number; longitude: number } | null, label?: string | null) => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleSelect: (place: PlaceResult) => void;
  isSelected: (id: number) => boolean;
  clearSelected: () => void;
  setChosenItinerary: (it: ItineraryResult | null) => void;
  setRouteContext: (ctx: RouteContext) => void;
  resetAll: () => void;
}

const DEFAULT_FILTERS: Filters = {
  interests: [],
  budget: null,
  available_hours: DEFAULT_AVAILABLE_HOURS,
  radius_km: DEFAULT_RADIUS_KM,
  preferred_time: null,
};

// SSR-safe storage: sessionStorage on the client, a no-op on the server.
const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? window.sessionStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
);

export const useTrip = create<TripState>()(
  persist(
    (set, get) => ({
      location: null,
      locationLabel: null,
      locationEnabled: false,
      filters: DEFAULT_FILTERS,
      selected: [],
      chosenItinerary: null,
      routeContext: null,

      setLocation: (loc, label = null) =>
        set({ location: loc, locationEnabled: !!loc, locationLabel: label }),

      setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),

      toggleSelect: (place) => {
        const exists = get().selected.some((p) => p.id === place.id);
        set({
          selected: exists
            ? get().selected.filter((p) => p.id !== place.id)
            : [...get().selected, place],
        });
      },

      isSelected: (id) => get().selected.some((p) => p.id === id),

      clearSelected: () => set({ selected: [] }),

      setChosenItinerary: (it) => set({ chosenItinerary: it }),

      setRouteContext: (ctx) => set({ routeContext: ctx }),

      resetAll: () =>
        set({
          location: null,
          locationLabel: null,
          locationEnabled: false,
          filters: DEFAULT_FILTERS,
          selected: [],
          chosenItinerary: null,
          routeContext: null,
        }),
    }),
    {
      name: "travelwise-trip",
      storage: safeStorage,
    },
  ),
);
