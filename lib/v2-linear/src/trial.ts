/**
 * The scoring trial for lines (docs/engine-v2/scoring-trial.md; the coordinator's declared trial, 16 November).
 * Beside the existing machine, changing nothing in it: one height per line, a price of friction plus lift, and a rule's
 * score as the worth of its best trophy less k times the cheapest price to reach it. Everything here is a formula of
 * the line and the family's parameters; there are no value files.
 *
 * A line y = mx + c with common denominator b (the primitive triple's b) is the point (|m|, |c|, b) with the signs of
 * m and c. Vertical lines are not on the trial board.
 *
 *   height  H = g·(|m| + |c| + b − 1)                                                     (bits)
 *   friction distance  D(s, t) = α·(‖m|−|m′‖ + ‖c|−|c′‖ + |b − b′|) + σ·(sign changes of m and c)
 *   lift  L(s, t) = max(0, H(t) − H(s))
 *   price of a call  = ν + max(the mutator's own fee, D(before, after)) + L(before, after)
 *   d(s, t) = D(s, t) + L(s, t), a quasi-metric that no call undercuts
 *   trophy T: a region of the (|m|, |c|, b) space (b ≥ 1 read as a real number: a relaxation, so a superset of the
 *   lines holding it); worth(T) = inf of H over T; price to T, P(s, T) = inf of d(s, t) over T
 *   score = max(0, max over the rule's trophies of worth(T) − k·P(s, T))
 *
 * True by construction (tested in test/trial.test.ts by enumeration): a call of price p raises no score by more than
 * k·p and lowers none by more than k times its undo's price; no score exceeds the line's height (k ≥ 1).
 */
import { Qn, q, whichBits, type Q } from "@workspace/v2-core";
import { intercept, isVertical, slope, type Line } from "./line.ts";
import { allMutators } from "./mutators.ts";
import { lineQ, lineQLenses } from "./type.ts";

export interface TrialDials {
  /**
   * "linear": height grows with a number's size (g bits a unit). "log": height grows with its doublings (g a doubling
   * of 1 + size; a bottom number by its own doublings), the scale-invariant gravity (owner, 16 November).
   */
  readonly mode: "linear" | "log";
  /** Field strength: height per coordinate unit (linear: a unit of size; log: a doubling). */
  readonly g: number;
  /**
   * Friction per coordinate unit. Linear: α on each of |m|, |c|, b. Log: alphaS along the size direction (both numbers
   * doubling together: a stretch), alphaD across it (one number doubling against the other: a change of shape, which
   * is a change of the crossing), alphaB on the bottom number's doublings.
   */
  readonly alpha: number;
  readonly alphaS: number;
  readonly alphaD: number;
  readonly alphaB: number;
  /** Friction of a sign change (of m or of c). */
  readonly sigma: number;
  /** Linear mode: friction of naming a call. (Log mode prices calls by the game's own fees, which name the call.) */
  readonly nu: number;
  /** Linear mode: friction per doubling of a multiplying factor (stretch, zoom), before the distance floor. */
  readonly mu: number;
  /** Pickiness: score = worth − k·price. Above 1 (at k = 1 every card reads "be high"; the trophy scan needs k > 1). */
  readonly k: number;
  /** Energy per unit of score (linear: 100⚡ a bit; log: prices are the game's fees, 1⚡ each). */
  readonly w: number;
}
export const TRIAL: TrialDials = { mode: "linear", g: 1 / 40, alpha: 1 / 120, alphaS: 0, alphaD: 0, alphaB: 0, sigma: 1 / 40, nu: 1 / 80, mu: 1 / 40, k: 2, w: 100 };
/**
 * The log mode's dials (my choice). g = 100⚡ a doubling; a stretch ×2 then costs its game fee (about 5) plus 2g of lift.
 * alphaD > g/(2k), so moving a doubling from one number to the other costs more score than it gains (each card cares
 * about its own number); alphaS small, so scaling the whole line is a short move, as owner decision 25 wants.
 */
export const TRIAL_LOG: TrialDials = { mode: "log", g: 100, alpha: 0, alphaS: 2, alphaD: 30, alphaB: 30, sigma: 3, nu: 0, mu: 0, k: 2, w: 1 };

/** A line as the trial reads it. */
export interface Pt { readonly sm: number; readonly x: number; readonly sc: number; readonly y: number; readonly b: number }
const sgn = (v: Q): number => (v.n > 0n ? 1 : v.n < 0n ? -1 : 0);
export function pt(l: Line): Pt | null {
  if (isVertical(l)) return null;
  const m = slope(l), c = intercept(l);
  return { sm: sgn(m), x: Math.abs(Qn.toNumber(m)), sc: sgn(c), y: Math.abs(Qn.toNumber(c)), b: Number(l.b) };
}
/** A size as a coordinate: itself (linear) or log2(1 + size) (log: 0 at 0, no singularity, a doubling a unit far out). */
export const co = (v: number, d: TrialDials): number => (d.mode === "log" ? Math.log2(1 + v) : v);
const coInv = (u: number, d: TrialDials): number => (d.mode === "log" ? 2 ** u - 1 : u);
/** The bottom number as a coordinate: b − 1 (linear) or log2 b (log). */
const coB = (b: number, d: TrialDials): number => (d.mode === "log" ? Math.log2(b) : b - 1);
export const heightOf = (p: Pt, d: TrialDials = TRIAL): number => d.g * (co(p.x, d) + co(p.y, d) + coB(p.b, d));
export const height = (l: Line, d: TrialDials = TRIAL): number => { const p = pt(l); return p ? heightOf(p, d) : Infinity; };
/** Signs differ (0 counts as its own sign: crossing zero is a change). */
const flip = (a: number, b: number): number => (a === b ? 0 : 1);
/** The friction metric as weighted |n·Δ| terms over the coordinates (X, Y, B). */
type Term = readonly [w: number, n: readonly [number, number, number]];
const terms = (d: TrialDials): readonly Term[] => (d.mode === "log"
  ? [[d.alphaS, [1, 1, 0]], [d.alphaD, [1, -1, 0]], [d.alphaB, [0, 0, 1]]]
  : [[d.alpha, [1, 0, 0]], [d.alpha, [0, 1, 0]], [d.alpha, [0, 0, 1]]]);
const metric = (d: TrialDials, dx: number, dy: number, db: number): number =>
  terms(d).reduce((t, [w, n]) => t + w * Math.abs(n[0] * dx + n[1] * dy + n[2] * db), 0);
export function frictionDistance(s: Pt, t: Pt, d: TrialDials = TRIAL): number {
  return metric(d, co(t.x, d) - co(s.x, d), co(t.y, d) - co(s.y, d), coB(t.b, d) - coB(s.b, d)) + d.sigma * (flip(s.sm, t.sm) + flip(s.sc, t.sc));
}
export const lift = (s: Pt, t: Pt, d: TrialDials = TRIAL): number => Math.max(0, heightOf(t, d) - heightOf(s, d));

// ------------------------------------------------------------------ prices of calls

const absQ = (v: unknown): number => (v && typeof v === "object" && "n" in (v as Q) ? Math.abs(Qn.toNumber(v as Q)) : 0);
const BY_ID = new Map(allMutators.map(m => [m.id, m]));
/**
 * A mutator's own fee in the trial, before the distance floor. Linear mode: additive moves by their size (α per unit),
 * a multiplying factor p/q by its doublings (μ·log2(|p|·q)), choices (mirror, swap, turn, fold) nothing. Log mode: the
 * game's own fee for the call (which mutator, plus its arguments' code: adding by the amount, multiplying by the
 * factor's digits, choices as choices), without the old shortcut floor, which was tied to the old number code.
 */
export function ownFee(mutator: string, args: Readonly<Record<string, unknown>>, d: TrialDials = TRIAL): number {
  if (d.mode === "log") {
    const m = BY_ID.get(mutator);
    if (!m) return 0;
    const v = lineQ.mutators.includes(mutator) ? lineQ : lineQLenses;  // swap and lean live on the lens board
    return whichBits(v, mutator) + m.args(v).bits(args as never);
  }
  switch (mutator) {
    case "si.shift": case "si.tilt": case "seq.step": case "int.move": case "gen.nudge": case "cart.pivot": case "basis.lean":
      return d.alpha * absQ(args.k);
    case "cart.slide": return d.alpha * (absQ(args.u) + absQ(args.v));
    case "mach.stretch": case "basis.zoom": {
      const f = args.f as Q | undefined;
      return f && typeof f === "object" ? d.mu * Math.log2(Math.max(1, Math.abs(Number(f.n)) * Number(f.d))) : 0;
    }
    default: return 0;
  }
}
export interface TrialPrice { readonly friction: number; readonly lift: number; readonly total: number; readonly energy: number }
/** The trial price of a call that took `before` to `after` (score units; energy = w × that). */
export function callPrice(mutator: string, args: Readonly<Record<string, unknown>>, before: Line, after: Line, d: TrialDials = TRIAL): TrialPrice | null {
  const s = pt(before), t = pt(after);
  if (!s || !t) return null;
  const friction = d.nu + Math.max(ownFee(mutator, args, d), frictionDistance(s, t, d)), up = lift(s, t, d);
  return { friction, lift: up, total: friction + up, energy: d.w * (friction + up) };
}

// ------------------------------------------------------------------ trophies

/** [lo, hi) on a size (hi may be Infinity). */
export interface Span { readonly lo: number; readonly hi: number }
const ANY: Span = { lo: 0, hi: Infinity };
/**
 * A trophy: a box on (|m|, |c|) (sizes; signs free), optionally with the axis-triangle area c²/(2|m|) exactly `area`.
 * `label` is for people.
 */
export interface Trophy { readonly label: string; readonly m?: Span; readonly c?: Span; readonly area?: number }

type V3 = [number, number, number];
function solve3(A: readonly V3[], r: readonly number[]): V3 | null {
  const [a, b, c] = A as [V3, V3, V3];
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-12) return null;
  const col = (i: number): V3[] => A.map((row, j) => row.map((v, k) => (k === i ? r[j]! : v)) as V3);
  const dt = (M: V3[]) => M[0]![0] * (M[1]![1] * M[2]![2] - M[1]![2] * M[2]![1]) - M[0]![1] * (M[1]![0] * M[2]![2] - M[1]![2] * M[2]![0]) + M[0]![2] * (M[1]![0] * M[2]![1] - M[1]![1] * M[2]![0]);
  return [dt(col(0)) / det, dt(col(1)) / det, dt(col(2)) / det];
}
/**
 * P(s, box) exactly: the minimum of a convex piecewise-linear function (the friction metric plus g × the lift) over a
 * box in (X, Y, B) is at a vertex of its kinks and the box's faces, so every vertex is tried.
 */
function boxPrice(s: Pt, M: Span, C: Span, d: TrialDials): number {
  if (d.mode === "linear") return boxPriceL1(s, M, C, d);
  const X0 = co(s.x, d), Y0 = co(s.y, d), B0 = coB(s.b, d), Hc = heightOf(s, d) / d.g;
  const box = { xl: co(M.lo, d), xh: co(M.hi, d), yl: co(C.lo, d), yh: co(C.hi, d) };
  const f = (X: number, Y: number, B: number) => metric(d, X - X0, Y - Y0, B - B0) + d.g * Math.max(0, X + Y + B - Hc);
  const planes: [V3, number][] = [
    ...terms(d).map(([, n]) => [[...n] as V3, n[0] * X0 + n[1] * Y0 + n[2] * B0] as [V3, number]),
    [[1, 1, 1], Hc], [[1, 0, 0], box.xl], [[0, 1, 0], box.yl], [[0, 0, 1], 0],
    ...(Number.isFinite(box.xh) ? [[[1, 0, 0], box.xh] as [V3, number]] : []),
    ...(Number.isFinite(box.yh) ? [[[0, 1, 0], box.yh] as [V3, number]] : []),
  ];
  let best = Infinity;
  const eps = 1e-9;
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const v = solve3([planes[i]![0], planes[j]![0], planes[k]![0]], [planes[i]![1], planes[j]![1], planes[k]![1]]);
    if (!v) continue;
    const [X, Y, B] = v;
    if (X < box.xl - eps || X > box.xh + eps || Y < box.yl - eps || Y > box.yh + eps || B < -eps) continue;
    best = Math.min(best, f(X, Y, Math.max(0, B)));
  }
  return best;
}
/** The linear mode's L1 metric: each coordinate to its nearest point, then take height off at α a unit (g > α). */
function boxPriceL1(s: Pt, M: Span, C: Span, d: TrialDials): number {
  const clamp = (v: number, sp: Span): number => Math.min(Math.max(v, sp.lo), sp.hi);
  const x = clamp(s.x, M), y = clamp(s.y, C), b = Math.max(1, s.b);
  const base = d.alpha * (Math.abs(s.x - x) + Math.abs(s.y - y) + Math.abs(s.b - b));
  const excess = (x + y + b - 1) - heightOf(s, d) / d.g;
  if (excess <= 0) return base;
  const r = Math.min(excess, (x - M.lo) + (y - C.lo) + (b - 1));
  return base + (d.g > d.alpha ? d.alpha * r + d.g * (excess - r) : d.g * excess);
}
const boxWorth = (M: Span, C: Span, d: TrialDials): number => d.g * (co(M.lo, d) + co(C.lo, d));

// The area trophy: the relaxed holders are (x, y, b) with y = √(2Ax), x ≥ 1/b, y ≥ 1/b, b ≥ 1 (a nonzero fraction with
// bottom b is at least 1/b; this is what keeps tiny lines from holding big areas for free).
function areaHolder(A: number, x: number, M: Span, C: Span): number | null {
  if (x <= 0 || x < M.lo || x >= M.hi) return null;
  const y = Math.sqrt(2 * A * x);
  return y < C.lo || y >= C.hi ? null : y;
}
/** For a holder's (x, y), the best bottom number and its cost from s (closed form: B enters only its own term). */
function areaCost(s: Pt, x: number, y: number, d: TrialDials): number {
  const wB = d.mode === "log" ? d.alphaB : d.alpha;
  const X = co(x, d), Y = co(y, d), BL = coB(Math.max(1, 1 / x, 1 / y), d), Bs = coB(s.b, d), B0 = Math.max(Bs, BL);
  const base = metric(d, X - co(s.x, d), Y - co(s.y, d), 0) + wB * (B0 - Bs);
  const excess = X + Y + B0 - heightOf(s, d) / d.g;
  if (excess <= 0) return base;
  const r = Math.min(excess, B0 - BL);
  return base + (d.g > wB ? wB * r + d.g * (excess - r) : d.g * excess);
}
/** Minimise f over x in (lo, hi) on a log grid, then by golden section around the best cell. Numerical. */
function minimiseLog(f: (x: number) => number, lo: number, hi: number, extra: readonly number[]): number {
  const N = 400, l0 = Math.log(lo), l1 = Math.log(hi);
  const xs = [...Array.from({ length: N + 1 }, (_, i) => Math.exp(l0 + ((l1 - l0) * i) / N)), ...extra.filter(x => x > lo && x < hi)].sort((a, b) => a - b);
  let best = Infinity, bi = 0;
  xs.forEach((x, i) => { const v = f(x); if (v < best) { best = v; bi = i; } });
  let a = xs[Math.max(0, bi - 1)]!, b = xs[Math.min(xs.length - 1, bi + 1)]!;
  const r = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 80; i++) {
    const c = b - r * (b - a), e = a + r * (b - a);
    if (f(c) < f(e)) b = e; else a = c;
  }
  return Math.min(best, f((a + b) / 2));
}
function areaRange(A: number, M: Span, C: Span): [number, number] {
  const lo = Math.max(M.lo, (C.lo * C.lo) / (2 * A), 1e-9), hi = Math.min(M.hi, (C.hi * C.hi) / (2 * A), 1e12);
  return [lo, hi];
}
function areaWorth(A: number, M: Span, C: Span, d: TrialDials): number {
  const [lo, hi] = areaRange(A, M, C);
  if (!(hi > lo)) return Infinity;
  const h = (x: number) => { const y = areaHolder(A, x, M, C); return y === null ? Infinity : d.g * (co(x, d) + co(y, d) + coB(Math.max(1, 1 / x, 1 / y), d)); };
  return minimiseLog(h, lo, hi, [lo, 1, 2 * A]);
}
function areaPrice(s: Pt, A: number, M: Span, C: Span, d: TrialDials): number {
  const [lo, hi] = areaRange(A, M, C);
  if (!(hi > lo)) return Infinity;
  const f = (x: number) => { const y = areaHolder(A, x, M, C); return y === null ? Infinity : areaCost(s, x, y, d); };
  return minimiseLog(f, lo, hi, [lo, s.x, (s.y * s.y) / (2 * A), 1, 1 / Math.max(1, s.b)]);
}

export function trophyWorth(t: Trophy, d: TrialDials = TRIAL): number {
  const M = t.m ?? ANY, C = t.c ?? ANY;
  return t.area === undefined ? boxWorth(M, C, d) : areaWorth(t.area, M, C, d);
}
export function trophyPrice(s: Pt, t: Trophy, d: TrialDials = TRIAL): number {
  const M = t.m ?? ANY, C = t.c ?? ANY;
  return t.area === undefined ? boxPrice(s, M, C, d) : areaPrice(s, t.area, M, C, d);
}
/** The largest size whose coordinate is u (for cutting trophy scans at a worth). */
export const sizeAt = coInv;

// ------------------------------------------------------------------ rules

/** A trial rule: its trophies, generated with worth at most `maxWorth`, best (highest worth) first. */
export interface TrialRule {
  readonly family: string;
  readonly params: unknown;
  readonly card: string;
  trophies(maxWorth: number, d: TrialDials): Iterable<Trophy>;
  /** A rule may score itself without listing every trophy up to maxWorth (e.g. by a walk from its best place). */
  score?(s: Pt, d: TrialDials): TrialScore;
}
export interface TrialScore { readonly score: number; readonly trophy: Trophy | null; readonly worth: number; readonly price: number; readonly height: number }

/**
 * The rule's score on a line. Only trophies of worth at most k·H/(k − 1) can score above zero (P ≥ worth − H), and a
 * trophy never scores above its worth, so the generator is cut there and trophies are visited best first, stopping
 * when the worth falls to the best score found. Exact for box trophies; area trophies are numerical.
 */
export function trialScore(rule: TrialRule, line: Line, d: TrialDials = TRIAL): TrialScore {
  const s = pt(line);
  if (!s) return { score: 0, trophy: null, worth: 0, price: Infinity, height: Infinity };
  if (!(d.k > 1)) throw new RangeError("the trial needs pickiness k > 1 (it bounds which trophies can score)");
  if (rule.score) return rule.score(s, d);
  const H = heightOf(s, d);
  const cap = (d.k * H) / (d.k - 1);
  let best: TrialScore = { score: 0, trophy: null, worth: 0, price: Infinity, height: H };
  for (const t of rule.trophies(cap, d)) {
    const w = trophyWorth(t, d);
    if (w <= best.score) continue;
    const p = trophyPrice(s, t, d), v = w - d.k * p;
    if (v > best.score) best = { score: v, trophy: t, worth: w, price: p, height: H };
  }
  return best;
}

// ------------------------------------------------------------------ number helpers (plain numbers: trophies are small)

export function isPrimeN(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
const half = (v: number): Span => ({ lo: v - 0.5, hi: v + 0.5 });

// ------------------------------------------------------------------ the three trial families

/** "The gradient, ignoring its sign, rounds to a prime whose last digits are `suffix`; bigger is better." */
export function gradientPrime(suffix: string): TrialRule {
  if (!/^[0-9]{0,3}[1379]$/.test(suffix)) throw new RangeError(`not a drawable suffix: ${suffix}`);
  const L = suffix.length, step = 10 ** L, v = Number(suffix);
  const first = String(v).length < L ? v + step : v;
  const trophy = (p: number): Trophy => ({ label: `|m| rounds to ${p}`, m: half(p) });
  /** The candidates ≡ suffix, at or above n, ascending (and at or below, descending). */
  const upFrom = function* (n: number) { for (let p = first + Math.max(0, Math.ceil((n - first) / step)) * step; ; p += step) if (isPrimeN(p)) yield p; };
  const downFrom = function* (n: number) { for (let p = first + Math.floor((n - first) / step) * step; p >= first; p -= step) if (isPrimeN(p)) yield p; };
  return {
    family: "trial-gradient-prime", params: { suffix },
    card: `The gradient, ignoring its sign, should round to a prime ending in ${suffix}. A prime p is a trophy worth g × the height of a gradient p − ½.`,
    *trophies(maxWorth, d) {
      for (const p of downFrom(sizeAt(maxWorth / d.g, d) + 0.5)) yield trophy(p);
    },
    /**
     * Exact without listing every prime: with X the gradient's coordinate, Q(X) = g·X − k·P(the point X) is concave
     * (P is a convex function partly minimised), and a trophy [lo, hi) scores at most Q(lo) above Q's peak and at most
     * Q(hi) below it. So find the peak, walk outwards both ways, and stop each way once that bound is below the best.
     */
    score(s, d) {
      const H = heightOf(s, d);
      const Q = (X: number) => { const x = sizeAt(X, d); return d.g * X - d.k * boxPrice(s, { lo: x, hi: x }, ANY, d); };
      let a = 0, b = (d.k * H) / ((d.k - 1) * d.g) + co(1, d);
      for (let i = 0; i < 60; i++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (Q(m1) < Q(m2)) a = m1; else b = m2; }
      const xStar = sizeAt((a + b) / 2, d);
      let best: TrialScore = { score: 0, trophy: null, worth: 0, price: Infinity, height: H };
      const consider = (p: number) => {
        const t = trophy(p), w = trophyWorth(t, d), pr = trophyPrice(s, t, d), val = w - d.k * pr;
        if (val > best.score) best = { score: val, trophy: t, worth: w, price: pr, height: H };
      };
      for (const p of upFrom(xStar - 0.5)) { if (Q(co(p - 0.5, d)) <= best.score) break; consider(p); }
      for (const p of downFrom(xStar + 0.5)) { if (Q(co(p + 0.5, d)) <= best.score) break; consider(p); }
      return best;
    },
  };
}

/** Whole numbers whose prime factors all lie in `primes`, up to `top`, descending. */
export function smoothUpTo(primes: readonly number[], top: number): number[] {
  const out: number[] = [];
  const go = (i: number, n: number) => {
    if (i === primes.length) { if (n > 1) out.push(n); return; }
    for (let m = n; m <= top; m *= primes[i]!) go(i + 1, m);
  };
  go(0, 1);
  return out.sort((a, b) => b - a);
}
/** The divisors above 1 of a number built from `primes` (found from its exponents: no trial division). */
function smoothDivisors(n: number, primes: readonly number[]): number[] {
  let ds = [1];
  for (const p of primes) {
    let e = 0, r = n;
    while (r % p === 0) { r /= p; e++; }
    ds = ds.flatMap(d => Array.from({ length: e + 1 }, (_, i) => d * p ** i));
  }
  return ds.filter(d => d > 1).sort((a, b) => a - b);
}

/**
 * "The y-intercept, ignoring its sign, rounds to a whole number built only from the primes `primes` (bigger is
 * better). Second layer (optional): the gradient's whole part ⌊|m|⌋ divides that number; a bigger divisor is better."
 * A trophy v is worth g × the height of an intercept v − ½; with the second layer, (v, e) adds a gradient e's height.
 */
export function interceptSmooth(primes: readonly number[], layered = false): TrialRule {
  if (!primes.length || !primes.every(isPrimeN)) throw new RangeError("a set of primes");
  return {
    family: "trial-intercept-smooth", params: { primes: [...primes], layered },
    card: `The y-intercept, ignoring its sign, should round to a whole number whose prime factors are all among ${primes.join(", ")}.`
      + (layered ? " Better still, the gradient's whole part divides that number (a bigger divisor is better)." : ""),
    *trophies(maxWorth, d) {
      const top = Math.floor(sizeAt(maxWorth / d.g, d) + 0.5);
      for (const v of smoothUpTo(primes, top)) {
        if (layered) for (const e of smoothDivisors(v, primes)) if (d.g * (co(v - 0.5, d) + co(e, d)) <= maxWorth) yield { label: `c rounds to ${v}, ⌊|m|⌋ = ${e}`, c: half(v), m: { lo: e, hi: e + 1 } };
        yield { label: `c rounds to ${v}`, c: half(v) };
      }
    },
  };
}

/**
 * "The triangle the line cuts from the axes has a perfect-square area n², n ≤ maxN; bigger is better." Numerical
 * prices (a one-dimensional minimisation per trophy), so slow: maxN bounds the work.
 */
export function areaSquare(maxN = 200): TrialRule {
  return {
    family: "trial-area-square", params: { maxN },
    card: `The triangle between the line and the two axes should have an area that is a perfect square (1, 4, 9, … 3721 = 61², …, up to ${maxN}²).`,
    *trophies(maxWorth, d) {
      for (let n = maxN; n >= 1; n--) if (areaWorth(n * n, ANY, ANY, d) <= maxWorth) yield { label: `area ${n * n} = ${n}²`, area: n * n };
    },
  };
}

/** The axis-triangle area of a line, or null if it passes through the origin or is parallel to an axis. */
export function axisArea(l: Line): number | null {
  const p = pt(l);
  return p && p.x > 0 && p.y > 0 ? (p.y * p.y) / (2 * p.x) : null;
}
export const fmtLineQ = (m: Q, c: Q): string => `y = ${Qn.toWire(m)}x + ${Qn.toWire(c)}`;
export { q as trialQ };
