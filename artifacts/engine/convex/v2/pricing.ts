/** What programs cost (pure, any runtime): a summon at full price, a replace for the change alone. */
import { editBits, summonBits } from "@workspace/v2-agents/pure";

type Language = "typescript" | "python";

/** The summon price of a program, in energy. */
export const priceOf = (language: Language, source: string) => summonBits(language, source).energy;
/**
 * What replacing an agent's program costs (owner decision 21): only the change, priced as a token-level edit at the
 * summon rate (comments and layout free, never more than the new program's full price); a change of language is a
 * new program, at its full price.
 */
export const editPriceOf = (current: { language: Language; source: string }, language: Language, source: string) =>
  current.language === language ? editBits(language, current.source, source).energy : priceOf(language, source);
