"use client";

import { useEffect, useRef } from "react";

/**
 * The login page's backdrop: a sky/clouds clip that sits still on its first
 * frame until the person taps "Continue & explore". At that point `play`
 * flips true and the clip plays through once (clouds drifting, a plane
 * crossing) — the movement itself is the cue that something is happening,
 * rather than a separate transition effect layered on top. When the clip
 * ends, `onEnded` hands off to the caller, which navigates to Discover.
 * There is no scale/zoom transform on the video — Discover's own background
 * simply fades in on arrival, so the two clips read as one smooth dissolve
 * instead of a camera push.
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
        className="h-full w-full object-cover"
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
