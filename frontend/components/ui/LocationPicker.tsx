"use client";

// A small, always-visible control for viewing/refreshing the user's
// location from inside the app. Location used to be captured once at
// login and then baked into trip-store for the rest of the session with
// no way back in — if it was skipped, denied, or just went stale (moved
// city, opened a fresh tab days later), there was no way to fix it short
// of signing out and back in. This makes it a first-class, tappable
// control instead.

import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { useTrip } from "@/lib/trip-store";
import { CHENNAI_CENTER } from "@/lib/constants";

export default function LocationPicker({ className = "" }: { className?: string }) {
  const locationLabel = useTrip((s) => s.locationLabel);
  const location = useTrip((s) => s.location);
  const setLocation = useTrip((s) => s.setLocation);
  const [locating, setLocating] = useState(false);
  const [deniedOnce, setDeniedOnce] = useState(false);

  const refresh = () => {
    if (!("geolocation" in navigator)) {
      setDeniedOnce(true);
      if (!location) setLocation(CHENNAI_CENTER, "Chennai (city centre)");
      return;
    }
    setLocating(true);
    setDeniedOnce(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, "Your live location");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setDeniedOnce(true);
        // Only fall back if there was never a location at all — a denied
        // *refresh* shouldn't wipe out a location that was already working.
        if (!location) setLocation(CHENNAI_CENTER, "Chennai (city centre)");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className={className}>
      <button
        onClick={refresh}
        disabled={locating}
        title="Tap to refresh your location"
        className="group inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-lagoon-300 disabled:opacity-70"
      >
        <MapPin size={14} className={locating ? "animate-pulse text-lagoon-300" : "text-lagoon-300"} />
        <span className="underline decoration-dotted decoration-white/20 underline-offset-2 group-hover:decoration-lagoon-300/60">
          {locating ? "Locating…" : (locationLabel ?? "Set your location")}
        </span>
        <LocateFixed
          size={12}
          className={locating ? "animate-spin text-lagoon-300" : "text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"}
        />
      </button>
      {deniedOnce && (
        <p className="mt-1 text-xs text-slate-500">Couldn&apos;t access location — check your browser/device permissions.</p>
      )}
    </div>
  );
}
