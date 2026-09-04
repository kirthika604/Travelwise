"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Leaf, LocateFixed, Lock, Mail, MapPin, ShieldCheck } from "lucide-react";
import SkyBackground from "@/components/ui/SkyBackground";
import { useTrip } from "@/lib/trip-store";
import { CHENNAI_CENTER } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

type LocState = "idle" | "locating" | "on" | "denied";
type Mode = "signin" | "signup";

// After this many failed sign-in attempts in a row, force a cooldown before
// the next try. This is a UX-level speed bump only — someone scripting
// requests directly against Supabase bypasses it entirely — real enforcement
// is Supabase Auth's own server-side rate limiting (Dashboard -> Auth ->
// Rate Limits), which this app has no code-level access to configure.
const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5;
const COOLDOWN_MS = 30_000;

// Whatever Supabase (or the signup-confirmed edge function) says about *why*
// sign-in/sign-up failed is not shown verbatim — "no such user" vs "wrong
// password" vs "email already registered" are each a user-enumeration leak.
// One generic message per mode regardless of cause.
const GENERIC_SIGNIN_ERROR = "Incorrect email or password.";
const GENERIC_SIGNUP_ERROR = "Couldn't create that account. Try signing in instead, or use a different email.";

export default function LoginPage() {
  const router = useRouter();
  const setLocation = useTrip((s) => s.setLocation);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [locState, setLocState] = useState<LocState>("idle");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (lockedUntil == null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining === 0) setLockedUntil(null);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [lockedUntil]);
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

  const proceed = () => {
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

  const submit = async () => {
    setAuthError(null);
    if (lockedUntil != null) return;
    if (!email || !password) {
      setAuthError("Enter both an email and a password.");
      return;
    }
    setAuthLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setFailedAttempts(0);
        proceed();
      } else {
        // Goes through the signup-confirmed Edge Function (admin API,
        // email_confirm: true) instead of the default supabase.auth.signUp —
        // that one never sends a confirmation email, so there's no "check
        // your inbox" step and nothing to hit an email rate limit on.
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/signup-confirmed`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) throw new Error(GENERIC_SIGNUP_ERROR);

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setFailedAttempts(0);
        proceed();
      }
    } catch {
      // Deliberately generic — see the constants above for why.
      setAuthError(mode === "signin" ? GENERIC_SIGNIN_ERROR : GENERIC_SIGNUP_ERROR);
      if (mode === "signin") {
        const next = failedAttempts + 1;
        if (next >= MAX_ATTEMPTS_BEFORE_COOLDOWN) {
          setFailedAttempts(0);
          setLockedUntil(Date.now() + COOLDOWN_MS);
        } else {
          setFailedAttempts(next);
        }
      }
    } finally {
      setAuthLoading(false);
    }
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
              <div className="mb-4 flex rounded-2xl border border-white/[0.12] bg-white/[0.03] p-1">
                <button
                  onClick={() => setMode("signin")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                    mode === "signin" ? "bg-lagoon-gradient text-night-950" : "text-slate-300"
                  }`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
                    mode === "signup" ? "bg-lagoon-gradient text-night-950" : "text-slate-300"
                  }`}
                >
                  Sign up
                </button>
              </div>

              <label className="mb-1.5 block text-sm text-slate-400">Email</label>
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.03] px-3 focus-within:border-lagoon-400/60">
                <Mail size={16} className="text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-600"
                />
              </div>

              <label className="mb-1.5 block text-sm text-slate-400">Password</label>
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.03] px-3 focus-within:border-lagoon-400/60">
                <Lock size={16} className="text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-600"
                />
              </div>

              {authError && <p className="mb-3 text-xs text-coral-400">{authError}</p>}
              {lockedUntil != null && (
                <p className="mb-3 text-xs text-coral-400">
                  Too many attempts — try again in {cooldownRemaining}s.
                </p>
              )}

              <button
                onClick={submit}
                disabled={authLoading || lockedUntil != null}
                className="btn-primary w-full text-sm"
              >
                {lockedUntil != null
                  ? `Try again in ${cooldownRemaining}s`
                  : authLoading
                    ? "One moment…"
                    : mode === "signin"
                      ? "Sign in"
                      : "Create account"}
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-white/10" />
                enable your location
                <span className="h-px flex-1 bg-white/10" />
              </div>

              {/* location — the key step */}
              <LocationCard state={locState} coords={coords} onEnable={enableLocation} />

              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <ShieldCheck size={13} /> Real account via Supabase — your location stays on your device.
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
