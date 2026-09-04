"use client";

import { useEffect, useRef } from "react";

/**
 * The login page's backdrop: a sky/clouds clip that sits still on its first
 * frame until the person taps "Continue & explore". At that point `play`
 * flips true, the clip plays through once at 1.6x (clouds drifting, a plane
 * crossing) while gently zooming in (`animate-video-zoom-in`), then holds at
 * that push-in until `onEnded` hands off to the caller, which navigates to
 * Discover — so the cut reads as a deliberate camera push into the next
 * scene rather than a flat clip swap.
 */
export default function SkyBackground({
  play,
  onEnded,
  className = "",
}: {
  play: boolean;
  onEnded?: () => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !play) return;
    // The clip itself runs ~5s — sped up so the transition reads as a quick
    // beat rather than a wait before Discover appears.
    v.playbackRate = 1.6;
    v.play().catch(() => onEnded?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-night-950 ${className}`}
    >
      <video
        ref={videoRef}
        className={`h-full w-full object-cover ${play ? "animate-video-zoom-in" : ""}`}
        src="/videos/login-clouds-transition.mp4"
        muted
        playsInline
        preload="auto"
        onEnded={onEnded}
      />
      <div className="absolute inset-0 bg-night-950/45" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 15% 10%, rgba(45,212,191,0.16), transparent 60%)," +
            "radial-gradient(55% 45% at 85% 15%, rgba(56,189,248,0.14), transparent 60%)," +
            "radial-gradient(60% 55% at 50% 100%, rgba(94,234,212,0.10), transparent 60%)",
        }}
      />
    </div>
  );
}
