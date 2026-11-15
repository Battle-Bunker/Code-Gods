/**
 * Value functions (owner decision 23): a state's value is the survival of the stationary law at its actual score,
 *
 *   bits(s) = −log2 π{ x : utility(x) ≥ utility(s) }      (utilities compared lexicographically, bigger better),
 *
 * defined for every score, with no thresholds, rungs or levels. A value function is stored as knots: scores, sorted, each
 * with a certified interval [lo, hi] for its bits. Survival is monotone in the score, so for a score between two knots
 * k_i ≤ s ≤ k_j the value lies in [lo(k_i), hi(k_j)] whatever happens between them: that bracket is the only
 * interpolation. Knots are kept wherever the value moves by more than `delta` bits, so a lookup between knots is within
 * delta/2 of its midpoint. A score better than the best knot is extrapolated from the last knots by the tail rule
 * (marked, with the best knot's lower bound as its certified floor). The best knot is where the measurement stops, not
 * a maximum: the tail keeps rising without bound wherever the score can keep improving (owner decision 26), so the
 * energy a state can be worth has no ceiling. The tail is the rule; the knots below it are where it is measured.
 *
 * The law has no box on the coefficients either: p(n) = 2^−mixedInt(n) is a complete code over all integers (its Kraft
 * sum is 1), so π is normalised by the code alone and the exact sums below need no conditioning.
 *
 * Knots come from survival "oracles": exact sums where a family declares them (lib/v2-linear sums.ts: separable, bands,
 * or the generic enumeration of the cheapest lines), and direct draws from π (owner decision 22) with a mixture of tilted
 * laws for the rare tail, weighted by p/q and self-normalised. Each knot takes the tightest certified interval.
 */
import {
  canonicalJson, compareScores, evaluateObject, hashHex, mixedIntBits, q, rng, ruleLayers, scoreFromWire, scoreToWire, STEP,
  tieBreakerId, type ObjectType, type Q, type RuleFamily, type Score, type TieBreaker, type Variant,
} from "@workspace/v2-core";
import { fromMC, lineLaw, lineParams, lineSums, lineType, type Band, type Law, type LineState, type LineSums } from "@workspace/v2-linear";
import { integersWithin } from "./exact.ts";
import { ruleKey, valuesHash } from "./keys.ts";

// ---------------------------------------------------------------- survival oracles

/** A source of survival values S(u) = π{utility ≥ u}: a certified interval where `valid(u)`, and candidate knots. */
export interface Oracle {
  readonly name: string;
  readonly source: "exact" | "sampled";
  /** Exact oracles: the mass whose scores are unknown (outside the enumeration). */
  readonly outside?: number;
  valid(u: Score): boolean;
  /** [lo, hi] for S(u) (exact oracles); for a sampled oracle [Ŝ − 2σ, Ŝ + 2σ], with `estimate` its centre. */
  survival(u: Score): { lo: number; hi: number; estimate: number; support: number };
  /** Scores worth a knot: the oracle's own atoms, thinned to about `delta` bits apart. */
  candidates(delta: number): Score[];
}

const keyOf = (u: Score): string => JSON.stringify(scoreToWire(u));
const desc = (a: { u: Score }, b: { u: Score }) => compareScores(b.u, a.u);
const bitsOf = (s: number) => (s <= 0 ? Infinity : s >= 1 ? 0 : -Math.log2(s));

/** Keep entries (best first, survival non-decreasing) where the bits move by more than delta, and the one before each jump. */
function thin<T extends { bits: number }>(list: readonly T[], delta: number): T[] {
  const out: T[] = [];
  let last: T | null = null, prev: T | null = null;
  for (const x of list) {
    if (last === null) { out.push(x); last = x; }
    else if (last.bits - x.bits > delta) {
      if (prev && prev !== last) { out.push(prev); last = prev; }
      if (last.bits - x.bits > delta) { out.push(x); last = x; }
    }
    prev = x;
  }
  if (prev && prev !== last) out.push(prev);
  return out;
}

/** Index of the first entry (sorted best first) worse than u: the number of entries at least as good as u. */
function countAtLeast(sorted: readonly { u: Score }[], u: Score): number {
  let a = 0, b = sorted.length;
  while (a < b) { const h = (a + b) >> 1; if (compareScores(sorted[h]!.u, u) >= 0) a = h + 1; else b = h; }
  return a;
}

/** Masses by score, summed as they come (an enumeration can visit millions of lines with few distinct scores). */
export class MassMap {
  readonly byKey = new Map<string, { u: Score; w: number }>();
  add(u: Score, w: number): void {
    const k = keyOf(u);
    const x = this.byKey.get(k);
    if (x) x.w += w; else this.byKey.set(k, { u, w });
  }
  values() { return this.byKey.values(); }
}

/** Exact masses of scores (each entry's mass is certain) plus the mass `outside` whose scores are unknown. */
export function massOracle(name: string, entries: Iterable<{ u: Score; w: number }>, outside: number, valid: (u: Score) => boolean = () => true): Oracle {
  const byKey = new Map<string, { u: Score; w: number }>();
  for (const e of entries) {
    const k = keyOf(e.u);
    const x = byKey.get(k);
    if (x) x.w += e.w; else byKey.set(k, { u: e.u, w: e.w });
  }
  const sorted = [...byKey.values()].sort(desc);
  const prefix = [0];
  for (const e of sorted) prefix.push(prefix[prefix.length - 1]! + e.w);
  return {
    name, source: "exact", valid, outside,
    survival(u) {
      if (u === null) return { lo: 1, hi: 1, estimate: 1, support: Infinity };
      const lo = prefix[countAtLeast(sorted, u)]!;
      return { lo, hi: Math.min(1, lo + outside), estimate: lo + outside / 2, support: Infinity };
    },
    candidates(delta) {
      return thin(sorted.map((e, i) => ({ u: e.u, bits: bitsOf(prefix[i + 1]!) })).filter(e => valid(e.u)), delta).map(e => e.u);
    },
  };
}

/**
 * The product of two independent 1D laws, main utility from one coefficient and tie-breaker from the other:
 * S(a, b) = P1(U1 > a) + P1(U1 = a)·P2(U2 ≥ b), each law certain inside its enumeration and T1, T2 outside.
 */
function productOracle(name: string, p1: { u: Q; w: number }[], t1: number, p2: { u: Q | null; w: number }[], t2: number): Oracle {
  const s1 = [...p1].sort((a, b) => compareScores([b.u], [a.u]));
  const s2 = [...p2].sort((a, b) => compareScores([b.u], [a.u]));
  const pre1 = [0], pre2 = [0];
  for (const e of s1) pre1.push(pre1[pre1.length - 1]! + e.w);
  for (const e of s2) pre2.push(pre2[pre2.length - 1]! + e.w);
  const ge1 = (a: Q) => { let x = 0, y = s1.length; while (x < y) { const h = (x + y) >> 1; if (compareScores([s1[h]!.u], [a]) >= 0) x = h + 1; else y = h; } return x; };
  const gt1 = (a: Q) => { let x = 0, y = s1.length; while (x < y) { const h = (x + y) >> 1; if (compareScores([s1[h]!.u], [a]) > 0) x = h + 1; else y = h; } return x; };
  const ge2 = (b: Q | null) => { let x = 0, y = s2.length; while (x < y) { const h = (x + y) >> 1; if (compareScores([s2[h]!.u], [b]) >= 0) x = h + 1; else y = h; } return x; };
  return {
    name, source: "exact", valid: () => true, outside: t1 + t2,
    survival(u) {
      if (u === null) return { lo: 1, hi: 1, estimate: 1, support: Infinity };
      const a = u[0]!, gt = pre1[gt1(a)]!, ge = pre1[ge1(a)]!, eq = ge - gt;
      const g2 = u.length > 1 ? pre2[ge2(u[1] ?? null)]! : 1;
      const lo = gt + eq * g2;
      const hi = Math.min(1, ge + t1, gt + t1 + (eq + t1) * Math.min(1, g2 + (u.length > 1 ? t2 : 0)));
      return { lo, hi, estimate: (lo + hi) / 2, support: Infinity };
    },
    candidates(delta) {
      const a = thin(s1.map((e, i) => ({ u: e.u, bits: bitsOf(pre1[i + 1]!) })), delta / 2);
      const b = thin(s2.map((e, i) => ({ u: e.u, bits: bitsOf(pre2[i + 1]!) })), delta / 2);
      const out: Score[] = [];
      for (const x of a) for (const y of b) out.push([x.u, y.u]);
      return out;
    },
  };
}

/** Self-normalised importance-sampled survival from weighted draws. */
export function sampledOracle(name: string, draws: readonly { u: Score; w: number }[]): Oracle {
  const sorted = [...draws].sort(desc);
  const pw = [0], pw2 = [0];
  for (const d of sorted) { pw.push(pw[pw.length - 1]! + d.w); pw2.push(pw2[pw2.length - 1]! + d.w * d.w); }
  const W = pw[pw.length - 1]!, W2 = pw2[pw2.length - 1]!;
  return {
    name, source: "sampled", valid: () => true,
    survival(u) {
      if (u === null) return { lo: 1, hi: 1, estimate: 1, support: Infinity };
      const n = countAtLeast(sorted, u);
      const s = W > 0 ? pw[n]! / W : 0;
      // Delta-method variance of the ratio estimator: Σ w_i² (1[x_i ≥ u] − Ŝ)² / W².
      const v = W > 0 ? (pw2[n]! * (1 - s) ** 2 + (W2 - pw2[n]!) * s * s) / (W * W) : 1;
      const sd = Math.sqrt(v);
      return { lo: Math.max(0, s - 2 * sd), hi: Math.min(1, s + 2 * sd), estimate: s, support: n };
    },
    candidates(delta) {
      const out: { u: Score; bits: number }[] = [];
      let acc = 0;
      for (const d of sorted) { acc += d.w; out.push({ u: d.u, bits: bitsOf(acc / W) }); }
      // Equal scores: keep the last of each run (its survival includes the whole run).
      const runs = out.filter((x, i) => i === out.length - 1 || compareScores(out[i + 1]!.u, x.u) !== 0);
      return thin(runs, delta).map(e => e.u);
    },
  };
}

// ---------------------------------------------------------------- the value function

export interface ValueKnot {
  /** The score (wire form; null is the worst score). */
  readonly u: (string | null)[] | null;
  readonly bits: number;
  readonly lo: number;
  readonly hi: number;
  readonly source: "exact" | "sampled";
}

export interface ValueConfig {
  /** Exact budgets: 1D enumeration (separable), band sums, and the generic 2D enumeration of the cheapest lines. */
  readonly separableBits: number;
  readonly bandBits: number;
  readonly triangleBits: number;
  readonly wideRange: number;
  /** Direct draws: the tilts of the mixture (1 is π itself) and the draws per tilt. */
  readonly tilts: readonly number[];
  readonly drawsPerTilt: number;
  /** Knots are kept where the value moves by more than this many bits. */
  readonly delta: number;
  /** A knot is certified when its interval is within max(relTarget · bits, absFloor) bits wide. */
  readonly relTarget: number;
  readonly absFloor: number;
  /** A sampled knot needs at least this many draws at or above it, and its ±2σ interval within max(sampledRel · bits, sampledAbs). */
  readonly minSupport: number;
  readonly sampledRel: number;
  readonly sampledAbs: number;
  /**
   * No sampled knot is certified past this many bits: the rarity to which the direct-draw sampler stayed calibrated in
   * independent replicates against the exact sums on line-z (sampler-check --replicates: 16 seeds, 6 pairings, |z| > 2 in
   * 4.2% of checks at 6–12 bits and 2.8% at 12–18; above 18 bits too few checks). Rarer scores are left to the tail rule,
   * marked "beyond", with the last certified knot as their floor. A limit on measurement, not on value: past it the
   * tail keeps rising without bound.
   */
  readonly sampledMaxBits: number;
}

export const VALUE_CONFIG: ValueConfig = {
  separableBits: 44, bandBits: 40, triangleBits: 28, wideRange: 200,
  tilts: [1, 0.75, 0.55, 0.4, 0.3], drawsPerTilt: 60_000, delta: 0.05, relTarget: 0.02, absFloor: 0.06, minSupport: 30,
  sampledRel: 0.05, sampledAbs: 0.2, sampledMaxBits: 18,
};

/**
 * How one utility past the best knot is worth more (owner decision 26: no maximum, a cost that makes larger numbers
 * harder to reach). "linear": `slope` bits per unit of the utility; "log": `slope` bits per doubling of 1 + the utility
 * (a magnitude ramp, for utilities ≥ 0, where each doubling of a coordinate costs about the same). The slope is always
 * positive, so the extrapolation keeps rising without bound wherever the utility can keep improving.
 */
export interface TailFit {
  readonly form: "linear" | "log";
  readonly slope: number;
  /** The fitted slope when the law's ceiling (TAIL_CEILING) cut it: a record that the knots alone would over-pay. */
  readonly unclamped?: number;
  /** "prime": the layer declares a prime-valued measure, so the tail is the code's own cost of a prime (Layer.measure). */
  readonly measure?: "prime" | "ladder";
  /**
   * A ladder's cap (the coordinator's amendment of trial 28): points [u, φ] from cheap witness states (RuleFamily.witness),
   * ascending in u, each φ the least code length of a witness at u or above. A score u is never worth more than the cap
   * at the first point at or above it: "at least u" is never rarer than a state that reaches it. Beyond the last point,
   * no cap.
   */
  readonly caps?: readonly (readonly [number, number])[];
}

/** What the rule's layers declare they measure (Layer.measure), per component of the score. */
export interface TailMeasures {
  readonly primary?: "prime" | "ladder";
  readonly secondary?: "prime" | "ladder";
}

export interface ValueTail {
  /** Along the secondary utility at the best knot's primary. */
  readonly secondary: TailFit;
  /** Along the primary utility. */
  readonly primary: TailFit;
}

export interface ValueFunction {
  /** 7: value functions (owner decision 23) whose tails have a form and never saturate (owner decision 26). */
  readonly schema: 7;
  readonly kind: "value-function";
  readonly ruleKey: string;
  readonly objectType: string;
  readonly objectTypeVersion: number;
  readonly variant: string;
  readonly variantHash: string;
  readonly family: string;
  readonly params: unknown;
  readonly tieBreaker: string;
  readonly seed: string;
  readonly config: ValueConfig;
  /** Worst first. The first is always the worst score (null, 0 bits). */
  readonly knots: readonly ValueKnot[];
  readonly tail: ValueTail;
  readonly diagnostics: {
    readonly exact: readonly { readonly name: string; readonly outside: number }[];
    readonly sampled: { readonly draws: number; readonly accepted: number; readonly ess: number } | null;
    readonly candidates: number;
  };
  readonly contentHash: string;
}

const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x);
/** Certified bounds round outward: lo down, hi up. */
const r4down = (x: number) => (Number.isFinite(x) ? Math.floor(x * 1e4) / 1e4 : x);
const r4up = (x: number) => (Number.isFinite(x) ? Math.ceil(x * 1e4) / 1e4 : x);

/** Knots from oracles: each candidate takes the tightest certified interval; monotone; thinned. */
export function knotsFrom(oracles: readonly Oracle[], cfg: Pick<ValueConfig, "delta" | "relTarget" | "absFloor" | "minSupport" | "sampledRel" | "sampledAbs"> & { sampledMaxBits?: number }): { knots: ValueKnot[]; candidates: number } {
  const seen = new Map<string, Score>();
  for (const o of oracles) for (const u of o.candidates(cfg.delta / 4)) seen.set(keyOf(u), u);
  seen.set(keyOf(null), null);
  const cands = [...seen.values()].sort((a, b) => compareScores(b, a));   // best first
  const chosen: { u: Score; bits: number; lo: number; hi: number; source: "exact" | "sampled" }[] = [];
  for (const u of cands) {
    let best: (typeof chosen)[number] | null = null;
    for (const o of oracles) {
      if (!o.valid(u)) continue;
      const s = o.survival(u);
      if (o.source === "sampled" && s.support < cfg.minSupport) continue;
      const hi = bitsOf(s.lo), lo = bitsOf(s.hi), bits = bitsOf(s.estimate);
      if (!Number.isFinite(hi) || !Number.isFinite(bits)) continue;
      if (o.source === "sampled" && bits > (cfg.sampledMaxBits ?? Infinity)) continue;
      const width = o.source === "exact" ? Math.max(cfg.relTarget * bits, cfg.absFloor) : 2 * Math.max(cfg.sampledRel * bits, cfg.sampledAbs);
      if (hi - lo > width) continue;
      if (!best || hi - lo < best.hi - best.lo) best = { u, bits, lo, hi, source: o.source };
    }
    if (best) chosen.push(best);
  }
  // Exact intervals are certain and monotone of themselves; a sampled estimate must fit between its exact neighbours,
  // or it is dropped (a ±2σ estimate never moves a certified bound).
  const betterHi: number[] = [], worseLo: number[] = [];
  let h = Infinity;
  chosen.forEach((k, i) => { betterHi[i] = h; if (k.source === "exact") h = Math.min(h, k.hi); });
  let l = 0;
  for (let i = chosen.length - 1; i >= 0; i--) { worseLo[i] = l; if (chosen[i]!.source === "exact") l = Math.max(l, chosen[i]!.lo); }
  const fits = chosen.filter((k, i) => k.source === "exact" || (k.bits <= betterHi[i]! && k.bits >= worseLo[i]!));
  // Monotone: walking from the worst up, a better score is worth at least as much. Lower bounds carry only from exact
  // knots (a certified floor); estimates carry as estimates.
  fits.reverse();
  let floorBits = 0, floorLo = 0;
  for (const k of fits) {
    k.bits = Math.max(k.bits, floorBits);
    if (k.source === "exact") { k.lo = Math.max(k.lo, floorLo); floorLo = k.lo; }
    k.hi = Math.max(k.hi, k.bits); k.lo = Math.min(k.lo, k.bits);
    floorBits = k.bits;
  }
  fits.reverse();
  const kept = thin(fits, cfg.delta).reverse();
  // The worst score is always a knot (0 bits), even when no oracle had anything to say.
  if (!kept.length || kept[0]!.u !== null) kept.unshift({ u: null, bits: 0, lo: 0, hi: 0, source: "exact" });
  return {
    knots: kept.map(k => ({ u: scoreToWire(k.u), bits: r4(k.bits), lo: r4down(k.lo), hi: r4up(k.hi), source: k.source })),
    candidates: cands.length,
  };
}

/** A rational as a float; a ratio of numbers too big for floats by bigint division. */
function toNumber(x: Q): number {
  const v = Number(x.n) / Number(x.d);
  return Number.isNaN(v) ? Number(x.n / x.d) : v;
}
/** log2 of a positive bigint, at any size. */
function log2Big(n: bigint): number {
  const len = n.toString(2).length;
  return len <= 1000 ? Math.log2(Number(n)) : Math.log2(Number(n >> BigInt(len - 64))) + (len - 64);
}
/** log2(1 + x) for x ≥ 0 (negative x counts as 0), at any size. */
function log2OnePlus(x: Q): number {
  if (x.n <= 0n) return 0;
  const v = toNumber(x);
  return Number.isFinite(v) ? Math.log2(1 + v) : log2Big(x.d + x.n) - log2Big(x.d);
}
/** Where a utility sits along a tail's form. */
const along = (form: TailFit["form"], x: Q): number => (form === "log" ? log2OnePlus(x) : toNumber(x));

/**
 * The law's floor for a tail (bits per doubling): how much rarer one coordinate's magnitude gets when it doubles from 1
 * to 2 under p(n) = 2^−mixedInt(n), −log2 P(|n| ≥ 2) + log2 P(|n| ≥ 1) ≈ 0.38, the slowest it ever decays (it rises
 * towards 1 bit per doubling for large numbers). A tail never rises more slowly than this.
 */
export const TAIL_FLOOR = (() => {
  const p = (n: bigint) => 2 ** -mixedIntBits(n);
  const atLeast1 = 1 - p(0n), atLeast2 = atLeast1 - 2 * p(1n);
  return Math.log2(atLeast1 / atLeast2);
})();

/** The least-squares slope of y on x and its residual sum of squares, or null with fewer than two distinct x. */
function leastSquares(pts: readonly { x: number; y: number }[]): { slope: number; sse: number } | null {
  if (pts.length < 2) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  if (!(sxx > 0) || !Number.isFinite(sxy / sxx)) return null;
  const slope = sxy / sxx;
  return { slope, sse: pts.reduce((a, p) => a + (p.y - my - slope * (p.x - mx)) ** 2, 0) };
}

/**
 * The law's ceiling for a tail on a utility ≥ 0 (bits per unit): STEP, what the mixed code charges per unit of a prime
 * (a prime p costs p/2 bits). bits(score) ≤ φ of the cheapest state with that score, and the dearest way a size,
 * prime or count can grow is through a new prime factor, so a tail never rises faster than this per unit: y = −2x + 734
 * (spf 367) has φ 197.8, which a fitted 0.66 bits per unit would over-pay by 50 bits. A ramp's steepest point is its
 * start, so a ramp is held to STEP per unit there: slope ≤ STEP·(1 + u_best)·ln 2 per doubling.
 */
export const TAIL_CEILING = STEP;

/**
 * One component's tail from the last knots along it (worst first; the last is the best knot). Utilities ≥ 0 (sizes,
 * counts, primes) take a straight line where one fits the knots at least as well as a magnitude ramp (bits on
 * log2(1 + u)) over three knots or more, at a per-unit cost on the code's scale (≥ STEP/4: a prime's p/2 bits, a
 * count's steps); otherwise the ramp. A line through a magnitude would over-value far scores without bound (2^30 is
 * cheap under the code, 2^30 units of a shallow line are not), so shallow lines are ramps. Either is held under the
 * law's ceiling (`ceiling`, TAIL_CEILING on lines); `unclamped` keeps the fitted slope when the ceiling cut it. Utilities that are distances
 * (≤ 0, best 0) take a straight line: their tail ends at 0, a finite top. A fit that rises more slowly than the law's
 * floor, or not at all (too few knots, noise), takes the floor: a ramp of TAIL_FLOOR bits per doubling, or for a
 * distance a line on which closing the rest of the gap to 0 is worth TAIL_FLOOR bits. The ceiling wins over the floor.
 */
function fitTail(pts: readonly { u: Q; y: number }[], ceiling: number, measure?: "prime" | "ladder", sizeRate?: number): TailFit {
  const best = pts[pts.length - 1];
  if (measure === "ladder" && best && best.u.n > 0n) {
    // A ladder's main part (the coordinator's declared trial, 15 Nov): past the measured knots its value keeps rising at
    // the rate measured over its rungs, a straight line in the main part, never held under the per-unit ceiling
    // (one unit of a ladder is a whole level: several primes, digits or 5s, each dearer under the law than a unit of a
    // coordinate). A flat tail was a top in disguise: Smooth Intercept's measured 5.4 bits per level, cut to 0.5, froze
    // lines at 22.87 bits (playtest round 26). What stops the climb is the price of the shortcuts that climb it
    // (v2-linear mutators.ts shortcutFloor), not the value. Too few rungs or no rise: TAIL_FLOOR per unit.
    const pos = pts.filter(p => p.u.n > 0n);
    const lin = pos.length >= 3 ? leastSquares(pos.map(p => ({ x: toNumber(p.u), y: p.y }))) : null;
    return { form: "linear", slope: Math.max(lin?.slope ?? 0, TAIL_FLOOR), measure };
  }
  if (measure === "prime" && (!best || best.u.n >= 0n)) {
    // A prime or a prime factor: the cheapest state whose value is the prime p pays about p/2 bits for it, so past the
    // measured knots the value rises at the code's own STEP bits per unit (the true rate, not only a ceiling). A
    // straight-line fit through three or more knots that rises more slowly is taken instead, but never below half that
    // rate; nothing rises faster than the ceiling.
    const rate = Math.min(STEP, ceiling);
    const pos = (pts ?? []).filter(p => p.u.n >= 0n);
    const lin = pos.length >= 3 ? leastSquares(pos.map(p => ({ x: toNumber(p.u), y: p.y }))) : null;
    const slope = lin !== null && lin.slope < rate ? Math.max(lin.slope, rate / 2) : rate;
    return lin !== null && lin.slope > ceiling ? { form: "linear", slope, unclamped: lin.slope, measure } : { form: "linear", slope, measure };
  }
  if (!best) return { form: "log", slope: TAIL_FLOOR };
  if (best.u.n > 0n || pts.every(p => p.u.n >= 0n)) {
    // A size (a magnitude, primary or secondary: −c on a sunken intercept, min(m, c), a prime): fitted on the knots at
    // or above 0, whatever lies below them.
    const pos = pts.filter(p => p.u.n >= 0n);
    const lin = leastSquares(pos.map(p => ({ x: toNumber(p.u), y: p.y })));
    const ramp = leastSquares(pos.map(p => ({ x: log2OnePlus(p.u), y: p.y })));
    // With a size rate (a variant whose numbers cost log₂ of their size), a size takes the log ramp, never a line.
    const lineFits = sizeRate === undefined && pos.length >= 3 && lin !== null && lin.slope >= TAIL_CEILING / 4
      && (ramp === null || ramp.slope <= 0 || lin.sse <= ramp.sse);
    const fit: TailFit = lineFits ? { form: "linear", slope: lin!.slope } : { form: "log", slope: Math.max(ramp?.slope ?? 0, TAIL_FLOOR) };
    const most = fit.form === "linear" ? ceiling : Math.min(ceiling * (1 + toNumber(best.u)) * Math.LN2, sizeRate ?? Infinity);
    return fit.slope > most ? { form: fit.form, slope: most, unclamped: fit.slope } : fit;
  }
  const gap = Math.max(-toNumber(best.u), 0) || 1;
  const lin = leastSquares(pts.map(p => ({ x: toNumber(p.u), y: p.y })));
  return { form: "linear", slope: Math.max(lin?.slope ?? 0, TAIL_FLOOR / gap) };
}

/**
 * The tail rule: fits through the last knots (at most six), along the secondary utility and along the primary, held
 * under `ceiling` bits per unit (TAIL_CEILING on lines, whose coordinates take the mixed integer code; none elsewhere).
 * `sizeRate`, for a variant whose law charges about log₂ of a number's size (pairs: 1 bit of φ per doubling of a
 * coefficient), makes every size tail a log ramp of at most that many bits per doubling, so a value never grows faster
 * than the φ of the cheapest state that reaches it (CLAUDE.md, decision 30).
 */
export function tailOf(knots: readonly Pick<ValueKnot, "u" | "bits">[], ceiling = Infinity, measures: TailMeasures = {}, sizeRate?: number, caps?: readonly (readonly [number, number])[]): ValueTail {
  const t = tailOf0(knots, ceiling, measures, sizeRate);
  return caps?.length && t.primary.measure === "ladder" ? { ...t, primary: { ...t.primary, caps } } : t;
}
function tailOf0(knots: readonly Pick<ValueKnot, "u" | "bits">[], ceiling: number, measures: TailMeasures, sizeRate?: number): ValueTail {
  const parsed = knots.map(k => ({ u: scoreFromWire(k.u), bits: k.bits })).filter(k => k.u !== null);
  const best = parsed[parsed.length - 1];
  if (!best) return { secondary: fitTail([], ceiling, measures.secondary, sizeRate), primary: fitTail([], ceiling, measures.primary, sizeRate) };
  const b = best.u!;
  const same = b.length > 1 && b[1] !== null
    ? parsed.filter(k => compareScores([k.u![0]!], [b[0]!]) === 0 && k.u!.length > 1 && k.u![1] !== null).slice(-6) : [];
  // Along the primary: the first (worst) knot at each primary, the survival of "primary at least this".
  const firsts: { u: Q; y: number }[] = [];
  for (const k of parsed) if (!firsts.length || compareScores([firsts[firsts.length - 1]!.u], [k.u![0]!]) !== 0) firsts.push({ u: k.u![0]!, y: k.bits });
  return { secondary: fitTail(same.map(k => ({ u: k.u![1]!, y: k.bits })), ceiling, measures.secondary, sizeRate),
    // A ladder's rate is measured over all its rungs (the top few alone are noisy where the samples run out).
    primary: fitTail(measures.primary === "ladder" ? firsts : firsts.slice(-6), ceiling, measures.primary, sizeRate) };
}

/**
 * A ladder family's cap points (TailFit.caps): for n = 1, 2, … its witnesses (RuleFamily.witness) valid on the variant,
 * each scored (its main part u) and priced (its code length φ); then for each u the least φ at u or above, so the cap is
 * a staircase that never falls. Stops after 4 units with no witness, or once φ passes 400 bits.
 */
export function ladderCaps<S, P>(type: ObjectType<S>, family: RuleFamily<S, P>, params: P, variant: Variant): [number, number][] {
  if (!family.keepsParams || !family.witness) return [];
  const pts: [number, number][] = [];
  let missed = 0;
  for (let n = 1; n <= 80 && missed < 4; n++) {
    let any = false;
    for (const w of family.witness(params, n)) {
      const s = type.canonical(w, variant);
      if (typeof s === "object" && s !== null && "invalid" in s) continue;
      const u = evaluateObject(type, family, params, s, variant, null).score?.[0];
      const phi = type.readLength(s, variant);
      if (!u || !Number.isFinite(phi)) continue;
      pts.push([toNumber(u), phi]);
      any = true;
    }
    missed = any ? 0 : missed + 1;
    if (pts.length && Math.min(...pts.slice(-3).map(p => p[1])) > 400) break;
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // The least φ at u or above, from the top down; one point per u.
  const out: [number, number][] = [];
  let least = Infinity;
  for (let i = pts.length - 1; i >= 0; i--) {
    least = Math.min(least, pts[i]![1]);
    // u to 6 decimals; φ rounded down to 3, so the stored cap never exceeds a witness's code length.
    const u = +pts[i]![0].toFixed(6), phi = Math.floor(least * 1000) / 1000;
    if (!out.length || out[0]![0] !== u) out.unshift([u, phi]);
    else out[0] = [u, phi];
  }
  return out;
}

export interface Lookup {
  readonly bits: number;
  /** Certified bounds (hi is Infinity beyond the best knot). */
  readonly lo: number;
  readonly hi: number;
  /** "knot": the score is a knot; "between": bracketed by two knots; "beyond": better than every knot (extrapolated). */
  readonly at: "knot" | "between" | "beyond";
}

/** What a rule's main layer and dealt tie-breaker declare they measure: the tail's measures. */
export function layerMeasures(family: RuleFamily<any, any>, tb: TieBreaker): TailMeasures {
  const [main, second] = ruleLayers(family, tb);
  // A ladder family's main part takes the ladder tail unless it declares its own measure.
  const primary = main?.measure ?? (family.keepsParams ? "ladder" : undefined);
  return { ...(primary ? { primary } : {}), ...(second?.measure ? { secondary: second.measure } : {}) };
}

/**
 * A lookup function for a value function: bits at any score. Past the best knot the tail rule extrapolates without
 * bound (owner decision 26); a value function given without its tail takes the tail its knots imply (tailOf).
 */
export function valueLookup(vf: { readonly knots: readonly Pick<ValueKnot, "u" | "bits" | "lo" | "hi">[]; readonly tail?: ValueTail | null }): (u: Score) => Lookup {
  const ks = vf.knots.map(k => ({ ...k, s: scoreFromWire(k.u) }));
  const tail = vf.tail ?? tailOf(vf.knots);
  return (u: Score) => {
    if (u === null) return { bits: 0, lo: 0, hi: 0, at: "knot" };
    // The last knot at most u.
    let a = 0, b = ks.length;
    while (a < b) { const h = (a + b) >> 1; if (compareScores(ks[h]!.s, u) <= 0) a = h + 1; else b = h; }
    const i = a - 1;
    const k = ks[i]!;
    if (compareScores(k.s, u) === 0) return { bits: k.bits, lo: k.lo, hi: k.hi, at: "knot" };
    const next = ks[i + 1];
    if (next) return { bits: (k.bits + next.bits) / 2, lo: k.lo, hi: next.hi, at: "between" };
    // Beyond the best knot: extrapolate along the tail rule; never below the best knot.
    let bits = k.bits;
    const s = k.s;
    if (s !== null && u[0] && s[0]) {
      const t = compareScores([u[0]], [s[0]]) === 0 ? (u[1] && s[1] ? { fit: tail.secondary, from: s[1], to: u[1] } : null) : { fit: tail.primary, from: s[0], to: u[0] };
      if (t) bits += t.fit.slope * (along(t.fit.form, t.to) - along(t.fit.form, t.from));
      // A ladder's cap: never more than the code length of a cheap state at this rung or above (TailFit.caps), whether
      // the tail runs along the main part or along the tie-breaker at the best knot's rung.
      if (tail.primary.caps) {
        const x = toNumber(u[0]), cap = tail.primary.caps.find(([cu]) => cu >= x - 1e-6);   // points are stored to 6 decimals
        if (cap) bits = Math.min(bits, cap[1]);
      }
    }
    // Floats end somewhere: a score past them is worth the largest finite number of bits, never Infinity or NaN.
    return { bits: Math.min(Number.isNaN(bits) ? k.bits : Math.max(bits, k.bits), Number.MAX_VALUE), lo: k.lo, hi: Infinity, at: "beyond" };
  };
}

// ---------------------------------------------------------------- lines: the oracles a line rule has

/** The score (utilities) of a one-line state. */
function utilityOf<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, state: LineState): Score {
  return evaluateObject(lineType, family, params, state, variant, tb).score;
}

/** Exact oracles for a rule on one whole-number line per object: its declared plan, and the cheapest lines. */
export function exactLineOracles<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, cfg: ValueConfig): Oracle[] {
  const lp = lineParams(variant);
  if (lp.domain !== "Z" || lp.linesPerObject !== 1) return [];
  const plan = lineSums[family.id] as LineSums<P> | undefined;
  const line = (m: bigint, c: bigint): LineState => ({ lines: [fromMC(q(m), q(c))] });
  // The law is the product of the mixed code on m and c, over every integer (no box, owner decision 26): its Kraft sum is 1.
  const within = integersWithin;
  const out: Oracle[] = [];
  // 1. The generic enumeration of every line with φ(m) + φ(c) ≤ triangleBits.
  {
    const ints = within(cfg.triangleBits);
    const entries = new MassMap();
    let inside = 0;
    for (const m of ints) for (const c of ints) {
      if (m.bits + c.bits > cfg.triangleBits) break;
      const w = 2 ** -(m.bits + c.bits);
      inside += w;
      entries.add(utilityOf(family, params, variant, tb, line(m.n, c.n)), w);
    }
    out.push(massOracle(`enumeration ≤ ${cfg.triangleBits} bits`, entries.values(), Math.max(0, 1 - inside)));
  }
  // 2. Separable: each dealt layer on one coefficient.
  const layers = ruleLayers(family, tb).map(l => l.id);
  const on = layers.map(id => plan?.separable?.[id]);
  if (on.every(x => x !== undefined)) {
    const ints = within(cfg.separableBits);
    const T = Math.max(0, 1 - ints.reduce((a, n) => a + 2 ** -n.bits, 0));
    const REF = 7n;
    const at = (coord: "m" | "c", n: bigint) => utilityOf(family, params, variant, tb, coord === "m" ? line(n, REF) : line(REF, n));
    if (on.length === 1 || on[0] === on[1]) {
      out.push(massOracle(`separable on ${on[0]} ≤ ${cfg.separableBits} bits`, ints.map(n => ({ u: at(on[0]!, n.n), w: 2 ** -n.bits })), T));
    } else {
      const p1: { u: Q; w: number }[] = [], p2: { u: Q | null; w: number }[] = [];
      for (const n of ints) {
        const u1 = at(on[0]!, n.n), u2 = at(on[1]!, n.n);
        if (u1 !== null) p1.push({ u: u1[0]!, w: 2 ** -n.bits });
        if (u2 !== null) p2.push({ u: u2[1] ?? null, w: 2 ** -n.bits });
      }
      out.push(productOracle(`separable on ${on.join(", ")} ≤ ${cfg.separableBits} bits`, p1, T, p2, T));
    }
  }
  // 3. Bands: every line at or above a main utility lies in the band's ranges.
  for (const band of plan?.bands ?? []) out.push(bandOracle(family, params, variant, tb, band, cfg));
  return out;
}

function bandOracle<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, band: Band<P>, cfg: ValueConfig): Oracle {
  const atLeast: Q = band.atLeast(params);
  const ints = integersWithin(cfg.bandBits);
  const byValue = [...ints].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  const prefix = [0];
  for (const x of byValue) prefix.push(prefix[prefix.length - 1]! + 2 ** -x.bits);
  const T1 = Math.max(0, 1 - prefix[prefix.length - 1]!);
  const lower = (v: bigint) => { let a = 0, b = byValue.length; while (a < b) { const h = (a + b) >> 1; if (byValue[h]!.n < v) a = h + 1; else b = h; } return a; };
  const one = mixedIntBits(1n);   // bits(t·k) = bits(t) + bits(k) − bits(1)
  const entries = new MassMap();
  let slack = 0, pointMass = 0;
  const add = (pm: number, m: bigint, c: bigint, bits: number) =>
    entries.add(utilityOf(family, params, variant, tb, { lines: [fromMC(q(m), q(c))] }), pm * 2 ** -bits);
  if (band.points === "same") for (const r of band.ranges(0n, params)) pointMass += 2 ** -mixedIntBits(r.lo);
  if (band.points === "one-per-m") pointMass = 2 ** -Math.min(...ints.map(x => x.bits));
  for (const m of ints) {
    const pm = 2 ** -m.bits;
    const seen = new Set<bigint>();
    for (const r of band.ranges(m.n, params)) {
      if (band.points) { if (!seen.has(r.lo)) { seen.add(r.lo); add(pm, m.n, r.lo, mixedIntBits(r.lo)); } continue; }
      if (r.step) {
        const tBits = mixedIntBits(r.step);
        for (const k of ints) {
          if (k.n !== 0n && tBits + k.bits - one > cfg.bandBits) { if (k.bits > cfg.bandBits - tBits + one) break; continue; }
          const c = r.step * k.n;
          if (c < r.lo || c > r.hi || seen.has(c)) continue;
          seen.add(c);
          add(pm, m.n, c, k.n === 0n ? mixedIntBits(0n) : tBits + k.bits - one);
        }
        continue;
      }
      const i0 = lower(r.lo), i1 = lower(r.hi + 1n);
      if (i1 - i0 > cfg.wideRange) { slack += pm * (prefix[i1]! - prefix[i0]!); continue; }
      for (let i = i0; i < i1; i++) {
        const c = byValue[i]!;
        if (seen.has(c.n)) continue;
        seen.add(c.n);
        add(pm, m.n, c.n, c.bits);
      }
    }
  }
  const outside = band.points ? T1 * pointMass : 2 * T1 + slack;
  return massOracle(`band from ${atLeast.d === 1n ? atLeast.n : `${atLeast.n}/${atLeast.d}`} ≤ ${cfg.bandBits} bits`, entries.values(), outside,
    u => u !== null && compareScores([u[0]!], [atLeast]) >= 0);
}

/** Direct draws from π for any law with tilts: weights p/q against the mixture of tilted laws, self-normalised. */
export function sampledDraws<S, P>(type: ObjectType<S>, law: Law<S>, family: RuleFamily<S, P>, params: P, variant: Variant, tb: TieBreaker,
  cfg: Pick<ValueConfig, "tilts" | "drawsPerTilt">, seed: string): { draws: { u: Score; w: number }[]; total: number } {
  const norms = cfg.tilts.map(t => law.log2Norm(t));
  const draws: { u: Score; w: number }[] = [];
  let total = 0;
  cfg.tilts.forEach(t => {
    const r = rng("value", seed, family.id, String(tb), t);
    for (let i = 0; i < cfg.drawsPerTilt; i++) {
      const d = law.draw(r, t);
      total++;
      if (d.state === null) continue;
      // p/q_mix with q_mix = (1/K) Σ_k q_k, q_k = 2^(−t_k φ − log2 Π Z_k): relative to p = 2^−φ.
      let mix = 0;
      cfg.tilts.forEach((tk, k) => { mix += 2 ** ((1 - tk) * d.bits - norms[k]!); });
      const w = cfg.tilts.length / mix;
      draws.push({ u: evaluateObject(type, family, params, d.state, variant, tb).score, w });
    }
  });
  return { draws, total };
}

/** Builds a rule's value function on lines: exact oracles where they exist, direct draws everywhere. */
export function lineValueFunction<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant,
  options: { tieBreaker?: TieBreaker; seed?: string; config?: Partial<ValueConfig>; exact?: boolean } = {}): ValueFunction {
  const cfg = { ...VALUE_CONFIG, ...options.config };
  const seed = options.seed ?? "v2";
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const exact = options.exact === false ? [] : exactLineOracles(family, params, variant, tb, cfg);
  const oracles: Oracle[] = [...exact];
  let sampled: ValueFunction["diagnostics"]["sampled"] = null;
  if (cfg.drawsPerTilt > 0) {
    const { draws, total } = sampledDraws(lineType, lineLaw(variant), family, params, variant, tb, cfg, seed);
    const W = draws.reduce((a, d) => a + d.w, 0), W2 = draws.reduce((a, d) => a + d.w * d.w, 0);
    sampled = { draws: total, accepted: draws.length, ess: Math.round(W2 > 0 ? (W * W) / W2 : 0) };
    oracles.push(sampledOracle("direct draws", draws));
  }
  const { knots, candidates } = knotsFrom(oracles, cfg);
  const body = {
    schema: 7 as const, kind: "value-function" as const,
    ruleKey: ruleKey(lineType as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: lineType.id, objectTypeVersion: lineType.version, variant: variant.id, variantHash: valuesHash(variant),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots, TAIL_CEILING, layerMeasures(family, tb), undefined, ladderCaps(lineType, family, params, variant)),
    diagnostics: { exact: exact.map(o => ({ name: o.name, outside: o.outside ?? 0 })), sampled, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}
