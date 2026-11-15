/**
 * Which two-line rules must not be seated together (the coordinator's guard on the valuation ladders: "two seated rules
 * must not both be raised by the same stretch"; owner decision 30: an unbounded hill needs an adversary, not a partner).
 * Measured on the triangular-ladder pool (docs/engine-v2/two-line-systems.md §9): the PMI matrix found 124 aligned
 * pairs of rules (> 2 bits), all among Whole Answer, High Start, Right Angle and Forty-Five, nearly all reading the
 * same residue r; the tension matrix's largest joint gain of one repeated move was Gap Ratio and Divide By together
 * (+10.9 bits each, a turn making the number to divide by 9 and the gaps' ratio a power of 3).
 *
 * Forbidden, so the dealer never seats them while the pool allows (deal.ts takes the first shuffle without one):
 * - one family twice (they share their main part);
 * - two of Whole Answer, High Start and Right Angle with the same r (each reads a y that one stretch or translate moves
 *   for both), or whose classes meet near zero (a number n, 0 < |n| ≤ 3, in both: y = −2 leaves 9 by 11 and 5 by 7;
 *   small numbers are the law's commonest, PMI 2.0–2.3 bits); Whole Answer with Forty-Five the same way (Forty-Five
 *   reads |n|);
 * - two valuation ladders (Whole Answer, High Start, Steep Ratio) with the same q: a stretch by q climbs both;
 * - Gap Ratio with Divide By when their k are powers of one base (2 and 4; 3 and 9): a turn climbs both.
 */
export interface SeatedPairRule { family: string; params?: unknown }

const SAME_Y = ["whole-answer", "high-start", "right-angle"];
/** What a y-reading family's residue reads of a number n near the corner (Forty-Five: |x| + |y| at (0, n)). */
const READS: Readonly<Record<string, (n: number) => number>> = {
  "whole-answer": n => n, "high-start": n => n, "right-angle": n => n, "forty-five": n => Math.abs(n),
};
const mod = (n: number, q: number) => ((n % q) + q) % q;
/** Whether some n, 0 < |n| ≤ 3, is in both rules' classes. */
function meetNearZero(a: SeatedPairRule, b: SeatedPairRule, qa: number, ra: number, qb: number, rb: number): boolean {
  for (let n = -3; n <= 3; n++) if (n !== 0 && mod(READS[a.family]!(n), qa) === ra && mod(READS[b.family]!(n), qb) === rb) return true;
  return false;
}
const VALUATION = ["whole-answer", "high-start", "steep-ratio"];
const num = (p: unknown, k: string): number | undefined => {
  const v = (p as Record<string, unknown> | undefined)?.[k];
  return typeof v === "number" ? v : undefined;
};
/** The product of the distinct primes of k (k's base: 4 → 2, 9 → 3, 6 → 6). */
function radical(k: number): number {
  let r = 1;
  for (let p = 2; p * p <= k; p++) if (k % p === 0) { r *= p; while (k % p === 0) k /= p; }
  return k > 1 ? r * k : r;
}
const both = (a: SeatedPairRule, b: SeatedPairRule, x: string, y: string) =>
  (a.family === x && b.family === y) || (a.family === y && b.family === x);

/** Whether two seated pair rules must not meet. A rule with unknown parameters clashes only as the same family. */
export function pairClash(a: SeatedPairRule, b: SeatedPairRule): boolean {
  if (a.family === b.family) return true;
  const [qa, qb, ra, rb, ka, kb] = [num(a.params, "q"), num(b.params, "q"), num(a.params, "r"), num(b.params, "r"), num(a.params, "k"), num(b.params, "k")];
  const known = qa !== undefined && qb !== undefined && ra !== undefined && rb !== undefined;
  if (SAME_Y.includes(a.family) && SAME_Y.includes(b.family) && known && (ra === rb || meetNearZero(a, b, qa, ra, qb, rb))) return true;
  if (both(a, b, "whole-answer", "forty-five") && known && meetNearZero(a, b, qa, ra, qb, rb)) return true;
  if (VALUATION.includes(a.family) && VALUATION.includes(b.family) && qa !== undefined && qa === qb) return true;
  if (both(a, b, "double-gap", "no-fractions") && ka !== undefined && kb !== undefined && radical(ka) === radical(kb)) return true;
  return false;
}

/** The forbidden pairs among seated rules, as "a × b" (each pair once, in seat order). */
export function pairClashes(rules: readonly SeatedPairRule[]): string[] {
  const out: string[] = [];
  const name = (r: SeatedPairRule) => (r.params === undefined ? r.family : `${r.family} ${JSON.stringify(r.params)}`);
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) if (pairClash(rules[i]!, rules[j]!)) out.push(`${name(rules[i]!)} × ${name(rules[j]!)}`);
  return out;
}
/** A table's seating cost: 1000 per forbidden pair, as the other seating rules (lower is better; 0 is a perfect table). */
export const pairSeatingCost = (rules: readonly SeatedPairRule[]): number => 1000 * pairClashes(rules).length;
