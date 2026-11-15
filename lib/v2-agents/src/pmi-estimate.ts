/**
 * The estimator behind scripts/pmi.ts (analysis only; not part of the pure entry). Every rule's bits are read on the same
 * weighted draws (importance weights against a tilted mixture, self-normalised), so for rules A and B and a depth t:
 *
 *   Ŝ_A = Σ_{A ≥ t} w / Σ w,   Ŝ_AB = Σ_{A ≥ t ∧ B ≥ t} w / Σ w,   PMI(t) = log2 Ŝ_AB − log2 Ŝ_A − log2 Ŝ_B.
 *
 * A set's effective sample size is (Σ w)² / Σ w² over its draws; a depth whose joint set has fewer than `minEss` effective
 * draws is not read (null). A depth not read where independence would have put many draws in the joint set (at least
 * BOUND_FACTOR · minEss expected effective draws, E = ESS · Ŝ_A · Ŝ_B) is an exclusion, not a thin sample: it carries
 * the upper bound log2(minEss / E) (≤ −3.3 bits) and counts in the headline as that bound.
 */

/** The draws (indices, ascending) at or above a depth, with their weight sums. */
export interface UpperSet { readonly idx: Int32Array; readonly w: number; readonly w2: number }

export function upperSet(bits: ArrayLike<number>, weights: ArrayLike<number>, t: number): UpperSet {
  let n = 0;
  for (let k = 0; k < bits.length; k++) if (bits[k]! >= t) n++;
  const idx = new Int32Array(n);
  let w = 0, w2 = 0, at = 0;
  for (let k = 0; k < bits.length; k++) if (bits[k]! >= t) { idx[at++] = k; const x = weights[k]!; w += x; w2 += x * x; }
  return { idx, w, w2 };
}

export const ess = (w: number, w2: number): number => (w2 > 0 ? (w * w) / w2 : 0);

/** The intersection of two upper sets (a merge of their sorted indices). */
export function jointSet(a: UpperSet, b: UpperSet, weights: ArrayLike<number>): { n: number; w: number; w2: number } {
  const x = a.idx, y = b.idx;
  let i = 0, j = 0, n = 0, w = 0, w2 = 0;
  while (i < x.length && j < y.length) {
    const p = x[i]!, q = y[j]!;
    if (p < q) i++;
    else if (q < p) j++;
    else { const v = weights[p]!; n++; w += v; w2 += v * v; i++; j++; }
  }
  return { n, w, w2 };
}

export interface DepthReading {
  readonly t: number;
  /** −log2 Ŝ of each upper set and of the joint one (null: empty). */
  readonly bitsA: number | null;
  readonly bitsB: number | null;
  readonly bitsJoint: number | null;
  /** Effective draws in the joint set. */
  readonly essJoint: number;
  /** null when the joint set is under minEss effective draws. */
  readonly pmi: number | null;
  /** When not read but independence expected ≥ BOUND_FACTOR · minEss effective joint draws: PMI ≤ this. */
  readonly bound: number | null;
  /** The delta-method standard error of log2 Ŝ_AB (the dominant term of PMI's error). */
  readonly se: number | null;
}

export const BOUND_FACTOR = 10;

const lg = (s: number) => (s > 0 ? -Math.log2(s) : null);

export function readDepth(t: number, a: UpperSet, b: UpperSet, weights: ArrayLike<number>, W: number, W2: number, minEss: number): DepthReading {
  const j = jointSet(a, b, weights);
  const e = ess(j.w, j.w2);
  const bitsA = lg(a.w / W), bitsB = lg(b.w / W), bitsJoint = lg(j.w / W);
  const read = e >= minEss && bitsA !== null && bitsB !== null && bitsJoint !== null;
  let se: number | null = null;
  if (read) {
    const s = j.w / W;
    // Var(Ŝ) = Σ w² (1[x ∈ J] − Ŝ)² / W², as in v2-valuation's sampledOracle.
    const v = (j.w2 * (1 - s) ** 2 + (W2 - j.w2) * s * s) / (W * W);
    se = Math.sqrt(v) / s / Math.LN2;
  }
  const expected = ess(W, W2) * (a.w / W) * (b.w / W);
  const bound = !read && expected >= BOUND_FACTOR * minEss ? Math.log2(minEss / expected) : null;
  return { t, bitsA, bitsB, bitsJoint, essJoint: e, pmi: read ? bitsA! + bitsB! - bitsJoint! : null, bound, se };
}

/** The mean PMI over the depths that were read (an exclusion counting as its bound), or null when none was. */
export function headline(readings: readonly DepthReading[]): number | null {
  const xs = readings.map(r => r.pmi ?? r.bound).filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
