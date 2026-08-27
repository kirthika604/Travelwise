"use client";

import { useEffect, useRef } from "react";

/**
 * Persistent animated backdrop used on the Discover page.
 * Plays the discovery video once (no loop) — when it ends, fires onEnded
 * so the parent can reveal content. Until play starts the video sits on
 * its first frame as a frozen backdrop.
 *
 * Arriving here from the login page's sky video, this simply fades in at
 * its resting scale (no zoom/scale transform) — that fade plus the page
 * content's own delayed reveal is what makes the handoff read as one smooth
 * dissolve instead of a hard cut or a camera move.
 */
export default function VideoBackground({
  className = "",
  fadeIn,
  play = true,
  onEnded,
}: {
  className?: string;
  fadeIn?: boolean;
  play?: boolean;
  onEnded?: () => void;
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
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-night-950 ${fadeIn ? "animate-fade-in" : ""} ${className}`}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover opacity-[0.55]"
        src="/videos/discovery-bg.mp4"
        muted
        playsInline
        preload="auto"
        onEnded={onEnded}
      />
      {/* Same scrim + glows as the rest of the app so contrast stays consistent */}
      <div className="absolute inset-0 bg-night-950/55" />
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
