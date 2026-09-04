"use client";

import { Award, PartyPopper, Flame, Star, X } from "lucide-react";
import { useExplorer } from "@/lib/explorer-store";

// Celebratory popup fired the moment a check-in crosses a level threshold —
// reads straight off the store's `pendingLevelUp`, so it works regardless of
// which page (Discover or Passport) triggered the check-in that leveled up.
// Level is a single, vibe-independent progression: the badge/icon here never
// changes based on category — only the category breakdown below does.
export default function LevelUpModal() {
  const levelUp = useExplorer((s) => s.pendingLevelUp);
  const dismiss = useExplorer((s) => s.dismissLevelUp);

  if (!levelUp) return null;

  const breakdown = Object.entries(levelUp.categoryBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-night-950/75 backdrop-blur-sm" onClick={dismiss} />
      <div className="animate-reveal-content relative w-full max-w-sm rounded-3xl border border-white/10 bg-night-900/95 p-6 text-center shadow-glow">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full glass hover:bg-white/10"
        >
          <X size={15} />
        </button>

        <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-lagoon-gradient text-night-950 shadow-glow-lagoon">
          <Award size={28} />
        </span>

        <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-lagoon-300">
          <PartyPopper size={13} /> Level up
        </p>
        <h2 className="mb-1 font-display text-2xl font-bold text-white">Level {levelUp.level}</h2>
        <p className="mb-5 text-sm text-slate-300">{levelUp.levelName}</p>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Star size={12} /> Points
            </p>
            <p className="mt-1 font-display text-lg font-bold text-white">{levelUp.score}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Flame size={12} /> Streak
            </p>
            <p className="mt-1 font-display text-lg font-bold text-white">
              {levelUp.streakDays} day{levelUp.streakDays === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {breakdown.length > 0 && (
          <div className="mb-5 text-left">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Where you've been leaning</p>
            <div className="space-y-1.5">
              {breakdown.slice(0, 4).map(([category, count]) => {
                const share = Math.round((count / breakdown.reduce((s, [, c]) => s + c, 0)) * 100);
                return (
                  <div key={category} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-xs text-slate-300">{category}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full rounded-full bg-lagoon-gradient" style={{ width: `${share}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-[11px] text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={dismiss} className="btn-primary w-full">
          Nice!
        </button>
      </div>
    </div>
  );
}
