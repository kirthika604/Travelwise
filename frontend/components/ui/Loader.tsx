import { Compass } from "lucide-react";

// A calm "finding your way" loader — an orbiting dot around a compass,
// driven by plain CSS animation (no JS animation library required).
export default function Loader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-slate-300">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin-slow rounded-full border border-white/10" />
        <div className="absolute inset-0 animate-spin-slow [animation-duration:2.2s]">
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-lagoon-gradient shadow-glow-lagoon" />
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <Compass className="text-lagoon-300" size={22} />
        </div>
      </div>
      {label && <p className="text-sm text-slate-400">{label}</p>}
    </div>
  );
}
