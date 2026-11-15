/**
 * How the exact valuation sums a line rule's value function (owner decision 19, spec §7; analytic-calibration.md).
 *
 * On whole-number lines y = mx + c the stationary law is exactly π(m, c) = p(m)·p(c), p(n) = 2^−mixedInt(n), so a rung's
 * value is a sum over lines. A family declares here how its sets of lines at least as good as a score can be summed, or
nothing (the generic fallback, an enumeration of the cheapest lines):
 *
 * - `separable`: the layer's term depends on m alone or on c alone. When every dealt layer is separable the law of
 *   the score is a product of two 1D laws: exact to the top.
 * - `bands`: for each band, every line whose main layer's utility (its score's primary: minus the distance for a
 *   distance) is `atLeast` or more has its c in the ranges given for its m. This is a contract: the valuation trusts it
 *   and test/sums.test.ts checks it against brute force for every family that declares one. The ranges may be wide (the
 *   valuation intersects them with the integers it enumerates) and may cover worse lines (they are counted at their own
 *   score).
 */
import { q, type Q } from "@workspace/v2-core";
import { isqrt } from "./numbers.ts";

/** c from lo to hi inclusive, or only its multiples of `step` when given. */
export interface CRange { readonly lo: bigint; readonly hi: bigint; readonly step?: bigint }

/**
 * A band (see the header). `points`: its ranges are single points, evaluated whatever their size, so only the lines with
 * m beyond the budget are left outside. "same": the same points for every m (Prime Staircase's primes), bounded by
 * T(m) times their mass. "one-per-m": one point for each m (c fixed by m, as where the main layer is exact), bounded by
 * T(m) times the dearest point's largest possible mass.
 */
export interface Band<P> {
  /** The primary utility from which the band holds. */
  atLeast(p: P): Q;
  ranges(m: bigint, p: P): readonly CRange[];
  readonly points?: "same" | "one-per-m";
}

export interface LineSums<P> {
  readonly separable?: Readonly<Record<string, "m" | "c">>;
  /** One or more bands; each score takes the tightest interval any of them gives. */
  readonly bands?: readonly Band<P>[];
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
  "prime-gradient": { separable: { near: "m", prime: "m", "c-spf": "c", "c-gpf": "c" } },
  "prime-landing": { separable: { landing: "c", "big-prime": "c", "m-spf": "m", "m-gpf": "m" } },
  // n | y(n) = mn + c exactly when n | c on whole-number lines: the run depends on c alone.
  "divisibility-ladder": { separable: { ladder: "c", "m-spf": "m", "m-gpf": "m", steep: "m", "m-prime": "m" } },
  "m-meets-c": { bands: [{ atLeast: () => q(-1), ranges: m => [{ lo: m - 1n, hi: m + 1n }] }] },        // |m − c| ≤ 1
  "treasure": { bands: [
    { atLeast: () => q(-4), ranges: (m, p: { k: number; T: number }) => {                     // |c + km − T| ≤ 4
      const c0 = BigInt(p.T) - BigInt(p.k) * m;
      return [{ lo: c0 - 4n, hi: c0 + 4n }];
    } },
    // y(k) = T exactly (distance 0): c = T − km, one c for each m, summed at any size.
    { atLeast: () => q(0), points: "one-per-m", ranges: (m, p: { k: number; T: number }) => {
      const c0 = BigInt(p.T) - BigInt(p.k) * m;
      return [{ lo: c0, hi: c0 }];
    } },
  ] },
  "triangle-area": { bands: [{ atLeast: () => q(-2), ranges: (m, p: { A: number }) => areaBand(m, p.A, 2) }] },   // within 2
  "same-on-both-rulers": { bands: [
    { atLeast: () => q(-2), ranges: (m, p: { T: number }) => {                                 // |c/(1 − m) − T| ≤ 2
      if (m === 1n) return [];
      const k = 1n - m, a = BigInt(p.T - 2) * k, b = BigInt(p.T + 2) * k;
      return [{ lo: a < b ? a : b, hi: a < b ? b : a }];
    } },
    // The unchanged number exactly T (distance 0): c = T(1 − m), one c for each m.
    { atLeast: () => q(0), points: "one-per-m", ranges: (m, p: { T: number }) => {
      if (m === 1n) return [];
      const c0 = BigInt(p.T) * (1n - m);
      return [{ lo: c0, hi: c0 }];
    } },
  ] },
  "square-area": { bands: [{ atLeast: (_p: object) => q(0), ranges: m => {                      // the area exactly a square
    // c²/(2|m|) = r² needs 2|m| = t² and c a multiple of t.
    if (m === 0n) return [];
    const t = isqrt(2n * abs(m));
    return t * t === 2n * abs(m) ? [{ lo: -BIG, hi: BIG, step: t }] : [];
  } }] },
  // Whole Crossing has no plan since its dealt residue (the crossing near a whole number leaving r when divided by q):
  // valued by sampling (owner decision 22).
  // A run of one or more different primes ending in the dealt digit from y(0) needs c such a prime: every score from a
  // run of 1 is a sum over those primes.
  "prime-staircase": { bands: [{ atLeast: () => q(1), points: "same",
    ranges: (_m: bigint, p: { ends: number }) => SMALL_PRIMES.filter(x => x % 10n === BigInt(p.ends)).map(x => ({ lo: x, hi: x })) }] },
};
