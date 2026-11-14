/**
 * The game's quantities in player words (ux-lessons 2.1, 3.9): points, rarity in bits (each bit = twice as rare),
 * ⚡ energy, power, and how a score is made. Pure.
 *
 * One number rule for every measure on screen: 2 decimal places (`num`, which is v2-views' `fmtNum`, so the faces and
 * the panes round the same way). A line's score is written once, by `scoreFormula`: the product shown is the product of
 * the full values, and "≈" stands in for "=" when the shown figures do not multiply to it.
 */
import { BITS_HELP, fmtBits, fmtNum } from "@workspace/v2-views/format";

/** 2 decimal places, en-US grouping, a true minus sign, never "−0.00": every measure a player reads. */
export const num = fmtNum;
/** "Each bit = twice as rare." */
export { BITS_HELP };

/** "12.50 points". */
export const pointsText = (x: number) => `${num(x)} point${num(x) === "1.00" ? "" : "s"}`;
/** "3.40 bits". */
export const bitsText = fmtBits;
/**
 * "123.40 ⚡"; energy a little below zero (an agent or a store spending as fast as it earns) reads "about 0 ⚡", since a
 * bare "−8.90 ⚡" read as broken to a first-time player (the exact figure goes in the tooltip).
 */
export const energyText = (x: number) => (x < 0 && x > -50 ? "about 0 ⚡" : `${num(x)} ⚡`);
/** The exact figure, for the tooltip under "about 0 ⚡". */
export const exactEnergy = (x: number) => `${num(x)} ⚡`;
/** Power: "2.50 ⚡ a second". */
export const powerText = (x: number) => `${num(x)} ⚡ a second`;
/** "1st", "2nd", "3rd", "4th". */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
/** "m:ss". */
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

// ------------------------------------------------------------------ how a score is made

/** The one-sentence explanation, where a beginner first meets a score (and the assistant's primer says the same). */
export const SCORE_SENTENCE = "You score on a line when it's rare for you and rare for someone else at the same time: your rarity × theirs. Your total adds up all the lines.";
/** Under a total: what it is made of. */
export const TOTAL_NOTE = "Your total is the sum of your points on every line.";
/** Under the standings: the same for every player. */
export const TOTALS_NOTE = "Each total is the sum of that player's points on every line.";
/** After either note, when a won bid's handicap (the "−N%" beside a total) came off it. */
export const HANDICAP_NOTE = "A won bid's share (the −% beside a total) comes off that sum.";
/** A total's note, with the handicap's when it applies. */
export const totalNote = (note: string, handicapped: boolean) => (handicapped ? `${note} ${HANDICAP_NOTE}` : note);

/** A measure in hundredths, as shown. */
const shown = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100);

/**
 * A line's score: "your 4.24 bits × others' 12.03 bits = 51.01 points" (others' = the other players' bits on the line
 * added together). The product is the full values' product, rounded; "≈" when the shown factors do not multiply to it.
 */
export function scoreFormula(yours: number, others: number): string {
  const product = yours * others;
  const sign = Math.round(shown(yours) * shown(others) / 100) === shown(product) ? "=" : "≈";
  return `your ${bitsText(yours)} × others' ${bitsText(others)} ${sign} ${pointsText(product)}`;
}

/** Why a line you find rare scores nothing: nobody else does (others' bits show 0.00). Null otherwise. */
export function onlyYouNote(yours: number, others: number): string | null {
  return shown(yours) > 0 && shown(others) === 0
    ? "Only you care about this line, so it scores nothing yet: it needs someone else to find it rare too."
    : null;
}

// ------------------------------------------------------------------ places

/**
 * Ranks as a player reads them: totals that show the same share a rank and the next rank skips ("1st, 2nd, 2nd, 4th").
 * The server ranks every row apart; two players holding the same lines would read "2nd" and "3rd" with one total.
 */
export function sharedRanks<R extends { net: number; rank: number }>(rows: readonly R[]): R[] {
  return rows.map(r => ({ ...r, rank: 1 + rows.filter(o => shown(o.net) > shown(r.net)).length }));
}
/** Whether another row shares this row's place. */
export const isTied = <R extends { rank: number }>(rows: readonly R[], row: R) => rows.some(r => r !== row && r.rank === row.rank);
/** Beside a shared place. */
export const TIE_NOTE = "Equal totals share a place.";
