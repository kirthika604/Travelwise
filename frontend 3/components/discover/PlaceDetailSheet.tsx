"use client";

import { Clock, MapPin, Star, Route, Plus, Check, Wallet, Ticket, Sparkles, ExternalLink, Camera } from "lucide-react";
import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import VibeIcon from "@/components/ui/VibeIcon";
import type { PlaceResult } from "@/lib/types";
import { vibeFor } from "@/lib/constants";
import { formatDistance, formatHours, expenseRange, formatMoney } from "@/lib/geo";

// Full detail for a place + the two flow actions:
//  • Plan route here  → single-destination Routes hand-off
//  • Add to combination → toggles selection for the Combination builder
export default function PlaceDetailSheet({
  place,
  open,
  selected,
  visited,
  onClose,
  onToggle,
  onRoute,
  onMarkVisited,
}: {
  place: PlaceResult | null;
  open: boolean;
  selected: boolean;
  visited?: boolean;
  onClose: () => void;
  onToggle: () => void;
  onRoute: () => void;
  onMarkVisited?: () => void;
}) {
  const vibe = place ? vibeFor(place.tags[0] || place.category) : null;
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = !!place?.image_url && !imageFailed;

  return (
    <Sheet
      open={open && !!place}
      onClose={onClose}
      footer={
        place && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                onClick={onToggle}
                className={[
                  "btn flex-1",
                  selected
                    ? "border border-lagoon-500/40 bg-lagoon-500/20 text-lagoon-200"
                    : "btn-ghost",
                ].join(" ")}
              >
                {selected ? <Check size={16} /> : <Plus size={16} />}
                {selected ? "Added to combination" : "Add to combination"}
              </button>
              <button onClick={onRoute} className="btn-primary flex-1">
                <Route size={16} /> Plan route here
              </button>
            </div>
            {onMarkVisited && (
              <button
                onClick={onMarkVisited}
                className={[
                  "btn w-full",
                  visited ? "border border-lagoon-500/40 bg-lagoon-500/20 text-lagoon-200" : "btn-ghost",
                ].join(" ")}
              >
                <Camera size={16} />
                {visited ? "Visited — add another memory" : "Mark as visited"}
              </button>
            )}
          </div>
        )
      }
    >
      {place && vibe && (
        <div>
          {/* cover */}
          <div className="relative -mx-5 -mt-5 mb-5 h-40 overflow-hidden">
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={place.image_url!}
                alt={place.name}
                onError={() => setImageFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ backgroundImage: `linear-gradient(135deg, ${vibe.from}, ${vibe.to})` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/30 to-transparent" />
            <span className="absolute left-5 top-4 grid h-14 w-14 place-items-center rounded-full bg-night-950/35 text-white backdrop-blur-sm">
              <VibeIcon icon={vibe.icon} size={26} />
            </span>
            <div className="absolute bottom-4 left-5 right-5">
              <h2 className="font-display text-2xl font-bold text-white drop-shadow">{place.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-200/90">
                <span>{place.category}</span>
                {place.distance_km != null && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} /> {formatDistance(place.distance_km)} away
                  </span>
                )}
                {place.rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star size={13} className="fill-lagoon-300 text-lagoon-300" />
                    {place.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {place.description && (
            <p className="mb-5 text-sm leading-relaxed text-slate-300">{place.description}</p>
          )}

          {place.location_url && (
            <a
              href={place.location_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-200 transition-colors hover:border-lagoon-400/50 hover:bg-white/[0.06]"
            >
              <span className="flex items-center gap-2">
                <MapPin size={15} className="text-lagoon-300" /> View location
              </span>
              <ExternalLink size={14} className="text-slate-500" />
            </a>
          )}

          {/* match score */}
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                <Sparkles size={15} className="text-lagoon-300" /> Match score
              </span>
              <span className="font-display text-lg font-bold text-white">
                {Math.round(place.final_score * 20)}%
              </span>
            </div>
            <div className="space-y-2">
              <ScoreBar label="Vibe" value={place.interest_score} />
              <ScoreBar label="Budget" value={place.budget_score} />
              <ScoreBar label="Time fit" value={place.time_score} />
              <ScoreBar label="Distance" value={place.distance_score} />
              <ScoreBar label="Rating" value={place.rating_score} />
            </div>
          </div>

          {/* facts */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <Fact icon={<Clock size={15} />} label="Time needed">
              {place.time_needed_min_hr != null
                ? `${formatHours(place.time_needed_min_hr)}${
                    place.time_needed_max_hr && place.time_needed_max_hr !== place.time_needed_min_hr
                      ? `–${formatHours(place.time_needed_max_hr)}`
                      : ""
                  }`
                : "Flexible"}
            </Fact>
            <Fact icon={<Wallet size={15} />} label="Typical spend">
              {expenseRange(place.avg_expense_min, place.avg_expense_max)}
              {place.budget_level ? ` · ${place.budget_level}` : ""}
            </Fact>
            <Fact icon={<Ticket size={15} />} label="Entry fee">
              {place.entry_fee_min == null && place.entry_fee_max == null
                ? "—"
                : place.entry_fee_min === 0 && (place.entry_fee_max ?? 0) === 0
                ? "Free"
                : expenseRange(place.entry_fee_min, place.entry_fee_max)}
            </Fact>
            <Fact icon={<Star size={15} />} label="Rating">
              {place.rating != null ? `${place.rating.toFixed(1)} / 5` : "—"}
            </Fact>
          </div>

          {/* best time */}
          {place.best_time_of_day?.length > 0 && (
            <FactList title="Best time to visit">
              {place.best_time_of_day.map((t) => (
                <span key={t} className="chip-idle cursor-default">{t}</span>
              ))}
            </FactList>
          )}

          {/* tags */}
          {place.tags?.length > 0 && (
            <FactList title="Vibes & tags">
              {place.tags.map((t) => (
                <span key={t} className="chip-idle cursor-default">{t}</span>
              ))}
            </FactList>
          )}

          {/* cuisines (food) */}
          {place.cuisines?.length > 0 && (
            <FactList title="Cuisines">
              {place.cuisines.map((c) => (
                <span key={c} className="chip-idle cursor-default">{c}</span>
              ))}
            </FactList>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 20)); // scores are 0..5
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-lagoon-gradient"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-400">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="text-lagoon-300">{icon}</span> {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white">{children}</p>
    </div>
  );
}

function FactList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
