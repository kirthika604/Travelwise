"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, ArrowLeft, Compass, Flame, LogOut, MapPin, MapPinPlus, Search, Sparkles, Trash2 } from "lucide-react";
import PassportMap, { PassportPlace } from "@/components/explorer/PassportMap";
import AddMemorySheet from "@/components/explorer/AddMemorySheet";
import LevelUpModal from "@/components/explorer/LevelUpModal";
import Sheet from "@/components/ui/Sheet";
import { useExplorer } from "@/lib/explorer-store";
import { isCustomVisit, levelProgressPercent, uniqueVisitsInOrder } from "@/lib/explorer-mock";
import { useRequireAuth } from "@/lib/use-require-auth";
import { supabase } from "@/lib/supabase";
import { listPlaces } from "@/lib/api";
import type { PlaceSummary } from "@/lib/types";

export default function PassportPage() {
  const router = useRouter();
  const { loading: authLoading } = useRequireAuth();
  const visits = useExplorer((s) => s.visits);
  const score = useExplorer((s) => s.score);
  const deleteVisit = useExplorer((s) => s.deleteVisit);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<PassportPlace | null>(null);
  const [catalog, setCatalog] = useState<PlaceSummary[]>([]);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    await deleteVisit(id);
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  // Fetch from the same source Discover check-ins pull place ids from (live
  // backend, or its mock fallback) — using the old static SEED_PLACES list
  // here instead let a visit's place_id come from a different id space than
  // this catalog, so it could never match and its dot never turned red.
  useEffect(() => {
    listPlaces().then((res) => setCatalog(res.data));
  }, []);

  const places = useMemo<PassportPlace[]>(() => {
    const visitByPlaceId = new Map(visits.map((v) => [v.placeId, v]));
    const known = catalog.map((p) => {
      const visit = visitByPlaceId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        latitude: p.lat,
        longitude: p.lon,
        visited: !!visit,
        category: visit?.category,
        note: visit?.note,
        photoDataUrl: visit?.photoDataUrl,
        createdAt: visit?.createdAt,
      };
    });
    // Custom spots have no catalog id — synthesize a unique one for the map
    // (only needs to be unique within this array, not globally).
    const custom = visits.filter(isCustomVisit).map((v, i) => ({
      id: -(i + 1),
      name: v.placeName,
      latitude: v.latitude,
      longitude: v.longitude,
      visited: true,
      category: v.category,
      note: v.note,
      photoDataUrl: v.photoDataUrl,
      createdAt: v.createdAt,
    }));
    return [...known, ...custom];
  }, [visits, catalog]);

  // The exact path the "distance covered" stat is computed from — same
  // ordering/de-duplication as scoreFromVisits, so the line drawn always
  // matches the number shown, not a second, silently-drifting definition.
  const path = useMemo(
    () => uniqueVisitsInOrder(visits).map((v) => ({ latitude: v.latitude, longitude: v.longitude })),
    [visits],
  );

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visits;
    return visits.filter((v) => v.placeName.toLowerCase().includes(q));
  }, [visits, search]);

  const progressPct = levelProgressPercent(score.score);

  const totalKnown = catalog.length;
  const pctExplored = totalKnown ? Math.round((score.placesVisited / totalKnown) * 100) : 0;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (authLoading) return <div className="min-h-screen bg-night-950" />;

  return (
    <main className="relative min-h-screen w-full bg-night-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-4 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-2">
          <button onClick={() => router.push("/discover")} className="btn-ghost shrink-0 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <div className="hidden items-center gap-2 font-display font-semibold sm:flex">
            <Compass size={17} className="text-lagoon-300" /> My Passport
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="btn-primary px-3 text-sm sm:px-4"
              aria-label="Remember this place"
            >
              <MapPinPlus size={15} /> <span className="hidden sm:inline">Remember this place</span>
            </button>
            <button onClick={signOut} className="btn-ghost px-3 py-2 text-sm" aria-label="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {visits.length > 0 && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lagoon-gradient text-night-950 shadow-glow">
                <Award size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-white">
                  Level {score.level} · {score.levelName}
                </p>
                <p className="text-xs text-slate-400">
                  {score.pointsToNextLevel != null
                    ? `${score.pointsToNextLevel} pts to next level`
                    : "Max level — legendary"}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="font-display text-lg font-bold text-white">{score.score}</span>
                <span className="ml-1 text-xs text-slate-400">pts</span>
              </span>
              {score.streakDays > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">
                  <Flame size={12} className="text-coral-400" /> {score.streakDays}d streak
                </span>
              )}
            </div>
            {/* level <-> points progress, as one connected bar */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-lagoon-gradient transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Explorer score" value={score.score} />
          <StatCard label="Places visited" value={score.placesVisited} sub={`${pctExplored}% of Chennai`} />
          <StatCard label="Categories" value={score.categoriesExplored} />
          <StatCard label="Distance covered" value={`${score.totalDistanceKm.toFixed(1)} km`} />
        </div>

        <div className="mb-6 h-[360px] overflow-hidden rounded-3xl border border-white/10 sm:h-[440px]">
          <PassportMap places={places} path={path} onSelectMemory={setSelectedMemory} />
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">Memories</h2>
          <div className="relative w-full max-w-[220px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by place name"
              className="w-full rounded-full border border-white/[0.12] bg-white/[0.03] py-2 pl-9 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-lagoon-400/60"
            />
          </div>
        </div>
        {filteredVisits.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
            <Sparkles size={20} className="mx-auto mb-2 text-lagoon-300" />
            {visits.length === 0
              ? 'No memories yet — mark a place as visited from Discover, or tap "Remember this place" to geotag anywhere.'
              : `No memories match "${search}".`}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVisits.map((v) => (
              <div key={v.id} className="card relative">
                {v.photoDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.photoDataUrl} alt={v.placeName} className="h-36 w-full object-cover" />
                )}

                {confirmDeleteId === v.id ? (
                  <div className="flex items-center justify-between gap-2 bg-coral-500/10 px-4 py-2.5">
                    <p className="text-xs text-coral-400">Delete this memory?</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-full px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDelete(v.id)}
                        disabled={deletingId === v.id}
                        className="rounded-full bg-coral-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-coral-400 disabled:opacity-60"
                      >
                        {deletingId === v.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(v.id)}
                    aria-label={`Delete memory: ${v.placeName}`}
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-night-950/60 text-slate-300 backdrop-blur hover:bg-coral-500/80 hover:text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                )}

                <div className="p-4">
                  <p className="flex items-center gap-1.5 font-display text-sm font-semibold text-white">
                    <MapPin size={13} className="text-lagoon-300" /> {v.placeName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="chip-idle cursor-default px-2 py-0.5 text-[11px]">{v.category}</span>
                    {isCustomVisit(v) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-lagoon-500/30 bg-lagoon-500/10 px-2 py-0.5 text-[11px] text-lagoon-300">
                        <MapPinPlus size={10} /> Custom spot
                      </span>
                    )}
                  </div>
                  {v.note && <p className="mt-1.5 text-sm text-slate-300">{v.note}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(v.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddMemorySheet place={null} open={addOpen} onClose={() => setAddOpen(false)} />
      <LevelUpModal />

      <Sheet
        open={!!selectedMemory}
        onClose={() => setSelectedMemory(null)}
        title={selectedMemory?.name}
        subtitle={
          selectedMemory?.createdAt &&
          new Date(selectedMemory.createdAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        }
      >
        {selectedMemory && (
          <div className="space-y-4">
            {selectedMemory.photoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedMemory.photoDataUrl}
                alt={selectedMemory.name}
                className="w-full rounded-2xl object-cover"
              />
            )}
            {selectedMemory.category && <span className="chip-idle cursor-default px-2 py-0.5 text-[11px]">{selectedMemory.category}</span>}
            {selectedMemory.note ? (
              <p className="text-sm text-slate-300">{selectedMemory.note}</p>
            ) : (
              <p className="text-sm text-slate-500">No note left for this memory.</p>
            )}
          </div>
        )}
      </Sheet>
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
