/**
 * `Part.heat` (explain/model.ts): how close a unit that scores nothing is to scoring, from 0 (nowhere near) to just
 * under 1 (one away). It is never shown to a player; the goal card's example search reads it as a gradient, so that a
 * ★ tier whose units are hard to hit by chance still gets an example board that scores it (`climbTier` in
 * explain/index.ts). Only the ★ tiers' units set it, in explain/tier-lenses.ts and tier-lenses-more.ts — which both
 * import this, so it lives in its own module rather than in either of them.
 */

/**
 * A unit may have to meet several conditions in turn (these two boxes must share exactly one pair, and then add up to
 * x): `met` of `conditions` already hold and the next is `away` off. Meeting one more condition always beats closing a
 * gap, so a search that follows heat uphill never trades the link away to bring the sum nearer.
 */
export const heatOf = (away: number, met = 0, conditions = 1): number =>
  (met + 1 / (1 + Math.max(0, away))) / (conditions + 1);
