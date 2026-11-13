/**
 * The goal card's "★ To score even higher" blocks (docs/layered-rules-design.md §4), without React: how a tiered card's
 * text splits into the base rule and its blocks, when a block opens by itself, and the bonus line of a closed block.
 * A card without `tiers` (every base draw, and every card stored before tiers existed) is its summary, unchanged.
 */
import { signedPoints, tierName, type Ordinal } from "@workspace/game-utilities";

/** One ★ block as the card carries it (game-utilities `CardTier`). */
export interface CardTierLike {
  id: string;
  heading: string;
  text: string;
  /** The block opens once the ordinal's first component reaches this. */
  gate: number;
  /** Where this tier's points sit in the ordinal, and how many components it has. */
  index: number;
  arity: number;
}

export interface CardTierSection {
  tier: CardTierLike;
  /** The block's one-line title: its heading and, when its text starts with its gate, the gate ("once you have …"). */
  title: string;
  /** The interaction's sentences. */
  body: string;
}

/** The card's text as the base rule and its ★ blocks. `summary` holds the whole text: the base, then each block from its ★ on. */
export function cardSections(card: { summary: string; tiers?: readonly CardTierLike[] }): { base: string; tiers: CardTierSection[] } {
  const tiers = card.tiers ?? [];
  if (!tiers.length) return { base: card.summary, tiers: [] };
  const star = card.summary.indexOf("★");
  return {
    base: (star < 0 ? card.summary : card.summary.slice(0, star)).trimEnd(),
    tiers: tiers.map(tier => {
      const gate = /^First get (.+?)\. (.+)$/s.exec(tier.text);
      return gate ? { tier, title: `${tier.heading} (once you have ${gate[1]})`, body: gate[2] } : { tier, title: tier.heading, body: tier.text };
    }),
  };
}

const asArray = (o: Ordinal | null | undefined): readonly number[] | null => (o === null || o === undefined ? null : typeof o === "number" ? [o] : o);
const tierSlice = (t: CardTierLike, ord: readonly number[]) => ord.slice(t.index, t.index + t.arity);

/**
 * Whether a block opens by itself for a board with this ordinal: the base has reached the gate, or the board already
 * holds a tier point. Without a board only a block with no gate is open; the player can always open one by hand.
 */
export function tierOpens(t: CardTierLike, ordinal: Ordinal | null | undefined): boolean {
  if (t.gate <= 0) return true;
  const ord = asArray(ordinal);
  return !!ord && (ord[0] >= t.gate || tierSlice(t, ord).some(x => x > 0));
}

/**
 * A closed block's line when the board already holds some of this tier: "Bonus: +2 to your tertiary rule score; open ★
 * to see why." Else null. It says "rule score", never the reserved word "points" (card-text.ts).
 */
export function tierBonus(t: CardTierLike, ordinal: Ordinal | null | undefined): string | null {
  const ord = asArray(ordinal);
  if (!ord) return null;
  const won = tierSlice(t, ord).map((x, k) => [x, t.index + k] as const).filter(([x]) => x > 0);
  return won.length
    ? `Bonus: ${won.map(([x, k]) => `${signedPoints(x)} to your ${tierName(k)} rule score`).join(", ")}; open ★ to see why.`
    : null;
}
