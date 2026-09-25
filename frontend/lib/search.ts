// ---------------------------------------------------------------------------
// Place search — pure functions, no I/O. Runs over the full catalog held in
// memory (~140 places), so every keystroke is instant and never waits on the
// backend.
//
// Outcome tiers:
//   match   — the query names something in the catalog (typos, word order,
//             missing spaces and partial words all tolerated)
//   similar — no direct hit, but some places share words with the query, are
//             a near-miss on name, or match on category/vibe/cuisine
//   nearby  — nothing related at all; falls back to what's closest to you
// When nothing matches directly, `nearby` is always populated too, so the
// user is never left at a dead end.
// ---------------------------------------------------------------------------

import type { PlaceResult } from "./types";
import { haversineKm } from "./geo";

export type SearchTier = "match" | "similar" | "nearby";

export interface SearchOutcome {
  tier: SearchTier;
  matches: PlaceResult[];
  similar: PlaceResult[];
  nearby: PlaceResult[];
}

const STOPWORDS = new Set(["the", "a", "an", "in", "at", "of", "near", "to", "chennai"]);
const MAX_SIMILAR = 8;
const MAX_NEARBY = 8;

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function maxEdits(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

// How well one query word matches one candidate word, 0..1.
function wordScore(q: string, w: string): number {
  if (q === w) return 1;
  if (q.length >= 2 && w.startsWith(q)) return 0.85;
  if (q.length >= 3 && w.includes(q)) return 0.6;
  const edits = maxEdits(q.length);
  if (edits > 0) {
    const d = levenshtein(q, w, edits);
    if (d <= edits) return 0.75 - 0.15 * d;
  }
  // Long names people only half-remember ("kapali" for "kapaleeshwarar"):
  // the front of the word is right even though the ending isn't.
  if (q.length >= 5) {
    let shared = 0;
    while (shared < q.length && shared < w.length && q[shared] === w[shared]) shared++;
    if (shared >= 4 && shared >= Math.ceil(q.length * 0.7)) return 0.6;
  }
  return 0;
}

function bestWordScore(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    const s = wordScore(q, w);
    if (s > best) best = s;
  }
  return best;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

// Sørensen–Dice similarity on character bigrams, 0..1.
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, n] of A) overlap += Math.min(n, B.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

interface Scored {
  place: PlaceResult;
  score: number;
}

export function searchPlaces(
  query: string,
  catalog: PlaceResult[],
  origin: { latitude: number; longitude: number },
): SearchOutcome {
  const withDistance = catalog.map((p) => ({
    ...p,
    distance_km: haversineKm(origin, { latitude: p.latitude, longitude: p.longitude }),
  }));
  const byDistance = (a: PlaceResult, b: PlaceResult) => (a.distance_km ?? 0) - (b.distance_km ?? 0);

  let qTokens = tokens(query);
  const meaningful = qTokens.filter((t) => !STOPWORDS.has(t));
  if (meaningful.length) qTokens = meaningful;
  if (!qTokens.length) {
    return { tier: "nearby", matches: [], similar: [], nearby: [...withDistance].sort(byDistance).slice(0, MAX_NEARBY) };
  }
  const compactQuery = qTokens.join("");

  const matches: Scored[] = [];
  const similar: Scored[] = [];

  for (const p of withDistance) {
    const nameWords = tokens(p.name);
    const perToken = qTokens.map((q) => bestWordScore(q, nameWords));
    const mean = perToken.reduce((a, x) => a + x, 0) / perToken.length;
    const allHit = perToken.every((s) => s >= 0.5);

    // "besantnagar" / "marinabeach" — the words are right, the spaces aren't.
    const compactName = nameWords.join("");
    const compactHit = compactQuery.length >= 4 && compactName.includes(compactQuery);

    if (allHit || compactHit) {
      matches.push({ place: p, score: compactHit ? Math.max(mean, 0.8) : mean });
      continue;
    }

    // Not a direct hit — is it close enough to suggest?
    const metaWords = [
      ...tokens(p.category),
      ...p.tags.flatMap(tokens),
      ...p.cuisines.flatMap(tokens),
    ];
    const metaPerToken = qTokens.map((q) => bestWordScore(q, metaWords));
    const metaMean = metaPerToken.reduce((a, x) => a + x, 0) / metaPerToken.length;

    const nameFuzzy = dice(compactQuery, compactName);
    const score = Math.max(mean * 0.9, metaMean * 0.8, nameFuzzy);
    if (mean >= 0.25 || metaMean >= 0.5 || nameFuzzy >= 0.4) {
      similar.push({ place: p, score });
    }
  }

  const rank = (list: Scored[], limit: number) =>
    list
      .sort((a, b) => b.score - a.score || (a.place.distance_km ?? 0) - (b.place.distance_km ?? 0))
      .slice(0, limit)
      .map((s) => s.place);

  if (matches.length) {
    // Shorter names first among equals — "Marina Beach" before a long
    // venue that merely contains the words.
    matches.sort(
      (a, b) => b.score - a.score || a.place.name.length - b.place.name.length,
    );
    return { tier: "match", matches: matches.map((m) => m.place), similar: [], nearby: [] };
  }

  const similarPlaces = rank(similar, MAX_SIMILAR);
  const taken = new Set(similarPlaces.map((p) => p.id));
  const nearby = withDistance
    .filter((p) => !taken.has(p.id))
    .sort(byDistance)
    .slice(0, MAX_NEARBY);

  return {
    tier: similarPlaces.length ? "similar" : "nearby",
    matches: [],
    similar: similarPlaces,
    nearby,
  };
}
