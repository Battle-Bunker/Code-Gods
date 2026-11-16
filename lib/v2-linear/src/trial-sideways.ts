/**
 * The scoring trial's fourth mode, "lift + sideways" (docs/engine-v2/scoring-trial.md, last section; the owner's idea,
 * 16 November: "if we measure expected distance from a random state at a similar height to the target utility class,
 * won't that be a proxy for rarity of the utility level class?").
 *
 *   energy(s) = H(s) + sideways(s)
 *   H: the log height (TRIAL_LOG: g a doubling of each number's size and of the bottom number)
 *   sideways(s): the mean, over random starts at the same height as s, of the cheapest price to reach any state whose
 *   utility is at least s's (the whole utility order: a higher basin, or the same basin at least as close)
 *
 * Prices are the log mode's: the game's own fee for the call (adding by the amount, multiplying by the factor's
 * digits, mirror and swap as choices), floored by the friction distance, plus the rise in H. Starts are drawn at the
 * same height (the scale-free law conditioned on a height is uniform over how the height is split between |m|, |c|
 * and the bottom number: a Dirichlet(1, 1, 1) split [derived for the continuous law]); routes are not restricted to
 * the band. Two estimates:
 *   (b) sampled: for each start, the cheapest route of up to two shortcuts (stretch ×2, ×3, ×½, ×⅓, ×−1, the three
 *       mirrors, the m–c swap) followed by one finishing move into the class: an addition (tilt or shift) or a stretch
 *       by the exact ratio (priced by the factor's digits). This is a bounded
 *       search, not the exact shortest path: a cheaper route with more steps is not seen.
 *   (a) formula, for a one-number reading: the start's reading is log-uniform-ish (the Dirichlet marginal), and the
 *       price is min(one addition onto the class, a stretch onto it), each with its lift, integrated numerically.
 */
import { q, Qn, rng as makeRng, type Q, type Rng } from "@workspace/v2-core";
import { fromMC, isVertical, type Line } from "./line.ts";
import { allMutators } from "./mutators.ts";
import { lineQLenses } from "./type.ts";
import { callPrice, height, ownFee, TRIAL_LOG } from "./trial.ts";
import { mcOf, READINGS, type Targets } from "./trial-rarity.ts";

/** A utility class in a reading's space: a union of [lo, hi] spans of |reading|. */
export type Spans = readonly (readonly [number, number])[];
export interface SidewaysRule {
  readonly label: string;
  /** Which number the reading is ("m", "c") or a composite ("area"). */
  readonly reading: "m" | "c" | "area";
  /** The class {u ≥ u(x)} for a state whose reading is x. */
  classOf(x: number): Spans;
}
const inSpans = (x: number, sp: Spans) => sp.some(([a, b]) => x >= a - 1e-12 && x <= b + 1e-12);

/** A target rule's class: the same basin at least as close as x, or any higher basin. */
export function targetRule(label: string, reading: "m" | "c" | "area", targets: Targets): SidewaysRule {
  return {
    label, reading,
    classOf(x) {
      const t = targets.around(x), lo = t.prev === 0 ? 0 : (t.prev + t.T) / 2, hi = (t.T + t.next) / 2, d = Math.abs(x - t.T);
      return [[Math.max(lo, t.T - d), t.T + d], [hi, Infinity]];
    },
  };
}
/** "Bigger is better" on one number: the class is everything at least as big. */
export const biggerRule = (reading: "m" | "c"): SidewaysRule => ({ label: `bigger |${reading}|`, reading, classOf: x => [[x, Infinity]] });

const readOf = (rule: SidewaysRule, l: Line): number | null => {
  const mc = mcOf(l);
  return mc ? READINGS[rule.reading]!.read(mc) : null;
};

/** The simplest rational in [a, b] (smallest bottom, up to 64), or null. */
function rationalIn(a: number, b: number): Q | null {
  if (!(b >= a)) return null;
  for (let den = 1; den <= 64; den++) {
    const n = Math.ceil(a * den - 1e-9);
    if (n / den <= b + 1e-9) return q(BigInt(n), BigInt(den));
  }
  return null;
}
const BY_ID = new Map(allMutators.map(m => [m.id, m]));
function apply(id: string, args: Record<string, unknown>, l: Line): Line | null {
  const r = BY_ID.get(id)!.apply({ lines: [l] }, 0, args as never, lineQLenses);
  return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!;
}
const price = (id: string, args: Record<string, unknown>, a: Line, b: Line) => callPrice(id, args, a, b, TRIAL_LOG)?.total ?? Infinity;

/** The cheapest single addition (tilt on m, shift on c) from l into the class; 0 if already in it. */
export function finish(rule: SidewaysRule, cls: Spans, l: Line): number {
  const x = readOf(rule, l);
  if (x !== null && inSpans(x, cls)) return 0;
  const m = Qn.toNumber(slopeQ(l)), c = Qn.toNumber(interceptQ(l));
  let best = Infinity;
  const tryMove = (id: "si.tilt" | "si.shift", target: Q | null, cur: Q) => {
    if (!target) return;
    const k = Qn.sub(target, cur);
    if (Qn.isZero(k)) return;
    const to = apply(id, { k }, l);
    if (to) best = Math.min(best, price(id, { k }, l, to));
  };
  // A stretch by the exact ratio onto the class ("renaming" the number by a multiplying factor, priced by its digits):
  // it scales m and c alike, so it scales an area by the same factor.
  const xq = rule.reading === "m" ? Qn.abs(slopeQ(l)) : rule.reading === "c" ? Qn.abs(interceptQ(l)) : areaQ(l);
  const tryStretch = (v: Q | null) => {
    if (!v || !xq || Qn.isZero(xq) || Qn.isZero(v)) return;
    const f = Qn.div(v, xq);
    if (Qn.eq(f, q(1))) return;
    const to = apply("mach.stretch", { f }, l);
    if (to) best = Math.min(best, price("mach.stretch", { f }, l, to));
  };
  for (const [a, b0] of cls) {
    const b = Number.isFinite(b0) ? b0 : a + Math.max(1, a);
    tryStretch(rationalIn(a, b));
    for (const sgn of [1, -1]) {
      if (rule.reading === "m") tryMove("si.tilt", signed(rationalIn(a, b), sgn), slopeQ(l));
      else if (rule.reading === "c") tryMove("si.shift", signed(rationalIn(a, b), sgn), interceptQ(l));
      else if (m !== 0 && c !== 0) {
        // area = c²/(2|m|): shift c into [√(2|m|a), √(2|m|b)], or tilt m to c²/(2A) for a rational A in [a, b]
        tryMove("si.shift", signed(rationalIn(Math.sqrt(2 * Math.abs(m) * a), Math.sqrt(2 * Math.abs(m) * b)), Math.sign(c) * sgn), interceptQ(l));
        const A = rationalIn(a, b);
        if (A && !Qn.isZero(A)) { const cq = interceptQ(l); tryMove("si.tilt", signed(Qn.div(Qn.mul(cq, cq), Qn.mul(q(2), A)), Math.sign(m) * sgn), slopeQ(l)); }
      }
    }
  }
  return best;
}
function areaQ(l: Line): Q | null {
  const m = slopeQ(l), c = interceptQ(l);
  return Qn.isZero(m) || Qn.isZero(c) ? null : Qn.abs(Qn.div(Qn.mul(c, c), Qn.mul(q(2), m)));
}
const signed = (v: Q | null, s: number): Q | null => (v === null ? null : s < 0 ? Qn.neg(v) : v);
const slopeQ = (l: Line): Q => q(-l.a, l.b);
const interceptQ = (l: Line): Q => q(-l.c, l.b);

const SHORTCUTS: readonly [string, Record<string, unknown>][] = [
  ["mach.stretch", { f: q(2) }], ["mach.stretch", { f: q(3) }], ["mach.stretch", { f: q(1, 2) }], ["mach.stretch", { f: q(1, 3) }], ["mach.stretch", { f: q(-1) }],
  ["cart.mirror", { axis: "x" }], ["cart.mirror", { axis: "y" }], ["cart.mirror", { axis: "origin" }], ["coef.swap", { pair: "m-c" }],
];
/** The cheapest route found: up to `depth` shortcuts, then one finishing addition. */
export function cheapestRoute(rule: SidewaysRule, cls: Spans, start: Line, depth = 2): number {
  let best = finish(rule, cls, start);
  if (best === 0) return 0;
  const go = (l: Line, spent: number, left: number) => {
    if (left === 0 || spent >= best) return;
    for (const [id, args] of SHORTCUTS) {
      const to = apply(id, args, l);
      if (!to) continue;
      const p = spent + price(id, args, l, to);
      if (p >= best) continue;
      best = Math.min(best, p + finish(rule, cls, to));
      go(to, p, left - 1);
    }
  };
  go(start, 0, depth);
  return best;
}

/** Doublings of height (H / g). */
export const doublings = (l: Line): number => height(l, TRIAL_LOG) / TRIAL_LOG.g;
/** A random line at about `h` doublings: a Dirichlet(1, 1, 1) split between |m|, |c| and the bottom number. */
export function startAt(h: number, r: Rng): Line {
  // Rounding to whole tops and bottoms can lose height on small numbers: redraw until within one doubling of h.
  let l = drawAt(h, r);
  for (let i = 0; i < 50 && Math.abs(doublings(l) - h) > 1; i++) l = drawAt(h, r);
  return l;
}
function drawAt(h: number, r: Rng): Line {
  const e = [0, 0, 0].map(() => -Math.log(1 - r.unit())), s = e[0]! + e[1]! + e[2]!;
  const [u1, u2, u3] = e.map(v => (v / s) * h) as [number, number, number];
  const b = Math.max(1, Math.round(2 ** u3));
  const top = (u: number) => BigInt(Math.round((2 ** u - 1) * b)) * (r.bit() ? 1n : -1n);
  return fromMC(q(top(u1), BigInt(b)), q(top(u2), BigInt(b)));
}

export interface Sideways { readonly sideways: number; readonly inClass: number; readonly height: number; readonly energy: number }
/** (b) sampled: the mean cheapest route from `n` random starts at s's height into s's class. */
export function sidewaysSampled(rule: SidewaysRule, s: Line, n = 200, seed = 1, depth = 2): Sideways {
  const x = readOf(rule, s), H = height(s, TRIAL_LOG);
  if (x === null) return { sideways: 0, inClass: 1, height: H, energy: H };
  const cls = rule.classOf(x), h = H / TRIAL_LOG.g, r = makeRng("sideways", rule.label, seed);
  let sum = 0, inside = 0;
  for (let i = 0; i < n; i++) {
    const st = startAt(h, r);
    const p = cheapestRoute(rule, cls, st, depth);
    if (p === 0) inside++;
    sum += Number.isFinite(p) ? p : 0;
  }
  const sideways = sum / n;
  return { sideways, inClass: inside / n, height: H, energy: H + sideways };
}

/**
 * (a) formula, for a one-number reading (m or c): the start's reading y has log2(1 + y) distributed as the Dirichlet
 * marginal 2(h − u)/h² on [0, h]; the rest of the height sits in the other numbers. The price is the cheaper of one
 * addition onto the nearest point of the class and a stretch by the ratio of the two (its fee by the factor's digits),
 * each with its lift (the rise in H). Integrated on a grid of 400 points.
 */
export function sidewaysFormula(rule: SidewaysRule, s: Line): number {
  const x = readOf(rule, s);
  if (x === null || rule.reading === "area") return NaN;
  const cls = rule.classOf(x), h = doublings(s), g = TRIAL_LOG.g;
  const N = 400;
  let sum = 0, w = 0;
  for (let i = 0; i < N; i++) {
    const u = ((i + 0.5) / N) * h, dens = (2 * (h - u)) / (h * h), y = 2 ** u - 1;
    let cost = 0;
    if (!inSpans(y, cls)) {
      // the nearest point of the class
      let v = Infinity;
      for (const [a, b] of cls) { const p = y < a ? a : y > b ? b : y; if (Math.abs(p - y) < Math.abs(v - y)) v = p; }
      const vq = rationalIn(v, v + 0.5) ?? q(Math.round(v));
      const lift = Math.max(0, g * (Math.log2(1 + Qn.toNumber(vq)) - Math.log2(1 + y)));
      const add = ownFee("si.shift", { k: rationalIn(Math.abs(Qn.toNumber(vq) - y), Math.abs(Qn.toNumber(vq) - y) + 0.5) ?? q(1) }, TRIAL_LOG);
      const yi = Math.max(1, Math.round(y)), vn = Qn.toNumber(vq);
      const ratio = vn > 0 ? q(BigInt(Math.round(vn * Number(vq.d))), BigInt(yi) * vq.d) : q(1);
      const stretch = ownFee("mach.stretch", { f: ratio }, TRIAL_LOG) + g * Math.max(0, Math.log2((1 + vn) / (1 + yi)));  // a stretch lifts both numbers by the ratio: at least this
      cost = Math.min(add + lift, stretch);
    }
    sum += dens * cost; w += dens;
  }
  return sum / w;
}
