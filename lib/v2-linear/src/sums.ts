/**
 * How the exact valuation sums a line rule's level sets (owner decision 19, spec §7; analytic-calibration.md).
 *
 * On whole-number lines y = mx + c the stationary law is exactly π(m, c) = p(m)·p(c), p(n) = 2^−mixedInt(n), so a rung's
 * value is a sum over lines. A family declares here how its level sets can be summed, or nothing (the generic fallback,
 * an enumeration of the cheapest lines, then certifies only the low rungs):
 *
 * - `separable`: the layer's term depends on m alone or on c alone. When every dealt layer is separable the law of
 *   the score is a product of two 1D laws: exact to the top.
 * - `band`: every line whose main layer is at level `fromMain` or above (1 = the main layer's first threshold) has its
 *   c in the ranges given for its m. This is a contract: the valuation trusts it and test/sums.test.ts checks it
 *   against brute force for every family that declares one. The ranges may be wide (the valuation intersects them
 *   with the integers it enumerates) and may cover lines below fromMain (they are counted at their own level).
 */
import { isqrt } from "./numbers.ts";

/** c from lo to hi inclusive, or only its multiples of `step` when given. */
export interface CRange { readonly lo: bigint; readonly hi: bigint; readonly step?: bigint }

export interface LineSums<P> {
  readonly separable?: Readonly<Record<string, "m" | "c">>;
  readonly band?: { fromMain(p: P): number; ranges(m: bigint, p: P): readonly CRange[] };
}

const abs = (x: bigint) => (x < 0n ? -x : x);
const BIG = 10n ** 40n;
const PRIMES_TO = (n: number): bigint[] => { const out: bigint[] = []; for (let k = 2; k <= n; k++) if (out.every(p => BigInt(k) % p !== 0n)) out.push(BigInt(k)); return out; };
/** Every prime a whole-number line's coefficient can be within any budget the valuation uses (a prime p costs 4.1 + p/2 bits). */
const SMALL_PRIMES = PRIMES_TO(400);

/** c with c²/(2|m|) in [A − d, A + d]: both signs, from the square roots (rounded outwards). */
function areaBand(m: bigint, A: number, d: number): CRange[] {
  if (m === 0n) return [];
  const twoM = 2n * abs(m);
  // Work in quarters so that fractional d (½, ¼) stays exact: c² ∈ [2|m|(A − d), 2|m|(A + d)].
  const lo4 = twoM * BigInt(Math.round(4 * Math.max(0, A - d))), hi4 = twoM * BigInt(Math.round(4 * (A + d)));
  const loC = lo4 <= 0n ? 0n : isqrt((lo4 + 3n) / 4n), hiC = isqrt(hi4 / 4n) + 1n;
  return [{ lo: loC, hi: hiC }, { lo: -hiC, hi: -loC }];
}

/** The plans, by family id. Rules on other object types, or families absent here, use the generic fallback. */
export const lineSums: Readonly<Record<string, LineSums<any>>> = {
  "prime-gradient": { separable: { near: "m", prime: "m", cPrime: "c" } },
  "prime-landing": {
    separable: { landing: "c", "big-prime": "c", "prime-gradient": "m" },
    // c exactly a prime (the main layer's last threshold, 0): y(1) = m + c is then a sum over primes c.
    band: { fromMain: () => 4, ranges: () => SMALL_PRIMES.map(p => ({ lo: p, hi: p })) },
  },
  "m-meets-c": { band: { fromMain: () => 6, ranges: m => [{ lo: m - 1n, hi: m + 1n }] } },          // |m − c| ≤ 1
  "treasure": { band: { fromMain: () => 4, ranges: (m, p: { k: number; T: number }) => {       // |c + km − T| ≤ 4
    const c0 = BigInt(p.T) - BigInt(p.k) * m;
    return [{ lo: c0 - 4n, hi: c0 + 4n }];
  } } },
  "triangle-area": { band: { fromMain: () => 5, ranges: (m, p: { A: number }) => areaBand(m, p.A, 2) } },   // within 2
  "pythagorean-area": { band: { fromMain: () => 4, ranges: (m, p: { A: number }) => areaBand(m, p.A, 2) } }, // within 2
  "same-on-both-rulers": { band: { fromMain: () => 4, ranges: (m, p: { T: number }) => {      // |c/(1 − m) − T| ≤ 2
    if (m === 1n) return [];
    const k = 1n - m, a = BigInt(p.T - 2) * k, b = BigInt(p.T + 2) * k;
    return [{ lo: a < b ? a : b, hi: a < b ? b : a }];
  } } },
  "square-area": { band: { fromMain: (_p: object) => 9, ranges: m => {                        // the area exactly a square
    // c²/(2|m|) = r² needs 2|m| = t² and c a multiple of t.
    if (m === 0n) return [];
    const t = isqrt(2n * abs(m));
    return t * t === 2n * abs(m) ? [{ lo: -BIG, hi: BIG, step: t }] : [];
  } } },
};
