/**
 * Line turnover's words (engine docs/engine-v2/retirement-design.md): at most `liveCap` lines are live, new ones
 * arrive on a schedule, and the oldest retires. Pure.
 */
import { clock, pointsText } from "../core/words.ts";

export interface TurnoverHeader { liveCap: number; banked: boolean; birthSeconds: number | null }
type Word = { one: string; many: string; One: string };

/** World seconds a newborn line is marked new. */
export const NEW_FOR_SECONDS = 30;

/** The rule, said once above the lines; null when lines never retire. */
export function turnoverNote(t: TurnoverHeader | null | undefined, word: Word): string | null {
  if (!t) return null;
  const fate = t.banked ? "its points stay in your total" : "its points leave your total";
  const pace = t.birthSeconds ? `A new ${word.one} arrives every ${Math.round(t.birthSeconds)} s. ` : "";
  return `At most ${t.liveCap} ${word.many} are live. ${pace}Once ${t.liveCap} are live, each new ${word.one} retires the oldest: ${fate}.`;
}

/** Whether a line was born in the last NEW_FOR_SECONDS (never a starting line, never outside a live game). */
export const isNewLine = (bornAt: number, worldNow: number | null) => worldNow !== null && bornAt > 0 && worldNow - bornAt < NEW_FOR_SECONDS;

/**
 * "retired at 2:05 · banked 42.25 points" (or "…, no longer counted" when retired points leave the totals). While the
 * game runs the figure is what the player last saw (paid looks, blurred sums), so it says so instead of "banked".
 */
export function bankedWords(o: { retiredAt: number; points: number }, banked: boolean, approx = false): string {
  const figure = approx ? `about ${pointsText(o.points)} as you last saw it` : banked ? `banked ${pointsText(o.points)}` : pointsText(o.points);
  return `retired at ${clock(o.retiredAt)} · ${figure}${banked ? "" : ", no longer counted"}`;
}
