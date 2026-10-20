"use client";

import { Loader2, Search, X } from "lucide-react";

// Typing filters our own places instantly; pressing Search (or Enter) also
// looks the place up on the map, so anywhere — not only tourist spots — can
// end in directions.
export default function PlaceSearchBar({
  value,
  onChange,
  onSubmit,
  searching = false,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  searching?: boolean;
  onFocus?: () => void;
}) {
  const canSubmit = value.trim().length >= 2 && !searching;

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="flex gap-2"
    >
      <div className="relative min-w-0 flex-1">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => e.key === "Escape" && onChange("")}
          placeholder="Search any place — Marina Beach, a college, hospital, mall, street…"
          aria-label="Search places"
          autoComplete="off"
          className="w-full rounded-2xl border border-white/[0.14] bg-night-900/60 py-3.5 pl-11 pr-11 text-sm text-white outline-none backdrop-blur-md transition-colors placeholder:text-slate-500 focus:border-lagoon-400/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
      </div>
      <button type="submit" disabled={!canSubmit} className="btn-primary shrink-0 px-5 text-sm disabled:opacity-50">
        {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        <span className="hidden sm:inline">Search</span>
        <span className="sr-only sm:hidden">Search</span>
      </button>
    </form>
  );
}
