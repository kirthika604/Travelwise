import { ArrowRight, Clock, Wallet, Footprints, Timer, MapPin, CheckCircle2, AlertTriangle, Leaf, UtensilsCrossed } from "lucide-react";
import ModeIcon from "@/components/ui/ModeIcon";
import { modeMeta } from "@/lib/constants";
import { formatHours, formatMoney, formatTime, formatDurationMin, co2SavedKg, formatCo2, pathDistanceKm } from "@/lib/geo";
import type { ItineraryResult } from "@/lib/types";

// One "combination" (a scored, time-sequenced multi-stop plan). Shows the
// ordered stops with the transit leg between each, plus totals, and hands the
// chosen plan to the Routes page.
export default function ItineraryCard({
  itinerary,
  index,
  best,
  onChoose,
}: {
  itinerary: ItineraryResult;
  index: number;
  best?: boolean;
  onChoose: () => void;
}) {
  const it = itinerary;
  const savedKg = co2SavedKg(
    pathDistanceKm(it.places.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))),
  );
  return (
    <article className="card animate-in flex flex-col p-5">
      {/* header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-white">Plan {index + 1}</h3>
            {best && (
              <span className="rounded-full bg-lagoon-gradient px-2 py-0.5 text-[11px] font-bold text-night-950">
                Best match
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {formatTime(it.start_time)} – {formatTime(it.end_time)} · {it.places.length} stops
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold text-white">{formatHours(it.total_time_hr)}</p>
          <p className="text-xs text-slate-400">{formatMoney(it.total_fare)} total</p>
        </div>
      </div>

      {/* sequence: place → leg → place */}
      <ol className="relative mb-4 space-y-1">
        {it.places.map((place, i) => {
          const leg = it.legs[i]; // leg from this place to the next
          const first = i === 0;
          const last = i === it.places.length - 1;
          return (
            <li key={`${place.id}-${i}`}>
              {/* stop */}
              <div className="flex items-center gap-3">
                <span
                  className={[
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-night-900 text-xs font-bold",
                    first
                      ? "bg-lagoon-gradient text-night-950"
                      : last
                        ? "bg-lagoon-400 text-night-950"
                        : "bg-night-700 text-lagoon-200 ring-1 ring-inset ring-lagoon-500/40",
                  ].join(" ")}
                >
                  {place.order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-white">
                    {place.name}
                    {place.source === "food" && (
                      <span
                        title="Nearby place to eat"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-lagoon-300"
                      >
                        <UtensilsCrossed size={11} />
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {place.arrive_at && place.depart_at
                      ? `${formatTime(place.arrive_at)} – ${formatTime(place.depart_at)}`
                      : `Stay ~${formatHours(place.visit_duration_hr)}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatHours(place.visit_duration_hr)}</span>
              </div>

              {/* connecting leg */}
              {leg && i < it.places.length - 1 && (
                <div
                  className="my-1 ml-4 flex items-center gap-2 border-l border-dashed py-1 pl-5 text-xs text-slate-400"
                  style={{ borderColor: `${modeMeta(leg.mode, leg.route_type).color}66` }}
                >
                  <ModeIcon mode={modeMeta(leg.mode, leg.route_type)} size={14} />
                  <span className="text-slate-300">{leg.mode_label || leg.mode}</span>
                  {leg.route_name && <span className="text-slate-400">· {leg.route_name}</span>}
                  <span className="text-slate-400">· {formatDurationMin(leg.travel_duration_minutes)}</span>
                  {leg.fare_total > 0 && <span className="text-slate-400">· {formatMoney(leg.fare_total)}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* transit availability */}
      <div
        className={[
          "mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
          it.all_legs_have_transit ? "bg-lagoon-500/10 text-lagoon-200" : "bg-white/[0.06] text-slate-300",
        ].join(" ")}
      >
        {it.all_legs_have_transit ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
        {it.transit_availability_summary ||
          (it.all_legs_have_transit ? "Fully connected by public transit" : "Some legs need walking")}
      </div>

      {savedKg > 0 && (
        <p className="mb-4 flex items-center gap-1.5 text-xs text-lagoon-200" title="Estimated CO₂ vs driving a petrol car the same distance">
          <Leaf size={13} /> ~{formatCo2(savedKg)} CO₂ saved vs driving this day
        </p>
      )}

      {/* totals */}
      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        <Stat icon={<MapPin size={14} />} label="Visit" value={formatHours(it.total_visit_time_hr)} />
        <Stat icon={<Clock size={14} />} label="Travel" value={formatHours(it.total_travel_time_hr)} />
        <Stat icon={<Footprints size={14} />} label="Walk" value={formatHours(it.total_walking_time_hr)} />
        <Stat icon={<Timer size={14} />} label="Wait" value={formatHours(it.total_wait_time_hr)} />
      </div>

      <button onClick={onChoose} className="btn-primary mt-auto w-full">
        Choose this plan <ArrowRight size={16} />
      </button>
    </article>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] py-2">
      <div className="mb-0.5 flex justify-center text-lagoon-300">{icon}</div>
      <p className="text-xs font-medium text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
