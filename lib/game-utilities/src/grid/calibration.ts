/**
 * Ordinal utility -> surprisal (bits), net bits and payoff for Grid games.
 *
 * Tables are computed OFFLINE by Grid Lab (lib/grid-lab/gridlab/calibrate.py, exported by
 * gridlab/export.py) and shipped in src/grid/data. Lookups reproduce `calibrate.Survival._bits`
 * exactly, so the server's surprisal equals Grid Lab's for every ordinal on a non-exact table:
 *
 *   on a level            bits[i]
 *   between two levels    linear in ordinal distance from the level below
 *   below the lowest      bits[0] / (1 + distance)          (stays positive)
 *   above the highest     bits[top] + slope * distance      (uncapped)
 *
 * Surprisal is STRICTLY increasing in the ordinal, so "bigger is better" always earns more bits.
 * Families with an exact tail ("exact": true) were sampled at every table level; between levels
 * the server interpolates where Grid Lab would evaluate the exact formula (documented deferral).
 *
 * Scoring (docs/defence-goals.md in Grid Lab, "floored" mode):
 *   s_i  reward surprisal of god i's utility function
 *   h_i  penalty bits = hinge(penalty surprisal) for a god with a defence goal, else 0
 *   n_i  net bits = s_i - (h_i - E_μ h_i)        (= s_i without a defence goal)
 *   π_i  payoff = n_i · max(0, Σ_{j≠i} n_j)
 */
import type { Ordinal } from "./env.ts";

export interface SurvivalTable {
  family: string;
  params: unknown;
  /** True when levels are integer tuples (lexicographic), false for plain integers. */
  tuple: boolean;
  /** Strictly increasing ordinals. */
  levels: Ordinal[];
  /** Surprisal (bits) at each level, strictly increasing. */
  bits: number[];
  slope: number;
  exact: boolean;
  /** E_μ[surprisal] under the prior. */
  priorMean: number;
  /** Penalty tables only: E_μ[hinge(surprisal)]. */
  hbar?: number;
}

/** Lexicographic comparison of two ordinals of one kind: -1, 0 or 1. */
export function compareOrdinals(a: Ordinal, b: Ordinal): number {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  const x = a as number[], y = b as number[];
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) throw new Error("Mismatched ordinal kinds");
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// --- calibrate.ordinal_distance and its helpers, line for line ------------------------------------
/** Strictly increasing squash of any real into (0, 1). */
const sq = (x: number) => 0.5 + 0.5 * x / (1.0 + Math.abs(x));

function u(s: readonly number[], from = 0): number {
  if (from >= s.length) return 0.5;
  const lo = sq(s[from]), hi = sq(s[from] + 1);
  return lo + (hi - lo) * u(s, from + 1);
}

const tails = (a: readonly number[], t: readonly number[]) => 0.5 * (u(t) + 1.0 - u(a));

function above(a: readonly number[], t: readonly number[]): number {
  let m = 0;
  while (a[m] === t[m]) m++;
  const e = t[m] - a[m];
  const r0 = 1.0 - 1.0 / (e + 1), r1 = 1.0 - 1.0 / (e + 2);
  const w = 2.0 ** -(m + 1);
  return w + w * (r0 + (r1 - r0) * tails(a.slice(m + 1), t.slice(m + 1)));
}

/** How far ordinal t lies above ordinal a (t > a): positive, increasing in t, decreasing in a. */
export function ordinalDistance(a: Ordinal, t: Ordinal): number {
  if (typeof a === "number") return (t as number) - a;
  const x = t as number[];
  if (x[0] > a[0]) return (x[0] - a[0]) + tails(a.slice(1), x.slice(1));
  return above(a.slice(1), x.slice(1));
}

/** Surprisal (bits ≥ 0) of an ordinal under a table: calibrate.Survival._bits. */
export function surprisal(table: SurvivalTable, t: Ordinal): number {
  const { levels, bits, slope } = table;
  // bisect_right(levels, t) - 1: the last level <= t
  let lo = 0, hi = levels.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareOrdinals(t, levels[mid]) < 0) hi = mid; else lo = mid + 1;
  }
  const i = lo - 1, top = levels.length - 1;
  if (i >= 0 && compareOrdinals(levels[i], t) === 0) return bits[i];
  if (i < 0) return bits[0] / (1.0 + ordinalDistance(t, levels[0]));
  if (i === top) return bits[i] + slope * ordinalDistance(levels[i], t);
  return bits[i] + (bits[i + 1] - bits[i]) * ordinalDistance(levels[i], t) / ordinalDistance(levels[i], levels[i + 1]);
}

export const HINGE_BITS = 1.0;
const H0 = Math.log2(1.0 + 2.0 ** -HINGE_BITS);

/** Penalty bits from badness surprisal: log2(1 + 2^(s-1)) - log2(1.5); strictly increasing, h(0) = 0. */
export function hinge(bits: number): number {
  const x = bits - HINGE_BITS;
  return Math.max(0, x) + Math.log2(1 + 2 ** -Math.abs(x)) - H0;
}

/** Net bits: reward surprisal minus the penalty's excess over its prior mean. */
export function netBits(rewardBits: number, penaltyBits: number | null, hbar: number | null, weight = 1): number {
  return penaltyBits === null || hbar === null ? rewardBits : rewardBits - weight * (penaltyBits - hbar);
}

/** Floored payoff: own net bits times the others' net bits, floored at zero. */
export function payoff(ownNet: number, othersNetSum: number): number {
  return ownNet * Math.max(0, othersNetSum);
}

/** "Rarer than 976 of 1,000 random grids": the share of random grids this one beats. */
export function rarerThanPerThousand(bits: number): number {
  return Math.round(1000 * (1 - 2 ** -bits));
}

/** "1 in 40": about one random grid in N is at least this good. */
export function oneIn(bits: number): number {
  return Math.max(1, Math.round(2 ** bits));
}
