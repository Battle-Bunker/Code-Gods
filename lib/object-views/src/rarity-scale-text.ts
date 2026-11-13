/**
 * How a rule score becomes ✨ rarity, in plain words (the goal card): the example board's line, the rows of the scale
 * ("How rare is each rule score?", game-utilities rarityScale) and the one sentence that says what ✨ means. No "bits",
 * no logarithms. Framework-free, so it is unit tested under Node.
 */
import { formatCount, oneInN } from "./rarity.ts";

const minus = (text: string) => text.replace(/-/g, "−");
/** "6.4", "30.4", "0": ✨ to one decimal. */
export const sparkle = (bits: number): string => {
  const r = Math.round((Number.isFinite(bits) ? bits : 0) * 10) / 10;
  return minus(r === 0 ? "0" : r.toFixed(1));
};
/** Rarity that shows as ✨ 0 is "common". */
const common = (bits: number) => sparkle(bits) === "0";

/** "(7, 2)" for a rule score with parts, "7" for a plain one. */
export const ruleScoreTuple = (ordinal: readonly number[]): string => minus(ordinal.length > 1 ? `(${ordinal.join(", ")})` : String(ordinal[0] ?? 0));
/** A scale row's rule score: its primary value only, "(2, …)" for a rule with parts, "2" for a plain one. */
const primaryOnly = (ordinal: readonly number[]): string => minus(ordinal.length > 1 ? `(${ordinal[0]}, …)` : String(ordinal[0] ?? 0));

/** "98.8%": the share of random boards a board with this ✨ is rarer than, never rounded up; "more than 99.99%" past that. */
export function rarerThanPercent(bits: number): string {
  const share = 100 * (1 - 2 ** -Math.max(0, bits));
  if (share > 99.99) return "more than 99.99%";
  const places = share >= 99 ? 2 : 1, step = 10 ** places;
  return `${(Math.floor(share * step) / step).toFixed(places).replace(/\.?0+$/, "")}%`;
}

export const HIGHER_IS_RARER = "A higher rule score is rarer, and rarer is worth more.";
/** "This board's rule score (7, 2) is rarer than 98.8% of random boards: ✨ 6.4. A higher rule score is rarer, and rarer is worth more." */
export function exampleRarityLine(ordinal: readonly number[], bits: number, noun = "board"): string {
  const score = ruleScoreTuple(ordinal);
  return common(bits)
    ? `This ${noun}'s rule score ${score} is common among random ${noun}s: ✨ 0. ${HIGHER_IS_RARER}`
    : `This ${noun}'s rule score ${score} is rarer than ${rarerThanPercent(bits)} of random ${noun}s: ✨ ${sparkle(bits)}. ${HIGHER_IS_RARER}`;
}

/** One row of the scale: "(2, …) 1 in 85: ✨ 6.4", "(0, …) common: ✨ 0". */
export function scaleRowText(row: { readonly ordinal: readonly number[]; readonly bits: number }): string {
  return common(row.bits) ? `${primaryOnly(row.ordinal)} common: ✨ 0` : `${primaryOnly(row.ordinal)} 1 in ${formatCount(oneInN(row.bits))}: ✨ ${sparkle(row.bits)}`;
}

/** What ✨ means, said once where the scale is. */
export const SPARKLE_MEANS = "✨ 10 means 1 board in about 1,000 is this good; each +1 is twice as rare.";
export const sparkleMeans = (noun = "board"): string => SPARKLE_MEANS.replace("board", noun);
