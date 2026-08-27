import { Clock, Timer, MapPin, Wallet, ArrowRight } from "lucide-react";
import ModeIcon from "@/components/ui/ModeIcon";
import type { UnifiedStep } from "@/lib/route-view";
import { formatTime, formatDurationMin, formatDistance, formatMoney } from "@/lib/geo";

// Sequential flow of the journey — one row per leg with the transit details
// (times, boarding stop / "platform", line/service number, wait, fare).
export default function TransitTimeline({ steps }: { steps: UnifiedStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {/* rail */}
            <div className="relative flex flex-col items-center">
              <span
                className="z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10"
                style={{ backgroundColor: `${s.mode.color}1f` }}
              >
                <ModeIcon mode={s.mode} size={18} />
              </span>
              {!last && (
                <span className="mt-1 w-0.5 flex-1 rounded-full" style={{ background: `linear-gradient(${s.mode.color}, transparent)` }} />
              )}
            </div>

            {/* content */}
            <div className="flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-display font-semibold text-white" style={{ color: s.mode.color }}>
                  {s.isWalk ? "Walk" : s.modeLabel || s.mode.label}
                </span>
                {s.routeName && (
                  <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-xs font-semibold text-slate-200">
                    {s.routeName}
                  </span>
                )}
                {s.durationMin != null && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={12} /> {formatDurationMin(s.durationMin)}
                  </span>
                )}
                {!s.isWalk && s.distanceKm != null && s.distanceKm > 0 && (
                  <span className="text-xs text-slate-500">· {formatDistance(s.distanceKm)}</span>
                )}
              </div>

              {/* from → to */}
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                <span className="truncate">{s.fromName}</span>
                <ArrowRight size={13} className="shrink-0 text-slate-500" />
                <span className="truncate">{s.toName}</span>
              </p>

              {/* times */}
              {(s.departAt || s.arriveAt) && (
                <p className="mt-1 text-xs text-slate-400">
                  {s.departAt && <>Dep {formatTime(s.departAt)}</>}
                  {s.departAt && s.arriveAt && " · "}
                  {s.arriveAt && <>Arr {formatTime(s.arriveAt)}</>}
                </p>
              )}

              {/* transit specifics */}
              {!s.isWalk && (s.boardStop || s.alightStop || (s.waitMin ?? 0) > 0) && (
                <div className="mt-2 space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                  {s.boardStop && (
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <MapPin size={12} className="text-lagoon-300" /> Board at{" "}
                      <span className="font-medium text-white">{s.boardStop}</span>
                    </p>
                  )}
                  {s.alightStop && (
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <MapPin size={12} className="text-coral-400" /> Alight at{" "}
                      <span className="font-medium text-white">{s.alightStop}</span>
                    </p>
                  )}
                  {(s.waitMin ?? 0) > 0 && (
                    <p className="flex items-center gap-1.5 text-slate-400">
                      <Timer size={12} /> ~{formatDurationMin(s.waitMin)} wait
                    </p>
                  )}
                </div>
              )}

              {s.fare != null && s.fare > 0 && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-lagoon-200">
                  <Wallet size={12} /> {formatMoney(s.fare)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
