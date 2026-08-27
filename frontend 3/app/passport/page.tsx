"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Compass, MapPin, Sparkles } from "lucide-react";
import PassportMap from "@/components/explorer/PassportMap";
import { useExplorer } from "@/lib/explorer-store";
import { SEED_PLACES } from "@/lib/mock";

export default function PassportPage() {
  const router = useRouter();
  const visits = useExplorer((s) => s.visits);
  const score = useExplorer((s) => s.score);

  const places = useMemo(() => {
    const visitedIds = new Set(visits.map((v) => v.placeId));
    return SEED_PLACES.map((p) => ({
      id: p.id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      visited: visitedIds.has(p.id),
    }));
  }, [visits]);

  const totalKnown = SEED_PLACES.length;
  const pctExplored = totalKnown ? Math.round((score.placesVisited / totalKnown) * 100) : 0;

  return (
    <main className="relative min-h-screen w-full bg-night-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-4 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button onClick={() => router.push("/discover")} className="btn-ghost text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-2 font-display font-semibold">
            <Compass size={17} className="text-lagoon-300" /> My Passport
          </div>
          <span className="w-16" aria-hidden />
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Explorer score" value={score.score} />
          <StatCard label="Places visited" value={score.placesVisited} sub={`${pctExplored}% of Chennai`} />
          <StatCard label="Categories" value={score.categoriesExplored} />
          <StatCard label="Distance covered" value={`${score.totalDistanceKm.toFixed(1)} km`} />
        </div>

        <div className="mb-6 h-[360px] overflow-hidden rounded-3xl border border-white/10 sm:h-[440px]">
          <PassportMap places={places} />
        </div>

        <h2 className="mb-3 font-display text-lg font-semibold text-white">Memories</h2>
        {visits.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
            <Sparkles size={20} className="mx-auto mb-2 text-lagoon-300" />
            No memories yet — mark a place as visited from Discover to start filling in your map.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visits.map((v) => (
              <div key={v.id} className="card">
                {v.photoDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.photoDataUrl} alt={v.placeName} className="h-36 w-full object-cover" />
                )}
                <div className="p-4">
                  <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-white">
                    <MapPin size={13} className="text-lagoon-300" /> {v.placeName}
                  </p>
                  {v.note && <p className="mt-1 text-sm text-slate-300">{v.note}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(v.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-display text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-lagoon-300">{sub}</p>}
    </div>
  );
}
