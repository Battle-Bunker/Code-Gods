/**
 * Lenses and mutators on a line: cost topology and collateral damage, for the nine mutators the engine has and nine
 * proposed lens mutators. Measurements behind docs/engine-v2/lenses-and-mutators.md. Analysis only: nothing here
 * changes the engine's mutators, prices or rules.
 *
 *   node --experimental-strip-types scripts/lenses.ts [--H 16] [--sources 30] [--part all|check|topology|turn|collateral|dynamics|balance]
 *     [--tables 60]
 *
 * The model. Every fraction line (line-q) with |a|, |b|, |c| ≤ H (a box; the engine's box is 10^6) is one node. Each
 * mutator's calls are enumerated up to small arguments (an amount's size ≤ 6, a factor's |p|, q ≤ 8, …: the act charge
 * W + 0.05·W² is convex, so a bigger single call is never the cheapest way, except to reach a denominator). A call's
 * price is the engine's W (spec §5.2): which (log2 of the variant's mutators) + choices + the size code
 * (rate(o)·σ, codes.ts) + the confining surcharge max(0, φ(t) − φ(s)), and its charge is W + 0.05·W² (one call per act).
 * The nine existing mutators are re-implemented on plain numbers for speed and checked call by call against the engine
 * (part "check"). Every proposed mutator has an inverse of the same fee, checked on every enumerated edge (the exact
 * potential, owner decision 19).
 */
import { parseArgs } from "node:util";
import { amountCode, applyPriced, evaluateSite, factorCode, gammaBits, nonzeroRatBits, q, ratBits, stepsRatBits } from "@workspace/v2-core";
import { LINE_Q_CODES, lineQ, lineType, mutators as engineMutators, presets, type LineState } from "@workspace/v2-linear";
import { findValues } from "../src/harness.ts";
import { valueLookup } from "@workspace/v2-valuation";

const { values: o } = parseArgs({ options: {
  // parts: check, topology, turn, collateral, dynamics, balance
  H: { type: "string", default: "16" }, tables: { type: "string", default: "60" }, sources: { type: "string", default: "30" }, part: { type: "string", default: "all" },
} });
const H = Number(o.H), NSRC = Number(o.sources);
const want = (p: string) => o.part === "all" || o.part!.split(",").includes(p);
const say = (s = "") => console.log(s);
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2), pct = (x: number) => `${Math.round(100 * x)}%`;

// ---------------------------------------------------------------- numbers and rationals (plain JS numbers; all small)

const gcd = (x: number, y: number): number => { x = Math.abs(x); y = Math.abs(y); while (y) [x, y] = [y, x % y]; return x; };
type R = [number, number];                                  // n/d, d > 0, lowest terms
const r = (n: number, d = 1): R => { if (d === 0) throw new Error("/0"); if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return [n / g, d / g]; };
const add = (x: R, y: R): R => r(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const sub = (x: R, y: R): R => r(x[0] * y[1] - y[0] * x[1], x[1] * y[1]);
const mul = (x: R, y: R): R => r(x[0] * y[0], x[1] * y[1]);
const div = (x: R, y: R): R | null => (y[0] === 0 ? null : r(x[0] * y[1], x[1] * y[0]));
const neg = (x: R): R => [-x[0], x[1]];
const isZ = (x: R) => x[0] === 0;
const sizeOf = (x: R) => (x[0] === 0 ? 0 : Math.abs(x[0]) + x[1] - 1);          // an amount's size (codes.ts)
const Qof = (x: R) => q(BigInt(x[0]), BigInt(x[1]));

// ---------------------------------------------------------------- states: primitive (a, b, c), b > 0 or b = 0 < a, in the box

type L3 = [number, number, number];
function norm(a: number, b: number, c: number): L3 | null {
  if (a === 0 && b === 0) return null;
  const g = gcd(gcd(a, b), c);
  a /= g; b /= g; c /= g;
  if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b; c = -c; }
  return [a + 0, b + 0, c + 0];
}
function fromR(A: R, B: R, C: R): L3 | null {
  const s = A[1] * B[1] * C[1];                               // a common multiple of the denominators; norm divides out
  return norm(A[0] * (s / A[1]), B[0] * (s / B[1]), C[0] * (s / C[1]));
}
const fromMC = (m: R, c: R) => fromR(neg(m), [1, 1], neg(c));
const W2 = 2 * H + 1;
const keyOf = (l: L3) => ((l[0] + H) * W2 + (l[1] + H)) * W2 + (l[2] + H);
const inBox = (l: L3 | null): l is L3 => !!l && Math.abs(l[0]) <= H && Math.abs(l[1]) <= H && Math.abs(l[2]) <= H;

const states: L3[] = [];
const idx = new Int32Array(W2 * W2 * W2).fill(-1);
for (let a = -H; a <= H; a++) for (let b = 0; b <= H; b++) for (let c = -H; c <= H; c++) {
  const n = norm(a, b, c);
  if (!n || n[0] !== a || n[1] !== b || n[2] !== c) continue;
  idx[keyOf(n)] = states.length;
  states.push(n);
}
const NS = states.length;
// line-q's φ: LINE_Q_CODES on (a, b, c), memoised per coordinate.
const MIX = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>()];
const CODES = [LINE_Q_CODES.a, LINE_Q_CODES.b, LINE_Q_CODES.c];
const mixedC = (n: number, d: 0 | 1 | 2) => { let v = MIX[d]!.get(n); if (v === undefined) MIX[d]!.set(n, v = CODES[d]!.bits(BigInt(n))); return v; };
const phi = new Float64Array(NS);
states.forEach((l, i) => { phi[i] = mixedC(l[0], 0) + mixedC(l[1], 1) + mixedC(l[2], 2); });
const slope = (l: L3): R | null => (l[1] === 0 ? null : r(-l[0], l[1]));
const yint = (l: L3): R | null => (l[1] === 0 ? null : r(-l[2], l[1]));

// ---------------------------------------------------------------- argument value lists

/** Nonzero rationals with size (|p| + q − 1) ≤ s, both signs. */
function amounts(s: number, whole = false): R[] {
  const out: R[] = [];
  for (let d = 1; d <= (whole ? 1 : s); d++) for (let p = 1; p + d - 1 <= s; p++) if (gcd(p, d) === 1) out.push([p, d], [-p, d]);
  return out;
}
/** Factors p/q, |p|, q ≤ n, lowest terms, not 0 or ±1. */
function factors(n: number): R[] {
  const out: R[] = [];
  for (let d = 1; d <= n; d++) for (let p = 1; p <= n; p++) if (gcd(p, d) === 1 && !(p === 1 && d === 1)) out.push([p, d], [-p, d]);
  return out;
}
const X0: R[] = [[0, 1], ...[1, 2, 3, 4].flatMap(n => [[n, 1], [-n, 1]] as R[]), [1, 2], [-1, 2], [3, 2], [-3, 2], [1, 3], [-1, 3]];
const X0bits = X0.map(x => stepsRatBits(Qof(x)));
const AMT6 = amounts(6), AMT4 = amounts(4), AMTZ6 = amounts(6, true);
const FAC8 = factors(8), TURN6 = factors(6).concat([[1, 1], [-1, 1]]);
const FOLD6: R[] = [[0, 1], ...TURN6];
const DISP4: [R, R][] = [];
for (const u of [[0, 1] as R, ...AMT4]) for (const v of [[0, 1] as R, ...AMT4]) if (!(isZ(u) && isZ(v)) && sizeOf(u) + sizeOf(v) <= 4) DISP4.push([u, v]);
const PYTH: [number, number][] = [[2, 1], [3, 2], [4, 1], [4, 3], [5, 2], [5, 4]];

// ---------------------------------------------------------------- prices
//
// A call's fee before the surcharge, for a variant with N mutators. o = log2 N + the choices' bits.
type Fee =
  | { k: "amountQ"; ch: number; size: number }
  | { k: "amountZ"; ch: number; size: number }
  | { k: "disp"; ch: number; size: number }
  | { k: "factor"; ch: number; size: number }
  | { k: "flat"; ch: number };                                      // choices and information only (no size)
function fee(f: Fee, N: number, which = Math.log2(N)): number {
  const o = which + f.ch;
  switch (f.k) {
    case "amountQ": return amountCode(o, 1, true).rate * f.size;
    case "amountZ": return amountCode(o, 1, false).rate * f.size;
    case "disp": return amountCode(o, 2, true).rate * f.size;
    case "factor": return factorCode(o).rate * f.size;
    case "flat": return o;
  }
}
const factorSz = (x: R) => Math.log2(Math.abs(x[0]) * x[1]);

// ---------------------------------------------------------------- mutators

type Emit = (to: L3 | null, f: Fee) => void;
interface Mut { id: string; lens: string; existing: boolean; additive: boolean; title: string; gen(l: L3, emit: Emit): void; built?: boolean }
const viaMC = (l: L3, emit: Emit, f: (m: R, c: R) => [R, R] | null, fe: Fee) => {
  const m = slope(l), c = yint(l);
  if (!m || !c) return;
  const mc = f(m, c);
  if (mc) emit(fromMC(mc[0], mc[1]), fe);
};

const EXISTING: Mut[] = [
  { id: "si.shift", lens: "slope-intercept", existing: true, additive: true, title: "move up k", gen: (l, e) => { for (const k of AMT6) viaMC(l, e, (m, c) => [m, add(c, k)], { k: "amountQ", ch: 0, size: sizeOf(k) }); } },
  { id: "si.tilt", lens: "slope-intercept", existing: true, additive: true, title: "gradient + k, keep y-intercept", gen: (l, e) => { for (const k of AMT6) viaMC(l, e, (m, c) => [add(m, k), c], { k: "amountQ", ch: 0, size: sizeOf(k) }); } },
  { id: "seq.step", lens: "sequence", existing: true, additive: true, title: "step + k, keep term 1", gen: (l, e) => { for (const k of AMT6) viaMC(l, e, (m, c) => [add(m, k), sub(c, k)], { k: "amountQ", ch: 0, size: sizeOf(k) }); } },
  { id: "cart.pivot", lens: "plane", existing: true, additive: true, title: "gradient + k about the point at x0", gen: (l, e) => {
    X0.forEach((x0, i) => { for (const k of AMT4) viaMC(l, e, (m, c) => [add(m, k), sub(c, mul(k, x0))], { k: "amountQ", ch: X0bits[i]!, size: sizeOf(k) }); });
  } },
  { id: "cart.slide", lens: "plane", existing: true, additive: true, title: "translate by (u, v)", gen: (l, e) => {
    for (const [u, v] of DISP4) e(fromR([l[0], 1], [l[1], 1], sub(sub([l[2], 1], mul([l[0], 1], u)), mul([l[1], 1], v))), { k: "disp", ch: 0, size: sizeOf(u) + sizeOf(v) });
  } },
  { id: "cart.mirror", lens: "plane", existing: true, additive: false, title: "reflect in x, y, origin, y = x", gen: (l, e) => {
    const [a, b, c] = l;
    for (const t of [[a, -b, c], [-a, b, c], [-a, -b, c], [b, a, c]] as L3[]) e(norm(...t), { k: "flat", ch: 2 });
  } },
  { id: "gen.nudge", lens: "general form", existing: true, additive: true, title: "a, b or c + k (whole)", gen: (l, e) => {
    for (let w = 0; w < 3; w++) for (const [kk] of AMTZ6) {
      const t: L3 = [...l]; t[w] += kk;
      if (gcd(gcd(t[0], t[1]), t[2]) !== 1) continue;
      if (t[1] < 0 || (t[1] === 0 && t[0] < 0)) continue;
      e(norm(...t), { k: "amountZ", ch: Math.log2(3), size: Math.abs(kk) });
    }
  } },
  { id: "int.move", lens: "intercepts", existing: true, additive: true, title: "move one intercept by k", gen: (l, e) => {
    const [a, b, c] = l;
    if (a === 0 || b === 0 || c === 0) return;
    for (const ax of [0, 1]) for (const k of AMT6) {
      let p = r(-c, a), qq = r(-c, b);
      if (ax === 0) p = add(p, k); else qq = add(qq, k);
      if (isZ(p) || isZ(qq)) continue;
      e(fromR(div([1, 1], p)!, div([1, 1], qq)!, [-1, 1]), { k: "amountQ", ch: 1, size: sizeOf(k) });
    }
  } },
  { id: "mach.stretch", lens: "machine", existing: true, additive: false, title: "multiply every output by f", gen: (l, e) => {
    for (const f of FAC8) viaMC(l, e, (m, c) => [mul(m, f), mul(c, f)], { k: "factor", ch: 0, size: factorSz(f) });
  } },
];

/** The continued fraction of a positive rational. */
function cf(x: R): number[] { const out: number[] = []; let [n, d] = x; while (d) { out.push(Math.floor(n / d)); [n, d] = [d, n % d]; } return out; }
function fromCf(a: number[]): R { let x: R = [a[a.length - 1]!, 1]; for (let i = a.length - 2; i >= 0; i--) x = add([a[i]!, 1], div([1, 1], x)!); return x; }
/** Stern–Brocot moves of a positive rational: [up, down-1, down-2] (null where not defined). */
function sb(x: R): (R | null)[] {
  const a = cf(x), n = a.length - 1;
  const d1 = a.slice(); d1[n]! += 1;
  const d2 = a.slice(); d2[n]! -= 1; d2.push(2);
  let up: R | null = null;
  if (n === 0) up = a[0]! >= 2 ? [a[0]! - 1, 1] : null;
  else { const u = a.slice(); u[n]! -= 1; if (u[n] === 1 && n >= 1) { u.pop(); u[n - 1]! += 1; } up = fromCf(u); }
  return [up, fromCf(d1), fromCf(d2)];
}
/** The line through (x0, y0) with gradient m (or null when m is vertical, given as null). */
const through = (x0: R, y0: R, m: R | null) => (m ? fromMC(m, sub(y0, mul(m, x0))) : null);
/** Reflect point p in the line a'x + b'y + c' = 0. */
function reflectPt(p: [R, R], M: L3): [R, R] {
  const [A, B, C] = M, n2 = A * A + B * B;
  const s = div(add(add(mul([A, 1], p[0]), mul([B, 1], p[1])), [C, 1]), [n2, 1])!;
  return [sub(p[0], mul([2 * A, 1], s)), sub(p[1], mul([2 * B, 1], s))];
}
function lineThrough(p: [R, R], q2: [R, R]): L3 | null {
  const dx = sub(q2[0], p[0]), dy = sub(q2[1], p[1]);
  if (isZ(dx) && isZ(dy)) return null;
  return fromR(dy, neg(dx), sub(mul(dx, p[1]), mul(dy, p[0])));
}
const AUX: { M: L3; bits: number }[] = [];
const AUX_BITS = 16;
for (const M of states) { const b = mixedC(M[0], 0) + mixedC(M[1], 1) + mixedC(M[2], 2); if (b <= AUX_BITS) AUX.push({ M, bits: b }); }

const PROPOSED: Mut[] = [
  { id: "rot.turn", lens: "angle (rotation about a point on the line)", existing: false, additive: false, title: "turn about the line's point at x0 by tan θ = t, or a quarter turn", gen: (l, e) => {
    const m = slope(l), c = yint(l);
    if (!m || !c) return;
    X0.forEach((x0, i) => {
      const y0 = add(mul(m, x0), c);
      e(through(x0, y0, div([-1, 1], m)), { k: "flat", ch: X0bits[i]! + 1 });          // quarter turn
      for (const t of TURN6) {
        const den = sub([1, 1], mul(m, t));
        e(through(x0, y0, div(add(m, t), den)), { k: "flat", ch: X0bits[i]! + 1 + nonzeroRatBits(Qof(t)) });
      }
    });
  } },
  { id: "rot.fold", lens: "fold (reflection in a line through a point on the line)", existing: false, additive: false, title: "fold about the line through its point at x0 with gradient s", gen: (l, e) => {
    const m = slope(l), c = yint(l);
    if (!m || !c) return;
    X0.forEach((x0, i) => {
      const y0 = add(mul(m, x0), c);
      for (const s of FOLD6) {
        const d = sub([1, 1], mul(s, s));
        const T = div(mul([2, 1], s), d);
        const m2 = T === null ? div([1, 1], m) : div(sub(T, m), add([1, 1], mul(m, T)));
        e(through(x0, y0, m2), { k: "flat", ch: X0bits[i]! + ratBits(Qof(s)) });
      }
    });
  } },
  { id: "mirror.any", lens: "reflection in an auxiliary line", existing: false, additive: false, title: "reflect in any line M, paying for M from scratch", gen: (l, e) => {
    const [a, b, c] = l;
    const p1: [R, R] = b !== 0 ? [[0, 1], r(-c, b)] : [r(-c, a), [0, 1]];
    const p2: [R, R] = b !== 0 ? [[1, 1], r(-c - a, b)] : [r(-c, a), [1, 1]];
    for (const { M, bits } of AUX) e(lineThrough(reflectPt(p1, M), reflectPt(p2, M)), { k: "flat", ch: bits });
  } },
  { id: "basis.lean", lens: "slanted grid (shear x → x + s·y)", existing: false, additive: true, title: "add s to the run per unit rise, keeping the x-intercept", gen: (l, e) => {
    const [a, b, c] = l;
    if (a === 0) return;
    for (const s of AMT6) e(fromR([a, 1], add([b, 1], mul([a, 1], s)), [c, 1]), { k: "amountQ", ch: 0, size: sizeOf(s) });
  } },
  { id: "basis.zoom", lens: "zoom about the origin (homothety)", existing: false, additive: false, title: "scale the plane about the origin by f: both intercepts × f", gen: (l, e) => {
    const [a, b, c] = l;
    if (c === 0) return;
    for (const f of FAC8) e(norm(a * f[1], b * f[1], c * f[0]), { k: "factor", ch: 0, size: factorSz(f) });
  } },
  { id: "pole.slide", lens: "dual point (the pole in the unit circle)", existing: false, additive: true, title: "slide the line's pole by (u, v)", gen: (l, e) => {
    const [a, b, c] = l;
    if (c === 0) return;
    for (const [u, v] of DISP4) e(fromR(sub([a, 1], mul(u, [c, 1])), sub([b, 1], mul(v, [c, 1])), [c, 1]), { k: "disp", ch: 0, size: sizeOf(u) + sizeOf(v) });
  } },
  { id: "sb.step", lens: "Stern–Brocot tree of the gradient", existing: false, additive: false, title: "move the gradient up or down its Stern–Brocot tree, keeping the y-intercept", gen: (l, e) => {
    const m = slope(l), c = yint(l);
    if (!m || !c || isZ(m)) return;
    const sgn = Math.sign(m[0]);
    for (const x of sb([Math.abs(m[0]), m[1]])) if (x) e(fromMC([sgn * x[0], x[1]], c), { k: "flat", ch: Math.log2(3) });
  } },
  { id: "coef.swap", lens: "the reciprocal chart (permute a, b, c)", existing: false, additive: false, title: "swap a and c (swap the gradient and the y-intercept) or b and c", gen: (l, e) => {
    const [a, b, c] = l;
    e(norm(c, b, a), { k: "flat", ch: 1 });
    e(norm(a, c, b), { k: "flat", ch: 1 });
  } },
  { id: "orbit.turn", lens: "normal form (rotation about the origin)", existing: false, additive: false, title: "turn the line about the origin by a Pythagorean angle or a quarter turn", gen: (l, e) => {
    const [a, b, c] = l;
    for (const s of [1, -1]) {
      e(norm(-b * s, a * s, c), { k: "flat", ch: 2 });                         // quarter turn (1 bit kind + 1 bit sign)
      for (const [u, v] of PYTH) {
        const cs = u * u - v * v, sn = 2 * u * v * s, rr = u * u + v * v;
        e(norm(a * cs - b * sn, a * sn + b * cs, c * rr), { k: "flat", ch: 2 + gammaBits(BigInt(u)) + gammaBits(BigInt(v)) });
      }
    }
  } },
];
/**
 * The five as built in the engine (lib/v2-linear mutators.ts, variant line-q-lenses), at the engine's prices: a turn
 * pays 1 bit for its centre's kind (origin or a pin) and an origin turn is any Pythagorean tangent; the fold pays 1 bit
 * for its kind (a crease through a pin or a mirror line). lib/v2-linear/test/lens-mutators.test.ts checks these
 * formulas and prices against the engine call by call.
 */
const PYTH_T: R[] = [];
for (const [u, v] of [[2, 1], [3, 2], [4, 1], [4, 3], [5, 2], [5, 4]] as [number, number][]) {
  const a = u * u - v * v, b = 2 * u * v;
  for (const t of [r(b, a), r(a, b)]) for (const sg of [1, -1]) { const x: R = [sg * t[0], t[1]]; if (!PYTH_T.some(y => y[0] === x[0] && y[1] === x[1])) PYTH_T.push(x); }
}
const BUILT: Mut[] = [
  { id: "rot.turn", lens: "angle", existing: false, additive: false, built: true, title: "turn about a pin or the origin", gen: (l, e) => {
    const [a, b, c] = l;
    e(norm(-b, a, c), { k: "flat", ch: 1 + 2 }); e(norm(b, -a, c), { k: "flat", ch: 1 + 2 });   // quarter turns about the origin
    for (const t of PYTH_T) {
      const rr = Math.round(Math.hypot(t[0], t[1]));
      e(norm(a * t[1] - b * t[0], a * t[0] + b * t[1], c * rr), { k: "flat", ch: 1 + 1 + nonzeroRatBits(Qof(t)) });
    }
    const m = slope(l), cc = yint(l);
    if (!m || !cc) return;
    X0.forEach((x0, i) => {
      const y0 = add(mul(m, x0), cc);
      e(through(x0, y0, div([-1, 1], m)), { k: "flat", ch: 1 + X0bits[i]! + 2 });
      for (const t of TURN6) e(through(x0, y0, div(add(m, t), sub([1, 1], mul(m, t)))), { k: "flat", ch: 1 + X0bits[i]! + 1 + nonzeroRatBits(Qof(t)) });
    });
  } },
  { ...PROPOSED.find(m => m.id === "coef.swap")!, built: true },
  { ...PROPOSED.find(m => m.id === "basis.lean")!, built: true },
  { ...PROPOSED.find(m => m.id === "basis.zoom")!, built: true },
  { id: "fold", lens: "reflection", existing: false, additive: false, built: true, title: "fold in a crease through a pin, or in any mirror paid in full", gen: (l, e) => {
    for (const { M, bits } of AUX) {
      const [a, b, c] = l;
      const p1: [R, R] = b !== 0 ? [[0, 1], r(-c, b)] : [r(-c, a), [0, 1]];
      const p2: [R, R] = b !== 0 ? [[1, 1], r(-c - a, b)] : [r(-c, a), [1, 1]];
      e(lineThrough(reflectPt(p1, M), reflectPt(p2, M)), { k: "flat", ch: 1 + bits });
    }
    const m = slope(l), cc = yint(l);
    if (!m || !cc) return;
    X0.forEach((x0, i) => {
      const y0 = add(mul(m, x0), cc);
      for (const sv of FOLD6) {
        const d = sub([1, 1], mul(sv, sv)), T = div(mul([2, 1], sv), d);
        const m2 = T === null ? div([1, 1], m) : div(sub(T, m), add([1, 1], mul(m, T)));
        e(through(x0, y0, m2), { k: "flat", ch: 1 + X0bits[i]! + ratBits(Qof(sv)) });
      }
    });
  } },
];
const ALL = [...EXISTING, ...PROPOSED, ...BUILT];

say(`# Lenses and mutators: script output (scripts/lenses.ts --H ${H} --sources ${NSRC})`);
say(`\nAnalysis for docs/engine-v2/lenses-and-mutators.md. Nothing here changes the engine.\n`);

// ---------------------------------------------------------------- part 0: the fast model against the engine

if (want("check")) {
  say(`## Check: the fast model against the engine (line-q, box H = ${H}, ${NS} lines)`);
  let n = 0, bad = 0, cheaper = 0;
  const toState = (l: L3): LineState => ({ lines: [{ a: BigInt(l[0]), b: BigInt(l[1]), c: BigInt(l[2]) }] });
  // Re-derive each existing call's engine arguments by brute matching: for each fast edge, find an engine call with the
  // same result and the same price among the engine's enumerated arguments up to the fast fee.
  for (let t = 0; t < 60; t++) {
    const s = states[(t * 7919) % NS]!;
    for (const M of EXISTING) {
      const em = engineMutators.find(x => x.id === M.id)!;
      const fast = new Map<string, number>();
      M.gen(s, (to, f) => { if (inBox(to) && to.join() !== s.join()) { const k = to.join(); const w = fee(f, 9); if (!(fast.get(k)! <= w)) fast.set(k, w); } });
      const eng = new Map<string, number>();
      const maxB = Math.max(0, ...fast.values()) - Math.log2(9) + 1e-6;
      for (const args of em.args(lineQ).enumerate!(maxB)) {
        const res = applyPriced(lineType, lineQ, toState(s), em, 0, args);
        if ("invalid" in res) continue;
        const L = res.result.lines[0]!;
        const k = [L.a, L.b, L.c].map(Number).join();
        const w = res.price.which + res.price.arg;
        if (!(eng.get(k)! <= w)) eng.set(k, w);
      }
      for (const [k, w] of fast) {
        n++;
        const ew = eng.get(k);
        if (ew !== undefined && ew < w - 1e-6) { cheaper++; continue; }       // the engine has arguments past the enumeration's limits
        if (ew === undefined || Math.abs(ew - w) > 1e-6) { bad++; if (bad <= 5) say(`  mismatch ${M.id} ${s.join()} → ${k}: fast ${f2(w)}, engine ${ew === undefined ? "none" : f2(ew)}`); }
      }
    }
  }
  say(`- ${n} (line, mutator, result) cheapest fees compared with the engine's own enumeration of arguments: ${bad} differ; ${cheaper} are cheaper in the engine through arguments past this model's limits (a pivot about a farther x0).`);
}

// ---------------------------------------------------------------- the graph

const NSETS = [9, 10, 18, 14] as const;
interface Edges { to: Int32Array; mut: Int8Array; fee: Float32Array[]; start: Int32Array }
function build(): Edges {
  const to: number[] = [], mut: number[] = [], fees: number[][] = NSETS.map(() => []), start = new Int32Array(NS + 1);
  for (let i = 0; i < NS; i++) {
    start[i] = to.length;
    const s = states[i]!;
    ALL.forEach((M, mi) => {
      const best = new Map<number, number[]>();
      M.gen(s, (t, f) => {
        if (!inBox(t)) return;
        const j = idx[keyOf(t)]!;
        if (j < 0 || j === i) return;
        // N = 14 is line-q-lenses with its weighted which code: the nine at log2 12, the five at log2 20.
        const ws = NSETS.map(N => fee(f, N, N === 14 ? Math.log2(M.built ? 20 : 12) : Math.log2(N)));
        const cur = best.get(j);
        if (!cur) best.set(j, ws); else for (let z = 0; z < ws.length; z++) cur[z] = Math.min(cur[z]!, ws[z]!);
      });
      for (const [j, ws] of best) { to.push(j); mut.push(mi); ws.forEach((w, z) => fees[z]!.push(w)); }
    });
  }
  start[NS] = to.length;
  return { to: Int32Array.from(to), mut: Int8Array.from(mut), fee: fees.map(f => Float32Array.from(f)), start };
}
const t0 = performance.now();
const G = build();
say(`\n_Graph: ${NS} lines, ${G.to.length.toLocaleString("en")} cheapest (line, mutator, result) edges, built in ${f1((performance.now() - t0) / 1000)} s._`);

// The exact potential: every edge s → t of a mutator has a reverse edge t → s of the same mutator and fee.
if (want("check")) {
  let miss = 0, n = 0;
  const per = new Map<string, number>();
  for (let i = 0; i < NS; i++) for (let e = G.start[i]!; e < G.start[i + 1]!; e++) {
    n++;
    const j = G.to[e]!, mi = G.mut[e]!;
    let ok = false;
    for (let e2 = G.start[j]!; e2 < G.start[j + 1]!; e2++) if (G.to[e2] === i && G.mut[e2] === mi && Math.abs(G.fee[2]![e2]! - G.fee[2]![e]!) < 1e-4) { ok = true; break; }
    if (!ok) { miss++; per.set(ALL[mi]!.id, (per.get(ALL[mi]!.id) ?? 0) + 1); }
  }
  say(`- Inverse check: ${n.toLocaleString("en")} edges, ${miss} without a same-fee reverse edge${miss ? ` (${[...per].map(([k, v]) => `${k} ${v}`).join(", ")}; enumeration limits, not the rule: see the doc)` : ""}.`);
}

// ---------------------------------------------------------------- Dijkstra on the act charge

const BETA = 0.05;
const charge = (w: number) => w + BETA * w * w;
interface MutSet { id: string; muts: Set<number>; Nz: number }
const PRED = new Int32Array(NS), PMUT = new Int8Array(NS);
function dijkstra(src: number, set: MutSet, pred = false): Float64Array {
  const dist = new Float64Array(NS).fill(Infinity);
  dist[src] = 0;
  // binary heap of (dist, node)
  const hd: number[] = [], hn: number[] = [];
  const push = (d: number, n: number) => { let i = hd.length; hd.push(d); hn.push(n); while (i > 0) { const p = (i - 1) >> 1; if (hd[p]! <= d) break; hd[i] = hd[p]!; hn[i] = hn[p]!; i = p; } hd[i] = d; hn[i] = n; };
  const pop = (): [number, number] => {
    const d = hd[0]!, n = hn[0]!, ld = hd.pop()!, ln = hn.pop()!;
    if (hd.length) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hd.length) break; if (c + 1 < hd.length && hd[c + 1]! < hd[c]!) c++; if (hd[c]! >= ld) break; hd[i] = hd[c]!; hn[i] = hn[c]!; i = c; } hd[i] = ld; hn[i] = ln; }
    return [d, n];
  };
  push(0, src);
  const F = G.fee[set.Nz]!;
  while (hd.length) {
    const [d, i] = pop();
    if (d > dist[i]!) continue;
    for (let e = G.start[i]!; e < G.start[i + 1]!; e++) {
      if (!set.muts.has(G.mut[e]!)) continue;
      const j = G.to[e]!;
      const nd = d + charge(F[e]! + Math.max(0, phi[j]! - phi[i]!));
      if (nd < dist[j]!) { dist[j] = nd; push(nd, j); if (pred) { PRED[j] = i; PMUT[j] = G.mut[e]!; } }
    }
  }
  return dist;
}

const ids = (p: (m: Mut) => boolean) => new Set(ALL.map((m, i) => [m, i] as const).filter(([m]) => p(m)).map(([, i]) => i));
const SETS: MutSet[] = [
  { id: "additive only (the unit-path baseline)", muts: ids(m => m.existing && m.additive), Nz: 0 },
  { id: "existing nine", muts: ids(m => m.existing), Nz: 0 },
  ...PROPOSED.map(p => ({ id: `nine + ${p.id}`, muts: ids(m => m.existing || m === p), Nz: 1 })),
  { id: "all eighteen", muts: ids(m => !m.built), Nz: 2 },
  { id: "the nine + the five as built (line-q-lenses, weighted which)", muts: ids(m => m.existing || !!m.built), Nz: 3 },
];

// π on the box: 2^−φ, normalised.
const piW = Array.from(phi, x => 2 ** -x);
const piZ = piW.reduce((a, b) => a + b, 0);
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
function drawPi(): number { let u = rand() * piZ; for (let i = 0; i < NS; i++) { u -= piW[i]!; if (u <= 0) return i; } return NS - 1; }
const sources: number[] = [];
while (sources.length < NSRC) { const s = drawPi(); if (!sources.includes(s)) sources.push(s); }
// Targets: half from π (a typical newborn line), half uniform on lines with φ between 18 and 30 bits (somewhere a rule
// might want to go: away from the centre, but inside the box).
const mid = states.map((_, i) => i).filter(i => phi[i]! >= 18 && phi[i]! <= 30);
const targets: number[] = [];
while (targets.length < 40) { const t = targets.length % 2 ? mid[Math.floor(rand() * mid.length)]! : drawPi(); if (!targets.includes(t)) targets.push(t); }

const fr = (x: R) => (x[1] === 1 ? `${x[0]}` : `${x[0]}/${x[1]}`).replace("-", "−");
function show(l: L3): string {
  const m = slope(l), c = yint(l);
  if (!m || !c) return `x = ${fr(r(-l[2], l[0]))}`;
  const mt = isZ(m) ? "" : m[0] === 1 && m[1] === 1 ? "x" : m[0] === -1 && m[1] === 1 ? "−x" : `${fr(m)}x`;
  if (!mt) return `y = ${fr(c)}`;
  return isZ(c) ? `y = ${mt}` : `y = ${mt} ${c[0] < 0 ? "−" : "+"} ${fr([Math.abs(c[0]), c[1]])}`;
}

// ---------------------------------------------------------------- part 1: cost topology

let dists: Float64Array[][] = [];
if (want("topology") || want("collateral")) {
  const t1 = performance.now();
  dists = SETS.map(set => sources.map(s => dijkstra(s, set)));
  say(`_Dijkstra from ${NSRC} sources × ${SETS.length} mutator sets: ${f1((performance.now() - t1) / 1000)} s._`);
}
if (want("topology")) {
  say(`\n## 1. Cost topology (line-q, box |a|, |b|, |c| ≤ ${H}; charge = W + 0.05·W², one call per act)`);
  say(`\nRoute cost between ${NSRC} newborn lines (drawn from π) and ${targets.length} targets (half from π, half lines of 18–30 bits).`);
  say(`"Gain" is the baseline's cheapest route cost over this set's cheapest route cost, per pair.\n`);
  const base = dists[0]!, nine = dists[1]!;
  say(`| Mutator set | Median route energy | Gain over additive-only: median | p90 | Share ≥ 1.5× | Gain over the nine: median | p90 | Share ≥ 1.25× | Lines within 30 energy | 60 energy | 120 energy |`);
  say(`|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`);
  const qtl = (xs: number[], p: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };
  SETS.forEach((set, si) => {
    const g0: number[] = [], g9: number[] = [], cost: number[] = [];
    sources.forEach((s, k) => targets.forEach(t => {
      if (t === s) return;
      const d = dists[si]![k]![t]!;
      if (!isFinite(d) || d === 0) return;
      cost.push(d); g0.push(base[k]![t]! / d); g9.push(nine[k]![t]! / d);
    }));
    const within = (B: number) => Math.round(sources.reduce((a, _, k) => a + dists[si]![k]!.filter(x => x <= B).length, 0) / NSRC);
    say(`| ${set.id} | ${Math.round(qtl(cost, 0.5))} | ${f2(qtl(g0, 0.5))} | ${f2(qtl(g0, 0.9))} | ${pct(g0.filter(x => x >= 1.5).length / g0.length)} | ${f2(qtl(g9, 0.5))} | ${f2(qtl(g9, 0.9))} | ${pct(g9.filter(x => x >= 1.25).length / g9.length)} | ${within(30)} | ${within(60)} | ${within(120)} |`);
  });

  // Which mutators the cheapest routes actually use (all eighteen), by count of acts on the reconstructed routes.
  say(`\nActs on the cheapest routes with all eighteen offered (share of acts, over every source–target pair):\n`);
  const all = SETS.length - 2, use = new Map<string, number>();
  let acts = 0;
  sources.forEach(s => {
    const dist = dijkstra(s, SETS[all]!, true);
    for (const t of targets) {
      if (t === s || !isFinite(dist[t]!)) continue;
      for (let cur = t, guard = 0; cur !== s && guard < 500; guard++) { const id = ALL[PMUT[cur]!]!.id; use.set(id, (use.get(id) ?? 0) + 1); acts++; cur = PRED[cur]!; }
    }
  });
  say(`| Mutator | Share of acts |`);
  say(`|---|--:|`);
  for (const [k, v] of [...use].sort((x, y) => y[1] - x[1])) say(`| ${k} | ${pct(v / acts)} |`);

  // Examples: the largest single-pair gains of the eighteen over the nine.
  say(`\nLargest shortcuts (all eighteen against the nine):\n`);
  const ex: { s: number; t: number; g: number; a: number; b: number }[] = [];
  sources.forEach((s, k) => targets.forEach(t => { if (t !== s) ex.push({ s, t, g: dists[1]![k]![t]! / dists[all]![k]![t]!, a: dists[1]![k]![t]!, b: dists[all]![k]![t]! }); }));
  ex.sort((x, y) => y.g - x.g);
  say(`| From | To | The nine energy | All eighteen energy | Gain |`);
  say(`|---|---|--:|--:|--:|`);
  for (const e of ex.slice(0, 6)) say(`| ${show(states[e.s]!)} | ${show(states[e.t]!)} | ${Math.round(e.a)} | ${Math.round(e.b)} | ${f2(e.g)} |`);
}

// ---------------------------------------------------------------- part 2: collateral damage

if (want("collateral")) {
  const pool = presets.find(p => p.id === "lines-beginner")!.rules;
  const rules = pool.map(pr => ({ family: pr.family, params: pr.params as Record<string, unknown>, tieBreaker: (pr.tieBreakers as string[])[0]! }))
    .filter(rl => findValues("line-q", rl));
  const tb = performance.now();
  const bits = rules.map(rl => {
    const fam = lineType.families.find(f => f.id === rl.family)!;
    const look = valueLookup(findValues("line-q", rl)!);
    return Float64Array.from(states, l => look(evaluateSite(lineType, fam, rl.params, { lines: [{ a: BigInt(l[0]), b: BigInt(l[1]), c: BigInt(l[2]) }] }, lineQ, 0, rl.tieBreaker).score).bits);
  });
  const RN = rules.length;
  say(`\n## 2. Collateral damage (line-q, box H = ${H}; ${RN} beginner rules, each with its first tie-breaker; values from the committed value functions; ${f1((performance.now() - tb) / 1000)} s)`);
  say(`\nFor every line s and every call of a mutator from s with W ≤ 30 bits (a local move) that raises some rule i's bits,`);
  say(`each other rule j that held at least 2 bits at s: the share of those calls that destroy at least half of j's bits.`);
  say(`Rows: mutators. Columns: the rule that suffers (j). "Keeps" is the share that leave j's bits unchanged or higher.\n`);
  const short = (rl: { family: string }) => rl.family.split("-").map(w => w[0]!.toUpperCase()).join("");
  say(`| Mutator | ${rules.map(short).join(" | ")} | Mean destroy | Mean keeps | Improving calls |`);
  say(`|---|${rules.map(() => "--:").join("|")}|--:|--:|--:|`);
  const WMAX = 30;
  const summary: { id: string; destroy: number; keep: number }[] = [];
  ALL.forEach((M, mi) => {
    const dn = new Float64Array(RN), dd = new Float64Array(RN), kp = new Float64Array(RN);
    let calls = 0;
    for (let i = 0; i < NS; i++) for (let e = G.start[i]!; e < G.start[i + 1]!; e++) {
      if (G.mut[e] !== mi) continue;
      const j = G.to[e]!;
      if (G.fee[2]![e]! + Math.max(0, phi[j]! - phi[i]!) > WMAX) continue;
      let imp = 0;
      for (let z = 0; z < RN; z++) if (bits[z]![j]! > bits[z]![i]! + 0.05) imp |= 1 << z;
      if (!imp) continue;
      calls++;
      for (let z = 0; z < RN; z++) {
        if (bits[z]![i]! < 2 || (imp & ~(1 << z)) === 0) continue;
        dn[z]!++;
        if (bits[z]![j]! < 0.5 * bits[z]![i]!) dd[z]!++;
        if (bits[z]![j]! >= bits[z]![i]! - 1e-9) kp[z]!++;
      }
    }
    const cols = rules.map((_, z) => (dn[z]! ? pct(dd[z]! / dn[z]!) : "–"));
    const tot = dn.reduce((a, b) => a + b, 0);
    const destroy = dd.reduce((a, b) => a + b, 0) / tot, keep = kp.reduce((a, b) => a + b, 0) / tot;
    summary.push({ id: M.id, destroy, keep });
    say(`| ${M.id}${M.built ? " (as built)" : ""} | ${cols.join(" | ")} | ${pct(destroy)} | ${pct(keep)} | ${calls.toLocaleString("en")} |`);
  });
  say(`\nColumns: ${rules.map(rl => `${short(rl)} = ${rl.family}/${rl.tieBreaker}`).join("; ")}.`);

  // Aspect invariance: which numbers each mutator leaves alone (all local calls, improving or not).
  const aspects: [string, (l: L3) => string][] = [
    ["gradient", l => (l[1] ? r(-l[0], l[1]).join("/") : "v")],
    ["y-intercept", l => (l[1] ? r(-l[2], l[1]).join("/") : "none")],
    ["x-intercept", l => (l[0] ? r(-l[2], l[0]).join("/") : "none")],
    ["y(1)", l => (l[1] ? r(-l[0] - l[2], l[1]).join("/") : "none")],
    ["distance² to O", l => r(l[2] * l[2], l[0] * l[0] + l[1] * l[1]).join("/")],
    ["pole", l => (l[2] ? `${r(-l[0], l[2]).join("/")},${r(-l[1], l[2]).join("/")}` : "inf")],
    ["a + b + c", l => `${l[0] + l[1] + l[2]}`],
    ["triangle area", l => (l[0] && l[1] ? r(l[2] * l[2], 2 * Math.abs(l[0] * l[1])).join("/") : "none")],
  ];
  say(`\n### 2.1 What each mutator leaves alone (share of local calls, W ≤ ${WMAX}, that keep the number unchanged)\n`);
  say(`| Mutator | ${aspects.map(a => a[0]).join(" | ")} |`);
  say(`|---|${aspects.map(() => "--:").join("|")}|`);
  ALL.forEach((M, mi) => {
    const keep = new Float64Array(aspects.length); let n = 0;
    for (let i = 0; i < NS; i++) {
      const A = aspects.map(a => a[1](states[i]!));
      for (let e = G.start[i]!; e < G.start[i + 1]!; e++) {
        if (G.mut[e] !== mi) continue;
        const j = G.to[e]!;
        if (G.fee[2]![e]! + Math.max(0, phi[j]! - phi[i]!) > WMAX) continue;
        n++;
        aspects.forEach((a, z) => { if (a[1](states[j]!) === A[z]) keep[z]!++; });
      }
    }
    say(`| ${M.id}${M.built ? " (as built)" : ""} | ${aspects.map((_, z) => (n ? pct(keep[z]! / n) : "–")).join(" | ")} |`);
  });

  // Peaks within reach: the best table total (three rules, Σ n_i Σ_{j≠i} n_j) on lines reachable within a budget.
  say(`\n### 2.2 The best three-rule table state within a budget, per mutator set`);
  const pick = ["prime-landing", "treasure", "whole-crossing"].map(f => rules.findIndex(rl => rl.family === f)).filter(z => z >= 0);
  say(`\nRules: ${pick.map(z => `${rules[z]!.family}/${rules[z]!.tieBreaker}`).join(", ")}. Mean over the ${NSRC} sources of the best table total`);
  say(`reachable within the budget, and the mean number of lines a searcher must score to know it (the reachable set).\n`);
  const F = Float64Array.from(states, (_, i) => { const n = pick.map(z => bits[z]![i]!); return n.reduce((a, x, k) => a + x * n.reduce((b, y, l) => b + (l === k ? 0 : y), 0), 0); });
  say(`| Mutator set | Best within 30 energy | lines | 60 energy | lines | 120 energy | lines | Box optimum |`);
  say(`|---|--:|--:|--:|--:|--:|--:|--:|`);
  const boxBest = Math.max(...F);
  SETS.forEach((set, si) => {
    const cell = (B: number) => {
      let best = 0, cnt = 0;
      sources.forEach((_, k) => { let b = 0; dists[si]![k]!.forEach((d, i) => { if (d <= B) { cnt++; if (F[i]! > b) b = F[i]!; } }); best += b; });
      return `${f1(best / NSRC)} | ${Math.round(cnt / NSRC)}`;
    };
    say(`| ${set.id} | ${cell(30)} | ${cell(60)} | ${cell(120)} | ${f1(boxBest)} |`);
  });
  const arg = F.indexOf(boxBest);
  say(`\nThe box optimum is ${show(states[arg]!)} (${pick.map(z => f1(bits[z]![arg]!)).join(", ")} bits).`);
}

// ---------------------------------------------------------------- part 3: the owner's example (keep a point, change the gradient)

if (want("turn")) {
  say(`\n## 3. Keep a point, change the gradient: a turn against a pivot (the owner's example)`);
  say(`\nA line from π (non-vertical), a point on it at x0 (from the pivot's list), and a wanted gradient m′ (the gradient of`);
  say(`another line from π, ≠ m). Both moves end on the same line (through the point, gradient m′), so the surcharge is the`);
  say(`same; compared: the fee of one pivot act (m += m′ − m), a pivot path (the whole part of m′ − m in unit acts, the`);
  say(`fraction in one act) and one turn (tan θ = (m′ − m)/(1 + m·m′), or a quarter turn), with`);
  say(`eighteen mutators offered. Charge = W + 0.05·W² per act, surcharge left out.\n`);
  const N = 18, o0 = Math.log2(N);
  let turnWins = 0, turnWinsPath = 0, n = 0;
  const ratios: number[] = [], ex: string[] = [];
  for (let k = 0; k < 4000; k++) {
    const l = states[drawPi()]!, l2 = states[drawPi()]!;
    if (!l[1] || !l2[1]) continue;
    const m = slope(l)!, m2 = slope(l2)!;
    if (m[0] * m2[1] === m2[0] * m[1]) continue;
    const xi = Math.floor(rand() * X0.length), xb = X0bits[xi]!;
    const d = sub(m2, m), sz = sizeOf(d);
    const pivotOne = charge(amountCode(o0 + xb, 1, true).rate * sz);
    const unit = charge(amountCode(o0 + xb, 1, true).rate * 1);
    // The pivot's path: the whole part of m′ − m in unit acts, the fractional part in one act (an upper bound on the best split).
    const ip = Math.floor(Math.abs(d[0]) / d[1]), fp: R = [Math.abs(d[0]) - ip * d[1], d[1]];
    const pivotPath = ip * unit + (fp[0] ? charge(amountCode(o0 + xb, 1, true).rate * sizeOf(fp)) : 0);
    const den = add([1, 1], mul(m, m2));
    const turnW = isZ(den) ? o0 + xb + 1 : o0 + xb + 1 + nonzeroRatBits(Qof(div(d, den)!));
    const turn = charge(turnW);
    n++;
    if (turn < pivotOne) turnWins++;
    if (turn < Math.min(pivotOne, pivotPath)) turnWinsPath++;
    ratios.push(Math.min(pivotOne, pivotPath) / turn);
    if (ex.length < 4 && Math.min(pivotOne, pivotPath) / turn > 3) ex.push(`${show(l)} → gradient ${fr(m2)} about x = ${fr(X0[xi]!)}: pivot ${Math.round(Math.min(pivotOne, pivotPath))} energy, turn ${Math.round(turn)} energy`);
  }
  ratios.sort((a, b) => a - b);
  say(`- ${n} cases. One turn is cheaper than one pivot act in ${pct(turnWins / n)} of them, and cheaper than the pivot path`);
  say(`  in ${pct(turnWinsPath / n)}. Pivot cost over turn cost: median ${f2(ratios[n >> 1]!)}, p10 ${f2(ratios[Math.floor(n * 0.1)]!)}, p90 ${f2(ratios[Math.floor(n * 0.9)]!)}.`);
  for (const e of ex) say(`- ${e}`);
}

// ---------------------------------------------------------------- part 4: dynamics of selfish climbers on one line

if (want("dynamics")) {
  const pool = presets.find(p => p.id === "lines-beginner")!.rules;
  const fams = ["prime-landing", "treasure", "whole-crossing"];
  const rules = fams.map(f => { const pr = pool.find(x => x.family === f)!; return { family: f, params: pr.params as Record<string, unknown>, tieBreaker: (pr.tieBreakers as string[])[0]! }; });
  const bits = rules.map(rl => {
    const fam = lineType.families.find(f => f.id === rl.family)!;
    const look = valueLookup(findValues("line-q", rl)!);
    return Float64Array.from(states, l => look(evaluateSite(lineType, fam, rl.params, { lines: [{ a: BigInt(l[0]), b: BigInt(l[1]), c: BigInt(l[2]) }] }, lineQ, 0, rl.tieBreaker).score).bits);
  });
  say(`\n## 4. Dynamics: three selfish climbers sharing one line`);
  say(`\nRules: ${rules.map(rl => `${rl.family}/${rl.tieBreaker}`).join(", ")}. From each of ${NSRC} newborn lines, the three take turns;`);
  say(`each takes the offered call that raises its own bits most per energy (charge W + 0.05·W², W ≤ 40), or passes when none`);
  say(`does. 300 turns. A fixed point is three passes in a row. "Lines" is the number of distinct lines the object visited;`);
  say(`"revisits" the share of moves onto a line it had held before (a tug of war).\n`);
  say(`| Mutator set | Runs that reach a fixed point | Mean turns to it | Mean distinct lines | Revisits | Mean table total at the end | Mean bits each at the end |`);
  say(`|---|--:|--:|--:|--:|--:|--:|`);
  for (const set of [SETS[0]!, SETS[1]!, SETS[SETS.length - 2]!, SETS[SETS.length - 1]!]) {
    let fixed = 0, turnsToFix = 0, distinct = 0, rev = 0, moves = 0, total = 0;
    const each = [0, 0, 0];
    const F = set.Nz;
    for (const src of sources) {
      let cur = src, passes = 0, t = 0;
      const seen = new Set([cur]);
      for (; t < 300 && passes < 3; t++) {
        const who = t % 3, B = bits[who]!;
        let best = -1, bestRate = 0;
        for (let e = G.start[cur]!; e < G.start[cur + 1]!; e++) {
          if (!set.muts.has(G.mut[e]!)) continue;
          const j = G.to[e]!, W = G.fee[F]![e]! + Math.max(0, phi[j]! - phi[cur]!);
          if (W > 40) continue;
          const gain = B[j]! - B[cur]!;
          if (gain <= 0.05) continue;
          const rate = gain / charge(W);
          if (rate > bestRate) { bestRate = rate; best = j; }
        }
        if (best < 0) { passes++; continue; }
        passes = 0; moves++;
        if (seen.has(best)) rev++;
        seen.add(best); cur = best;
      }
      if (passes >= 3) { fixed++; turnsToFix += t; }
      distinct += seen.size;
      const n = bits.map(b => b[cur]!);
      n.forEach((x, k) => { each[k]! += x; });
      total += n.reduce((a, x, k) => a + x * n.reduce((b, y, l) => b + (l === k ? 0 : y), 0), 0);
    }
    say(`| ${set.id} | ${pct(fixed / NSRC)} | ${fixed ? Math.round(turnsToFix / fixed) : "–"} | ${f1(distinct / NSRC)} | ${moves ? pct(rev / moves) : "–"} | ${f1(total / NSRC)} | ${each.map(x => f1(x / NSRC)).join(", ")} |`);
  }
}

// ---------------------------------------------------------------- part 5: balance and dynamics of the menu as built, over many tables

if (want("balance")) {
  const NT = Number(o.tables);
  const pool = presets.find(p => p.id === "lines-beginner")!.rules;
  const rules = pool.flatMap(pr => (pr.tieBreakers as string[]).map(tb => ({ family: pr.family, params: pr.params as Record<string, unknown>, tieBreaker: tb })))
    .filter(rl => findValues("line-q", rl));
  const t2 = performance.now();
  const bits = rules.map(rl => {
    const fam = lineType.families.find(f => f.id === rl.family)!;
    const look = valueLookup(findValues("line-q", rl)!);
    return Float64Array.from(states, l => look(evaluateSite(lineType, fam, rl.params, { lines: [{ a: BigInt(l[0]), b: BigInt(l[1]), c: BigInt(l[2]) }] }, lineQ, 0, rl.tieBreaker).score).bits);
  });
  const name = (z: number) => `${rules[z]!.family}/${rules[z]!.tieBreaker}`;
  // Tables: three rules of three different families, seeded.
  const tables: number[][] = [];
  while (tables.length < NT) {
    const t = [0, 1, 2].map(() => Math.floor(rand() * rules.length));
    if (new Set(t.map(z => rules[z]!.family)).size === 3 && !tables.some(u => u.join() === t.join())) tables.push(t);
  }
  const nine = SETS[1]!, built = SETS[SETS.length - 1]!;
  const builtIds = new Set([...built.muts].filter(i => ALL[i]!.built));
  say(`\n## 5. Balance and dynamics: the nine against the nine + the five as built (line-q-lenses)`);
  say(`\n${rules.length} rules of the beginner pool (every family with each tie-breaker that has values on line-q), ${NT} seeded`);
  say(`three-rule tables of three different families, ${NSRC} newborn lines each. On each line the three take turns as selfish`);
  say(`climbers: each takes the offered call that raises its own bits most per energy (charge W + 0.05·W², W ≤ 40), or passes;`);
  say(`300 turns; a fixed point is three passes in a row. "Time-mean" is a seat's bits averaged over the 300 turns. Values took`);
  say(`${f1((performance.now() - t2) / 1000)} s.\n`);
  interface Run { end: number[]; mean: number[]; fixed: boolean; distinct: number; rev: number; moves: number; lensMoves: number[]; ownMoves: number[] }
  const climb = (set: MutSet, seats: number[], src: number): Run => {
    const F = set.Nz, B = seats.map(z => bits[z]!);
    let cur = src, passes = 0, t = 0, rev = 0, moves = 0;
    const seen = new Set([cur]), sum = [0, 0, 0], lensMoves = [0, 0, 0], ownMoves = [0, 0, 0];
    for (; t < 300; t++) {
      if (passes < 3) {
        const who = t % 3, Bw = B[who]!;
        let best = -1, bestRate = 0, bestMut = -1;
        for (let e = G.start[cur]!; e < G.start[cur + 1]!; e++) {
          if (!set.muts.has(G.mut[e]!)) continue;
          const j = G.to[e]!, W = G.fee[F]![e]! + Math.max(0, phi[j]! - phi[cur]!);
          if (W > 40) continue;
          const gain = Bw[j]! - Bw[cur]!;
          if (gain <= 0.05) continue;
          const rate = gain / charge(W);
          if (rate > bestRate) { bestRate = rate; best = j; bestMut = G.mut[e]!; }
        }
        if (best < 0) passes++;
        else {
          passes = 0; moves++; ownMoves[who]!++;
          if (builtIds.has(bestMut)) lensMoves[who]!++;
          if (seen.has(best)) rev++;
          seen.add(best); cur = best;
        }
      }
      B.forEach((b, k) => { sum[k]! += b[cur]!; });
    }
    return { end: B.map(b => b[cur]!), mean: sum.map(x => x / 300), fixed: passes >= 3, distinct: seen.size, rev, moves, lensMoves, ownMoves };
  };
  const tot = (n: number[]) => n.reduce((a, x, k) => a + x * n.reduce((b, y, l) => b + (l === k ? 0 : y), 0), 0);
  const agg = (set: MutSet) => {
    const perTable = tables.map(seats => sources.map(src => climb(set, seats, src)));
    return perTable;
  };
  const R9 = agg(nine), R14 = agg(built);
  const summ = (R: Run[][]) => {
    const all = R.flat();
    const n = all.length;
    const dom = all.map(x => { const s = x.mean.reduce((a, b) => a + b, 0); return s > 0 ? Math.max(...x.mean) / s : 1 / 3; });
    return {
      fixed: all.filter(x => x.fixed).length / n, distinct: all.reduce((a, x) => a + x.distinct, 0) / n,
      rev: all.reduce((a, x) => a + x.rev, 0) / Math.max(1, all.reduce((a, x) => a + x.moves, 0)),
      total: all.reduce((a, x) => a + tot(x.end), 0) / n, meanBits: all.reduce((a, x) => a + x.mean.reduce((b, y) => b + y, 0) / 3, 0) / n,
      dominance: dom.reduce((a, b) => a + b, 0) / n, dom60: dom.filter(d => d > 0.6).length / n,
      lensShare: all.reduce((a, x) => a + x.lensMoves.reduce((b, y) => b + y, 0), 0) / Math.max(1, all.reduce((a, x) => a + x.moves, 0)),
    };
  };
  const a9 = summ(R9), a14 = summ(R14);
  say(`| Menu | Runs reaching a fixed point | Distinct lines | Revisits | Lens moves | Table total at the end | Time-mean bits per seat | Leader's share of the time-mean bits | Runs one seat leads with > 60% |`);
  say(`|---|--:|--:|--:|--:|--:|--:|--:|--:|`);
  for (const [id, a] of [["the nine", a9], ["the nine + the five as built", a14]] as const)
    say(`| ${id} | ${pct(a.fixed)} | ${f1(a.distinct)} | ${pct(a.rev)} | ${pct(a.lensShare)} | ${f1(a.total)} | ${f2(a.meanBits)} | ${pct(a.dominance)} | ${pct(a.dom60)} |`);

  // Per rule: its time-mean bits change from the nine to the fourteen, minus its tablemates' change (its advantage).
  const per = new Map<number, { adv: number[]; d: number[]; lens: number; own: number }>();
  tables.forEach((seats, ti) => sources.forEach((_, si) => {
    const x9 = R9[ti]![si]!, x14 = R14[ti]![si]!;
    seats.forEach((z, k) => {
      const d = x14.mean[k]! - x9.mean[k]!;
      const others = seats.map((_, l) => x14.mean[l]! - x9.mean[l]!).filter((_, l) => l !== k);
      const e = per.get(z) ?? { adv: [], d: [], lens: 0, own: 0 };
      e.adv.push(d - (others[0]! + others[1]!) / 2); e.d.push(d);
      e.lens += x14.lensMoves[k]!; e.own += x14.ownMoves[k]!;
      per.set(z, e);
    });
  }));
  const meanSe = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1); return [m, Math.sqrt(v / xs.length)] as const; };
  const rows = [...per].map(([z, e]) => ({ z, n: e.adv.length, adv: meanSe(e.adv), d: meanSe(e.d), lens: e.own ? e.lens / e.own : 0 })).sort((x, y) => y.adv[0] - x.adv[0]);
  say(`\nPer rule (seats over all tables and lines): the change in its time-mean bits from the nine to the fourteen, and its`);
  say(`advantage (that change minus its two tablemates' mean change), ± one standard error; "lens moves" is the share of its`);
  say(`own moves made with one of the five. A rule with an advantage above 1 bit and 3 standard errors is flagged.\n`);
  say(`| Rule | Seats | Change (bits) | Advantage (bits) | Lens moves | Flag |`);
  say(`|---|--:|--:|--:|--:|---|`);
  for (const x of rows) say(`| ${name(x.z)} | ${x.n} | ${f2(x.d[0])} ± ${f2(x.d[1])} | ${f2(x.adv[0])} ± ${f2(x.adv[1])} | ${pct(x.lens)} | ${x.adv[0] > 1 && x.adv[0] > 3 * x.adv[1] ? "**advantaged**" : x.adv[0] < -1 && -x.adv[0] > 3 * x.adv[1] ? "disadvantaged" : ""} |`);

  // Cheap peaks: the energy from a newborn to a line within 90% of the table's best total in the box, nine against fourteen.
  const d9 = sources.map(src => dijkstra(src, nine)), d14 = sources.map(src => dijkstra(src, built));
  const ratios: number[] = [], c9s: number[] = [], c14s: number[] = [];
  for (const seats of tables) {
    const T = Float64Array.from(states, (_, i) => tot(seats.map(z => bits[z]![i]!)));
    const best = T.reduce((a, b) => Math.max(a, b), 0);
    const tg: number[] = [];
    T.forEach((x, i) => { if (x >= 0.9 * best && best > 0) tg.push(i); });
    if (!tg.length) continue;
    sources.forEach((_, k) => {
      const c9 = Math.min(...tg.map(i => d9[k]![i]!)), c14 = Math.min(...tg.map(i => d14[k]![i]!));
      if (isFinite(c9) && isFinite(c14) && c14 > 0) { ratios.push(c9 / c14); c9s.push(c9); c14s.push(c14); }
    });
  }
  const q2 = (xs: number[], p: number) => { const s2 = xs.slice().sort((a, b) => a - b); return s2[Math.min(s2.length - 1, Math.floor(p * s2.length))]!; };
  say(`\nCheap peaks: the cheapest energy from a newborn line to a line within 90% of its table's best total in the box`);
  say(`(${ratios.length} table–line pairs). The nine: median ${Math.round(q2(c9s, 0.5))} energy, p10 ${Math.round(q2(c9s, 0.1))}; the fourteen: median`);
  say(`${Math.round(q2(c14s, 0.5))} energy, p10 ${Math.round(q2(c14s, 0.1))}. Nine over fourteen: median ${f2(q2(ratios, 0.5))}, p90 ${f2(q2(ratios, 0.9))},`);
  say(`max ${f2(q2(ratios, 1))}; ${pct(ratios.filter(x => x >= 1.5).length / ratios.length)} of pairs at least 1.5× cheaper.`);
}
