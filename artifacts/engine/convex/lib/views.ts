/**
 * The per-god object read model's numbers (docs/convex-read-architecture.md §4.1, §4.3): pure, so the tick action, the
 * read-model sync, the start, the end and the backfill compute them exactly as the observation does (lib/projection.ts
 * personalObject). Live, the others' sum carries each value's disclosure noise (settings.peerNoiseBits); ended, exact.
 */
import { applyHandicap, viewOf } from "./world.ts";

type Score = { god: string; ordinal: number | number[]; rewardBits: number; netBits: number; penaltyBits?: number };
/** What a row is computed from: an object's scores (every roster god's) and its value's disclosure noise. */
export type Scored = { scores: readonly Score[]; noise?: number };
/** The objects panel's filters: contested (yours > 0 and the others care: exactly payoff > 0) and chips (they care, yours ≤ 0). */
export type Quadrant = "contested" | "chips" | "other";
export const quadrantOf = (own: number, care: number): Quadrant => (care > 0 ? (own > 0 ? "contested" : "chips") : "other");

/** God `godId`'s numbers on one object as disclosed (null when the god holds no score on it). */
export function viewRowOf(o: Scored, godId: string, live: boolean) {
  const own = o.scores.find(s => s.god === godId);
  if (!own) return null;
  const view = viewOf(o.scores, godId, live ? o.noise ?? 0 : 0);
  return {
    ordinal: own.ordinal, rewardBits: own.rewardBits, ...(own.penaltyBits !== undefined ? { penaltyBits: own.penaltyBits } : {}), netBits: own.netBits,
    peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff,
  };
}
export type ViewRow = NonNullable<ReturnType<typeof viewRowOf>>;

/**
 * One god's totals over every object, as disclosed: the count, the score (Σ payoff: the observation's self.score), Σ own
 * net bits, Σ the others' sums, how many objects are contested and how many are chips (the panel's filters' counts), and
 * the extremes the panel scales by.
 */
export type GodTotals = {
  godId: string; objectCount: number; score: number; sumOwnNetBits: number; sumPeerNetBits: number; contested: number; chips: number;
  maxOwn: number; maxCare: number; maxPayoff: number; minPayoff: number;
};

/** Every roster god's totals over these objects. */
export function godTotalsOf(roster: readonly string[], objects: readonly Scored[], live: boolean, handicaps?: readonly number[]): GodTotals[] {
  return roster.map((godId, index) => {
    const t: GodTotals = { godId, objectCount: 0, score: 0, sumOwnNetBits: 0, sumPeerNetBits: 0, contested: 0, chips: 0, maxOwn: 0, maxCare: 0, maxPayoff: 0, minPayoff: 0 };
    for (const o of objects) {
      const r = viewRowOf(o, godId, live);
      if (!r) continue;
      t.objectCount++; t.score += r.payoff; t.sumOwnNetBits += r.netBits; t.sumPeerNetBits += r.peerNetBits;
      t.maxOwn = Math.max(t.maxOwn, Math.abs(r.netBits)); t.maxCare = Math.max(t.maxCare, r.peerCare);
      t.maxPayoff = Math.max(t.maxPayoff, r.payoff); t.minPayoff = Math.min(t.minPayoff, r.payoff);
      const q = quadrantOf(r.netBits, r.peerCare);
      if (q === "contested") t.contested++;
      else if (q === "chips") t.chips++;
    }
    // The score is the god's total as ranked: net of its handicap (docs/bid-phase.md). Per-object payoffs stay as they are.
    t.score = applyHandicap(t.score, handicaps?.[index]);
    return t;
  });
}
