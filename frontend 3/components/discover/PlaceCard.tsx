"use client";

import { useState } from "react";
import { Clock, MapPin, Plus, Check, Star, Route } from "lucide-react";
import VibeIcon from "@/components/ui/VibeIcon";
import type { PlaceResult } from "@/lib/types";
import { vibeFor } from "@/lib/constants";
import { formatDistance, expenseRange } from "@/lib/geo";

// A portrait place card — tall photo up top, facts below. Cards only ever
// sit in a horizontally-scrolling strip (VibeRow / HorizontalCardRow), never
// in a wrapping grid, so there's no vertical scrolling to see more of them.
export default function PlaceCard({
  place,
  rank,
  selected,
  fitsTime,
  onOpen,
  onToggle,
  onRoute,
}: {
  place: PlaceResult;
  rank?: number;
  selected: boolean;
  fitsTime?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRoute: () => void;
}) {
  const vibe = vibeFor(place.tags[0] || place.category);
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = !!place.image_url && !imageFailed;

  return (
    <article className="card group relative flex w-[220px] shrink-0 flex-col transition-transform duration-200 hover:-translate-y-1.5 sm:w-[240px]">
      {/* cover — tall/portrait (elongated for a cinematic feel) */}
      <button onClick={onOpen} className="relative h-[380px] w-full overflow-hidden text-left sm:h-[420px]">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={place.image_url!}
            alt={place.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div
            className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
            style={{ backgroundImage: `linear-gradient(135deg, ${vibe.from}, ${vibe.to})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-night-950/90 via-night-950/10 to-transparent" />
        <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-night-950/40 text-white backdrop-blur-sm">
          <VibeIcon icon={vibe.icon} size={18} />
        </span>
        {rank != null && (
          <span className="absolute right-3 top-3 grid h-7 min-w-7 place-items-center rounded-full bg-night-950/70 px-2 text-xs font-bold text-white backdrop-blur">
            #{rank}
          </span>
        )}
        {fitsTime && (
          <span className="absolute bottom-2 left-3 inline-flex items-center gap-1 rounded-full bg-lagoon-500/90 px-2 py-0.5 text-[11px] font-semibold text-night-950">
            <Clock size={11} /> Fits your time
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="line-clamp-1 font-display text-base font-semibold text-white drop-shadow">{place.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-200/90">
            <span className="rounded-full bg-white/[0.12] px-2 py-0.5 backdrop-blur-sm">{place.category}</span>
            {place.distance_km != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} /> {formatDistance(place.distance_km)}
              </span>
            )}
            {place.rating != null && (
              <span className="inline-flex items-center gap-1 text-lagoon-200">
                <Star size={11} className="fill-lagoon-300 text-lagoon-300" /> {place.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">{place.description}</p>

        <span className="mt-2 text-xs text-slate-400">
          {place.budget_level ?? "—"} · {expenseRange(place.avg_expense_min, place.avg_expense_max)}
        </span>

        <div className="mt-3 flex gap-2">
          <button
            onClick={onToggle}
            className={[
              "btn flex-1 px-3 py-2 text-sm",
              selected ? "border border-lagoon-500/40 bg-lagoon-500/20 text-lagoon-200" : "glass hover:bg-white/10",
            ].join(" ")}
          >
            {selected ? <Check size={15} /> : <Plus size={15} />}
            {selected ? "Added" : "Add"}
          </button>
          <button onClick={onRoute} className="btn glass px-3 py-2 text-sm hover:bg-white/10" title="Plan a route straight here">
            <Route size={15} className="text-lagoon-300" />
          </button>
        </div>
      </div>
    </article>
  );
}
