/**
 * Witnesses for the ladder families' tail cap (the coordinator's amendment of trial 28, 15 Nov; CLAUDE.md "a value tail
 * never grows faster than the φ of the cheapest state that reaches it"): for the n-th unit of a ladder (n dealt primes
 * multiplied, n fives, n digits, a run of n), a few cheap lines that reach it. Their code length bounds the value of
 * every score at or below theirs: bits are rarity, and a state of code length φ has probability 2^−φ, so "at least this
 * score" is never rarer than φ. A witness need not be the cheapest; a cheaper one only tightens the cap.
 */
import { Qn, q, type Q } from "@workspace/v2-core";
import { fromMC, type LineState } from "./line.ts";
import { firstPrimeWithSuffix, isPrime } from "./numbers.ts";

const line = (m: Q | number, c: Q | number | bigint): LineState => ({
  lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "bigint" ? q(c) : typeof c === "number" ? q(c) : c)],
});
/** Lines crossing the x-axis at X: gradient ±1, and the gradient 1/X through y = −1. */
const crossingAt = (X: bigint): LineState[] => X === 0n ? [] : [line(1, -X), line(-1, X), line(Qn.inv(q(X)), -1)];
/** The smallest prime with n digits ending in k (n ≥ 1). */
function firstPrime(n: number, k: number): bigint | null {
  if (n === 1) return isPrime(BigInt(k)) ? BigInt(k) : null;
  let p = 10n ** BigInt(n - 1) + BigInt(k);
  for (let i = 0; i < 100_000; i++, p += 10n) if (isPrime(p)) return p;
  return null;
}

/** Smooth Intercept: n of the dealt primes multiplied, the smallest such number being p₁ⁿ. */
export const smoothWitness = (p: { primes: number[] }, n: number): LineState[] => {
  const N = BigInt(Math.min(...p.primes)) ** BigInt(n);
  return [line(0, N), line(1, N), line(1, -N)];
};
/** Whole Crossing: a crossing 5ⁿ·t with t leaving r (t = r or r − 5). */
export const crossingWitness = (p: { q: number; r: number }, n: number): LineState[] =>
  [BigInt(p.r), BigInt(p.r - p.q)].flatMap(t => crossingAt(BigInt(p.q) ** BigInt(n) * t));
/** Prime Landing: a crossing on the smallest n-digit prime ending in k (minus it on the mirror). */
export const landingWitness = (p: { ends: number; side?: number }, n: number): LineState[] => {
  const pr = firstPrime(n, p.ends);
  return pr === null ? [] : crossingAt((p.side ?? 1) === -1 ? -pr : pr);
};
/** Prime Gradient: the gradient on the smallest n-digit prime ending in the suffix, either sign (none shorter than it). */
export const gradientWitness = (p: { suffix: string }, n: number): LineState[] => {
  const pr = firstPrimeWithSuffix(p.suffix, n);
  return pr === null ? [] : [line(q(pr), 0), line(q(pr), 1), line(q(-pr), 0)];
};
/** Divisibility Ladder: a run of n needs lcm(1, …, n) to divide c. */
export const divisibilityWitness = (_p: object, n: number): LineState[] => {
  let L = 1n;
  const g = (a: bigint, b: bigint): bigint => (b === 0n ? a : g(b, a % b));
  for (let k = 1n; k <= BigInt(n); k++) L = (L / g(L, k)) * k;
  return [line(0, L), line(1, L)];
};

/**
 * Prime Staircase: y(0), y(1), … a run of n different primes ending in k, found by search over y = d·x + a with a a prime
 * ending in k below 5,000 and d a multiple of 10 up to 3,000 (so every term keeps the ending): for each run length, the
 * lines reaching it (e.g. y = 210x + 199: ten primes ending in 9). Computed once per ending and side.
 */
const staircaseCache = new Map<string, Map<number, LineState[]>>();
function staircaseRuns(k: number, side: number): Map<number, LineState[]> {
  const key = `${k}/${side}`;
  const hit = staircaseCache.get(key);
  if (hit) return hit;
  const runs = new Map<number, LineState[]>();
  for (let a = BigInt(k); a < 5000n; a += 10n) {
    if (!isPrime(a)) continue;
    for (let d = 10n; d <= 3000n; d += 10n) {
      let n = 0;
      for (let x = 0n; x < 30n && isPrime(a + d * x); x++) n++;
      if (n < 2) continue;
      // The mirror reads y(0), y(−1), y(−2), …: the same run on y = −d·x + a.
      const s = line(side === -1 ? -Number(d) : Number(d), a);
      for (let r = 2; r <= n; r++) { const l = runs.get(r) ?? []; if (l.length < 6) { l.push(s); runs.set(r, l); } }
    }
  }
  staircaseCache.set(key, runs);
  return runs;
}
export const staircaseWitness = (p: { ends: number; side?: number }, n: number): LineState[] =>
  staircaseRuns(p.ends, p.side ?? 1).get(n) ?? [];
