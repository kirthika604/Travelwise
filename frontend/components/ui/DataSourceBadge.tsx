"use client";

import { Database, Radio } from "lucide-react";

// Small pill showing whether results came from the live API or the built-in
// mock fallback (and why, on hover).
export default function DataSourceBadge({
  source,
  error,
}: {
  source: "live" | "mock" | null;
  error?: string;
}) {
  if (!source) return null;
  if (source === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-lagoon-500/30 bg-lagoon-500/10 px-2.5 py-1 text-xs text-lagoon-300">
        <Radio size={12} /> Live API
      </span>
    );
  }
  return (
    <span
      title={error ? `Backend unavailable — showing sample data.\n${error}` : "Showing built-in sample data."}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300"
    >
      <Database size={12} /> Sample data
    </span>
  );
}
