"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, SlidersHorizontal, MapPin, RotateCcw, ArrowUpDown, Sparkles } from "lucide-react";
import VideoBackground from "@/components/ui/VideoBackground";
import Stepper from "@/components/ui/Stepper";
import Loader from "@/components/ui/Loader";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import HorizontalCardRow from "@/components/ui/HorizontalCardRow";
import PlaceCard from "@/components/discover/PlaceCard";
import FindPlaceSheet from "@/components/discover/FindPlaceSheet";
import PlaceDetailSheet from "@/components/discover/PlaceDetailSheet";
import SelectionTray from "@/components/discover/SelectionTray";
import AddMemorySheet from "@/components/explorer/AddMemorySheet";
import LevelUpModal from "@/components/explorer/LevelUpModal";
import PassportLink from "@/components/ui/PassportLink";
import { discover, type Source } from "@/lib/api";
import { useTrip, type Filters } from "@/lib/trip-store";
import { useExplorer } from "@/lib/explorer-store";
import { useRequireAuth } from "@/lib/use-require-auth";
import { CHENNAI_CENTER } from "@/lib/constants";
import type { PlaceResult } from "@/lib/types";

type Mode = "browse" | "ranked";

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-night-950" />}>
      <DiscoverPageInner />
    </Suspense>
  );
}

function DiscoverPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading } = useRequireAuth();
  // Arriving straight from the login page's clouds zoom-through — run the
  // settle + card-reveal choreography instead of popping in immediately.
  const isIntro = searchParams.get("intro") === "1";
  const [showContent, setShowContent] = useState(!isIntro);
  const location = useTrip((s) => s.location);
  const locationLabel = useTrip((s) => s.locationLabel);
  const filters = useTrip((s) => s.filters);
  const setFilters = useTrip((s) => s.setFilters);
  const toggleSelect = useTrip((s) => s.toggleSelect);
  const isSelected = useTrip((s) => s.isSelected);
  const setRouteContext = useTrip((s) => s.setRouteContext);
  const setLocation = useTrip((s) => s.setLocation);
  const hasVisited = useExplorer((s) => s.hasVisited);

  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("browse");
  const [findOpen, setFindOpen] = useState(false);
  const [detail, setDetail] = useState<PlaceResult | null>(null);
  const [memoryPlace, setMemoryPlace] = useState<PlaceResult | null>(null);

  const origin = location ?? CHENNAI_CENTER;

  const runDiscovery = useCallback(
    async (f: Filters, nextMode: Mode) => {
      setLoading(true);
      const res = await discover({
        // browse = neutral nearby (no vibe filter); ranked = full filters
        interests: nextMode === "ranked" ? f.interests : [],
        budget: nextMode === "ranked" ? f.budget : null,
        available_hours: f.available_hours,
        preferred_time: nextMode === "ranked" ? f.preferred_time : null,
        latitude: origin.latitude,
        longitude: origin.longitude,
        radius_km: f.radius_km,
        limit: nextMode === "ranked" ? 40 : 36,
      });
      setPlaces(res.data.places);
      setSource(res.source);
      setError(res.error);
      setMode(nextMode);
      setLoading(false);
    },
    [origin.latitude, origin.longitude],
  );

  // initial nearby browse
  useEffect(() => {
    runDiscovery(filters, "browse");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.latitude, origin.longitude]);

  // Intro choreography: reveal cards shortly after arriving from the login
  // hand-off — the backdrop video loops continuously now, so there's nothing
  // to wait on. Clean the ?intro=1 flag after so a refresh doesn't replay it.
  useEffect(() => {
    if (!isIntro) return;
    const reveal = setTimeout(() => setShowContent(true), 350);
    const cleanUrl = setTimeout(() => router.replace("/discover"), 900);
    return () => {
      clearTimeout(reveal);
      clearTimeout(cleanUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntro]);

  const applyFilters = (f: Filters) => {
    setFilters(f);
    runDiscovery(f, "ranked");
  };

  const backToBrowse = () => {
    setFilters({ interests: [], budget: null, preferred_time: null });
    runDiscovery({ ...filters, interests: [], budget: null, preferred_time: null }, "browse");
  };

  const goRoute = (p: PlaceResult) => {
    // If origin is just the fallback (Chennai centre), try to get real location first
    const isFallback = !location;
    const doRoute = (realOrigin: { latitude: number; longitude: number }) => {
      setRouteContext({
        mode: "single",
        origin: realOrigin,
        destination: { latitude: p.latitude, longitude: p.longitude },
        destinationName: p.name,
      });
      router.push("/routes");
    };
    if (isFallback && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setLocation(loc, "Your live location");
          doRoute(loc);
        },
        () => doRoute(origin), // fallback to CHENNAI_CENTER
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
      );
    } else {
      doRoute(origin);
    }
  };

  // Ranked mode should reflect the actual match (interest/budget/time/
  // distance/rating blend the backend already sorted by) — sorting by raw
  // rating instead ignored interest matching entirely and let any
  // well-rated food place outrank a genuinely matching, unrated POI.
  const rankedPlaces = useMemo(() => {
    if (mode !== "ranked") return [];
    return [...places].sort((a, b) => b.final_score - a.final_score);
  }, [places, mode]);

  const fitsTime = (p: PlaceResult) =>
    p.time_needed_min_hr != null && filters.available_hours != null && p.time_needed_min_hr <= filters.available_hours;

  const activeFilterCount = filters.interests.length + (filters.budget ? 1 : 0) + (filters.preferred_time ? 1 : 0);

  if (authLoading) return <div className="min-h-screen bg-night-950" />;

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <VideoBackground fadeIn={isIntro} />

      <div
        className={`relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-28 sm:px-6 ${
          showContent ? "" : "opacity-0"
        }`}
      >
        {/* top bar */}
        <header
          className={`sticky top-0 z-20 -mx-4 mb-2 flex items-center justify-between gap-3 bg-night-950/40 px-4 py-4 backdrop-blur-md sm:mx-0 sm:rounded-b-2xl sm:px-4 transition-opacity duration-700 ${
            showContent ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 font-display font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-lagoon-gradient text-night-950">
              <Compass size={17} />
            </span>
            <span className="hidden sm:inline">TravelWise</span>
          </div>
          <Stepper current={2} />
          <div className="flex items-center gap-2">
            <PassportLink />
            <DataSourceBadge source={source} error={error} />
          </div>
        </header>

        {/* title row */}
        <div
          className={`mb-5 flex flex-wrap items-end justify-between gap-4 transition-all duration-700 delay-100 ${
            showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {mode === "browse" ? "Explore around you" : "Your ranked matches"}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
              <MapPin size={14} className="text-lagoon-300" />
              {locationLabel ?? "Chennai"} ·{" "}
              {mode === "browse" ? "a few places nearby" : `${places.length} places, best match first`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {mode === "ranked" && (
              <button onClick={backToBrowse} className="btn-ghost text-sm">
                <RotateCcw size={15} /> Reset
              </button>
            )}
            <button onClick={() => setFindOpen(true)} className="btn-primary">
              <SlidersHorizontal size={16} /> Find place
              {activeFilterCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-night-950/30 px-1 text-xs">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* content */}
        {loading ? (
          <Loader label="Finding places around you…" />
        ) : places.length === 0 ? (
          <EmptyState onFind={() => setFindOpen(true)} />
        ) : (
          /* Single horizontal row of portrait cards — browse or ranked */
          <div
            className={`transition-all duration-700 delay-200 ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
              {mode === "browse" ? (
                <>
                  <MapPin size={13} /> Swipe to explore nearby places
                </>
              ) : (
                <>
                  <ArrowUpDown size={13} /> Ranked by vibe, budget, time & distance match
                </>
              )}
            </div>
            <HorizontalCardRow nudgeBy={300}>
              {(mode === "ranked" ? rankedPlaces : places).map((p, i) => (
                <div
                  key={p.id}
                  className="animate-card-reveal"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <PlaceCard
                    place={p}
                    rank={mode === "ranked" ? i + 1 : undefined}
                    selected={isSelected(p.id)}
                    fitsTime={fitsTime(p)}
                    onOpen={() => setDetail(p)}
                    onToggle={() => toggleSelect(p)}
                    onRoute={() => goRoute(p)}
                  />
                </div>
              ))}
            </HorizontalCardRow>
          </div>
        )}

        {/* not satisfied? hint → combination */}
        {!loading && places.length > 0 && showContent && (
          <p className="mt-10 text-center text-sm text-slate-400 transition-opacity duration-700 delay-500">
            <Sparkles size={14} className="mb-0.5 mr-1 inline text-lagoon-300" />
            Add a few places you like to build a multi-stop day, or plan a route straight to one.
          </p>
        )}
      </div>

      <SelectionTray onBuild={() => router.push("/combination")} />

      <FindPlaceSheet open={findOpen} onClose={() => setFindOpen(false)} initial={filters} onApply={applyFilters} />
      <PlaceDetailSheet
        place={detail}
        open={!!detail}
        selected={detail ? isSelected(detail.id) : false}
        visited={detail ? hasVisited(detail.id) : false}
        onClose={() => setDetail(null)}
        onToggle={() => detail && toggleSelect(detail)}
        onRoute={() => {
          if (detail) {
            const p = detail;
            setDetail(null);
            goRoute(p);
          }
        }}
        onMarkVisited={() => detail && setMemoryPlace(detail)}
      />
      <AddMemorySheet
        place={
          memoryPlace
            ? {
                id: memoryPlace.id,
                name: memoryPlace.name,
                category: memoryPlace.category,
                latitude: memoryPlace.latitude,
                longitude: memoryPlace.longitude,
              }
            : null
        }
        open={!!memoryPlace}
        onClose={() => setMemoryPlace(null)}
      />
      <LevelUpModal />
    </main>
  );
}

function EmptyState({ onFind }: { onFind: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.08]">
        <Compass className="text-lagoon-300" size={26} />
      </div>
      <h3 className="font-display text-lg font-semibold text-white">No places match yet</h3>
      <p className="mt-2 text-sm text-slate-400">Try widening your distance, budget or vibe to see more of the city.</p>
      <button onClick={onFind} className="btn-primary mx-auto mt-5">
        <SlidersHorizontal size={16} /> Adjust filters
      </button>
    </div>
  );
}
