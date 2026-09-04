"use client";

import { useEffect, useRef } from "react";

/**
 * Persistent animated backdrop, used on Discover and Combination. Loops
 * continuously as ambient motion — it never gates page content, so arriving
 * on Discover straight from the login hand-off doesn't mean staring at a
 * blank page until a clip finishes. `fadeIn` (set when arriving via the
 * login intro) just fades the whole backdrop in at its resting scale.
 */
export default function VideoBackground({
  className = "",
  fadeIn,
}: {
  className?: string;
  fadeIn?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

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
        loop
        playsInline
        preload="auto"
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
