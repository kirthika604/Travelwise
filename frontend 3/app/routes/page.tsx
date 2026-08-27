"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Compass,
  ChevronLeft,
  Route as RouteIcon,
  Clock,
  Repeat,
  Footprints,
  MapPin,
  Navigation,
  Leaf,
} from "lucide-react";
import Stepper from "@/components/ui/Stepper";
import Loader from "@/components/ui/Loader";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import TransitTimeline from "@/components/routes/TransitTimeline";
import RouteOptionCard from "@/components/routes/RouteOptionCard";
import type { RouteSegment, RouteWaypoint } from "@/components/routes/RouteMap";
import { route as fetchRoute, type Source } from "@/lib/api";
import { routeToUnified, itineraryToUnified, type UnifiedRoute } from "@/lib/route-view";
import { useTrip } from "@/lib/trip-store";
import { modeMeta, WALK_MODE } from "@/lib/constants";
import { toLocalISO, formatDurationMin, formatMoney, formatTime, co2SavedKg, formatCo2, type LngLat } from "@/lib/geo";

// maplibre-gl is browser-only → load the map without SSR.
const RouteMap = dynamic(() => import("@/components/routes/RouteMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const valid = (c: LngLat) => Number.isFinite(c[0]) && Number.isFinite(c[1]) && !(c[0] === 0 && c[1] === 0);

export default function RoutesPage() {
  const router = useRouter();
  const ctx = useTrip((s) => s.routeContext);
  const setLocation = useTrip((s) => s.setLocation);
  const savedLocation = useTrip((s) => s.location);

  const [options, setOptions] = useState<UnifiedRoute[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(ctx?.mode === "single");
  const [locating, setLocating] = useState(false);

  // Capture live geolocation if origin is missing, then fetch route
  useEffect(() => {
    if (!ctx) {
      setLoading(false);
      return;
    }
    if (ctx.mode === "itinerary") {
      setOptions([itineraryToUnified(ctx.itinerary)]);
      setLoading(false);
      return;
    }

    let ignore = false;

    const fetchRouteWith = async (origin: { latitude: number; longitude: number }) => {
      setLoading(true);
      try {
        const res = await fetchRoute({
          origin,
          destination: ctx.destination,
          departure_time: toLocalISO(new Date()),
          max_results: 4,
          destination_name: ctx.destinationName,
        });
        if (ignore) return;
        setOptions(res.data.routes.map(routeToUnified));
        setSource(res.source);
        setError(res.error);
        setSelectedIdx(0);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    const hasRealOrigin = ctx.origin && ctx.origin.latitude !== 0 && ctx.origin.longitude !== 0;
    const hasSavedLocation = savedLocation && savedLocation.latitude !== 0 && savedLocation.longitude !== 0;

    if (hasRealOrigin) {
      fetchRouteWith(ctx.origin);
    } else if (hasSavedLocation) {
      fetchRouteWith(savedLocation!);
    } else if ("geolocation" in navigator) {
      setLocating(true);
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (ignore) return;
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setLocation(loc, "Your live location");
          setLocating(false);
          fetchRouteWith(loc);
        },
        () => {
          if (ignore) return;
          setLocating(false);
          setLoading(false);
          setError("Couldn't access your location. Please enable location permissions and try again.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } else {
      setError("Location not available — please enable location access.");
      setLoading(false);
    }

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const selected = options[selectedIdx];
  const isItinerary = ctx?.mode === "itinerary";

  // map geometry
  const { segments, waypoints } = useMemo<{ segments: RouteSegment[]; waypoints: RouteWaypoint[] }>(() => {
    if (!ctx) return { segments: [], waypoints: [] };

    if (ctx.mode === "itinerary") {
      const it = ctx.itinerary;
      const segs: RouteSegment[] = it.legs
        .map((leg) => ({
          from: [leg.from_longitude, leg.from_latitude] as LngLat,
          to: [leg.to_longitude, leg.to_latitude] as LngLat,
          color: modeMeta(leg.mode, leg.route_type).color,
        }))
        .filter((s) => valid(s.from) && valid(s.to));
      const wps: RouteWaypoint[] = it.places.map((p, i) => ({
        lngLat: [p.longitude, p.latitude] as LngLat,
        label: p.name,
        kind: i === 0 ? "origin" : i === it.places.length - 1 ? "dest" : "stop",
        order: p.order,
      }));
      return { segments: segs, waypoints: wps };
    }

    // single: one arc origin → destination, coloured by the chosen transit mode
    const from: LngLat = [ctx.origin.longitude, ctx.origin.latitude];
    const to: LngLat = [ctx.destination.longitude, ctx.destination.latitude];
    const transit = selected?.steps.find((s) => !s.isWalk);
    const color = transit?.mode.color ?? WALK_MODE.color;
    return {
      segments: valid(from) && valid(to) ? [{ from, to, color }] : [],
      waypoints: [
        { lngLat: from, label: "Your location", kind: "origin" },
        { lngLat: to, label: ctx.destinationName, kind: "dest" },
      ],
    };
  }, [ctx, selected]);

  const title = isItinerary ? "Your day route" : ctx?.mode === "single" ? ctx.destinationName : "Routes";

  if (!ctx) return <NoContext onBack={() => router.push("/discover")} />;

  return (
    <main className="relative min-h-screen w-full bg-night-950">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 sm:px-6">
        {/* top bar */}
        <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center justify-between gap-3 bg-night-950/70 px-4 py-4 backdrop-blur-md sm:mx-0 sm:rounded-b-2xl">
          <div className="flex items-center gap-2 font-display font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-lagoon-gradient text-night-950">
              <Compass size={17} />
            </span>
            <span className="hidden sm:inline">TravelWise</span>
          </div>
          <Stepper current={4} />
          <DataSourceBadge source={source} error={error} />
        </header>

        {/* title */}
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full glass hover:bg-white/10" aria-label="Back">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="flex items-center gap-1.5 text-sm text-slate-400">
              <RouteIcon size={14} className="text-lagoon-300" />
              {isItinerary ? "Multi-stop journey by public transit" : "Get there by public transit"}
            </p>
          </div>
        </div>

        {loading ? (
          <Loader label={locating ? "Getting your live location…" : "Finding the best way there…"} />
        ) : options.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
            No public-transit route found for this trip.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,430px)_1fr]">
            {/* LEFT: options + timeline */}
            <section className="min-w-0">
              {/* transport combination chooser (single mode, multiple options) */}
              {!isItinerary && options.length > 1 && (
                <div className="mb-5">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Choose your transport</h2>
                  <div className="grid gap-3">
                    {options.map((r, i) => (
                      <RouteOptionCard key={i} route={r} index={i} selected={i === selectedIdx} best={i === 0} onSelect={() => setSelectedIdx(i)} />
                    ))}
                  </div>
                </div>
              )}

              {/* chosen route summary + full step flow */}
              {selected && (
                <div key={selectedIdx} className="animate-in card p-5">
                  <SummaryBar route={selected} />
                  <div className="my-4 h-px bg-white/10" />
                  <TransitTimeline steps={selected.steps} />
                </div>
              )}
            </section>

            {/* RIGHT: map */}
            <section className="lg:sticky lg:top-24 lg:self-start">
              <div className="relative h-[52vh] overflow-hidden rounded-3xl border border-white/10 shadow-glow lg:h-[calc(100vh-8rem)]">
                <RouteMap segments={segments} waypoints={waypoints} className="h-full w-full" />
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-night-950/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
                  <Navigation size={12} className="text-lagoon-300" /> Live route preview
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryBar({ route }: { route: UnifiedRoute }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-bold text-white">{formatDurationMin(route.totalDurationMin)}</p>
          {(route.departAt || route.arriveAt) && (
            <p className="text-sm text-slate-400">
              {formatTime(route.departAt)} → {formatTime(route.arriveAt)}
            </p>
          )}
        </div>
        {route.totalFare != null && route.totalFare > 0 && (
          <div className="text-right">
            <p className="font-display text-xl font-semibold text-lagoon-200">{formatMoney(route.totalFare)}</p>
            <p className="text-xs text-slate-500">est. fare</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {co2SavedKg(route.approxDistanceKm) > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-lagoon-500/30 bg-lagoon-500/10 px-2.5 py-1 font-medium text-lagoon-200"
            title="Estimated CO₂ vs driving a petrol car the same distance"
          >
            <Leaf size={12} /> ~{formatCo2(co2SavedKg(route.approxDistanceKm))} CO₂ saved vs driving
          </span>
        )}
        <Pill icon={<Repeat size={12} />}>
          {route.transfers} transfer{route.transfers === 1 ? "" : "s"}
        </Pill>
        {route.walkingMin != null && <Pill icon={<Footprints size={12} />}>{formatDurationMin(route.walkingMin)} walking</Pill>}
        {route.transitMin != null && route.transitMin > 0 && <Pill icon={<Clock size={12} />}>{formatDurationMin(route.transitMin)} in transit</Pill>}
        {route.modesUsed.slice(0, 4).map((m) => (
          <Pill key={m} icon={<MapPin size={12} />}>
            {m}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-300">
      <span className="text-lagoon-300">{icon}</span>
      {children}
    </span>
  );
}

function MapSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center bg-night-900">
      <Loader label="Loading map…" />
    </div>
  );
}

function NoContext({ onBack }: { onBack: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-night-950 px-6">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.08]">
          <RouteIcon className="text-lagoon-300" size={26} />
        </div>
        <h3 className="font-display text-lg font-semibold text-white">No route selected yet</h3>
        <p className="mt-2 text-sm text-slate-400">Pick a place or build a combination first, then we&apos;ll map the way there.</p>
        <button onClick={onBack} className="btn-primary mx-auto mt-5">
          <MapPin size={16} /> Go to Discover
        </button>
      </div>
    </main>
  );
}
