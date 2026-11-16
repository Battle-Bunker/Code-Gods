/**
 * The scoring trial's third mode, "scale-free rarity" (docs/engine-v2/scoring-trial.md, last section; the
 * coordinator's proposal to the owner, 16 November). A rule's bits are the rarity, under one law over lines, of doing
 * at least this well; the law is the log height's own: chance 2^−H.
 *
 * THE LAW. The gradient and the y-intercept are two independent fractions m = p₁/q₁, c = p₂/q₂ in lowest terms (not
 * the stored triple, whose common bottom number couples them). Each top |p| and each bottom q is an independent
 * discrete power law with exact survival: P(|p| ≥ n) = (n + 1)^−(g−1), P(q ≥ k) = k^−(g−1) (draw: ⌊u^−1/(g−1)⌋ − 1
 * and ⌊u^−1/(g−1)⌋); a nonzero top's sign is a fair coin; pairs with a common factor are redrawn. So H = −log2 P is a
 * function of the line alone, about g·(log2(1+|p₁|) + log2 q₁ + log2(1+|p₂|) + log2 q₂) + constants, and prices
 * "the game's fee + the rise in H" stay an exact potential [true by construction].
 *
 * A RULE'S BITS: a reading r (a number read off the line), a target set (from the rule's drawn parameters), and
 * optionally a third part (a second reading against a value tied to the target). With T the nearest target, lo and hi
 * the edges of T's cell (midpoints to its neighbours), W = hi − lo:
 *   LEVEL  −log2 S(lo), S the reading's survival P(r ≥ x): a power law, S(x) ≈ 2^−(slope·log2 x + offset)
 *   CLOSE  −log2 P(at least this close to T | in T's cell), read off S: [S(T − δ) − S(T + δ)] / [S(lo) − S(hi)],
 *          δ = |r − T| + res/2 (so the formula needs nothing but S)
 *   THIRD  the same on the second reading, with its own target's cell
 *   bits = −log2( S(hi) + (S(lo) − S(hi)) · 2^−(close + third) )
 * The reading's survival is parameter-free: for a single coefficient it is a sum (`coefSurvival`); for any other
 * reading it is two numbers fitted once from direct samples of the law (`fitReading`). A drawn rule only places
 * targets, so nothing is tabled per instance.
 */
import { gcd, rng as makeRng, type Rng } from "@workspace/v2-core";
import { intercept, isVertical, slope, type Line } from "./line.ts";
import { isPrimeN, smoothUpTo } from "./trial.ts";

export interface RarityDials {
  /** The law's exponent: bits of rarity per doubling of a top or a bottom number (H's g). Above 1. */
  readonly g: number;
  /** The closeness resolution, in units of the reading (an exact hit is worth log2(W / res)). */
  readonly res: number;
}
export const RARITY: RarityDials = { g: 2, res: 1 };

// ------------------------------------------------------------------ the law

/** A line as two reduced fractions (tops signed, bottoms positive). */
export interface Fr { readonly p: number; readonly q: number }
export interface MC { readonly m: Fr; readonly c: Fr }
const pareto = (r: Rng, g: number): number => Math.floor(Math.max(1, (1 - r.unit()) ** (-1 / (g - 1))));
function drawFraction(r: Rng, g: number): Fr {
  for (;;) {
    const n = pareto(r, g) - 1, q = pareto(r, g);
    if (gcd(BigInt(n), BigInt(q)) !== 1n) continue;  // gcd(0, q) = q: zero only over 1
    return { p: n === 0 ? 0 : r.bit() ? n : -n, q };
  }
}
export const drawLine = (r: Rng, d: RarityDials = RARITY): MC => ({ m: drawFraction(r, d.g), c: drawFraction(r, d.g) });
const topBits = (n: number, g: number) => -Math.log2((n + 1) ** -(g - 1) - (n + 2) ** -(g - 1)) + (n === 0 ? 0 : 1);
const bottomBits = (k: number, g: number) => -Math.log2(k ** -(g - 1) - (k + 1) ** -(g - 1));
/** H = −log2 of the law's chance (less the redraw constant): a function of the line, so prices on it are an exact potential. */
export const rarityHeight = (l: MC, d: RarityDials = RARITY): number =>
  topBits(Math.abs(l.m.p), d.g) + bottomBits(l.m.q, d.g) + topBits(Math.abs(l.c.p), d.g) + bottomBits(l.c.q, d.g);
export function mcOf(l: Line): MC | null {
  if (isVertical(l)) return null;
  const m = slope(l), c = intercept(l);
  return { m: { p: Number(m.n), q: Number(m.d) }, c: { p: Number(c.n), q: Number(c.d) } };
}

// ------------------------------------------------------------------ readings

export interface Reading { readonly id: string; readonly title: string; read(l: MC): number | null }
const val = (f: Fr) => f.p / f.q;
export const READINGS: Record<string, Reading> = {
  m: { id: "m", title: "the gradient's size", read: l => Math.abs(val(l.m)) },
  c: { id: "c", title: "the y-intercept's size", read: l => Math.abs(val(l.c)) },
  area: { id: "area", title: "the axis-triangle area", read: l => (l.m.p === 0 || l.c.p === 0 ? null : val(l.c) ** 2 / (2 * Math.abs(val(l.m)))) },
  crossing: { id: "crossing", title: "the x-crossing's size", read: l => (l.m.p === 0 ? null : Math.abs(val(l.c) / val(l.m))) },
  y3: { id: "y3", title: "the size of y at x = 3", read: l => Math.abs(3 * val(l.m) + val(l.c)) },
  dist2: { id: "dist2", title: "the squared distance from the origin", read: l => val(l.c) ** 2 / (1 + val(l.m) ** 2) },
};

/** A reading's survival S(x) = P(r ≥ x) (r null counts as below everything). */
export interface Survival { (x: number): number; readonly how: string }

/**
 * A single coefficient's survival as a sum [derived; checked against samples in test/trial-rarity.test.ts]:
 * S(x) = Σ_q P(q)·P(|p| ≥ ⌈x·q⌉ | coprime to q) / Z, with P(coprime) ≈ φ(q)/q (exact as |p|'s range grows).
 */
export function coefSurvival(d: RarityDials = RARITY, Q = 4000): Survival {
  const g = d.g, Pq = (k: number) => k ** -(g - 1) - (k + 1) ** -(g - 1);
  const phiFrac: number[] = [0];
  for (let k = 1; k <= Q; k++) { let n = k, f = 1; for (let p = 2; p * p <= n; p++) if (n % p === 0) { f *= 1 - 1 / p; while (n % p === 0) n /= p; } if (n > 1) f *= 1 - 1 / n; phiFrac.push(k === 1 ? 1 : f); }
  // Z: the chance a draw is kept (p = 0 is kept only over 1).
  let Z = 0;
  for (let k = 1; k <= Q; k++) Z += Pq(k) * (k === 1 ? 1 : phiFrac[k]! * (1 - 0.5 ** (g - 1)));
  const f = ((x: number) => {
    if (x <= 0) return 1;
    let s = 0;
    for (let k = 1; k <= Q; k++) { const n = Math.ceil(x * k - 1e-12); s += Pq(k) * phiFrac[k]! * (n + 1) ** -(g - 1); }
    return Math.min(1, s / Z);
  }) as Survival;
  return Object.assign(f, { how: "sum over bottoms" });
}

/**
 * Fit S(x) ≈ 2^−(slope·log2 x + offset) from `n` direct draws of the law, over the sizes where at least `minTail`
 * draws lie beyond; with the largest error of the fit on those sizes, in bits [a fit: its error is reported].
 */
export function fitReading(reading: Reading, d: RarityDials = RARITY, n = 400_000, seed = 1): Survival & { slope: number; offset: number; maxErr: number } {
  const r = makeRng("rarity-fit", reading.id, seed), xs: number[] = [];
  for (let i = 0; i < n; i++) { const v = reading.read(drawLine(r, d)); if (v !== null && v > 0) xs.push(v); }
  xs.sort((a, b) => b - a);
  const pts: [number, number][] = [];
  for (let x = 2; ; x *= 2 ** 0.25) {
    let lo = 0, hi = xs.length;  // count of draws ≥ x (xs descending)
    while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid]! >= x) lo = mid + 1; else hi = mid; }
    if (lo < 200) break;
    pts.push([Math.log2(x), -Math.log2(lo / n)]);
  }
  const k = pts.length, sx = pts.reduce((t, p) => t + p[0], 0), sy = pts.reduce((t, p) => t + p[1], 0);
  const sxx = pts.reduce((t, p) => t + p[0] * p[0], 0), sxy = pts.reduce((t, p) => t + p[0] * p[1], 0);
  const sl = (k * sxy - sx * sy) / (k * sxx - sx * sx), off = (sy - sl * sx) / k;
  const maxErr = Math.max(...pts.map(([lx, b]) => Math.abs(sl * lx + off - b)));
  const f = ((x: number) => (x <= 0 ? 1 : x <= 2 ? Math.min(1, 2 ** -(sl + off) * (1 + (2 ** (sl + off) - 1) * (2 - x) / 2)) : Math.min(1, 2 ** -(sl * Math.log2(x) + off)))) as Survival;
  return Object.assign(f, { how: `fitted: ${sl.toFixed(3)} bits a doubling + ${off.toFixed(2)}`, slope: sl, offset: off, maxErr });
}

const SURVIVALS = new Map<string, Survival>();
export function survivalOf(reading: Reading, d: RarityDials = RARITY): Survival {
  const key = `${reading.id}/${d.g}`;
  if (!SURVIVALS.has(key)) SURVIVALS.set(key, reading.id === "m" || reading.id === "c" ? coefSurvival(d) : fitReading(reading, d));
  return SURVIVALS.get(key)!;
}

// ------------------------------------------------------------------ target sets (from a rule's drawn parameters)

/** A target set: the nearest target to x, with its neighbours (prev 0 below the first). */
export interface Targets { readonly label: string; around(x: number): { T: number; prev: number; next: number } }
function fromList(label: string, list: (upTo: number) => number[]): Targets {
  return {
    label,
    around(x) {
      let top = 64, l = list(top);
      for (let i = 0; i < 40 && !(l.length && l[l.length - 1]! > 2 * x + 2 && l.filter(t => t > x).length >= 2); i++) { top *= 4; const n = list(top); if (n.length === l.length && i > 2) break; l = n; }
      let i = l.findIndex(t => t >= x);
      if (i < 0) i = l.length - 1;
      if (i > 0 && x - l[i - 1]! <= l[i]! - x) i--;
      return { T: l[i]!, prev: i > 0 ? l[i - 1]! : 0, next: l[i + 1] ?? 2 * l[i]! };
    },
  };
}
export const targetsPrimesEnding = (suffix: string): Targets => fromList(`primes ending ${suffix}`, top => {
  const st = 10 ** suffix.length, v = Number(suffix), first = String(v).length < suffix.length ? v + st : v, out: number[] = [];
  for (let p = first; p <= top; p += st) if (isPrimeN(p)) out.push(p);
  return out;
});
export const targetsPowersOf2: Targets = fromList("powers of 2", top => { const o: number[] = []; for (let p = 1; p <= top; p *= 2) o.push(p); return o; });
export const targetsSmooth = (primes: readonly number[]): Targets => fromList(`built from ${primes.join(", ")}`, top => smoothUpTo(primes, top).reverse());
export const targetsSquares: Targets = fromList("perfect targetsSquares", top => { const o: number[] = []; for (let n = 1; n * n <= top; n++) o.push(n * n); return o; });
export const targetsDivisorsOf = (v: number): Targets => fromList(`divisors of ${v}`, () => { const o: number[] = []; for (let i = 1; i <= v; i++) if (v % i === 0) o.push(i); return o; });

// ------------------------------------------------------------------ rules

export interface RarityRule {
  readonly label: string;
  readonly reading: Reading;
  readonly targets: Targets;
  /** A third part: a second reading against targets tied to the main target. */
  readonly third?: { readonly reading: Reading; targets(T: number): Targets };
}
export interface RarityBits { readonly bits: number; readonly level: number; readonly close: number; readonly third: number; readonly T: number | null }

const cell = (t: { T: number; prev: number; next: number }) => {
  const lo = t.prev === 0 ? 0 : (t.prev + t.T) / 2, hi = (t.T + t.next) / 2;
  return { lo, hi, W: hi - lo };
};
/**
 * Closeness in bits: −log2 of the chance, among lines in T's cell, of being at least this close to T, read off the
 * reading's own survival (so a coefficient's exact hits keep their true weight: integers carry most of the mass near
 * a large target). Within res/2 of T counts as on it.
 */
export function closeness(r: number, t: { T: number; prev: number; next: number }, S: Survival, d: RarityDials = RARITY): number {
  const { lo, hi } = cell(t), dd = Math.abs(r - t.T) + d.res / 2;
  const cellMass = S(lo) - S(hi), near = S(Math.max(lo, t.T - dd)) - S(Math.min(hi, t.T + dd));
  return cellMass > 0 && near > 0 ? Math.max(0, -Math.log2(near / cellMass)) : 0;
}

export function rarityBits(rule: RarityRule, l: MC, d: RarityDials = RARITY): RarityBits {
  const r = rule.reading.read(l);
  if (r === null) return { bits: 0, level: 0, close: 0, third: 0, T: null };
  const S = survivalOf(rule.reading, d), t = rule.targets.around(r), { lo, hi } = cell(t);
  const close = closeness(r, t, S, d);
  let third = 0;
  if (rule.third) {
    const r2 = rule.third.reading.read(l);
    if (r2 !== null) third = closeness(r2, rule.third.targets(t.T).around(r2), survivalOf(rule.third.reading, d), d);
  }
  const Slo = S(lo), Shi = Math.min(Slo, S(hi));
  return { bits: -Math.log2(Shi + (Slo - Shi) * 2 ** -(close + third)), level: -Math.log2(Slo), close, third, T: t.T };
}
export const rarityOfLine = (rule: RarityRule, line: Line, d: RarityDials = RARITY): RarityBits => {
  const l = mcOf(line);
  return l ? rarityBits(rule, l, d) : { bits: 0, level: 0, close: 0, third: 0, T: null };
};

/** The example's three rules: A (gradient on a prime ending in `suffix`), B (intercept from `primes`, third part: the
 * gradient near a divisor of the target), C (area a perfect square). */
export const rarityRules = (suffix = "1", primes: readonly number[] = [3, 17]): RarityRule[] => [
  { label: `A: |m| near a prime ending ${suffix}`, reading: READINGS.m!, targets: targetsPrimesEnding(suffix) },
  { label: `B: |c| near a number built from ${primes.join(", ")}; then |m| near one of its divisors`, reading: READINGS.c!, targets: targetsSmooth(primes), third: { reading: READINGS.m!, targets: targetsDivisorsOf } },
  { label: "C: area near a perfect square", reading: READINGS.area!, targets: targetsSquares },
];
