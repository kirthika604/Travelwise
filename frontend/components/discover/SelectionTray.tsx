"use client";

import { ArrowRight, Layers, X } from "lucide-react";
import { useTrip } from "@/lib/trip-store";
import { vibeFor } from "@/lib/constants";
import VibeIcon from "@/components/ui/VibeIcon";

// Floating tray summarising selected places → entry point to the Combination
// builder. Appears only when at least one place is selected.
export default function SelectionTray({ onBuild }: { onBuild: () => void }) {
  const selected = useTrip((s) => s.selected);
  const toggleSelect = useTrip((s) => s.toggleSelect);
  const clearSelected = useTrip((s) => s.clearSelected);

  const count = selected.length;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-all duration-300 ${
        count > 0 ? "translate-y-0 opacity-100" : "translate-y-24 opacity-0"
      }`}
    >
      {count > 0 && (
        <div className="glass-strong pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl p-2.5 pl-4 shadow-glow">
          <Layers size={18} className="shrink-0 text-lagoon-300" />

          {/* stacked vibe-icon chips */}
          <div className="flex -space-x-2">
            {selected.slice(0, 5).map((p) => {
              const v = vibeFor(p.tags[0] || p.category);
              return (
                <span
                  key={p.id}
                  title={p.name}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-night-900 text-white"
                  style={{ backgroundImage: `linear-gradient(135deg, ${v.from}, ${v.to})` }}
                >
                  <VibeIcon icon={v.icon} size={14} />
                </span>
              );
            })}
            {count > 5 && (
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-night-900 bg-white/10 text-xs font-semibold">
                +{count - 5}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">
              {count} place{count > 1 ? "s" : ""} selected
            </p>
            <button onClick={clearSelected} className="text-xs text-slate-400 transition-colors hover:text-white">
              Clear all
            </button>
          </div>

          {/* quick remove list on wider screens */}
          <div className="hidden max-w-[38%] flex-wrap gap-1.5 md:flex">
            {selected.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => toggleSelect(p)}
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.15]"
              >
                <span className="max-w-[9rem] truncate">{p.name}</span>
                <X size={12} />
              </button>
            ))}
          </div>

          <button onClick={onBuild} className="btn-primary shrink-0 whitespace-nowrap">
            Build combination <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
