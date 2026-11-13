/**
 * The Objects panel's "why?" (pure, unit-tested): the heading of the open breakdown, and the one plain sentence shown
 * when there is no breakdown to show, so "why?" never opens an empty gap.
 */
const points = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }).replace("-", "−");

/**
 * "Why this grid gives you 301.5 points", "Why this grid takes 12 points from you", "Why this grid gives you no points".
 * Never the rank: the list re-ranks while the box is open, so a "#1" in the heading became "#4", "#9" under the finger.
 */
export function whyTitle(payoff: number, noun = "object"): string {
  const which = `this ${noun}`;
  if (points(Math.abs(payoff)) === "0") return `Why ${which} gives you no points`;
  return payoff < 0 ? `Why ${which} takes ${points(-payoff)} points from you` : `Why ${which} gives you ${points(payoff)} points`;
}

/** The open object's current rank, as a small note beside the heading: "now #4 by points". */
export const rankNote = (rank: number | null | undefined): string | null => (typeof rank === "number" ? `now #${rank} by points` : null);

/**
 * Why no breakdown shows: still loading (undefined), or the player holds no score on the object any more (null: it
 * left the world, or it is not theirs to see). Null when the object is there.
 */
export function whyUnavailable(object: unknown, noun = "object"): string | null {
  if (object === undefined) return `Loading this ${noun}'s points…`;
  if (object === null) return `There is nothing to explain for this ${noun} now: it is no longer in the world, so it gives nobody points.`;
  return null;
}
