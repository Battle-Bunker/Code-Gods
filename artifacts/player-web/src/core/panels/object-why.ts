/**
 * The Objects panel's "why?" (pure, unit-tested): the heading of the open breakdown, and the one plain sentence shown
 * when there is no breakdown to show, so "why?" never opens an empty gap.
 */
const points = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }).replace("-", "−");

/** "Why #3 gives you 301.5 points", "Why #7 takes 12 points from you", "Why this grid gives you no points". */
export function whyTitle(rank: number | null | undefined, payoff: number, noun = "object"): string {
  const which = typeof rank === "number" ? `#${rank}` : `this ${noun}`;
  if (points(Math.abs(payoff)) === "0") return `Why ${which} gives you no points`;
  return payoff < 0 ? `Why ${which} takes ${points(-payoff)} points from you` : `Why ${which} gives you ${points(payoff)} points`;
}

/**
 * Why no breakdown shows: still loading (undefined), or the player holds no score on the object any more (null: it
 * left the world, or it is not theirs to see). Null when the object is there.
 */
export function whyUnavailable(object: unknown, noun = "object"): string | null {
  if (object === undefined) return `Loading this ${noun}'s points…`;
  if (object === null) return `There is nothing to explain for this ${noun} now: it is no longer in the world, so it gives nobody points.`;
  return null;
}
