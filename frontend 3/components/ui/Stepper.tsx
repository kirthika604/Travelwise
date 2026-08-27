import Link from "next/link";
import { Check } from "lucide-react";

const STEPS = [
  { n: 1, label: "Login", href: "/login" },
  { n: 2, label: "Discover", href: "/discover" },
  { n: 3, label: "Combine", href: "/combination" },
  { n: 4, label: "Routes", href: "/routes" },
] as const;

// The four-step journey drawn as a transit line: each step is a station, the
// line fills in behind you as you travel, and the current stop is the
// glowing interchange ("you are here").
export default function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav className="flex items-center" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        const clickable = s.n <= current;

        const node = (
          <span
            className={[
              "relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
              active
                ? "bg-lagoon-gradient text-night-950 shadow-glow-lagoon"
                : done
                  ? "bg-lagoon-400 text-night-950"
                  : "border border-white/15 bg-white/[0.04] text-slate-400",
            ].join(" ")}
          >
            {active && (
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-lagoon-400/40" aria-hidden />
            )}
            {done ? <Check size={14} strokeWidth={3} /> : s.n}
          </span>
        );

        const label = (
          <span className={["hidden text-sm sm:inline", active ? "font-medium text-white" : "text-slate-400"].join(" ")}>
            {s.label}
          </span>
        );

        return (
          <div key={s.n} className="flex items-center">
            {clickable ? (
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-lagoon-400/60 sm:pr-2"
              >
                {node}
                {label}
              </Link>
            ) : (
              <div className="flex cursor-not-allowed items-center gap-2 py-1 pl-1 pr-1 opacity-60 sm:pr-2">
                {node}
                {label}
              </div>
            )}
            {i < STEPS.length - 1 && (
              <div className="relative mx-0.5 h-[3px] w-5 overflow-hidden rounded-full bg-white/10 sm:w-9">
                {s.n < current && (
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-lagoon-400 to-lagoon-300" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
