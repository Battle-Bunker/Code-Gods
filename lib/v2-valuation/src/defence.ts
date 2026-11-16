/**
 * Defence goals' arithmetic (v1, restored; archive lib/grid-lab/docs/defence-goals.md §3–§4, owner-decisions call 1):
 * a seat dealt a defence goal holds signed bits on each object,
 *
 *   n = s⁺ − w·(η(h) − E_π η(h)),
 *
 * s⁺ the reward rule's bits, h the penalty's badness bits (the rarity of "at least this bad", from the penalty
 * family's own value function: bigger is worse), η the soft hinge at the median, E_π the expectation under the
 * stationary law (so a defence goal is neither a handicap nor a free lunch on fresh objects), and w the setting
 * `penaltyWeight` (v1's default 1). Points stay n × max(0, others): no farming of shared negatives (v1's floored mode).
 */

/** The soft hinge at the median: η(s) = log₂(1 + 2^(s−1)) − log₂ 1.5; η(0) = 0, η(1) ≈ 0.42, ≈ s − 1.58 when bad. */
export const hinge = (s: number): number => {
  const x = s - 1;
  // log₂(1 + 2^x) without overflow for large x.
  const softplus = x > 30 ? x + Math.log2(1 + 2 ** -x) : Math.log2(1 + 2 ** x);
  return softplus - Math.log2(1.5);
};

/**
 * E_π η(h) from a penalty's value-function knots (worst first: bits non-decreasing, the first 0): each knot's bits b
 * is −log₂ of the share of states at least that bad, so the mass between two knots is 2^−b_k − 2^−b_{k+1}, and the last
 * knot keeps its tail.
 */
export function meanHinge(knots: readonly { readonly bits: number }[]): number {
  let mean = 0;
  for (let k = 0; k < knots.length; k++) {
    const p = 2 ** -knots[k]!.bits, next = k + 1 < knots.length ? 2 ** -knots[k + 1]!.bits : 0;
    mean += hinge(knots[k]!.bits) * Math.max(0, p - next);
  }
  return mean;
}

/** A seat's signed bits: the reward's bits less w times the penalty's hinge above its mean. */
export const defenceNet = (rewardBits: number, penaltyBits: number, weight: number, meanH: number): number =>
  rewardBits - weight * (hinge(penaltyBits) - meanH);
