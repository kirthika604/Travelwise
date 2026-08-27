import { Repeat, Footprints, Wallet, Check } from "lucide-react";
import ModeIcon from "@/components/ui/ModeIcon";
import type { UnifiedRoute } from "@/lib/route-view";
import { formatDurationMin, formatTime, formatMoney } from "@/lib/geo";

// A single transport "combination" option (e.g. Walk → Metro → Bus) the user
// can pick from before seeing the full step-by-step route.
export default function RouteOptionCard({
  route,
  selected,
  best,
  onSelect,
}: {
  route: UnifiedRoute;
  index: number;
  selected: boolean;
  best?: boolean;
  onSelect: () => void;
}) {
  const chain = route.steps.map((s) => s.mode);

  return (
    <button
      onClick={onSelect}
      className={[
        "card w-full p-4 text-left transition-colors",
        selected ? "ring-2 ring-lagoon-400/70 shadow-glow-lagoon" : "hover:bg-white/[0.06]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        {/* mode chain */}
        <div className="flex flex-wrap items-center gap-1.5">
          {chain.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: `${m.color}22` }}>
                <ModeIcon mode={m} size={16} />
              </span>
              {i < chain.length - 1 && <span className="h-[3px] w-3 shrink-0 rounded-full bg-white/15" aria-hidden />}
            </span>
          ))}
        </div>

        {selected ? (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lagoon-500 text-night-950">
            <Check size={14} strokeWidth={3} />
          </span>
        ) : (
          best && (
            <span className="shrink-0 rounded-full bg-lagoon-gradient px-2 py-0.5 text-[11px] font-bold text-night-950">
              Fastest
            </span>
          )
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="font-display text-2xl font-bold text-white">{formatDurationMin(route.totalDurationMin)}</p>
          {(route.departAt || route.arriveAt) && (
            <p className="text-xs text-slate-400">
              {formatTime(route.departAt)} → {formatTime(route.arriveAt)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Repeat size={12} /> {route.transfers} transfer{route.transfers === 1 ? "" : "s"}
          </span>
          {route.walkingMin != null && (
            <span className="inline-flex items-center gap-1">
              <Footprints size={12} /> {formatDurationMin(route.walkingMin)} walk
            </span>
          )}
          {route.totalFare != null && route.totalFare > 0 && (
            <span className="inline-flex items-center gap-1 text-lagoon-200">
              <Wallet size={12} /> {formatMoney(route.totalFare)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
