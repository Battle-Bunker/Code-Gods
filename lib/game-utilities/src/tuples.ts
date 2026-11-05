/**
 * Points tuples, the player-facing vocabulary (owner 2026-11-03): a rule scores a board as a tuple of points, primary
 * first, then secondary, tertiary…; tuples compare primary first, then secondary, and so on, and a player's payoff is
 * how rare their tuple is. Rule texts, score boxes, board totals and the payoff breakdown all speak this one way, and
 * never in terms of winning or breaking ties (glossary term "points-tuple").
 */

/** The tiers' names, in order. */
export const TIER_NAMES = ["primary", "secondary", "tertiary", "quaternary"] as const;

/** A tier's name: "primary", "secondary", … ("tier 5" past the named ones). */
export const tierName = (k: number): string => TIER_NAMES[k] ?? `tier ${k + 1}`;

/** A number with a real minus sign ("−3"). */
export const minusText = (n: number) => (n < 0 ? `−${-n}` : String(n));
const minus = minusText;
/** A change with its sign ("+1", "−3", "0"). */
export const signedPoints = (n: number) => (n > 0 ? `+${n}` : minus(n));

/** What a unit adds to the board, as a tuple of signed changes: "(+1, 0)", "(0, −3)"; one tier: "(+1)". */
export const impactText = (points: readonly number[]): string => `(${points.map(signedPoints).join(", ")})`;

/** A board's score as a tuple: "(4, −10)"; one tier: "(4)". */
export const tupleText = (points: readonly number[]): string => `(${points.map(minus).join(", ")})`;

/**
 * "1 primary point", "3 secondary points"; a rule with one tier says plain "points" ("2 points"). `n` may be a phrase
 * ("as many", "1").
 */
export function tierPoints(n: number | string, k: number, tiers: number): string {
  const plural = typeof n === "number" ? Math.abs(n) !== 1 : n !== "1";
  return `${n}${tiers > 1 ? ` ${tierName(k)}` : ""} point${plural ? "s" : ""}`;
}
