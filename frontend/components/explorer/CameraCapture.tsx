"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";

type CamState = "idle" | "starting" | "live" | "denied" | "unsupported";

// Live camera → canvas snapshot, no file picker involved anywhere in the
// flow. Deliberately does NOT fall back to <input type="file"> — the point
// of a geotagged memory is that the photo was taken right here, right now,
// not chosen from a gallery (which could be from anywhere, any time).
export default function CameraCapture({
  photoDataUrl,
  onCapture,
  onClear,
}: {
  photoDataUrl: string | null;
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>("idle");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  // The <video> element only exists in the DOM once `state === "live"` (see
  // the render branches below) — attaching srcObject has to happen *after*
  // that element mounts, not in the same tick as the setState call that
  // causes it to mount. Doing it inline in startCamera() looked right but
  // silently no-opped: videoRef.current was still null at that point (the
  // component was still rendering the "starting" button, not the video),
  // so the stream was granted but never actually shown — a black/blank
  // preview instead of a real error.
  useEffect(() => {
    if (state === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [state]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setState("live");
    } catch {
      setState("denied");
    }
  };

  // A memory photo never needs to be camera-native resolution (modern rear
  // cameras stream well past 4K) — capping the longer side keeps the
  // resulting data URL (stored as a text column, see explorer-store.ts)
  // from ballooning into megabytes for no visible benefit.
  const MAX_DIMENSION = 1600;

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    setState("idle");
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  };

  const retake = () => {
    onClear();
    startCamera();
  };

  if (photoDataUrl) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.03]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoDataUrl} alt="" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={retake}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-night-950/70 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-night-950/90"
        >
          <RotateCcw size={13} /> Retake
        </button>
      </div>
    );
  }

  if (state === "live") {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/[0.12] bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={capture}
          aria-label="Take photo"
          className="absolute inset-x-0 bottom-3 mx-auto grid h-14 w-14 place-items-center rounded-full border-4 border-white/80 bg-white/10 backdrop-blur transition-transform active:scale-95"
        >
          <span className="h-10 w-10 rounded-full bg-white" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startCamera}
      disabled={state === "starting"}
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-sm text-slate-400 hover:border-lagoon-400/50 disabled:opacity-60"
    >
      <Camera size={22} />
      {state === "starting" && "Opening camera…"}
      {state === "denied" && "Camera access denied — check permissions and try again"}
      {state === "unsupported" && "Camera isn't available in this browser"}
      {state === "idle" && "Take a photo"}
    </button>
  );
}
