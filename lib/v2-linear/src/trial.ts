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
import { Qn, q, type Q } from "@workspace/v2-core";
import { intercept, isVertical, slope, type Line } from "./line.ts";

export interface TrialDials {
  /** Field strength: bits of height per unit of size (of |m|, of |c|, and of the denominator above 1). */
  readonly g: number;
  /** Friction: bits per unit moved, in any of |m|, |c|, b. */
  readonly alpha: number;
  /** Friction of a sign change (of m or of c). */
  readonly sigma: number;
  /** Friction of naming a call. */
  readonly nu: number;
  /** Friction per doubling of a multiplying factor (stretch, zoom), before the distance floor. */
  readonly mu: number;
  /** Pickiness: score = worth − k·price. At least 1. */
  readonly k: number;
  /** Energy per bit (the exchange rate to the game's energy). */
  readonly w: number;
}
export const TRIAL: TrialDials = { g: 1 / 40, alpha: 1 / 120, sigma: 1 / 40, nu: 1 / 80, mu: 1 / 40, k: 2, w: 100 };

/** A line as the trial reads it. */
export interface Pt { readonly sm: number; readonly x: number; readonly sc: number; readonly y: number; readonly b: number }
const sgn = (v: Q): number => (v.n > 0n ? 1 : v.n < 0n ? -1 : 0);
export function pt(l: Line): Pt | null {
  if (isVertical(l)) return null;
  const m = slope(l), c = intercept(l);
  return { sm: sgn(m), x: Math.abs(Qn.toNumber(m)), sc: sgn(c), y: Math.abs(Qn.toNumber(c)), b: Number(l.b) };
}
export const heightOf = (p: Pt, d: TrialDials = TRIAL): number => d.g * (p.x + p.y + p.b - 1);
export const height = (l: Line, d: TrialDials = TRIAL): number => { const p = pt(l); return p ? heightOf(p, d) : Infinity; };
/** Signs differ (0 counts as its own sign: crossing zero is a change). */
const flip = (a: number, b: number): number => (a === b ? 0 : 1);
export function frictionDistance(s: Pt, t: Pt, d: TrialDials = TRIAL): number {
  return d.alpha * (Math.abs(s.x - t.x) + Math.abs(s.y - t.y) + Math.abs(s.b - t.b)) + d.sigma * (flip(s.sm, t.sm) + flip(s.sc, t.sc));
}
export const lift = (s: Pt, t: Pt, d: TrialDials = TRIAL): number => Math.max(0, heightOf(t, d) - heightOf(s, d));

// ------------------------------------------------------------------ prices of calls

const absQ = (v: unknown): number => (v && typeof v === "object" && "n" in (v as Q) ? Math.abs(Qn.toNumber(v as Q)) : 0);
/**
 * A mutator's own fee in the trial, before the distance floor: additive moves by their size (α per unit), a
 * multiplying factor p/q by its doublings (μ·log2(|p|·q)), choices (mirror, swap, turn, fold) nothing.
 */
export function ownFee(mutator: string, args: Readonly<Record<string, unknown>>, d: TrialDials = TRIAL): number {
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
/** The trial price of a call that took `before` to `after` (bits; energy = w × bits). */
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

/** Least cost of moving a coordinate from v into [lo, hi), and how far it can then still go down at α a unit. */
const clamp = (v: number, s: Span): number => Math.min(Math.max(v, s.lo), s.hi);

/**
 * P(s, box) exactly: each coordinate goes to its nearest point of the box; if the line is then higher than s, every
 * unit taken off any coordinate (down to the box's floor) costs α and saves g of lift, and g > α, so take height off
 * until the lift is gone or nothing is left to take (a convex piecewise-linear minimum).
 */
function boxPrice(s: Pt, M: Span, C: Span, d: TrialDials): number {
  const x = clamp(s.x, M), y = clamp(s.y, C), b = Math.max(1, s.b);
  const base = d.alpha * (Math.abs(s.x - x) + Math.abs(s.y - y) + Math.abs(s.b - b));
  const excess = (x + y + b - 1) - heightOf(s, d) / d.g;  // units of height still to lift
  if (excess <= 0) return base;
  const room = (x - M.lo) + (y - C.lo) + (b - 1);
  const r = Math.min(excess, room);
  return base + (d.g > d.alpha ? d.alpha * r + d.g * (excess - r) : d.g * excess);
}
const boxWorth = (M: Span, C: Span, d: TrialDials): number => d.g * (M.lo + C.lo);

// The area trophy: the relaxed holders are (x, y, b) with y = √(2Ax), x ≥ 1/b, y ≥ 1/b, b ≥ 1 (a nonzero fraction with
// bottom b is at least 1/b; this is what keeps tiny lines from holding big areas for free).
function areaHolder(A: number, x: number, M: Span, C: Span): number | null {
  if (x <= 0 || x < M.lo || x >= M.hi) return null;
  const y = Math.sqrt(2 * A * x);
  return y < C.lo || y >= C.hi ? null : y;
}
/** For a holder's (x, y), the best denominator b and its cost from s (closed form, as in boxPrice). */
function areaCost(s: Pt, x: number, y: number, d: TrialDials): number {
  const L = Math.max(1, 1 / x, 1 / y), b0 = Math.max(s.b, L);
  const base = d.alpha * (Math.abs(s.x - x) + Math.abs(s.y - y) + (b0 - s.b));
  const excess = (x + y + b0 - 1) - heightOf(s, d) / d.g;
  if (excess <= 0) return base;
  const r = Math.min(excess, b0 - L);
  return base + (d.g > d.alpha ? d.alpha * r + d.g * (excess - r) : d.g * excess);
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
  const h = (x: number) => { const y = areaHolder(A, x, M, C); return y === null ? Infinity : d.g * (x + y + Math.max(1, 1 / x, 1 / y) - 1); };
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

// ------------------------------------------------------------------ rules

/** A trial rule: its trophies, generated with worth at most `maxWorth`, best (highest worth) first. */
export interface TrialRule {
  readonly family: string;
  readonly params: unknown;
  readonly card: string;
  trophies(maxWorth: number, d: TrialDials): Iterable<Trophy>;
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
  const H = heightOf(s, d);
  const cap = d.k > 1 ? (d.k * H) / (d.k - 1) : Infinity;
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
  return {
    family: "trial-gradient-prime", params: { suffix },
    card: `The gradient, ignoring its sign, should round to a prime ending in ${suffix}. A prime p is a trophy worth g·(p − ½).`,
    *trophies(maxWorth, d) {
      const top = Math.floor(maxWorth / d.g + 0.5);
      for (let p = first + Math.floor(Math.max(0, top - first) / step) * step; p >= first; p -= step) {
        if (isPrimeN(p)) yield { label: `|m| rounds to ${p}`, m: half(p) };
      }
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
const divisors = (n: number): number[] => { const o: number[] = []; for (let i = 2; i <= n; i++) if (n % i === 0) o.push(i); return o; };

/**
 * "The y-intercept, ignoring its sign, rounds to a whole number built only from the primes `primes` (bigger is
 * better). Second layer (optional): the gradient's whole part ⌊|m|⌋ divides that number; a bigger divisor is better."
 * A trophy v is worth g·(v − ½); with the second layer, the trophy (v, e) is worth g·(v − ½ + e).
 */
export function interceptSmooth(primes: readonly number[], layered = false): TrialRule {
  if (!primes.length || !primes.every(isPrimeN)) throw new RangeError("a set of primes");
  return {
    family: "trial-intercept-smooth", params: { primes: [...primes], layered },
    card: `The y-intercept, ignoring its sign, should round to a whole number whose prime factors are all among ${primes.join(", ")}.`
      + (layered ? " Better still, the gradient's whole part divides that number (a bigger divisor is better)." : ""),
    *trophies(maxWorth, d) {
      const top = Math.floor(maxWorth / d.g + 0.5);
      for (const v of smoothUpTo(primes, top)) {
        if (layered) for (const e of divisors(v)) if (d.g * (v - 0.5 + e) <= maxWorth) yield { label: `c rounds to ${v}, ⌊|m|⌋ = ${e}`, c: half(v), m: { lo: e, hi: e + 1 } };
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
