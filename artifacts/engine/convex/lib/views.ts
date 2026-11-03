/**
 * The per-god object read model's numbers (docs/convex-read-architecture.md §4.1): pure, so the tick action, the
 * commit, the start, the end and the backfill compute them the same way. Live, the others' sum carries each value's
 * disclosure noise (settings.peerNoiseBits) exactly as the observation discloses it; ended, it is exact.
 */

type Score = { god: string; ordinal: number | number[]; rewardBits: number; netBits: number; penaltyBits?: number };
export type Scored = { scores: readonly Score[]; noise?: number };
export type Quadrant = "contested" | "chips" | "other";

/** The objects panel's filters as one stored field: contested (yours > 0, others care: exactly payoff > 0), chips. */
export const quadrantOf = (own: number, care: number): Quadrant => (care > 0 ? (own > 0 ? "contested" : "chips") : "other");

/** God `godId`'s row of one object as disclosed (null when it holds no score on it). */
export function viewRowOf(o: Scored, godId: string, live: boolean) {
  const own = o.scores.find(s => s.god === godId);
  if (!own) return null;
  // As lib/world.ts viewOf (kept import-free so unit tests load it): the others' sum, with the live noise, and the payoff.
  // Summed in the same order (peers, then the noise), so the numbers equal the observation's to the last bit.
  let peers = 0;
  for (const s of o.scores) if (s.god !== godId) peers += s.netBits;
  const noise = live ? o.noise ?? 0 : 0;
  const peerNetBits = noise === 0 ? peers : peers + noise;
  const peerCare = Math.max(0, peerNetBits);
  const view = { peerNetBits, peerCare, payoff: peerCare === 0 ? 0 : own.netBits * peerCare };
  return {
    ordinal: own.ordinal, rewardBits: own.rewardBits, ...(own.penaltyBits !== undefined ? { penaltyBits: own.penaltyBits } : {}), netBits: own.netBits,
    peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff, quadrant: quadrantOf(own.netBits, view.peerCare),
  };
}
export type ViewRow = NonNullable<ReturnType<typeof viewRowOf>>;

/** `maxOwn`, `maxCare`, `maxPayoff`, `minPayoff`: the extremes the objects panel scales its rectangles and bars by. */
export type GodTotals = {
  godId: string; objectCount: number; score: number; sumOwnNetBits: number; sumPeerNetBits: number; contested: number; chips: number;
  maxOwn: number; maxCare: number; maxPayoff: number; minPayoff: number;
};

/** Every roster god's totals over these objects, as disclosed (score = Σ payoff: the observation's self.score). */
export function godTotalsOf(roster: readonly string[], objects: readonly Scored[], live: boolean): GodTotals[] {
  return roster.map(godId => {
    const t: GodTotals = { godId, objectCount: 0, score: 0, sumOwnNetBits: 0, sumPeerNetBits: 0, contested: 0, chips: 0, maxOwn: 0, maxCare: 0, maxPayoff: 0, minPayoff: 0 };
    for (const o of objects) {
      const r = viewRowOf(o, godId, live);
      if (!r) continue;
      t.objectCount++; t.score += r.payoff; t.sumOwnNetBits += r.netBits; t.sumPeerNetBits += r.peerNetBits;
      t.maxOwn = Math.max(t.maxOwn, Math.abs(r.netBits)); t.maxCare = Math.max(t.maxCare, r.peerCare);
      t.maxPayoff = Math.max(t.maxPayoff, r.payoff); t.minPayoff = Math.min(t.minPayoff, r.payoff);
      if (r.quadrant === "contested") t.contested++;
      else if (r.quadrant === "chips") t.chips++;
    }
    return t;
  });
}

/** Every roster god's scatter points: own net bits and the others' sum (as disclosed), in object order. */
export function digestsOf(roster: readonly string[], objects: readonly Scored[], live: boolean) {
  return roster.map(godId => {
    const own: number[] = [], peer: number[] = [];
    for (const o of objects) {
      const r = viewRowOf(o, godId, live);
      if (r) { own.push(r.netBits); peer.push(r.peerNetBits); }
    }
    return { godId, own, peer };
  });
}
