"use client";

import { useRouter, usePathname } from "next/navigation";
import { Award } from "lucide-react";
import { useExplorer } from "@/lib/explorer-store";

// The only way into /passport used to be a "{score} pts" pill that never
// said where it led and was hidden below the sm breakpoint — so most users
// never discovered the Passport/memories feature existed. This is the same
// pill, shown in every step's header instead of just Discover's, always
// visible, and labelled with what it actually is.
export default function PassportLink() {
  const router = useRouter();
  const pathname = usePathname();
  const score = useExplorer((s) => s.score);

  if (pathname === "/passport") return null;

  return (
    <button
      onClick={() => router.push("/passport")}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-lagoon-400/40 hover:text-white"
      aria-label={`My Passport — ${score.score} points`}
      title="My Passport — your visited places & memories"
    >
      <Award size={12} className="text-lagoon-300" />
      Passport
      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">{score.score}</span>
    </button>
  );
}
