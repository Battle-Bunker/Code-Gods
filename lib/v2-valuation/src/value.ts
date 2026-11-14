/**
 * Value functions (owner decision 23): a state's value is the survival of the stationary law at its actual score,
 *
 *   bits(s) = −log2 π{ x : utility(x) ≥ utility(s) }      (utilities compared lexicographically, bigger better),
 *
 * defined for every score, with no thresholds, rungs or levels. A value function is stored as knots: scores, sorted, each
 * with a certified interval [lo, hi] for its bits. Survival is monotone in the score, so for a score between two knots
 * k_i ≤ s ≤ k_j the value lies in [lo(k_i), hi(k_j)] whatever happens between them: that bracket is the only
 * interpolation. Knots are kept wherever the value moves by more than `delta` bits, so a lookup between knots is within
 * delta/2 of its midpoint. A score better than the best knot is extrapolated from the last knots (marked, with the best
 * knot's lower bound as its certified floor).
 *
 * Knots come from survival "oracles": exact sums where a family declares them (lib/v2-linear sums.ts: separable, bands,
 * or the generic enumeration of the cheapest lines), and direct draws from π (owner decision 22) with a mixture of tilted
 * laws for the rare tail, weighted by p/q and self-normalised. Each knot takes the tightest certified interval.
 */
import {
  canonicalJson, compareScores, evaluateObject, hashHex, mixedIntBits, mixedIntLog2Norm, q, rng, ruleLayers, scoreFromWire, scoreToWire, STEP,
  tieBreakerId, type ObjectType, type Q, type RuleFamily, type Score, type TieBreaker, type Variant,
} from "@workspace/v2-core";
import { fromMC, lineLaw, lineParams, lineSums, lineType, type Band, type Law, type LineState, type LineSums } from "@workspace/v2-linear";
import { integersWithin } from "./exact.ts";
import { ruleKey } from "./estimate.ts";

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
}

export const VALUE_CONFIG: ValueConfig = {
  separableBits: 44, bandBits: 40, triangleBits: 28, wideRange: 200,
  tilts: [1, 0.75, 0.55, 0.4, 0.3], drawsPerTilt: 60_000, delta: 0.05, relTarget: 0.02, absFloor: 0.06, minSupport: 30,
  sampledRel: 0.05, sampledAbs: 0.2,
};

export interface ValueTail {
  /**
   * How a score better than the best knot is extrapolated: bits per unit (≥ 0) of the secondary utility at the best
   * knot's primary, and of the primary utility; each a straight line through the last knots (0: flat).
   */
  readonly secondary: number;
  readonly primary: number;
}

export interface ValueFunction {
  /** 6: value functions (owner decision 23). Schema 5 (rung tables) is deleted in PR 2. */
  readonly schema: 6;
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
export function knotsFrom(oracles: readonly Oracle[], cfg: Pick<ValueConfig, "delta" | "relTarget" | "absFloor" | "minSupport" | "sampledRel" | "sampledAbs">): { knots: ValueKnot[]; candidates: number } {
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

/** The tail rule: straight lines through the last knots, along the secondary utility and along the primary. */
function tailOf(knots: readonly ValueKnot[]): ValueTail {
  const parsed = knots.map(k => ({ u: scoreFromWire(k.u), bits: k.bits })).filter(k => k.u !== null);
  const best = parsed[parsed.length - 1];
  if (!best) return { secondary: 0, primary: 0 };
  const num = (x: Q) => Number(x.n) / Number(x.d);
  const fit = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return 0;
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    let sxx = 0, sxy = 0;
    for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
    return sxx > 0 && Number.isFinite(sxy / sxx) ? Math.max(0, sxy / sxx) : 0;
  };
  const b = best.u!;
  const same = b.length > 1 && b[1] !== null
    ? parsed.filter(k => compareScores([k.u![0]!], [b[0]!]) === 0 && k.u!.length > 1 && k.u![1] !== null).slice(-6) : [];
  const firsts: { x: number; y: number }[] = [];
  for (const k of parsed) if (!firsts.length || firsts[firsts.length - 1]!.x !== num(k.u![0]!)) firsts.push({ x: num(k.u![0]!), y: k.bits });
  return { secondary: fit(same.map(k => ({ x: num(k.u![1]!), y: k.bits }))), primary: fit(firsts.slice(-6)) };
}

export interface Lookup {
  readonly bits: number;
  /** Certified bounds (hi is Infinity beyond the best knot). */
  readonly lo: number;
  readonly hi: number;
  /** "knot": the score is a knot; "between": bracketed by two knots; "beyond": better than every knot (extrapolated). */
  readonly at: "knot" | "between" | "beyond";
}

/** A lookup function for a value function: bits at any score. */
export function valueLookup(vf: Pick<ValueFunction, "knots" | "tail">): (u: Score) => Lookup {
  const ks = vf.knots.map(k => ({ ...k, s: scoreFromWire(k.u) }));
  const num = (x: Q) => Number(x.n) / Number(x.d);
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
      if (compareScores([u[0]], [s[0]]) === 0) { if (u[1] && s[1]) bits += vf.tail.secondary * (num(u[1]) - num(s[1])); }
      else bits += vf.tail.primary * (num(u[0]) - num(s[0]));
    }
    return { bits: Math.max(bits, k.bits), lo: k.lo, hi: Infinity, at: "beyond" };
  };
}

// ---------------------------------------------------------------- lines: the oracles a line rule has

/** The utility of a one-line state. */
function utilityOf<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, state: LineState): Score {
  const e = evaluateObject(lineType, family, params, state, variant, tb);
  return e.utility === undefined ? e.score : e.utility;
}

const capCache = new Map<bigint, number>();
/**
 * P(|n| ≤ cap) under p(n) = 2^−mixedInt(n): the board refuses numbers past its height cap, so the walk's law is p
 * conditioned on every coordinate within the cap, and the exact sums divide by this per coordinate. By a sieve.
 */
export function capMass(cap: bigint): number {
  const hit = capCache.get(cap);
  if (hit !== undefined) return hit;
  const N = Number(cap);
  if (!Number.isSafeInteger(N) || N > 50_000_000) throw new RangeError(`a height cap of ${cap} is too large to sum`);
  const spf = new Uint32Array(N + 1);
  for (let i = 2; i <= N; i++) if (spf[i] === 0) for (let j = i; j <= N; j += i) if (spf[j] === 0) spf[j] = i;
  const base = mixedIntBits(1n);   // 2 + log2 Z: the bits of ±1
  const fw = new Float64Array(N + 1);   // STEP · Σ e·p, by the smallest prime factor
  let sum = 0;
  for (let n = 1; n <= N; n++) {
    if (n > 1) fw[n] = fw[n / spf[n]!]! + STEP * spf[n]!;
    sum += 2 ** -(base + fw[n]!);
  }
  const mass = 2 ** -mixedIntBits(0n) + 2 * sum;
  capCache.set(cap, mass);
  return mass;
}

/** Exact oracles for a rule on one whole-number line per object: its declared plan, and the cheapest lines. */
export function exactLineOracles<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, cfg: ValueConfig): Oracle[] {
  const lp = lineParams(variant);
  if (lp.domain !== "Z" || lp.linesPerObject !== 1) return [];
  const plan = lineSums[family.id] as LineSums<P> | undefined;
  const line = (m: bigint, c: bigint): LineState => ({ lines: [fromMC(q(m), q(c))] });
  // The law is conditioned on |m|, |c| ≤ the height cap: enumerations keep in-cap numbers, and masses are per Z1 = P(in cap).
  const cap = lp.heightCap, Z1 = capMass(cap);
  const within = (budget: number) => integersWithin(budget).filter(n => (n.n < 0n ? -n.n : n.n) <= cap);
  const out: Oracle[] = [];
  // 1. The generic enumeration of every line with φ(m) + φ(c) ≤ triangleBits.
  {
    const ints = within(cfg.triangleBits);
    const entries = new MassMap();
    let inside = 0;
    for (const m of ints) for (const c of ints) {
      if (m.bits + c.bits > cfg.triangleBits) break;
      const w = 2 ** -(m.bits + c.bits) / (Z1 * Z1);
      inside += w;
      entries.add(utilityOf(family, params, variant, tb, line(m.n, c.n)), w);
    }
    out.push(massOracle(`enumeration ≤ ${cfg.triangleBits} bits`, entries.values(), Math.max(0, 1 - inside)));
  }
  // 2. Separable: each dealt layer on one coefficient.
  const layers = ruleLayers(family, tb).map(l => l.id);
  const on = layers.map(id => plan?.separable?.[id]);
  if (on.every(x => x !== undefined)) {
    const ints = within(cfg.separableBits).map(n => ({ n: n.n, bits: n.bits + Math.log2(Z1) }));   // the capped 1D law
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
  for (const band of plan?.bands ?? []) out.push(bandOracle(family, params, variant, tb, band, cfg, cap, Z1));
  return out;
}

function bandOracle<P>(family: RuleFamily<LineState, P>, params: P, variant: Variant, tb: TieBreaker, band: Band<P>, cfg: ValueConfig,
  cap: bigint, Z1: number): Oracle {
  const main = family.main;
  const t = main.thresholds(params, variant)[band.fromMain(params) - 1];
  if (!t) throw new Error(`${family.id}: the band starts at main level ${band.fromMain(params)}, which the main layer does not have`);
  const atLeast: Q = main.sense === "max" ? t : { n: -t.n, d: t.d };
  const abs = (x: bigint) => (x < 0n ? -x : x);
  // The capped 1D law: in-cap numbers, each mass divided by Z1 (its bits raised by log2 Z1).
  const lz = Math.log2(Z1);
  const ints = integersWithin(cfg.bandBits).filter(n => abs(n.n) <= cap).map(n => ({ n: n.n, bits: n.bits + lz }));
  const byValue = [...ints].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  const prefix = [0];
  for (const x of byValue) prefix.push(prefix[prefix.length - 1]! + 2 ** -x.bits);
  const T1 = Math.max(0, 1 - prefix[prefix.length - 1]!);
  const lower = (v: bigint) => { let a = 0, b = byValue.length; while (a < b) { const h = (a + b) >> 1; if (byValue[h]!.n < v) a = h + 1; else b = h; } return a; };
  const one = mixedIntBits(1n) + lz;   // bits(t·k) = bits(t) + bits(k) − bits(1), all three on the capped law
  const entries = new MassMap();
  let slack = 0, pointMass = 0;
  const add = (pm: number, m: bigint, c: bigint, bits: number) =>
    entries.add(utilityOf(family, params, variant, tb, { lines: [fromMC(q(m), q(c))] }), pm * 2 ** -bits);
  const capped = (n: bigint) => mixedIntBits(n) + lz;
  if (band.points === "same") for (const r of band.ranges(0n, params)) if (abs(r.lo) <= cap) pointMass += 2 ** -capped(r.lo);
  if (band.points === "one-per-m") pointMass = 2 ** -Math.min(...ints.map(x => x.bits));
  for (const m of ints) {
    const pm = 2 ** -m.bits;
    const seen = new Set<bigint>();
    for (const r of band.ranges(m.n, params)) {
      if (band.points) { if (!seen.has(r.lo) && abs(r.lo) <= cap) { seen.add(r.lo); add(pm, m.n, r.lo, capped(r.lo)); } continue; }
      if (r.step) {
        const tBits = capped(r.step);
        for (const k of ints) {
          if (k.n !== 0n && tBits + k.bits - one > cfg.bandBits) { if (k.bits > cfg.bandBits - tBits + one) break; continue; }
          const c = r.step * k.n;
          if (c < r.lo || c > r.hi || abs(c) > cap || seen.has(c)) continue;
          seen.add(c);
          add(pm, m.n, c, k.n === 0n ? capped(0n) : tBits + k.bits - one);
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
  const norms = cfg.tilts.map(t => mixedIntLog2Norm(t));
  const draws: { u: Score; w: number }[] = [];
  let total = 0;
  cfg.tilts.forEach(t => {
    const r = rng("value", seed, family.id, String(tb), t);
    for (let i = 0; i < cfg.drawsPerTilt; i++) {
      const d = law.draw(r, t);
      total++;
      if (d.state === null) continue;
      // p/q_mix with q_mix = (1/K) Σ_k q_k, q_k = 2^(−t_k φ − coords·log2 Z_k): log-sum-exp relative to p = 2^−φ.
      let mix = 0;
      cfg.tilts.forEach((tk, k) => { mix += 2 ** ((1 - tk) * d.bits - d.coords * norms[k]!); });
      const w = cfg.tilts.length / mix;
      const e = evaluateObject(type, family, params, d.state, variant, tb);
      draws.push({ u: e.utility === undefined ? e.score : e.utility, w });
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
    schema: 6 as const, kind: "value-function" as const,
    ruleKey: ruleKey(lineType as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: lineType.id, objectTypeVersion: lineType.version, variant: variant.id, variantHash: hashHex(canonicalJson(variant)),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots),
    diagnostics: { exact: exact.map(o => ({ name: o.name, outside: o.outside ?? 0 })), sampled, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}
