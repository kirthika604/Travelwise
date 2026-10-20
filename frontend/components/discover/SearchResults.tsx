"use client";

import { Loader2, MapPin, Navigation, SearchX } from "lucide-react";
import HorizontalCardRow from "@/components/ui/HorizontalCardRow";
import PlaceCard from "@/components/discover/PlaceCard";
import type { MapPlace, PlaceResult } from "@/lib/types";
import type { SearchOutcome } from "@/lib/search";
import { formatDistance, haversineKm } from "@/lib/geo";
import { normalize } from "@/lib/search";

export interface MapSearchState {
  status: "loading" | "done";
  results: MapPlace[];
  failed: boolean;
}

interface Handlers {
  isSelected: (id: number) => boolean;
  fitsTime: (p: PlaceResult) => boolean;
  onOpen: (p: PlaceResult) => void;
  onToggle: (p: PlaceResult) => void;
  onRoute: (p: PlaceResult) => void;
}

// What the Discover page shows while the search box has text in it. Our own
// places match instantly as you type; once Search is pressed the map is
// queried too, so anything a person can name — a shop, college, hospital,
// street — comes back with a Directions button, curated place or not.
export default function SearchResults({
  query,
  outcome,
  map,
  origin,
  onDirections,
  ...handlers
}: {
  query: string;
  outcome: SearchOutcome | null;
  map: MapSearchState | null;
  origin: { latitude: number; longitude: number };
  onDirections: (p: MapPlace) => void;
} & Handlers) {
  const q = query.trim();
  const tier = outcome?.tier;
  const hasMap = !!map && map.results.length > 0;

  // Map hits that are just a place we already show (same spot) are noise.
  const shown = [...(outcome?.matches ?? []), ...(outcome?.similar ?? [])];
  const bare = (n: string) => normalize(n).replace(/\bchennai\b/g, "").replace(/\s+/g, " ").trim();
  const mapResults = (map?.results ?? []).filter(
    (m) =>
      !shown.some(
        (p) => haversineKm({ latitude: p.latitude, longitude: p.longitude }, m) < 0.15 || bare(p.name) === bare(m.name),
      ),
  );

  const mapSection = map && (
    <MapGroup state={map} results={mapResults} origin={origin} onDirections={onDirections} />
  );

  if (!outcome) {
    return (
      <div>
        {mapSection}
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin" /> Loading our places…
        </p>
      </div>
    );
  }

  if (tier === "match") {
    return (
      <div>
        <Group
          title={`${outcome.matches.length} ${outcome.matches.length === 1 ? "place" : "places"} for “${q}”`}
          places={outcome.matches}
          {...handlers}
        />
        {mapSection && <div className="mt-8">{mapSection}</div>}
      </div>
    );
  }

  const headline = hasMap
    ? `“${q}” isn't one of our featured places — but it's on the map`
    : map?.status === "loading"
      ? `Looking for “${q}” on the map…`
      : map
        ? `We couldn't find “${q}” on the map either`
        : `“${q}” isn't one of our featured places`;
  const sub = hasMap
    ? "Tap Directions for the best way there. Similar featured places are below."
    : map?.status === "loading"
      ? "Checking the whole city, not just tourist spots."
      : map
        ? map.failed
          ? "The map lookup didn't respond — try again in a moment. Meanwhile, here are similar and nearby places."
          : "Try adding the area, like “T Nagar” or “Velachery”. Meanwhile, here are similar and nearby places."
        : "Press Search to look it up anywhere on the map. Meanwhile, here are similar and nearby places.";

  return (
    <div>
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-slate-300">
          {map?.status === "loading" ? <Loader2 size={18} className="animate-spin" /> : <SearchX size={18} />}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{headline}</p>
          <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
        </div>
      </div>

      {mapSection && <div className="mb-8">{mapSection}</div>}
      {outcome.similar.length > 0 && <Group title="Similar places" places={outcome.similar} {...handlers} />}
      {outcome.nearby.length > 0 && (
        <Group title="Nearby you" places={outcome.nearby} {...handlers} className={outcome.similar.length ? "mt-8" : ""} />
      )}
    </div>
  );
}

function MapGroup({
  state,
  results,
  origin,
  onDirections,
}: {
  state: MapSearchState;
  results: MapPlace[];
  origin: { latitude: number; longitude: number };
  onDirections: (p: MapPlace) => void;
}) {
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 size={15} className="animate-spin" /> Searching the map…
      </p>
    );
  }
  if (!results.length) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold text-white">On the map</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {results.map((m, i) => (
          <li key={`${m.name}-${i}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lagoon-500/15 text-lagoon-300">
              <MapPin size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{m.name}</p>
              <p className="truncate text-xs text-slate-400">
                {[m.kind ? m.kind[0].toUpperCase() + m.kind.slice(1) : null, m.subtitle].filter(Boolean).join(" · ") || "Chennai"}
                {" · "}
                {formatDistance(haversineKm(origin, m))}
              </p>
            </div>
            <button onClick={() => onDirections(m)} className="btn-primary shrink-0 px-3 py-2 text-xs" aria-label={`Directions to ${m.name}`}>
              <Navigation size={14} /> Directions
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Group({
  title,
  places,
  className = "",
  isSelected,
  fitsTime,
  onOpen,
  onToggle,
  onRoute,
}: { title: string; places: PlaceResult[]; className?: string } & Handlers) {
  return (
    <section className={className}>
      <h2 className="mb-3 font-display text-lg font-semibold text-white">{title}</h2>
      <HorizontalCardRow nudgeBy={300}>
        {places.map((p) => (
          <PlaceCard
            key={p.id}
            place={p}
            selected={isSelected(p.id)}
            fitsTime={fitsTime(p)}
            onOpen={() => onOpen(p)}
            onToggle={() => onToggle(p)}
            onRoute={() => onRoute(p)}
          />
        ))}
      </HorizontalCardRow>
    </section>
  );
}
