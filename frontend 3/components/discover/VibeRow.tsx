"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import VibeIcon from "@/components/ui/VibeIcon";

// A horizontally-scrolling, snap-based carousel row (one per vibe). Vertical
// stacking of these rows gives the "scroll down through vibes, swipe across
// similar places" browse experience.
export default function VibeRow({
  title,
  icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: string;
  count: number;
  accent?: { from: string; to: string };
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <section className="animate-in group/row">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-white">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-night-950 shadow-glow"
            style={accent ? { backgroundImage: `linear-gradient(135deg, ${accent.from}, ${accent.to})` } : undefined}
            aria-hidden
          >
            <VibeIcon icon={icon} size={14} />
          </span>
          {title}
          <span className="text-sm font-normal text-slate-400">· {count}</span>
        </h2>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
          <button onClick={() => nudge(-1)} className="grid h-8 w-8 place-items-center rounded-full glass hover:bg-white/10">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => nudge(1)} className="grid h-8 w-8 place-items-center rounded-full glass hover:bg-white/10">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div ref={scroller} className="no-scrollbar snap-x-mandatory flex gap-4 overflow-x-auto scroll-pl-1 px-1 pb-2">
        {children}
        <div className="w-1 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
