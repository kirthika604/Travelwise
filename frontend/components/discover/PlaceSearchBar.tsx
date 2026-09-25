"use client";

import { Search, X } from "lucide-react";

export default function PlaceSearchBar({
  value,
  onChange,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
}) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder="Search a place, e.g. Marina Beach, temples, seafood…"
        aria-label="Search places"
        autoComplete="off"
        className="w-full rounded-2xl border border-white/[0.14] bg-night-900/60 py-3.5 pl-11 pr-11 text-sm text-white outline-none backdrop-blur-md transition-colors placeholder:text-slate-500 focus:border-lagoon-400/60 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
