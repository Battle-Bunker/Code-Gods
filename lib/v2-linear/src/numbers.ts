/** Number facts rules use: primes near a rational. Exact, on bigint. */
import { Qn, q, type Q } from "@workspace/v2-core";

/** Numbers up to this are trial-divided in floating point (exact below 2^53), the same divisors in the same order. */
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const LIMIT = 100_000;

export function isPrime(n: bigint): boolean {
  // Trial division where it is cheap and exact (below 10^10, every divisor up to the square root is tried); above it,
  // Miller–Rabin with the first thirteen primes as witnesses, as the agents' helper does (lib/v2-sandbox guest
  // helpers: exact below 3.3·10^24), so the engine and the starters agree. (Trial division to 10^5 alone called the
  // composites above 10^10 with no small factor prime: the grids session, 15 Nov.)
  if (n < 2n) return false;
  if (n < 4n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  if (n < 10_000_000_000n) {
    const x = Number(n);
    for (let d = 5; d * d <= x; d += 6) if (x % d === 0 || x % (d + 2) === 0) return false;
    return true;
  }
  // Primes below 2000 first: they reject most composites for one division each, before a modular power (a 400-digit
  // distance² searched about 90 candidates for its nearest prime ending in k, 2.5 s with a power on each).
  for (const p of SMALL_PRIMES) if (n % p === 0n) return n === p;
  let d = n - 1n, s = 0;
  while (d % 2n === 0n) { d /= 2n; s++; }
  witness: for (const a of WITNESSES) {
    let y = modPow(a, d, n);
    if (y === 1n || y === n - 1n) continue;
    for (let i = 1; i < s; i++) { y = (y * y) % n; if (y === n - 1n) continue witness; }
    return false;
  }
  return true;
}
const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
const SMALL_PRIMES: bigint[] = (() => {
  const out: bigint[] = [];
  for (let k = 2; k < 2000; k++) if (out.every(p => p * p > BigInt(k) || BigInt(k) % p !== 0n)) out.push(BigInt(k));
  return out;
})();
/** b^e mod m, for m > 1. */
function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n, x = b % m;
  for (let k = e; k > 0n; k >>= 1n) { if (k & 1n) r = (r * x) % m; x = (x * x) % m; }
  return r;
}

/** The largest prime ≤ x, or null when x < 2. */
export function primeAtMost(x: Q): bigint | null {
  for (let n = Qn.floor(x); n >= 2n; n--) if (isPrime(n)) return n;
  return null;
}

/** The smallest prime ≥ x. */
export function primeAtLeast(x: Q): bigint {
  let n = Qn.ceil(x);
  if (n < 2n) n = 2n;
  while (!isPrime(n)) n++;
  return n;
}

/** The primes either side of x (one when x is prime or below 2), nearest first. */
export function nearbyPrimes(x: Q): bigint[] {
  const lo = primeAtMost(x), hi = primeAtLeast(x);
  const ps = lo === null || lo === hi ? [hi] : [lo, hi];
  return ps.sort((a, b) => Qn.cmp(Qn.abs(Qn.sub(x, q(a))), Qn.abs(Qn.sub(x, q(b)))));
}

/** ⌊√n⌋ for n ≥ 0 (Newton's method on bigint: exact at any size). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  // A start from the float square root of the top 52 bits, just above the root, then Newton (one or two steps).
  const L = n.toString(16).length * 4, sh = Math.max(0, L - 52) & ~1;
  let x = (BigInt(Math.ceil(Math.sqrt(Number(n >> BigInt(sh))))) + 1n) << BigInt(sh / 2);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** The whole number nearest x (halves round up). */
export const nearestInteger = (x: Q): bigint => Qn.floor(Qn.add(x, q(1, 2)));

/** The root r ≥ 0 of the perfect square r² nearest x (ties go to the smaller square; negative x → 0). */
export function nearestSquareRoot(x: Q): bigint {
  if (x.n <= 0n) return 0n;
  const r = isqrt(Qn.floor(x));
  const lo = Qn.sub(x, q(r * r)), hi = Qn.sub(q((r + 1n) * (r + 1n)), x);
  return Qn.cmp(hi, lo) < 0 ? r + 1n : r;
}

/**
 * Trial division stops at this divisor: a number with no factor below it counts as prime here. Rule scores stay exact
 * and deterministic, and the cost of a rule evaluation stays bounded on huge numbers (which the confining code makes
 * vanishingly rare).
 */
export const TRIAL_DIVISION_LIMIT = BigInt(LIMIT);

/** The smallest prime factor of |n| (up to TRIAL_DIVISION_LIMIT, else |n|); 1 for 0 and ±1. */
export function smallestPrimeFactor(n: bigint): bigint {
  const m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  if (m % 2n === 0n) return 2n;
  if (m <= SAFE) {
    const x = Number(m);
    for (let d = 3; d * d <= x && d <= LIMIT; d += 2) if (x % d === 0) return BigInt(d);
    return m;
  }
  for (let d = 3n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += 2n) if (m % d === 0n) return d;
  return m;
}

/** The largest prime factor of |n| (a cofactor with no factor below the limit counts as prime); 1 for 0 and ±1. */
export function largestPrimeFactor(n: bigint): bigint {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 1n;
  let big = 1n;
  if (m <= SAFE) {
    let x = Number(m), b = 1;
    for (let d = 2; d * d <= x && d <= LIMIT; d += d === 2 ? 1 : 2) while (x % d === 0) { b = d; x /= d; }
    return x > 1 ? BigInt(x) : BigInt(b);
  }
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { big = d; m /= d; }
  return m > 1n ? m : big;
}

/** Ω(n): prime factors of |n| counted with multiplicity (a cofactor with no factor below the limit counts once); 0 for 0 and ±1. */
export function primeFactorCount(n: bigint): number {
  let m = n < 0n ? -n : n;
  if (m < 2n) return 0;
  let k = 0;
  if (m <= SAFE) {
    let x = Number(m);
    for (let d = 2; d * d <= x && d <= LIMIT; d += d === 2 ? 1 : 2) while (x % d === 0) { x /= d; k++; }
    return x > 1 ? k + 1 : k;
  }
  for (let d = 2n; d * d <= m && d <= TRIAL_DIVISION_LIMIT; d += d === 2n ? 1n : 2n) while (m % d === 0n) { m /= d; k++; }
  return m > 1n ? k + 1 : k;
}

/** Distance from x to the nearest prime (primes are positive, so anything at or below 2 is measured to 2). */
export function distanceToPrime(x: Q): Q {
  return Qn.abs(Qn.sub(x, q(nearbyPrimes(x)[0]!)));
}

/**
 * The dealt prime filter (owner decision 41: "distance to nearest prime ending in k (base 10) ... rather than just
 * distance to nearest prime"): primes whose last decimal digit is k, k ∈ 1, 3, 7, 9 (every prime but 2 and 5 ends in
 * one of them, a quarter each).
 */
export const PRIME_ENDINGS = [1, 3, 7, 9] as const;
export type PrimeEnding = (typeof PRIME_ENDINGS)[number];
const endsIn = (p: bigint, k: number) => p % 10n === BigInt(k);
/**
 * The prime ending in k nearest x (on a tie, the smaller): searched outward from x, nearer candidates first (the one below
 * on a tie), so the first found is the answer and only one prime is confirmed (a 400-digit x confirmed two, 2 s).
 */
export function nearestPrimeEnding(x: Q, k: number): bigint {
  const f = Qn.floor(x);
  let lo = f, hi = f + 1n < 2n ? 2n : f + 1n;
  for (;;) {
    const below = lo >= 2n && Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0;
    const n = below ? lo : hi;
    if (endsIn(n, k) && isPrime(n)) return n;
    if (below) lo--; else hi++;
  }
}
/** Distance from x to the nearest prime ending in k. */
export const distanceToPrimeEnding = (x: Q, k: number): Q => Qn.abs(Qn.sub(x, q(nearestPrimeEnding(x, k))));
/** Whether n is a prime ending in k. */
export const isPrimeEnding = (n: bigint, k: number): boolean => endsIn(n, k) && isPrime(n);

/**
 * A dealt prime suffix (the owner, 16 Nov: "a prime's final digits can be any drawable suffix whose last digit is 1, 3,
 * 7 or 9"): 1 to 3 decimal digits, the last one 1, 3, 7 or 9. Such a suffix read as a residue is coprime to 10^L, so by
 * Dirichlet's theorem infinitely many primes end in it: every draw has targets. A suffix is read as written digits: a
 * target is a prime whose decimal digits end with the string, so "007" is met by 4007, not by 7.
 */
export const isSuffix = (s: unknown): s is string => typeof s === "string" && /^[0-9]{0,2}[1379]$/.test(s);
/** Whether n is a prime whose decimal digits end with the suffix s. */
export const isPrimeWithSuffix = (n: bigint, s: string): boolean => n > 1n && n.toString().endsWith(s) && isPrime(n);
/** The numbers whose digits end with s, in order: v + k·10^L for k ≥ k0 (k0 = 1 when s has a leading zero). */
const suffixLadder = (s: string) => {
  const step = 10n ** BigInt(s.length), v = BigInt(s);
  return { step, v, k0: s.length > 1 && s[0] === "0" ? 1n : 0n };
};
/**
 * The prime ending in the suffix s nearest x (on a tie, the smaller): the candidates v + k·10^L searched outward from x,
 * nearer first, so the first prime found is the answer.
 */
export function nearestPrimeWithSuffix(x: Q, s: string): bigint {
  const { step, v, k0 } = suffixLadder(s);
  // The candidate at or below x, and the one above.
  let klo = Qn.floor(Qn.div(Qn.sub(x, q(v)), q(step)));
  if (klo < k0) klo = k0 - 1n;
  let khi = klo + 1n;
  for (;;) {
    const lo = v + klo * step, hi = v + khi * step;
    const below = klo >= k0 && Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x)) <= 0;
    const n = below ? lo : hi;
    if (isPrimeWithSuffix(n, s)) return n;
    if (below) klo--; else khi++;
  }
}
/** The first `count` primes ending in the suffix s, smallest first (the card's examples). */
export function primesWithSuffix(s: string, count: number): bigint[] {
  const { step, v, k0 } = suffixLadder(s), out: bigint[] = [];
  for (let k = k0; out.length < count; k++) { const n = v + k * step; if (isPrimeWithSuffix(n, s)) out.push(n); }
  return out;
}
/** The smallest prime with exactly `digits` digits ending in s, or null (none shorter than s; the witnesses). */
export function firstPrimeWithSuffix(s: string, digits: number): bigint | null {
  if (digits < s.length) return null;
  const { step, v } = suffixLadder(s), lo = digits === 1 ? 0n : 10n ** BigInt(digits - 1), hi = 10n ** BigInt(digits);
  for (let n = v + (lo > v ? (lo - v + step - 1n) / step : 0n) * step; n < hi; n += step) if (isPrimeWithSuffix(n, s)) return n;
  return null;
}
/**
 * A suffix drawn from the space (444 of them): its length 1, 2 or 3 with chance 3/10, 1/2, 1/5 (a longer suffix has
 * sparser targets: its first target is at least 10^(L−1)), the earlier digits uniform, the last uniform on 1, 3, 7, 9.
 */
export function drawSuffix(r: { below(k: number): number }): string {
  const u = r.below(10), L = u < 3 ? 1 : u < 8 ? 2 : 3;
  let s = "";
  for (let i = 1; i < L; i++) s += String(r.below(10));
  return s + String(PRIME_ENDINGS[r.below(4)]);
}

/** Distance from x to the nearest whole number. */
export const distanceToWhole = (x: Q): Q => Qn.abs(Qn.sub(x, q(nearestInteger(x))));

/** The whole number leaving r when divided by q nearest x; on a tie the one nearer 0 (so x → −x, r → q − r mirrors it). */
export function nearestResidue(x: Q, p: { q: number; r: number }): bigint {
  const qq = BigInt(p.q), r = BigInt(p.r);
  const lo = r + qq * Qn.floor(Qn.div(Qn.sub(x, q(r)), q(qq))), hi = lo + qq;
  const c = Qn.cmp(Qn.sub(x, q(lo)), Qn.sub(q(hi), x));
  return c < 0 ? lo : c > 0 ? hi : (lo < 0n ? -lo : lo) <= (hi < 0n ? -hi : hi) ? lo : hi;
}

/**
 * The residue ladder (Whole Crossing since 15 Nov): the numbers q^j × t with t leaving r when divided by q (t of either
 * sign, j ≥ 0). `level` is j for x on the ladder (x whole and nonzero), else null.
 */
export function ladderLevel(x: Q, p: { q: number; r: number }): { j: number; t: bigint } | null {
  if (x.d !== 1n || x.n === 0n) return null;
  const qq = BigInt(p.q);
  let t = x.n, j = 0;
  while (t % qq === 0n) { t /= qq; j++; }
  return ((t % qq) + qq) % qq === BigInt(p.r) ? { j, t } : null;
}
/**
 * The ladder number nearest x (any level; the nearer, then the higher level, on a tie): j, t, the number and its
 * distance. Levels up to the one past |x| are tried, so the answer is exact.
 */
export function nearestOnLadder(x: Q, p: { q: number; r: number }): { j: number; t: bigint; at: bigint; d: Q } {
  const qq = BigInt(p.q);
  let best: { j: number; t: bigint; at: bigint; d: Q } | null = null;
  for (let j = 0, s = 1n; ; j++, s *= qq) {
    const t = nearestResidue(Qn.div(x, q(s)), p), at = s * t, d = Qn.abs(Qn.sub(x, q(at)));
    if (!best || Qn.cmp(d, best.d) < 0 || (Qn.cmp(d, best.d) === 0 && j > best.j)) best = { j, t, at, d };
    if (Qn.cmp(q(s), Qn.add(Qn.abs(x), q(1))) > 0) break;
  }
  return best!;
}

/**
 * A whole number's place on a ladder in triangular levels of digits (Prime Landing, Prime Gradient) (the coordinator's "each further level dearer than the
 * last", 15 Nov: by size, 30 zooms by 7 reached a landing worth 227 bits, a straight hill in the number of digits): level
 * ℓ needs ℓ(ℓ + 1)/2 digits (1, 3, 6, 10, … digits), and within a level the bigger prime is higher:
 * u = ℓ + (D − ℓ(ℓ + 1)/2 + p/10^D) / (ℓ + 1) for p of D digits. It rises with p, so a bigger prime is still better.
 */
export function digitLevel(p: bigint): Q {
  const D = p.toString().length;
  let level = 0;
  while (((level + 1) * (level + 2)) / 2 <= D) level++;
  const rest = Qn.add(q(D - (level * (level + 1)) / 2), q(p, 10n ** BigInt(D)));
  return Qn.add(q(level), Qn.div(rest, q(level + 1)));
}

/**
 * A count's place in triangular levels (Whole Crossing's 5s): level ℓ needs ℓ(ℓ + 1)/2 of it (1, 3, 6, 10, …), and between
 * levels each one more counts 1/(ℓ + 1) of a level: u = ℓ + (j − ℓ(ℓ + 1)/2)/(ℓ + 1). 0 for none.
 */
export function triangularLevel(j: number): Q {
  let level = 0;
  while (((level + 1) * (level + 2)) / 2 <= j) level++;
  return Qn.add(q(level), Qn.div(q(j - (level * (level + 1)) / 2), q(level + 1)));
}

/**
 * What a triangular ladder's count means to a player (the Why line; the card says only "bigger is better, though each
 * extra counts for less"): "3 digits; the next big step is 6 digits". The big steps are the triangular numbers 1, 3, 6,
 * 10, …, where each step counts as much as the last whole level.
 */
export function stepNote(n: number, one: string, many: string): string {
  let level = 0;
  while (((level + 1) * (level + 2)) / 2 <= n) level++;
  const next = ((level + 1) * (level + 2)) / 2;
  return `${n} ${n === 1 ? one : many}; the next big step is ${next} ${many}`;
}
/** stepNote for a prime's digits (Prime Landing, Prime Gradient). */
export const digitNote = (p: bigint): string => stepNote((p < 0n ? -p : p).toString().length, "digit", "digits");
