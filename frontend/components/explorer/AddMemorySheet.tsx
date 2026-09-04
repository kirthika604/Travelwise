"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Loader2, MapPin, MapPinOff, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import VibeIcon from "@/components/ui/VibeIcon";
import CameraCapture from "@/components/explorer/CameraCapture";
import { useExplorer } from "@/lib/explorer-store";
import { NEARBY_KNOWN_PLACE_RADIUS_KM } from "@/lib/explorer-mock";
import { VIBES } from "@/lib/constants";
import { haversineKm } from "@/lib/geo";
import { SEED_PLACES } from "@/lib/mock";

type GeoState = "idle" | "locating" | "on" | "denied";

export interface MemoryPlace {
  id: number;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}

interface NearbyMatch {
  id: number;
  name: string;
  category: string;
}

// Once geolocation resolves for a custom check-in, see if the user is
// actually standing near a place already in our catalog — if so, that's
// what this memory should be attributed to, not a hand-typed name.
function findNearbyKnownPlace(coords: { latitude: number; longitude: number }): NearbyMatch | null {
  let best: { seed: (typeof SEED_PLACES)[number]; distance: number } | null = null;
  for (const s of SEED_PLACES) {
    const distance = haversineKm(coords, { latitude: s.latitude, longitude: s.longitude });
    if (distance <= NEARBY_KNOWN_PLACE_RADIUS_KM && (!best || distance < best.distance)) {
      best = { seed: s, distance };
    }
  }
  return best ? { id: best.seed.id, name: best.seed.name, category: best.seed.category } : null;
}

// Photo + note + geolocation "I was here" capture. `place` set = checking in
// to a known catalog place (proximity-verified against its real coordinates).
// `place` null = a custom spot — once the geotag resolves, we check whether
// it's actually near a known catalog place (auto-attributing to that place
// instead of asking for a name) before falling back to a hand-typed name +
// vibe. Self-contained: only talks to lib/explorer-store.
export default function AddMemorySheet({
  place,
  open,
  onClose,
  onSaved,
}: {
  place: MemoryPlace | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (isNewPlace: boolean) => void;
}) {
  const checkIn = useExplorer((s) => s.checkIn);
  const isCheckingIn = useExplorer((s) => s.isCheckingIn);
  const isCustom = !place;

  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyMatch, setNearbyMatch] = useState<NearbyMatch | null>(null);
  const [note, setNote] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customVibe, setCustomVibe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPhotoDataUrl(null);
    setCustomName("");
    setCustomVibe(null);
    setNearbyMatch(null);
    setError(null);
    setDone(false);
    setCoords(null);
    if (!("geolocation" in navigator)) {
      setGeoState("denied");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(c);
        setGeoState("on");
        if (!place) setNearbyMatch(findNearbyKnownPlace(c));
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place?.id]);

  const needsManualName = isCustom && !nearbyMatch;
  const canSubmitCustom = geoState === "on" && !!coords && (!!nearbyMatch || (customName.trim().length > 0 && !!customVibe));
  const submitDisabled = isCheckingIn || done || (isCustom && !canSubmitCustom);

  const submit = async () => {
    setError(null);

    if (isCustom) {
      if (!canSubmitCustom || !coords) {
        setError("Name this place, pick a vibe, and allow location to save a custom spot.");
        return;
      }
      const res = await checkIn({
        placeId: nearbyMatch?.id ?? null,
        placeName: nearbyMatch?.name ?? customName.trim(),
        category: nearbyMatch?.category ?? customVibe!,
        placeLatitude: coords.latitude,
        placeLongitude: coords.longitude,
        userLatitude: coords.latitude,
        userLongitude: coords.longitude,
        note,
        photoDataUrl,
        isCustom: !nearbyMatch,
      });
      if (res.ok) {
        setDone(true);
        onSaved?.(res.isNewPlace);
        setTimeout(onClose, 900);
      } else {
        setError(res.error);
      }
      return;
    }

    if (!place) return;
    const res = await checkIn({
      placeId: place.id,
      placeName: place.name,
      category: place.category,
      placeLatitude: place.latitude,
      placeLongitude: place.longitude,
      userLatitude: coords?.latitude ?? null,
      userLongitude: coords?.longitude ?? null,
      note,
      photoDataUrl,
      isCustom: false,
    });
    if (res.ok) {
      setDone(true);
      onSaved?.(res.isNewPlace);
      setTimeout(onClose, 900);
    } else {
      setError(res.error);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isCustom ? "Remember this place" : "Add a memory"}
      subtitle={place?.name ?? nearbyMatch?.name}
      footer={
        <button onClick={submit} disabled={submitDisabled} className="btn-primary w-full">
          {done ? <Check size={16} /> : isCheckingIn ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {done ? "Saved!" : isCheckingIn ? "Saving…" : isCustom ? "Save this spot" : "Mark as visited"}
        </button>
      }
    >
      <div className="space-y-4">
        {isCustom && nearbyMatch && (
          <div className="flex items-center gap-3 rounded-2xl border border-lagoon-500/30 bg-lagoon-500/10 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lagoon-500/20 text-lagoon-300">
              <Sparkles size={16} />
            </span>
            <p className="text-sm text-lagoon-100">
              You're near <span className="font-semibold">{nearbyMatch.name}</span> — this'll count as visiting it.
            </p>
          </div>
        )}

        {needsManualName && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Name this place
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. That chai stall near the signal"
                className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lagoon-400/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Vibe
              </label>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setCustomVibe(v.key)}
                    className={customVibe === v.key ? "chip-active" : "chip-idle"}
                  >
                    <VibeIcon icon={v.icon} size={14} />
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div
          className={[
            "flex items-center gap-3 rounded-2xl border p-3",
            geoState === "on" ? "border-lagoon-500/30 bg-lagoon-500/10" : "border-white/10 bg-white/[0.03]",
          ].join(" ")}
        >
          {geoState === "on" ? (
            <MapPin size={16} className="shrink-0 text-lagoon-300" />
          ) : (
            <MapPinOff size={16} className="shrink-0 text-slate-400" />
          )}
          <p className="text-xs text-slate-300">
            {isCustom ? (
              <>
                {geoState === "locating" && "Recording your current location…"}
                {geoState === "on" && "Location captured — this spot is geotagged."}
                {geoState === "denied" && "Location is required to save a custom spot — enable it and reopen this sheet."}
              </>
            ) : (
              <>
                {geoState === "locating" && "Confirming you're actually here…"}
                {geoState === "on" && "Location confirmed — you're nearby."}
                {geoState === "denied" && "No location — check-in will still be saved, unverified."}
              </>
            )}
          </p>
        </div>

        <CameraCapture
          photoDataUrl={photoDataUrl}
          onCapture={setPhotoDataUrl}
          onClear={() => setPhotoDataUrl(null)}
        />

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What happened here? (optional)"
          rows={3}
          className="w-full resize-none rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lagoon-400/60"
        />

        {error && <p className="text-xs text-coral-400">{error}</p>}
      </div>
    </Sheet>
  );
}
