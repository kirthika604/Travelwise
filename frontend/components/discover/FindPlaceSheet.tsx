"use client";

import { useEffect, useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Segmented from "@/components/ui/Segmented";
import VibeIcon from "@/components/ui/VibeIcon";
import TimeIcon from "@/components/ui/TimeIcon";
import { BUDGETS, TIMES_OF_DAY, VIBES } from "@/lib/constants";
import { formatAvailableHours } from "@/lib/geo";
import type { Filters } from "@/lib/trip-store";
import type { BudgetLevel } from "@/lib/types";

// "Find place" — vibe (multi), budget, available time, max distance (optional),
// plus an optional time-of-day. Applies as ranked discovery constraints.
export default function FindPlaceSheet({
  open,
  onClose,
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initial: Filters;
  onApply: (f: Filters) => void;
}) {
  const [f, setF] = useState<Filters>(initial);
  const [anyDistance, setAnyDistance] = useState(initial.radius_km == null);

  useEffect(() => {
    if (open) {
      setF(initial);
      setAnyDistance(initial.radius_km == null);
    }
  }, [open, initial]);

  const toggleVibe = (key: string) =>
    setF((s) => ({
      ...s,
      interests: s.interests.includes(key)
        ? s.interests.filter((v) => v !== key)
        : [...s.interests, key],
    }));

  const reset = () =>
    setF({ interests: [], budget: null, available_hours: 6, radius_km: 8, preferred_time: null });

  const apply = () => {
    onApply({ ...f, radius_km: anyDistance ? null : f.radius_km ?? 8 });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Find your place"
      subtitle="Tune the vibe, budget and time — we'll rank the best matches."
      footer={
        <div className="flex gap-3">
          <button onClick={reset} className="btn-ghost text-sm">
            <RotateCcw size={15} /> Reset
          </button>
          <button onClick={apply} className="btn-primary flex-1">
            <Sparkles size={16} /> Show ranked places
          </button>
        </div>
      }
    >
      <div className="space-y-7">
        {/* Vibe */}
        <div>
          <SectionLabel>Vibe</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => {
              const active = f.interests.includes(v.key);
              return (
                <button
                  key={v.key}
                  onClick={() => toggleVibe(v.key)}
                  className={active ? "chip-active" : "chip-idle"}
                >
                  <VibeIcon icon={v.icon} size={14} />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Budget */}
        <div>
          <SectionLabel>Budget</SectionLabel>
          <Segmented<BudgetLevel>
            name="budget"
            value={f.budget}
            onChange={(v) => setF((s) => ({ ...s, budget: v }))}
            options={BUDGETS.map((b) => ({ value: b.key, label: b.label, hint: b.hint }))}
          />
        </div>

        {/* Available time */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel className="mb-0">Available time</SectionLabel>
            <span className="text-sm font-semibold text-lagoon-300">
              {formatAvailableHours(f.available_hours ?? 6)}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={48}
            step={1}
            value={f.available_hours ?? 6}
            onChange={(e) => setF((s) => ({ ...s, available_hours: Number(e.target.value) }))}
            className="w-full accent-lagoon-400"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>1h</span>
            <span>24h</span>
            <span>2 days</span>
          </div>
        </div>

        {/* Max distance (optional) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel className="mb-0">
              Max distance <span className="text-slate-400">(optional)</span>
            </SectionLabel>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={anyDistance}
                onChange={(e) => setAnyDistance(e.target.checked)}
                className="accent-lagoon-400"
              />
              Any distance
            </label>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            disabled={anyDistance}
            value={f.radius_km ?? 8}
            onChange={(e) => setF((s) => ({ ...s, radius_km: Number(e.target.value) }))}
            className="w-full accent-lagoon-400 disabled:opacity-40"
          />
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>1 km</span>
            <span className="font-semibold text-slate-300">
              {anyDistance ? "Any" : `${f.radius_km ?? 8} km`}
            </span>
            <span>30 km</span>
          </div>
        </div>

        {/* Preferred time of day (optional) */}
        <div>
          <SectionLabel>
            Best time to go <span className="text-slate-400">(optional)</span>
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {TIMES_OF_DAY.map((t) => {
              const active = f.preferred_time === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() =>
                    setF((s) => ({ ...s, preferred_time: active ? null : t.key }))
                  }
                  className={active ? "chip-active" : "chip-idle"}
                >
                  <TimeIcon icon={t.icon} size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 ${className}`}>
      {children}
    </p>
  );
}
