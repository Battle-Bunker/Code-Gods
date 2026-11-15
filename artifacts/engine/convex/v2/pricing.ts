/**
 * What programs cost (pure, any runtime): a summon at full price, a replace for the change alone, each at its bits times
 * the game's power ÷ 64 (v2-economy summonPriceScale: the coordinator's call on decision 21, so a starter costs the same
 * seconds of full power whatever the power).
 */
import { editBits, summonBits } from "@workspace/v2-agents/pure";
import { summonPriceScale } from "@workspace/v2-economy";

type Language = "typescript" | "python";

/** A game's factor on summon and edit prices (its power ÷ 64). */
export const priceScaleOf = (game: { settings: { economy: { powerPerSecond: number } } }) => summonPriceScale(game.settings.economy.powerPerSecond);
/** The summon price of a program, in energy, at a game's price scale. */
export const priceOf = (language: Language, source: string, scale: number) => scale * summonBits(language, source).energy;
/**
 * What replacing an agent's program costs (owner decision 21): only the change, priced as a token-level edit at the
 * summon rate (comments and layout free, never more than the new program's full price); a change of language is a
 * new program, at its full price.
 */
export const editPriceOf = (current: { language: Language; source: string }, language: Language, source: string, scale: number) =>
  current.language === language ? scale * editBits(language, current.source, source).energy : priceOf(language, source, scale);
