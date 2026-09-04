"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Layers, MapPin, Plus, X, Clock, RefreshCw, Sparkles, CalendarDays, UtensilsCrossed, Star } from "lucide-react";
import VideoBackground from "@/components/ui/VideoBackground";
import Stepper from "@/components/ui/Stepper";
import Loader from "@/components/ui/Loader";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import PassportLink from "@/components/ui/PassportLink";
import VibeIcon from "@/components/ui/VibeIcon";
import TimeIcon from "@/components/ui/TimeIcon";
import ItineraryCard from "@/components/combination/ItineraryCard";
import { combine, discover, type Source } from "@/lib/api";
import { useTrip } from "@/lib/trip-store";
import { CHENNAI_CENTER, vibeFor } from "@/lib/constants";
import { dateAndHourToISO, localDateStr, isWeekend, formatAvailableHours, formatDistance } from "@/lib/geo";
import { useRequireAuth } from "@/lib/use-require-auth";
import type { ItineraryResult, PlaceInput, PlaceResult } from "@/lib/types";

const SUGGESTION_RADIUS_KM = 4;

const START_TIMES = [
  { hour: 8, label: "Morning", icon: "Sunrise" },
  { hour: 12, label: "Midday", icon: "Sun" },
  { hour: 15, label: "Afternoon", icon: "Sunset" },
  { hour: 18, label: "Evening", icon: "Moon" },
];

const DATE_QUICK_PICKS = [
  { label: "Today", offsetDays: 0 },
  { label: "Tomorrow", offsetDays: 1 },
];

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export default function CombinationPage() {
  const router = useRouter();
  const { loading: authLoading } = useRequireAuth();
  const location = useTrip((s) => s.location);
  const setLocation = useTrip((s) => s.setLocation);
  const selected = useTrip((s) => s.selected);
  const toggleSelect = useTrip((s) => s.toggleSelect);
  const filters = useTrip((s) => s.filters);
  const setChosenItinerary = useTrip((s) => s.setChosenItinerary);
  const setRouteContext = useTrip((s) => s.setRouteContext);
  // Lives in the shared trip store, not page-local state, so it survives the
  // "Add more" round trip through /discover and back — see trip-store.ts.
  const placeSuggestions = useTrip((s) => s.placeSuggestions);
  const setPlaceSuggestions = useTrip((s) => s.setPlaceSuggestions);
  const removePlaceSuggestion = useTrip((s) => s.removePlaceSuggestion);
  const suggestionsDismissed = useTrip((s) => s.suggestionsDismissed);
  const setSuggestionsDismissed = useTrip((s) => s.setSuggestionsDismissed);

  const [hours, setHours] = useState<number>(filters.available_hours ?? 6);
  const [startHour, setStartHour] = useState<number>(8);
  const [dateStr, setDateStr] = useState<string>(() => localDateStr(new Date()));
  const [itineraries, setItineraries] = useState<ItineraryResult[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  const origin = location ?? CHENNAI_CENTER;
  // Split for the selection strip below — seeing places and food apart
  // makes it obvious at a glance what's actually going into the plan.
  const selectedPlaces = selected.filter((p) => p.source !== "food");
  const selectedFood = selected.filter((p) => p.source === "food");

  const build = useCallback(
    async (startLoc?: { latitude: number; longitude: number }) => {
      if (selected.length === 0) {
        setItineraries([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const places: PlaceInput[] = selected.map((p) => ({
        id: p.id,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        time_needed_min_hr: p.time_needed_min_hr,
        time_needed_max_hr: p.time_needed_max_hr,
        final_score: p.final_score,
        best_time_of_day: p.best_time_of_day,
        source: p.source === "food" ? "food" : "poi",
      }));
      const res = await combine({
        places,
        available_hours: hours,
        departure_time: dateAndHourToISO(dateStr, startHour),
        start_location: startLoc ?? origin,
        limit: 5,
        // The engine no longer auto-inserts a food stop — the frontend
        // suggests one instead (see the effect below) and only ever
        // includes it if the user explicitly adds it to `selected`.
        include_nearby_food: false,
      });
      setItineraries(res.data.itineraries);
      setSource(res.source);
      setError(res.error);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, hours, startHour, dateStr, origin.latitude, origin.longitude],
  );

  useEffect(() => {
    // If no real location, try to capture it first
    if (!location && "geolocation" in navigator) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setLocation(loc, "Your live location");
          setLocating(false);
          build(loc);
        },
        () => {
          setLocating(false);
          build(); // fallback to CHENNAI_CENTER
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } else {
      build();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build]);

  // Suggest — never auto-insert — nearby, time-feasible places (POIs AND
  // food, not food-only) to round out the plan. Uses the same discover()
  // path Discover itself uses, so suggestions reflect real data whenever
  // Live API is on, rather than only ever searching the mock's seed places.
  // "Feasible" is a lightweight visit-time budget check (remaining hours
  // after what's already selected), not a full route computation — precise
  // enough for a soft suggestion without the cost of routing every
  // candidate just to decide whether to show it.
  useEffect(() => {
    if (suggestionsDismissed || selected.length === 0) {
      setPlaceSuggestions([]);
      return;
    }
    let ignore = false;
    const centroid = {
      latitude: selected.reduce((s, p) => s + p.latitude, 0) / selected.length,
      longitude: selected.reduce((s, p) => s + p.longitude, 0) / selected.length,
    };
    const committedHours = selected.reduce((s, p) => s + (p.time_needed_min_hr ?? 1.5), 0);
    const remainingHours = hours - committedHours;
    const selectedIds = new Set(selected.map((p) => p.id));
    discover({
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      radius_km: SUGGESTION_RADIUS_KM,
      limit: 12,
    }).then((res) => {
      if (ignore) return;
      const feasible = res.data.places
        .filter((p) => !selectedIds.has(p.id))
        .filter((p) => (p.time_needed_min_hr ?? 1) <= Math.max(remainingHours, 0))
        .slice(0, 4);
      setPlaceSuggestions(feasible);
    });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hours, suggestionsDismissed]);

  const addSuggestion = (place: PlaceResult) => {
    toggleSelect(place);
    removePlaceSuggestion(place.id);
  };

  const choose = (it: ItineraryResult) => {
    setChosenItinerary(it);
    setRouteContext({ mode: "itinerary", itinerary: it });
    router.push("/routes");
  };

  if (authLoading) return <div className="min-h-screen bg-night-950" />;

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <VideoBackground />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 sm:px-6">
        {/* top bar */}
        <header className="sticky top-0 z-20 -mx-4 mb-2 flex items-center justify-between gap-3 bg-night-950/40 px-4 py-4 backdrop-blur-md sm:mx-0 sm:rounded-b-2xl">
          <div className="flex items-center gap-2 font-display font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-lagoon-gradient text-night-950">
              <Compass size={17} />
            </span>
            <span className="hidden sm:inline">TravelWise</span>
          </div>
          <Stepper current={3} />
          <div className="flex items-center gap-2">
            <PassportLink />
            <DataSourceBadge source={source} error={error} />
          </div>
        </header>

        {/* title */}
        <div className="mb-5">
          <h1 className="animate-in font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Build your perfect day
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            We sequence your picks into time-aware plans connected by public transit — and suggest nearby places (food included) that still fit your time, no pressure.
          </p>
        </div>

        {selected.length === 0 ? (
          <EmptyState onBack={() => router.push("/discover")} />
        ) : (
          <>
            {/* selected strip */}
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Layers size={16} className="text-lagoon-300" /> Your places ({selected.length})
                </span>
                <button onClick={() => router.push("/discover")} className="btn-ghost px-3 py-1.5 text-xs">
                  <Plus size={14} /> Add more
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Places ({selectedPlaces.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPlaces.map((p) => (
                      <SelectedChip key={p.id} place={p} onRemove={() => toggleSelect(p)} />
                    ))}
                  </div>
                </div>
                {selectedFood.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <UtensilsCrossed size={11} /> Food ({selectedFood.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFood.map((p) => (
                        <SelectedChip key={p.id} place={p} onRemove={() => toggleSelect(p)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* nearby & feasible suggestions — never auto-added */}
            {placeSuggestions.length > 0 && (
              <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white">
                    <Sparkles size={14} className="text-lagoon-300" /> Nearby &amp; fits your time
                  </span>
                  <button onClick={() => setSuggestionsDismissed(true)} className="btn-ghost px-2.5 py-1 text-xs">
                    No thanks
                  </button>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {placeSuggestions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-3 pr-2"
                    >
                      {s.source === "food" && <UtensilsCrossed size={14} className="shrink-0 text-lagoon-300" />}
                      <div className="min-w-0">
                        <p className="max-w-[9rem] truncate text-sm text-slate-100">{s.name}</p>
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          {s.distance_km != null && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin size={10} /> {formatDistance(s.distance_km)}
                            </span>
                          )}
                          {s.rating != null && (
                            <span className="inline-flex items-center gap-0.5">
                              <Star size={10} className="fill-lagoon-300 text-lagoon-300" /> {s.rating.toFixed(1)}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => addSuggestion(s)}
                        aria-label={`Add ${s.name} to plan`}
                        className="btn-primary shrink-0 p-1.5"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* plan controls */}
            <div className="mb-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
                    <Clock size={15} className="text-lagoon-300" /> Time available
                  </span>
                  <span className="text-sm font-semibold text-lagoon-300">{formatAvailableHours(hours)}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={48}
                  step={1}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="w-full accent-lagoon-400"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                  <span>2h</span>
                  <span>24h</span>
                  <span>2 days</span>
                </div>
              </div>
              <div>
                <span className="mb-2 block text-sm text-slate-300">Start around</span>
                <div className="flex flex-wrap gap-2">
                  {START_TIMES.map((t) => {
                    const active = startHour === t.hour;
                    return (
                      <button key={t.hour} onClick={() => setStartHour(t.hour)} className={active ? "chip-active" : "chip-idle"}>
                        <TimeIcon icon={t.icon} size={14} /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
                    <CalendarDays size={15} className="text-lagoon-300" /> Plan for
                  </span>
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                      isWeekend(dateStr)
                        ? "border-coral-400/30 bg-coral-400/10 text-coral-400"
                        : "border-lagoon-500/30 bg-lagoon-500/10 text-lagoon-300",
                    ].join(" ")}
                  >
                    {isWeekend(dateStr) ? "Weekend service" : "Weekday service"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {DATE_QUICK_PICKS.map((d) => {
                    const value = localDateStr(d.offsetDays === 0 ? new Date() : addDays(new Date(), d.offsetDays));
                    const active = dateStr === value;
                    return (
                      <button key={d.label} onClick={() => setDateStr(value)} className={active ? "chip-active" : "chip-idle"}>
                        {d.label}
                      </button>
                    );
                  })}
                  <input
                    type="date"
                    value={dateStr}
                    min={localDateStr(new Date())}
                    onChange={(e) => e.target.value && setDateStr(e.target.value)}
                    className="chip-idle cursor-pointer border-white/[0.12] bg-white/[0.03] [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            {/* itineraries */}
            {loading ? (
              <Loader label={locating ? "Getting your live location…" : "Sequencing your day…"} />
            ) : itineraries.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
                <p className="text-sm text-slate-400">
                  Couldn&apos;t fit these places into {formatAvailableHours(hours)}. Try more time, or remove a stop.
                </p>
                <button onClick={() => build()} className="btn-ghost mx-auto mt-4">
                  <RefreshCw size={15} /> Rebuild
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
                  <Sparkles size={13} className="text-lagoon-300" />
                  {itineraries.length} plan{itineraries.length > 1 ? "s" : ""} — ordered by best overall experience
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {itineraries.map((it, i) => (
                    <ItineraryCard key={it.itinerary_number} itinerary={it} index={i} best={i === 0} onChoose={() => choose(it)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SelectedChip({ place, onRemove }: { place: PlaceResult; onRemove: () => void }) {
  const v = vibeFor(place.tags[0] || place.category);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2 text-sm">
      <span
        className="grid h-6 w-6 place-items-center rounded-full text-white"
        style={{ backgroundImage: `linear-gradient(135deg, ${v.from}, ${v.to})` }}
      >
        <VibeIcon icon={v.icon} size={13} />
      </span>
      <span className="max-w-[10rem] truncate text-slate-200">{place.name}</span>
      <button onClick={onRemove} className="text-slate-400 hover:text-white" aria-label={`Remove ${place.name}`}>
        <X size={14} />
      </button>
    </span>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.08]">
        <Layers className="text-lagoon-300" size={26} />
      </div>
      <h3 className="font-display text-lg font-semibold text-white">No places picked yet</h3>
      <p className="mt-2 text-sm text-slate-400">
        Head back to Discover and add a few places you like — we&apos;ll weave them into a day plan.
      </p>
      <button onClick={onBack} className="btn-primary mx-auto mt-5">
        <MapPin size={16} /> Back to Discover
      </button>
    </div>
  );
}
