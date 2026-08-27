"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Leaf, LocateFixed, Mail, MapPin, ShieldCheck } from "lucide-react";
import SkyBackground from "@/components/ui/SkyBackground";
import { useTrip } from "@/lib/trip-store";
import { CHENNAI_CENTER } from "@/lib/constants";

type LocState = "idle" | "locating" | "on" | "denied";

export default function LoginPage() {
  const router = useRouter();
  const setLocation = useTrip((s) => s.setLocation);
  const [email, setEmail] = useState("");
  const [locState, setLocState] = useState<LocState>("idle");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  // Drives the sky video: idle on its first frame until this flips true, at
  // which point the clouds/plane start moving. onEnded (below) is what
  // actually navigates on to Discover.
  const [transitioning, setTransitioning] = useState(false);

  const enableLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocState("denied");
      return;
    }
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(c);
        setLocState("on");
      },
      () => setLocState("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const start = () => {
    if (locState === "on" && coords) {
      setLocation(coords, "Your live location");
    } else {
      // graceful fallback so the demo always works
      setLocation(CHENNAI_CENTER, "Chennai (city centre)");
    }
    // Let the clouds/plane play through before navigating — Discover picks
    // up the "intro" flag and fades its own background + cards in, so the
    // handoff reads as one smooth dissolve rather than a hard cut.
    setTransitioning(true);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <SkyBackground play={transitioning} onEnded={() => router.push("/discover?intro=1")} />

      <div
        className={`relative z-10 flex min-h-screen flex-col transition-opacity duration-500 ease-out ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <header className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-lagoon-gradient text-night-950 shadow-glow-lagoon">
              <Compass size={20} />
            </span>
            TravelWise
          </div>
          <span className="hidden items-center gap-1.5 rounded-full glass px-3 py-1.5 text-xs text-lagoon-200 sm:inline-flex">
            <Leaf size={13} /> Sustainable travel
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center p-6">
          <div className="animate-in w-full max-w-md">
            <div className="mb-6 text-center">
              <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                Explore your city,
                <br />
                the wiser way.
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-slate-300">
                Discover places that match your vibe, budget and time — then get there by bus, metro and train.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/15 bg-night-900/60 p-6 shadow-[0_30px_80px_-24px_rgba(4,6,16,0.85)] backdrop-blur-xl">
              {/* demo auth */}
              <label className="mb-1.5 block text-sm text-slate-400">Email</label>
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.03] px-3 focus-within:border-lagoon-400/60">
                <Mail size={16} className="text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost text-sm">Continue with Google</button>
                <button className="btn-ghost text-sm">Continue with Apple</button>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-white/10" />
                enable your location
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {/* location — the key step */}
              <LocationCard state={locState} coords={coords} onEnable={enableLocation} />

              <button onClick={start} className="btn-primary mt-4 w-full text-base">
                {locState === "on" ? "Start exploring" : "Continue & explore"}
                <span aria-hidden>→</span>
              </button>

              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                <ShieldCheck size={13} /> Demo sign-in — no account is created, location stays on your device.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function LocationCard({
  state,
  coords,
  onEnable,
}: {
  state: LocState;
  coords: { latitude: number; longitude: number } | null;
  onEnable: () => void;
}) {
  if (state === "on" && coords) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-lagoon-500/30 bg-lagoon-500/10 p-3">
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-lagoon-500/20">
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-lagoon-400/40" />
          <MapPin size={18} className="text-lagoon-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-lagoon-200">Live location on</p>
          <p className="truncate text-xs text-slate-400">
            {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <button
        onClick={onEnable}
        disabled={state === "locating"}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3 text-left transition-colors hover:border-lagoon-400/50 disabled:opacity-60"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08]">
          <LocateFixed size={18} className={state === "locating" ? "animate-spin text-lagoon-300" : "text-slate-300"} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{state === "locating" ? "Finding you…" : "Enable live location"}</p>
          <p className="text-xs text-slate-400">Powers nearby discovery & accurate routes</p>
        </div>
      </button>
      {state === "denied" && (
        <p className="mt-2 text-xs text-slate-400">
          Couldn&apos;t access location — no problem, we&apos;ll start you at Chennai city centre.
        </p>
      )}
    </div>
  );
}
