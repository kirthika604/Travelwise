"use client";

import { SearchX } from "lucide-react";
import HorizontalCardRow from "@/components/ui/HorizontalCardRow";
import PlaceCard from "@/components/discover/PlaceCard";
import type { PlaceResult } from "@/lib/types";
import type { SearchOutcome } from "@/lib/search";

interface Handlers {
  isSelected: (id: number) => boolean;
  fitsTime: (p: PlaceResult) => boolean;
  onOpen: (p: PlaceResult) => void;
  onToggle: (p: PlaceResult) => void;
  onRoute: (p: PlaceResult) => void;
}

// What the Discover page shows while the search box has text in it: the
// matches if the query names something we know, otherwise a plain "couldn't
// find it" with similar places and what's nearest to the user instead.
export default function SearchResults({
  query,
  outcome,
  ...handlers
}: { query: string; outcome: SearchOutcome } & Handlers) {
  const q = query.trim();

  if (outcome.tier === "match") {
    return (
      <Group
        title={`${outcome.matches.length} ${outcome.matches.length === 1 ? "place" : "places"} for “${q}”`}
        places={outcome.matches}
        {...handlers}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-slate-300">
          <SearchX size={18} />
        </span>
        <div>
          <p className="text-sm font-medium text-white">We couldn&apos;t find “{q}”</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {outcome.tier === "similar"
              ? "Nothing with that name yet — here are similar places, and what's closest to you."
              : "Nothing similar either — here's what's closest to you instead."}
          </p>
        </div>
      </div>

      {outcome.similar.length > 0 && <Group title="Similar places" places={outcome.similar} {...handlers} />}
      {outcome.nearby.length > 0 && (
        <Group title="Nearby you" places={outcome.nearby} {...handlers} className={outcome.similar.length ? "mt-8" : ""} />
      )}
    </div>
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
