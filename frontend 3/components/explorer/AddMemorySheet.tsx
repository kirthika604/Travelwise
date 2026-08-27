"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Loader2, MapPin, MapPinOff } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { useExplorer } from "@/lib/explorer-store";

type GeoState = "idle" | "locating" | "on" | "denied";

export interface MemoryPlace {
  id: number;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
}

// Photo + note + geolocation-verified "I was here" capture, opened from a
// place's detail sheet. Self-contained: only talks to lib/explorer-store.
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

  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [note, setNote] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPhotoDataUrl(null);
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
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGeoState("on");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place?.id]);

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!place) return;
    setError(null);
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
      open={open && !!place}
      onClose={onClose}
      title="Add a memory"
      subtitle={place?.name}
      footer={
        place && (
          <button onClick={submit} disabled={isCheckingIn || done} className="btn-primary w-full">
            {done ? <Check size={16} /> : isCheckingIn ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {done ? "Saved!" : isCheckingIn ? "Saving…" : "Mark as visited"}
          </button>
        )
      }
    >
      {place && (
        <div className="space-y-4">
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
              {geoState === "locating" && "Confirming you're actually here…"}
              {geoState === "on" && "Location confirmed — you're nearby."}
              {geoState === "denied" && "No location — check-in will still be saved, unverified."}
            </p>
          </div>

          <label className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-slate-400 hover:border-lagoon-400/50">
            {photoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm">
                <Camera size={22} />
                Add a photo
              </span>
            )}
            <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange} className="hidden" />
          </label>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened here? (optional)"
            rows={3}
            className="w-full resize-none rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lagoon-400/60"
          />

          {error && <p className="text-xs text-coral-400">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
