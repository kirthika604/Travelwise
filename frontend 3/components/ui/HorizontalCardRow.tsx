"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// A horizontally-scrolling, snap-based row for big/long cards — used
// anywhere a set of cards should read as a single swipeable strip instead
// of stacking down the page.
export default function HorizontalCardRow({
  children,
  nudgeBy = 400,
}: {
  children: React.ReactNode;
  nudgeBy?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nudge = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * nudgeBy, behavior: "smooth" });

  return (
    <div className="group/row relative -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        ref={scroller}
        className="no-scrollbar snap-x-mandatory flex gap-4 overflow-x-auto scroll-pl-1 pb-2"
      >
        {children}
        <div className="w-1 shrink-0" aria-hidden />
      </div>
      <button
        onClick={() => nudge(-1)}
        aria-label="Scroll left"
        className="absolute -left-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full glass p-2 opacity-0 shadow-glow transition-opacity group-hover/row:opacity-100 hover:bg-white/10 sm:grid"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => nudge(1)}
        aria-label="Scroll right"
        className="absolute -right-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full glass p-2 opacity-0 shadow-glow transition-opacity group-hover/row:opacity-100 hover:bg-white/10 sm:grid"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
