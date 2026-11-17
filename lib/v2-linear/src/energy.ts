/**
 * The dynamic energy measure on lines (the owner, 16 Nov; docs/engine-v2/energy.md): "energy of an object is the
 * expected energy cost of reaching a state at least this good from a random object of the same 'size'".
 *
 *   energy(s) = mean over K starts x of min(direct(x → s), floor(x), heuristics(x))
 *
 * - Start: a random line whose read numbers (the gradient m, the y-intercept c: what the rule `reads`) each have s's
 *   information content: as many binary digits in the top and in the bottom (`sameSize`), the others from the law.
 * - direct (the ceiling): the cheapest solved move, or pair of moves, onto s itself.
 * - floor (shared by every rule): each single move with a solved amount putting one reading on s's (either sign):
 *   tilt, shift, cross.shift, area.shift, stretch by the exact ratio; the shortcuts (mirrors, stretch by 2, 3, ½, ⅓,
 *   1/10, −1, and the roundings); and each shortcut followed by one solved move (simplify first: round-then-solve,
 *   divide-then-solve); and through a mirror and back (reflect, one solved move, reflect back). A route counts when it reaches u ≥ u(s).
 * - heuristics: the rule's own target proposals, reached by solved moves onto the readings that differ (either order),
 *   from the start and from where each shortcut lands. Adding one can only lower the energy on the same starts.
 * - Price: the game's own act charge for each move as its own act (v2-economy changeCharge of the call's bits), so
 *   energy is in the units players pay. Moves the variant does not offer are never used.
 * Nothing is computed at import time.
 */
import { gcd, Qn, q, rng as makeRng, whichBits, type DynamicRule, type Estimate, type EstimateOpts, type Q, type Rng, type Variant } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { fromMC, isVertical, normalise, type Line, type LineState } from "./line.ts";
import { allMutators, roundTo } from "./mutators.ts";

// ------------------------------------------------------------------ readings

export interface Readings { readonly m: number; readonly c: number; readonly X: number | null; readonly area: number | null }
export const mq = (l: Line): Q => q(-l.a, l.b), cq = (l: Line): Q => q(-l.c, l.b);
export function readings(l: Line): Readings | null {
  if (isVertical(l)) return null;
  const m = Qn.toNumber(mq(l)), c = Qn.toNumber(cq(l));
  return { m, c, X: m === 0 ? null : -c / m, area: m === 0 || c === 0 ? null : -(c * c) / (2 * m) };
}
/** A number as a fraction: exact when whole, else the nearest with a bottom up to 64. */
export function toQ(v: number): Q | null {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v) && Math.abs(v) < 2 ** 53) return q(BigInt(v));
  let best = q(Math.round(v)), err = Math.abs(Math.round(v) - v);
  for (let d = 2; d <= 64; d++) { const n = Math.round(v * d), e = Math.abs(n / d - v); if (e < err) { best = q(n, d); err = e; } }
  return best;
}

/** A line rule as the estimator takes it: u of a line, what it reads, and target lines proposed from a start. */
export interface LineRule {
  u(l: Line): number;
  readonly reads: readonly string[];
  propose(x: Line, uStar: number, r: Rng): readonly Line[];
}
/** A dynamic rule on line states (one line per object) as a LineRule. */
export function lineRule<P>(rule: DynamicRule<LineState, P>, params: P): LineRule {
  const st = (l: Line): LineState => ({ lines: [l] });
  return {
    u: l => rule.u(st(l), params), reads: rule.reads,
    propose: (x, uStar, r) => (rule.searches ?? []).flatMap(h => h.propose(st(x), uStar, params, r).map(t => t.lines[0]!)),
  };
}

// ------------------------------------------------------------------ moves and prices

const BY_ID = new Map(allMutators.map(m => [m.id, m]));
interface Mv { readonly id: string; readonly args: Readonly<Record<string, unknown>> }
type Priced = [price: number, line: Line];

/** Applies and prices moves on one variant: a move it does not offer is refused (null). */
class Mover {
  readonly v: Variant;
  // Interim until the estimator moves to the new turn law (v2-core surprise.ts): it prices its routes with the old
  // moves on every board, whatever the board's menu.
  constructor(v: Variant) { this.v = { ...v, mutators: allMutators.map(m => m.id), which: undefined }; }
  apply(mv: Mv, l: Line): Priced | null {
    if (!this.v.mutators.includes(mv.id)) return null;
    const m = BY_ID.get(mv.id)!, r = m.apply({ lines: [l] }, 0, mv.args as never, this.v as never);
    if ("invalid" in r || isVertical(r.lines[0]!)) return null;
    let bits: number;
    try { bits = whichBits(this.v, mv.id) + m.args(this.v).bits(mv.args as never); } catch { return null; }
    return Number.isFinite(bits) ? [changeCharge([bits]), r.lines[0]!] : null;
  }
  /** The solved single moves putting the gradient ("m") or the y-intercept ("c") on v. */
  solved(l: Line, on: "m" | "c", v: Q): Priced[] {
    const cur = on === "m" ? mq(l) : cq(l);
    if (Qn.eq(cur, v)) return [[0, l]];
    const out: Priced[] = [], k = Qn.sub(v, cur);
    const push = (mv: Mv) => { const p = this.apply(mv, l); if (p && Qn.eq(on === "m" ? mq(p[1]) : cq(p[1]), v)) out.push(p); };
    if (on === "m") push({ id: "si.tilt", args: { k } });
    else { push({ id: "si.shift", args: { k } }); if (!Qn.isZero(mq(l))) push({ id: "cross.shift", args: { k: Qn.div(Qn.neg(k), mq(l)) } }); }
    if (!Qn.isZero(cur) && !Qn.isZero(v)) push({ id: "mach.stretch", args: { f: Qn.div(v, cur) } });
    return out;
  }
  /** The cheapest route of solved moves onto the readings of t that differ from x's (either order) reaching ok. */
  toTarget(x: Line, t: Line, ok: (l: Line) => boolean): number {
    const ons = (["m", "c"] as const).filter(k => !Qn.eq(k === "m" ? mq(x) : cq(x), k === "m" ? mq(t) : cq(t)));
    const orders: (readonly ("m" | "c")[])[] = ons.length === 2 ? [["m", "c"], ["c", "m"]] : [ons];
    let best = Infinity;
    for (const order of orders) {
      let frontier: Priced[] = [[0, x]];
      for (const on of order) frontier = frontier.flatMap(([p, l]) => this.solved(l, on, on === "m" ? mq(t) : cq(t)).map(([p2, u]) => [p + p2, u] as Priced));
      for (const [p, l] of frontier) if (p < best && ok(l)) best = p;
    }
    return best;
  }
}
/** The shortcuts, each also the first step of a floor route: mirrors, small stretches (divide-then-solve) and roundings (round-then-solve). */
const SHORTCUTS: Mv[] = [
  ...["x", "y", "origin", "diagonal"].map(axis => ({ id: "cart.mirror", args: { axis } })),
  ...[q(2), q(3), q(1, 2), q(1, 3), q(1, 10), q(-1)].map(f => ({ id: "mach.stretch", args: { f } })),
  ...["m", "c"].flatMap(which => ["whole", "tens", "tenths"].map(to => ({ id: "si.round", args: { which, to } }))),
];
const MIRRORS = SHORTCUTS.filter(m => m.id === "cart.mirror");
const shortcutsFrom = (mv: Mover, x: Line): Priced[] => SHORTCUTS.flatMap(s => { const p = mv.apply(s, x); return p ? [p] : []; });

const ROUNDINGS = [q(1), q(10), q(1, 10)];
/** The generic floor's routes: solved moves onto s's readings (either sign, and rounded), its crossing and area, the shortcuts, and a shortcut then a solved move. */
function floorRoutes(mv: Mover, x: Line, s: Line): Priced[] {
  const out: Priced[] = [], m = mq(s), c = cq(s);
  // Targets: s's readings, either sign, and their roundings (a padded reading's simpler neighbour may already be as good).
  const targets = (v: Q): Q[] => {
    const out: Q[] = [];
    for (const t of [v, ...ROUNDINGS.map(u => roundTo(v, u))]) for (const x of [t, Qn.neg(t)]) if (!out.some(o => Qn.eq(o, x))) out.push(x);
    return out;
  };
  const tm = targets(m), tc = targets(c);
  const onto = (from: Line, p0: number) => {
    for (const on of ["m", "c"] as const) for (const v of on === "m" ? tm : tc)
      for (const [p, l] of mv.solved(from, on, v)) if (p > 0) out.push([p0 + p, l]);
  };
  onto(x, 0);
  const mx = mq(x), cx = cq(x), one = (move: Mv) => { const p = mv.apply(move, x); if (p) out.push(p); };
  if (!Qn.isZero(mx) && !Qn.isZero(m)) {
    const X = Qn.div(Qn.neg(c), m), Xx = Qn.div(Qn.neg(cx), mx);
    for (const v of [X, Qn.neg(X)]) if (!Qn.eq(v, Xx)) one({ id: "cross.shift", args: { k: Qn.sub(v, Xx) } });
    if (!Qn.isZero(c) && !Qn.isZero(cx)) {
      const A = Qn.div(Qn.neg(Qn.mul(c, c)), Qn.mul(q(2), m)), Ax = Qn.div(Qn.neg(Qn.mul(cx, cx)), Qn.mul(q(2), mx));
      if (!Qn.eq(A, Ax)) one({ id: "area.shift", args: { k: Qn.sub(A, Ax) } });
    }
  }
  for (const [p1, l1] of shortcutsFrom(mv, x)) { out.push([p1, l1]); onto(l1, p1); }
  // Through a mirror and back (a lens): reflect, solve onto the reflected s's readings, reflect back. The diagonal
  // mirror swaps the x-crossing and the y-intercept, so a crossing is set as cheaply as a y-intercept.
  for (const mirror of MIRRORS) {
    const s1 = mv.apply(mirror, s), first = mv.apply(mirror, x);
    if (!s1 || !first) continue;
    const m1 = mq(s1[1]), c1 = cq(s1[1]);
    for (const on of ["m", "c"] as const) for (const [p, l] of mv.solved(first[1], on, on === "m" ? m1 : c1)) {
      const back = p > 0 ? mv.apply(mirror, l) : null;
      if (back) out.push([first[0] + p + back[0], back[1]]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ starts of the same size

/** A fraction for the parameters a rule does not read: top and bottom each Pareto (exponent 2), in lowest terms. */
const pareto = (r: Rng): number => Math.floor(Math.max(1, (1 - r.unit()) ** -1));
function drawFraction(r: Rng): { p: number; q: number } {
  for (;;) {
    const n = pareto(r) - 1, d = pareto(r);
    if (gcd(BigInt(n), BigInt(d)) !== 1n) continue;   // gcd(0, d) = d: zero only over 1
    return { p: n === 0 ? 0 : r.bit() ? n : -n, q: d };
  }
}
const drawLine = (r: Rng) => ({ m: drawFraction(r), c: drawFraction(r) });

/** n ≥ 1 with log2 n uniform in [log2 v, log2 v + band) (v ≥ 1). */
const sameBits = (v: bigint, band: number, r: Rng): bigint => {
  const L = Math.log2(Math.max(1, Number(v)));
  return BigInt(Math.max(1, Math.round(2 ** (L + band * r.unit()))));
};
/**
 * A number of v's information content: its top and its bottom (in lowest terms) each drawn with as many binary digits
 * as v's own (log2 uniform in [log2, log2 + band)), either sign, top and bottom sharing no factor where a few tries find
 * such a pair. A whole number gives a whole number; padding a number with digits (867 → 8,670,001/10,000) makes its
 * starts as long as the padded number, so rounding them first leads back to starts like the plain number's.
 */
export function sameSize(v: Q, band: number, r: Rng): Q {
  const top = v.n < 0n ? -v.n : v.n;
  let n = sameBits(top, band, r), d = sameBits(v.d, band, r);
  for (let i = 0; i < 4 && d > 1n && gcd(n, d) !== 1n; i++) { n = sameBits(top, band, r); d = sameBits(v.d, band, r); }
  return q(r.bit() ? n : -n, d);
}
/**
 * A start for s: the numbers the rule reads, each of s's information content, in the rule's own representation; the
 * others from the law. Reads: "m" and "c" (y = mx + c), "X" (where it crosses the x-axis: the gradient from the law,
 * the y-intercept −m·X), "gen" (a, b and c of ax + by + c = 0, each whole number of s's own digits, b > 0).
 */
export function startLike(s: Line, reads: readonly string[], band: number, r: Rng): Line {
  const d = drawLine(r), lawM = q(d.m.p, d.m.q), lawC = q(d.c.p, d.c.q);
  if (reads.includes("gen")) {
    const whole = (v: bigint, positive = false): bigint => { const x = sameSize(q(v), band, r).n; return positive && x < 0n ? -x : x; };
    for (let i = 0; i < 8; i++) {
      const l = normalise(whole(s.a), whole(s.b === 0n ? 1n : s.b, true), whole(s.c));
      if (!("invalid" in l) && !isVertical(l)) return l;
    }
    return fromMC(lawM, lawC);
  }
  if (reads.includes("X")) {
    const m = Qn.isZero(mq(s)) || !reads.includes("m") ? (Qn.isZero(lawM) ? q(1) : lawM) : sameSize(mq(s), band, r);
    const X = Qn.isZero(mq(s)) ? q(1) : sameSize(Qn.div(Qn.neg(cq(s)), mq(s)), band, r);
    return fromMC(m, Qn.neg(Qn.mul(m, X)));
  }
  return fromMC(reads.includes("m") ? sameSize(mq(s), band, r) : lawM, reads.includes("c") ? sameSize(cq(s), band, r) : lawC);
}

// ------------------------------------------------------------------ the energy

/** K on the server: 8 keeps a commit (every seat's estimate) near 200 ms in the Convex runtime (energy.md); tests pass their own. */
export const LINE_K = 8;
export interface LineEstimateOpts extends EstimateOpts {
  /** The band of start sizes above s's, in bits (½). */
  readonly band?: number;
  /** Use the rule's heuristics (true) or the floor alone (false). */
  readonly heuristics?: boolean;
}
export interface LineSample { readonly from: Line; readonly direct: number; readonly floor: number; readonly heuristic: number; readonly cost: number }
export interface LineEstimate extends Estimate { readonly samples: readonly LineSample[] }

let fresh = 0;
/** energy(s) under a line rule on a variant: the mean over K same-size starts of min(direct, floor, heuristics). */
export function estimateLine(s: Line, rule: LineRule, variant: Variant, o: LineEstimateOpts = {}): LineEstimate {
  const K = o.K ?? LINE_K, band = o.band ?? 0.5, seed = o.seed ?? `fresh:${Date.now()}:${fresh++}:${Math.random()}`;
  const starts = makeRng("dynamic-starts", seed), hr = makeRng("dynamic-heuristics", seed), mv = new Mover(variant);
  const uOf = (l: Line) => { const v = isVertical(l) ? NaN : rule.u(l); return Number.isNaN(v) ? -Infinity : v; };
  const uStar = uOf(s), ok = (l: Line) => uOf(l) >= uStar - 1e-9;
  if (!Number.isFinite(uStar) && uStar < 0) return { energy: 0, u: uStar, K: 0, samples: [] };
  const samples: LineSample[] = [];
  for (let i = 0; i < K; i++) {
    const x = startLike(s, rule.reads, band, starts);
    if (ok(x)) { samples.push({ from: x, direct: 0, floor: 0, heuristic: 0, cost: 0 }); continue; }
    const direct = mv.toTarget(x, s, l => l.a === s.a && l.b === s.b && l.c === s.c);
    const floor = floorRoutes(mv, x, s).reduce((b, [p, l]) => (p < b && ok(l) ? p : b), Infinity);
    let heuristic = Infinity;
    if (o.heuristics !== false) {
      for (const t of rule.propose(x, uStar, hr)) heuristic = Math.min(heuristic, mv.toTarget(x, t, ok));
      for (const [p1, l1] of shortcutsFrom(mv, x)) {
        if (p1 >= Math.min(heuristic, direct, floor)) continue;
        for (const t of rule.propose(l1, uStar, hr)) heuristic = Math.min(heuristic, p1 + mv.toTarget(l1, t, ok));
      }
    }
    samples.push({ from: x, direct, floor, heuristic, cost: Math.min(direct, floor, heuristic) });
  }
  // A start with no route at all (none found, not even the direct one) costs nothing it could be charged: skip it.
  const finite = samples.filter(x => Number.isFinite(x.cost));
  return { energy: finite.length ? finite.reduce((a, b) => a + b.cost, 0) / finite.length : 0, u: uStar, K, samples };
}
