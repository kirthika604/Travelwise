// ---------------------------------------------------------------------------
// Explorer Passport state (Zustand + localStorage). Separate from
// lib/trip-store.ts on purpose: trip-store is per-session planning context,
// this is a lifetime record that should survive across sessions/tabs.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CheckInRequest, ExplorerScore, VisitRecord } from "./explorer-types";
import { checkIn as apiCheckIn } from "./explorer-api";

type CheckInInput = Omit<CheckInRequest, "deviceId">;
type CheckInOutcome = { ok: true; isNewPlace: boolean } | { ok: false; error: string };

interface ExplorerState {
  deviceId: string;
  visits: VisitRecord[];
  score: ExplorerScore;
  source: "live" | "mock" | null;
  isCheckingIn: boolean;
  hasVisited: (placeId: number) => boolean;
  checkIn: (req: CheckInInput) => Promise<CheckInOutcome>;
}

function genDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? window.localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
);

export const useExplorer = create<ExplorerState>()(
  persist(
    (set, get) => ({
      deviceId: genDeviceId(),
      visits: [],
      score: { score: 0, placesVisited: 0, categoriesExplored: 0, totalDistanceKm: 0 },
      source: null,
      isCheckingIn: false,

      hasVisited: (placeId) => get().visits.some((v) => v.placeId === placeId),

      checkIn: async (req) => {
        set({ isCheckingIn: true });
        try {
          const full: CheckInRequest = { ...req, deviceId: get().deviceId };
          const res = await apiCheckIn(full, get().visits);
          set({
            visits: [res.data.visit, ...get().visits],
            score: res.data.score,
            source: res.source,
            isCheckingIn: false,
          });
          return { ok: true, isNewPlace: res.data.isNewPlace };
        } catch (e) {
          set({ isCheckingIn: false });
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    {
      name: "travelwise-explorer",
      storage: safeStorage,
      partialize: (s) => ({ deviceId: s.deviceId, visits: s.visits, score: s.score }),
    },
  ),
);
