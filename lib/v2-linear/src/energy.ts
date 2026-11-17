/**
 * A line's energy for a rule (the owner, 17 Nov; docs/engine-v2/energy.md; the machinery is v2-core free-energy.ts):
 *
 *   energy(s) = mean over K starts x of c(x),   c(x) = −log2 Σ over distinct one-turn routes 2^−bits(route)
 *
 * - Bits: a turn pins one lens and costs its mutations' naming bits plus its surprise (lens-routes.ts, v2-core
 *   surprise.ts). A route to a target line costs the cheapest such turn over the four lenses.
 * - Starts: each whole number of the lens the rule reads drawn with about the state's information size (log2 |n|
 *   uniform in [log2 |n|, log2 |n| + ½), stratified across the starts; tops either sign, bottoms positive). The
 *   gradient-and-area lens draws its starts in the gradient-and-y-intercept lens (an area rarely has a rational root).
 * - Routes per start: the universal ones (the direct turn onto s; a cost-aware greedy climb in each lens) and the rule's
 *   `candidates`, summed by distinct target line.
 * Nothing is computed at import time.
 */
import { gcd, latinHypercube, physicsOf, meanAndSpread, q, Qn, rng as makeRng, startCost, greedyClimb, type DynamicRule, type Estimate, type EstimateOpts, type Q, type RouteSpace, type Rng, type Variant } from "@workspace/v2-core";
import { isVertical, type Line, type LineState } from "./line.ts";
import { searchMeter } from "./dynamic-families.ts";
import { LENSES, lensById, lensMoves, lensPrice, lensSurprise, routePrice, type Lens, type LensId } from "./lens-routes.ts";

// ------------------------------------------------------------------ readings

export interface Readings { readonly m: number; readonly c: number; readonly X: number | null; readonly area: number | null }
export const mq = (l: Line): Q => q(-l.a, l.b), cq = (l: Line): Q => q(-l.c, l.b);
export function readings(l: Line): Readings | null {
  if (isVertical(l)) return null;
  const m = Qn.toNumber(mq(l)), c = Qn.toNumber(cq(l));
  return { m, c, X: m === 0 ? null : -c / m, area: m === 0 || c === 0 ? null : -(c * c) / (2 * m) };
}

/** A line rule as the estimator takes it: u of a line, the lens its starts are drawn in, and its candidate targets. */
export interface LineRule {
  u(l: Line): number;
  readonly lens: LensId;
  candidates(x: Line, uStar: number): readonly Line[];
}
/** The lens a dynamic rule reads, from its `reads`. */
export const lensOfReads = (reads: readonly string[]): LensId =>
  reads.includes("gen") ? "abc" : reads.includes("X") ? "xy" : reads.includes("area") ? "mA" : "mc";
/** A dynamic rule on line states (one line per object) as a LineRule. */
export function lineRule<P>(rule: DynamicRule<LineState, P>, params: P): LineRule {
  const st = (l: Line): LineState => ({ lines: [l] });
  return {
    u: l => rule.u(st(l), params), lens: lensOfReads(rule.reads),
    candidates: (x, uStar) => (rule.candidates?.(st(x), uStar, params) ?? []).map(t => t.lines[0]!),
  };
}

// ------------------------------------------------------------------ starts of the same size

/** log2 of a whole number at any size. */
const log2Big = (n: bigint): number => { const L = Math.max(0, n.toString(2).length - 53); return Math.log2(Number(n >> BigInt(L))) + L; };
/**
 * n with log2 |n| at t of the band above log2 |v| (0 stays 0). Past 2^53 the top 52 bits come from the size and the low
 * bits are drawn uniformly, so a large start is not a multiple of a large power of two.
 */
const sameBits = (v: bigint, t: number, band: number, r: Rng): bigint => {
  if (v === 0n) return 0n;
  const e = log2Big(v < 0n ? -v : v) + band * t, k = Math.max(0, Math.floor(e) - 52);
  const top = BigInt(Math.max(1, Math.round(2 ** (e - k))));
  if (k === 0) return top;
  let low = 0n;
  for (let i = 0; i < k; i += 32) low = (low << 32n) | BigInt(r.uint32());
  return (top << BigInt(k)) | (low & ((1n << BigInt(k)) - 1n));
};
/** K starts for s in the rule's lens: each whole number of s's information size, stratified. */
export function lineStarts(s: Line, lensId: LensId, K: number, seed: string, band: number): Line[] {
  const lens = lensById(lensId === "mA" ? "mc" : lensId), base = lens.numbers(s);
  if (!base) return [];
  const r = makeRng("line-starts", seed), bottoms = new Set(lens.pairs.map(p => p[1]));
  const grid = latinHypercube(K, base.length, () => r.unit(), k => r.below(k)), out: Line[] = [];
  const draw = (i: number, t: number) => { const n = sameBits(base[i]!, t, band, r); return bottoms.has(i) || (lens.id === "abc" && i === 1) ? n : r.bit() ? n : -n; };
  for (const row of grid) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ns = base.map((_, i) => draw(i, attempt === 0 ? row[i]! : r.unit()));
      // Keep the drawn sizes: a pair whose top and bottom share a factor is drawn again (a few times, its own place kept).
      for (const [t, b] of lens.pairs) for (let k = 0; k < 12 && ns[b]! > 1n && gcd(ns[t]!, ns[b]!) !== 1n; k++) { ns[t] = draw(t, r.unit()); ns[b] = draw(b, r.unit()); }
      const l = lens.line(ns, s);
      if (l) { out.push(l); break; }
    }
  }
  return out;
}

// ------------------------------------------------------------------ the energy

export interface LineEstimateOpts extends EstimateOpts {
  /** The band of start sizes above s's, in bits: the game's physics setting sameSizeBand unless given. */
  readonly band?: number;
  /** Use the rule's candidates (true) or the universal routes alone (false). */
  readonly candidates?: boolean;
}
export interface LineSample { readonly from: Line; readonly cost: number; readonly best: number; readonly universal: number; readonly by: string }
export interface LineEstimate extends Estimate {
  readonly spread: number;
  readonly samples: readonly LineSample[];
  /** The distinct states scored (the work spent, against physics estimatorWork). */
  readonly work: number;
  /** True when the work budget ran out and some starts cost their upper bound ("bound, not found"). */
  readonly bound: boolean;
}

/**
 * What scoring one state costs against the work budget: its largest coefficient's binary length over WORD (at least 1,
 * not rounded: a rounded cost halved the work at a size threshold and with it the accuracy). A state's moves, its line
 * and its utility all cost about in proportion to its numbers' size, so the budget bounds time at any size (17 Nov: a
 * 40-bit line's state cost about three times a 5-bit one's).
 */
const WORD = 80;
const sizeCost = (l: Line): number => {
  const ab = (x: bigint) => (x < 0n ? -x : x), top = [ab(l.a), ab(l.b), ab(l.c)].reduce((t, x) => (x > t ? x : t), 0n);
  return Math.max(1, (top.toString(16).length * 4) / WORD);
};
/** Thrown inside a start's search when the estimate's work budget is spent. */
class OutOfWork extends Error {}

const keyOf = (l: Line) => `${l.a},${l.b},${l.c}`;
/** One lens's route space (the climb's moves, naming and surprise). */
export function lensSpace(lambda: number, lens: Lens, u: (l: Line) => number): RouteSpace<Line> {
  const nums = (l: Line) => lens.numbers(l);
  return {
    key: keyOf, u,
    *moves(y) { const ys = nums(y); if (ys) yield* lensMoves(lens, y, ys); },
    surprise: (x, z) => { const xs = nums(x), zs = nums(z); return xs && zs ? lensSurprise(lambda, xs, zs) : Infinity; },
    name: (x, t) => { const xs = nums(x), ts = nums(t); return xs && ts ? lensPrice(lambda, lens, xs, ts).naming : Infinity; },
  };
}

let fresh = 0;
/**
 * energy(s) under a line rule, in bits: the mean of c(x) over same-size starts. The variant carries the game's physics
 * settings (gravity, estimatorStarts, sameSizeBand); there are no defaults.
 */
export function estimateLine(s: Line, rule: LineRule, variant: Variant, o: LineEstimateOpts = {}): LineEstimate {
  const physics = physicsOf(variant), lambda = physics.gravity;
  const K = o.K ?? physics.estimatorStarts, band = o.band ?? physics.sameSizeBand, seed = o.seed ?? `fresh:${Date.now()}:${fresh++}:${Math.random()}`;
  // Work: each distinct state scored. Each start gets an even share of what is left of the budget (`limit`); past it
  // the start's climb stops and its routes found so far count (OutOfWork), and only a start that could not even price
  // its candidates costs its upper bound.
  const memo = new Map<string, number>(), budget = physics.estimatorWork;
  let work = 0, bound = false, limit = budget;
  const u = (l: Line) => {
    const k = keyOf(l);
    let v = memo.get(k);
    if (v === undefined) {
      if (work >= limit) throw new OutOfWork();
      work += sizeCost(l);
      v = isVertical(l) ? NaN : rule.u(l); if (Number.isNaN(v)) v = -Infinity; memo.set(k, v);
    }
    return v;
  };
  const uStar = u(s);
  if (uStar === -Infinity) return { energy: 0, spread: 0, u: uStar, K: 0, samples: [], work, bound };
  // The climb runs in the rule's own lens first (its cost bounds the others'), then gradient-and-intercept and the two
  // fine-structure lenses (continued fractions, prime exponents). The intercept, equation and area lenses join the
  // routes' prices (every candidate and the direct turn are priced in all six) but not the climb: their climbs found
  // the best route on almost no start and doubled the time (seen narrowly, 17 Nov).
  const CLIMB: readonly LensId[] = [rule.lens, "mc", "cf", "pe"];
  const spaces = LENSES.filter(l => CLIMB.includes(l.id)).sort((a, b) => CLIMB.indexOf(a.id) - CLIMB.indexOf(b.id)).map(l => lensSpace(lambda, l, u));
  // The direct turn and the candidates are priced here; past the start's share a candidate reads worst instead of
  // ending the start (it keeps the direct turn and what was already priced), and the estimate is a bound.
  const soft = (l: Line) => { try { return u(l); } catch (e) { if (!(e instanceof OutOfWork)) throw e; bound = true; return -Infinity; } };
  const all: RouteSpace<Line> = { key: keyOf, u: soft, moves: function* () {}, surprise: () => 0, name: (x, t) => routePrice(lambda, x, t).total };
  const climb = (x: Line, uS: number, _sp: RouteSpace<Line>, ceiling = Infinity) => {
    let best: { readonly target: Line; readonly bits: number } | null = null, cap = ceiling;
    try {
      for (const sp of spaces) {
        const c = greedyClimb(x, uS, sp, cap, 6);
        if (c && c.bits < cap) { best = c; cap = c.bits; }
      }
    } catch (e) {
      if (!(e instanceof OutOfWork)) throw e;
      bound = true;   // the climb was cut: the start keeps the direct turn, its candidates and the climbs that finished
    }
    return best;
  };
  const starts = lineStarts(s, rule.lens, K, seed, band);
  const samples: LineSample[] = starts.map((x, i) => {
    limit = work + Math.floor((budget - work) / (starts.length - i));
    try {
      // The rule's own searches spend from the same budget: at most half the start's share (the rest prices their
      // targets and runs the climbs). A search cut short keeps what it found; the estimate is then a bound.
      let cands: Line[] = [];
      if (o.candidates !== false) {
        const share = Math.floor((limit - work) / 2);
        searchMeter.left = share; searchMeter.cut = false; searchMeter.unit = sizeCost(x);
        try { cands = rule.candidates(x, uStar).filter(t => !isVertical(t)); }
        finally { work += share - Math.max(0, searchMeter.left); if (searchMeter.cut) bound = true; searchMeter.left = Infinity; searchMeter.cut = false; searchMeter.unit = 1; }
      }
      const c = startCost(x, s, uStar, all, cands, climb);
      return { from: x, cost: c.cost, best: c.best, universal: c.universal, by: c.by };
    } catch (e) {
      if (!(e instanceof OutOfWork)) throw e;
      // Out of work before the climb (the start's own utility or its candidates'): the upper bound, the price of
      // reaching exactly this state (a start already as good would cost 0, but telling needs the work that ran out).
      bound = true;
      const direct = routePrice(lambda, x, s).total;
      return { from: x, cost: direct, best: direct, universal: direct, by: "bound" };
    }
  });
  const finite = samples.filter(x => Number.isFinite(x.cost));
  const { energy, spread } = finite.length ? meanAndSpread(finite.map(x => x.cost)) : { energy: 0, spread: 0 };
  return { energy, spread, u: uStar, K: samples.length, samples, work, bound };
}
