/**
 * Prefix codes (spec §2.3). Each length function is the code length in bits; each sampler draws a value with
 * probability exactly 2^−length (or returns null for the code's unused mass), which is what the walk needs.
 */
import { gcd, type Q, q } from "./q.ts";
import type { Rng } from "./rng.ts";

/** ⌊log2 n⌋ for n ≥ 1. */
export function floorLog2(n: bigint): number {
  if (n < 1n) throw new RangeError("floorLog2 needs n ≥ 1");
  return n.toString(2).length - 1;
}

/** Elias gamma: n ≥ 1, 2⌊log2 n⌋ + 1 bits. */
export function gammaBits(n: bigint): number {
  return 2 * floorLog2(n) + 1;
}
export function sampleGamma(rng: Rng): bigint {
  let l = 0;
  while (rng.bit() === 0) l++;
  let v = 1n;
  for (let i = 0; i < l; i++) v = (v << 1n) | BigInt(rng.bit());
  return v;
}

const zigzag = (n: bigint): bigint => (n >= 0n ? 2n * n : -2n * n - 1n);
const unzigzag = (z: bigint): bigint => (z % 2n === 0n ? z / 2n : -(z + 1n) / 2n);

/** Any integer: gamma(zigzag(n) + 1). 0 → 1 bit, ±1 → 3, ±2 and ±3 → 5. */
export function intBits(n: bigint): number {
  return gammaBits(zigzag(n) + 1n);
}
export function sampleInt(rng: Rng): bigint {
  return unzigzag(sampleGamma(rng) - 1n);
}

/** A nonzero integer: a sign bit and gamma(|n|). ±1 → 2 bits, ±2 and ±3 → 4. */
export function nonzeroBits(n: bigint): number {
  if (n === 0n) throw new RangeError("nonzero code: 0");
  return 1 + gammaBits(n < 0n ? -n : n);
}
export function sampleNonzero(rng: Rng): bigint {
  const s = rng.bit();
  const m = sampleGamma(rng);
  return s ? -m : m;
}

/** A rational in lowest terms: int(p) + gamma(q). */
export function ratBits(x: Q): number {
  return intBits(x.n) + gammaBits(x.d);
}
export function sampleRat(rng: Rng): Q | null {
  const p = sampleInt(rng), d = sampleGamma(rng);
  return gcd(p, d) === 1n ? q(p, d) : null;
}

/** A nonzero rational in lowest terms: nonzero(p) + gamma(q). */
export function nonzeroRatBits(x: Q): number {
  return nonzeroBits(x.n) + gammaBits(x.d);
}
export function sampleNonzeroRat(rng: Rng): Q | null {
  const p = sampleNonzero(rng), d = sampleGamma(rng);
  return gcd(p, d) === 1n ? q(p, d) : null;
}

/** One of k equally likely choices. */
export const choiceBits = (k: number): number => Math.log2(k);

// ---------------------------------------------------------------- mixed costing (owner decision 17)
//
// "Use mixed costing now." Additive moves are priced by steps: the cost of adding k grows in proportion to |k|
// ("Adding to a number should have cost proportional to the absolute value of the amount added"). Multiplicative
// moves are priced by digits (the gamma codes above): the cost of a factor grows with its length. The number code that
// prices reads and confines the walk follows the same principle: a whole number is written by its prime factorisation,
// each prime p costing STEP·p bits, so large primes are dear and large smooth composites cheap, and a number's energy
// is roughly its shortest arithmetic description.

/** Bits per unit of an amount added, and per unit of a prime in a factorisation. */
export const STEP = 0.5;
const R = 2 ** -STEP;
/** −log2(1 − 2^−STEP): the constant that makes a geometric code complete. */
const GEO = -Math.log2(1 - R);

/** A geometric draw j ≥ 0 with P(j) = (1 − r) r^j, r = 2^−STEP. */
function geometric(rng: Rng): number {
  const u = rng.unit();
  return Math.floor(Math.log1p(-u) / Math.log(R));
}

/** A nonzero integer by steps: a sign bit, then |n| − 1 geometric: 1 + STEP·(|n| − 1) + GEO bits. */
export function stepsNonzeroBits(n: bigint): number {
  if (n === 0n) throw new RangeError("steps code: 0");
  const m = n < 0n ? -n : n;
  return 1 + STEP * Number(m - 1n) + GEO;
}
export function sampleStepsNonzero(rng: Rng): bigint {
  const s = rng.bit();
  const m = BigInt(1 + geometric(rng));
  return s ? -m : m;
}

/** Any integer by steps: 0 → 1 bit; otherwise 1 + the nonzero code. */
export const stepsIntBits = (n: bigint): number => (n === 0n ? 1 : 1 + stepsNonzeroBits(n));
export function sampleStepsInt(rng: Rng): bigint {
  return rng.bit() === 0 ? 0n : sampleStepsNonzero(rng);
}

/** A nonzero rational p/q by steps on its numerator and denominator: 1 + STEP·(|p| − 1) + STEP·(q − 1) + 2·GEO bits. */
export function stepsNonzeroRatBits(x: Q): number {
  return stepsNonzeroBits(x.n) + STEP * Number(x.d - 1n) + GEO;
}
export function sampleStepsNonzeroRat(rng: Rng): Q | null {
  const p = sampleStepsNonzero(rng);
  const d = BigInt(1 + geometric(rng));
  return gcd(p, d) === 1n ? q(p, d) : null;
}
export const stepsRatBits = (x: Q): number => (x.n === 0n ? 1 : 1 + stepsNonzeroRatBits(x));
export function sampleStepsRat(rng: Rng): Q | null {
  return rng.bit() === 0 ? q(0) : sampleStepsNonzeroRat(rng);
}

/** Trial division stops here; a cofactor with no factor below it is treated as one prime (dear, and rare). */
const FACTOR_LIMIT = 100_000n;

function smallPrimes(limit: number): number[] {
  const sieve = new Uint8Array(limit + 1);
  const out: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (sieve[i]) continue;
    out.push(i);
    for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
  }
  return out;
}
/** log2 of Π_p 1/(1 − 2^−STEP·p): the normaliser of the factorisation code (the tail past 10^4 is below 2^−5000). */
const LOG2_Z = smallPrimes(10_000).reduce((a, p) => a - Math.log2(1 - 2 ** (-STEP * p)), 0);

/** The weight of n ≥ 1: STEP · Σ e·p over its factorisation p^e (1 → 0). */
export function factorWeight(n: bigint): number {
  let m = n < 0n ? -n : n;
  if (m < 1n) throw new RangeError("factorWeight needs n ≥ 1");
  let w = 0;
  if (m <= BigInt(Number.MAX_SAFE_INTEGER)) {
    // The same trial division in floating point (exact below 2^53): the same weight, much faster.
    let x = Number(m);
    for (let d = 2; d * d <= x && d <= 100_000; d += d === 2 ? 1 : 2) while (x % d === 0) { w += d; x /= d; }
    if (x > 1) w += x;
    return STEP * w;
  }
  for (let d = 2n; d * d <= m && d <= FACTOR_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { w += Number(d); m /= d; }
  if (m > 1n) w += Number(m);
  return STEP * w;
}

/** A positive integer by its factorisation: factorWeight(n) + log2 Z. Kraft sum exactly 1 over n ≥ 1. */
export const mixedPosBits = (n: bigint): number => factorWeight(n) + LOG2_Z;
/** Any integer: 0 → 1 bit; ±n → 2 + mixedPosBits(|n|) (one bit for "not zero", one for the sign). */
export const mixedIntBits = (n: bigint): number => (n === 0n ? 1 : 2 + mixedPosBits(n < 0n ? -n : n));

// ---------------------------------------------------------------- direct draws from the mixed code (owner decision 23)

const DRAW_PRIMES = smallPrimes(10_000);
const log2ZCache = new Map<number, number>();
/**
 * log2 of Z_t = Σ_n 2^(−t·mixedIntBits(n)) over all integers: the normaliser of the tilted law q_t(n) = 2^(−t·bits)/Z_t.
 * Z_1 = 1 (the code is complete). Z_t = 2^−t + 2·2^(−t(2 + log2 Z))·Π_p 1/(1 − 2^(−t·STEP·p)).
 */
export function mixedIntLog2Norm(t: number): number {
  const hit = log2ZCache.get(t);
  if (hit !== undefined) return hit;
  if (!(t > 0)) throw new RangeError("the tilt t must be positive");
  const logProd = DRAW_PRIMES.reduce((a, p) => a - Math.log2(1 - 2 ** (-t * STEP * p)), 0);
  const nonzero = 1 - t * (2 + LOG2_Z) + logProd;   // log2 of 2·2^(−t(2 + log2 Z))·Π
  const z = Math.log2(2 ** -t + 2 ** nonzero);
  log2ZCache.set(t, z);
  return z;
}

/**
 * One integer from q_t(n) = 2^(−t·mixedIntBits(n)) / Z_t: t = 1 is the law itself, t < 1 a heavier tail for importance
 * sampling. Zero or not, then a fair sign, then each prime's exponent independently geometric with ratio 2^(−t·STEP·p)
 * (the factorisation code is a product over primes). Primes whose chance of appearing at all is below 2^−60 are skipped.
 */
export function sampleMixedInt(r: Rng, t = 1): bigint {
  const z = mixedIntLog2Norm(t);
  if (r.unit() < 2 ** (-t - z)) return 0n;
  const negative = r.bit() === 1;
  let n = 1n;
  for (const p of DRAW_PRIMES) {
    const ratio = 2 ** (-t * STEP * p);
    if (ratio < 2 ** -60) break;
    while (r.unit() < ratio) n *= BigInt(p);
  }
  return negative ? -n : n;
}

// ---------------------------------------------------------------- integer codes with a chosen p(0) (line-q's law, C3)
//
// A complete code on the integers with P(0) = zero, ±n sharing 1 − zero symmetrically (fractions.md §4, code C3). Each
// is a length function, a direct sampler of the tilted law q_t(n) = 2^(−t·bits(n)) / Z_t (t = 1: the code itself), and
// log2 Z_t (log2 Z_1 = 0: the Kraft sum is 1). Unbounded: no cap.

export interface IntCode {
  readonly id: string;
  bits(n: bigint): number;
  sample(r: Rng, t?: number): bigint;
  log2Norm(t: number): number;
}

/**
 * A symmetric code from a magnitude code on m ≥ 1: magnitudeBits(m), its draw at tilt t, and nonzeroTail(t) = log2 of
 * Σ_{m ≥ 1} 2^(−t·magnitudeBits(m)) (0 at t = 1 when the magnitude code is complete).
 */
function intCode(id: string, zero: number, nonzeroTail: (t: number) => number, magnitude: (r: Rng, t: number) => bigint,
  magnitudeBits: (m: bigint) => number): IntCode {
  if (!(zero > 0 && zero < 1)) throw new RangeError("p(0) must be in (0, 1)");
  const zeroBits = -Math.log2(zero), signed = 1 - Math.log2(1 - zero);   // the prefix of ±n: "not zero" and a sign
  const norms = new Map<number, number>();
  const log2Norm = (t: number): number => {
    let z = norms.get(t);
    if (z === undefined) {
      if (!(t > 0)) throw new RangeError("the tilt t must be positive");
      // Z_t = 2^(−t·zeroBits) + 2·2^(−t·signed)·tail(t), tail(t) = Σ_{m ≥ 1} 2^(−t·magnitudeBits(m)).
      z = Math.log2(2 ** (-t * zeroBits) + 2 ** (1 - t * signed + nonzeroTail(t)));
      norms.set(t, z);
    }
    return z;
  };
  return {
    id,
    bits: n => (n === 0n ? zeroBits : signed + magnitudeBits(n < 0n ? -n : n)),
    sample(r, t = 1) {
      if (r.unit() < 2 ** (-t * zeroBits - log2Norm(t))) return 0n;
      const negative = r.bit() === 1, m = magnitude(r, t);
      return negative ? -m : m;
    },
    log2Norm,
  };
}

/** The mixed code (p(0) = ½) as an IntCode: the functions above, unchanged. */
export const mixedInt: IntCode = { id: "mixed", bits: mixedIntBits, sample: sampleMixedInt, log2Norm: mixedIntLog2Norm };

/** The mixed (factorisation) code with P(0) = zero: ±n → 1 − log2(1 − zero) + mixedPosBits(|n|). zero = ½ is mixedInt. */
export function mixedIntCode(zero: number): IntCode {
  return intCode(`mixed(p0=${zero})`, zero,
    t => -t * LOG2_Z + DRAW_PRIMES.reduce((a, p) => a - Math.log2(1 - 2 ** (-t * STEP * p)), 0),
    (r, t) => {
      let n = 1n;
      for (const p of DRAW_PRIMES) {
        const ratio = 2 ** (-t * STEP * p);
        if (ratio < 2 ** -60) break;
        while (r.unit() < ratio) n *= BigInt(p);
      }
      return n;
    },
    mixedPosBits);
}

/** By steps with P(0) = zero: ±n → 1 − log2(1 − zero) + GEO + STEP·(|n| − 1) (each unit of |n| costs STEP bits). */
export function stepsIntCode(zero: number): IntCode {
  return intCode(`steps(p0=${zero})`, zero,
    // Σ_{j ≥ 0} 2^(−t(GEO + STEP·j)) = 2^(−t·GEO) / (1 − 2^(−t·STEP)).
    t => -t * GEO - Math.log2(1 - 2 ** (-t * STEP)),
    (r, t) => {
      const u = r.unit();
      return BigInt(1 + Math.floor(Math.log1p(-u) / Math.log(2 ** (-t * STEP))));
    },
    m => GEO + STEP * Number(m - 1n));
}

// ---------------------------------------------------------------- far moves are dear (owner design, 2026-11-14)
//
// "It's really expensive to move objects a long way in a single turn, by design, so all strategies should be incremental
// hill climbing." A call's fee is which + where + its arguments. Most arguments split into choices (which coefficient,
// which cell, a pivot's x0) and one size (how far: an amount added, a slide, a factor). The size is priced against the
// rest of the call: when the call's other parts cost o bits, a size σ costs rate(o)·σ − o, so the whole fee is
// rate(o)·σ: exactly proportional to the size. A move of size n then costs exactly what n unit moves cost (each paying
// its own which, where and choices), and a far move is never cheaper than the path of unit moves to the same place.
// rate(o) is the least that keeps the code a (sub-)probability: Σ 2^−bits ≤ 1 over every size, with equality here.
// Sizes:
//   an amount (a nonzero rational p/q in lowest terms; integers have q = 1): σ = |p| + q − 1, so a whole number n has
//     σ = |n| and a fraction pays for its denominator;
//   a displacement (u, v), not both 0: σ = σ(u) + σ(v), with σ(0) = 0;
//   a factor (a nonzero rational p/q other than ±1): σ = log2(|p|·q), its digits, which add up along a product of
//     primes: a factor costs exactly what its prime factors cost one by one.
// The amount and displacement codes are geometric in σ (ratio r = 2^−rate) over sign, p ≥ 1 and q ≥ 1 drawn
// independently; a draw that is not in lowest terms is the code's leftover mass. The factor code is a zeta law
// (|p|·q)^−rate over p ≥ 1 and q ≥ 1, likewise.

/** The size of a nonzero amount p/q: |p| + q − 1 (a whole number's absolute value). 0 has size 0. */
export function amountSize(x: Q): number {
  if (x.n === 0n) return 0;
  return Number(x.n < 0n ? -x.n : x.n) + Number(x.d) - 1;
}

/** The size of a factor p/q: log2(|p|·q). */
export function factorSize(x: Q): number {
  const p = x.n < 0n ? -x.n : x.n;
  return log2Big(p) + log2Big(x.d);
}
function log2Big(n: bigint): number {
  const s = n.toString(2);
  if (s.length <= 52) return Math.log2(Number(n));
  return s.length - 52 + Math.log2(Number(n >> BigInt(s.length - 52)));
}

/** A size code given the rest of the call's bits o: bits(σ) = rate·σ − o. */
export interface SizeCode {
  /** Bits per unit of size: a call of size σ has fee rate·σ. */
  readonly rate: number;
  /** The bits of the size part: rate·σ − o. */
  bits(size: number): number;
}

const rateCache = new Map<string, number>();
function cached(key: string, f: () => number): number {
  let r = rateCache.get(key);
  if (r === undefined) rateCache.set(key, r = f());
  return r;
}

/**
 * The geometric ratio r for an amount (dims 1) or a displacement (dims 2), whole (Z) or rational (Q), after o bits.
 * g(r) = Σ over a nonzero component of r^σ: 2r/(1 − r) for Z (sign, |n| ≥ 1), 2r/(1 − r)² for Q (sign, p ≥ 1, q ≥ 1).
 * Complete code: 2^o·g = 1 for one amount; 2^o·((1 + g)² − 1) = 1 for a displacement (the pair (0, 0) excluded).
 */
function amountRatio(o: number, dims: 1 | 2, rational: boolean): number {
  return cached(`a${dims}${rational ? "Q" : "Z"}${o}`, () => {
    const g = dims === 1 ? 2 ** -o : Math.sqrt(1 + 2 ** -o) - 1;
    // Z: 2r/(1 − r) = g. Q: 2r/(1 − r)² = g, the root below 1.
    return rational ? (g + 1 - Math.sqrt(2 * g + 1)) / g : g / (2 + g);
  });
}

/** The code of an amount (dims 1) or a displacement (dims 2) when the rest of the call costs o bits. */
export function amountCode(o: number, dims: 1 | 2, rational: boolean): SizeCode {
  const rate = -Math.log2(amountRatio(o, dims, rational));
  return { rate, bits: size => rate * size - o };
}

/** A geometric draw j ≥ 0 with P(j) = (1 − r)·r^j. */
function geometricRatio(rng: Rng, r: number): number {
  return Math.floor(Math.log1p(-rng.unit()) / Math.log(r));
}
/** A nonzero component with probability r^σ / g (see amountRatio), or null when not in lowest terms. */
function drawComponent(rng: Rng, r: number, rational: boolean): Q | null {
  const s = rng.bit();
  const p = BigInt(1 + geometricRatio(rng, r));
  const d = rational ? BigInt(1 + geometricRatio(rng, r)) : 1n;
  if (gcd(p, d) !== 1n) return null;
  return q(s ? -p : p, d);
}

/** One amount with probability 2^−bits under amountCode(o, 1, rational), or null for the leftover mass. */
export function sampleAmount(rng: Rng, o: number, rational: boolean): Q | null {
  return drawComponent(rng, amountRatio(o, 1, rational), rational);
}

/** One displacement (u, v), not both 0, with probability 2^−bits under amountCode(o, 2, rational), or null. */
export function sampleDisplacement(rng: Rng, o: number, rational: boolean): [Q, Q] | null {
  const r = amountRatio(o, 2, rational);
  const g = rational ? 2 * r / (1 - r) ** 2 : 2 * r / (1 - r);
  // Each component is 0 with probability 1/(1 + g), else a nonzero draw; (0, 0) is redrawn.
  for (;;) {
    const zu = rng.unit() < 1 / (1 + g), zv = rng.unit() < 1 / (1 + g);
    if (zu && zv) continue;
    const u = zu ? q(0) : drawComponent(rng, r, rational);
    const v = zv ? q(0) : drawComponent(rng, r, rational);
    return u === null || v === null ? null : [u, v];
  }
}

/** ζ(s) for s > 1: a direct sum and the Euler–Maclaurin tail. */
function zeta(s: number): number {
  const N = 1000;
  let t = 0;
  for (let n = 1; n < N; n++) t += n ** -s;
  return t + N ** (1 - s) / (s - 1) + N ** -s / 2 + s * N ** (-s - 1) / 12;
}

/**
 * The factor code when the rest of the call costs o bits: bits = rate·log2(|p|·q) − o, rate the root of
 * 2^(o+1)·(ζ(rate)² − 1) = 1 (sign, p ≥ 1, q ≥ 1, the pair (1, 1) excluded).
 */
export function factorCode(o: number): SizeCode {
  const rate = cached(`f${o}`, () => {
    let lo = 1.01, hi = 80;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (2 ** (o + 1) * (zeta(mid) ** 2 - 1) > 1) lo = mid; else hi = mid;
    }
    return hi;
  });
  return { rate, bits: size => rate * size - o };
}

/** A draw n ≥ 1 with P(n) = n^−a / ζ(a), a > 1 (Devroye's rejection method), or null past 2^52. */
function sampleZipf(rng: Rng, a: number): number | null {
  const b = 2 ** (a - 1);
  for (;;) {
    const u = 1 - rng.unit(), v = rng.unit();
    const x = Math.floor(u ** (-1 / (a - 1)));
    if (!(x <= 2 ** 52)) return null;
    const t = (1 + 1 / x) ** (a - 1);
    if (v * x * (t - 1) / (b - 1) <= t / b) return x;
  }
}

/** One factor (not ±1) with probability 2^−bits under factorCode(o), or null for the leftover mass. */
export function sampleFactor(rng: Rng, o: number): Q | null {
  const a = factorCode(o).rate;
  for (;;) {
    const s = rng.bit();
    const p = sampleZipf(rng, a), d = sampleZipf(rng, a);
    if (p === null || d === null) return null;
    if (p === 1 && d === 1) continue;
    const P = BigInt(p), D = BigInt(d);
    if (gcd(P, D) !== 1n) return null;
    return q(s ? -P : P, D);
  }
}
