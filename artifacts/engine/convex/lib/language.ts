/**
 * Agent languages in the engine. The list is game-core's LANGUAGE_SPECS (one entry per language), so adding a language
 * there also extends every validator built here.
 */
import { v, type VLiteral } from "convex/values";
import { LANGUAGES, RETIRED_LANGUAGES, allowedLanguages, type GameSettings, type Language, type StoredLanguage } from "@workspace/game-core";
export type { StoredLanguage } from "@workspace/game-core";

/** One supported agent language. */
export const languageV = v.union(...(LANGUAGES.map(l => v.literal(l)) as [VLiteral<Language>, VLiteral<Language>]));

/** A language a stored agent may carry: a supported one, or a retired one (game-core RETIRED_LANGUAGES). */
export const storedLanguageV = v.union(...([...LANGUAGES, ...RETIRED_LANGUAGES].map(l => v.literal(l)) as [VLiteral<StoredLanguage>, VLiteral<StoredLanguage>]));

/**
 * The language a stored agent is written in. Agents summoned before a game allowed several languages carry none: they
 * were written in the game's one language, which `allowedLanguages` reads from old and new settings alike.
 */
export function agentLanguage(agent: { language?: StoredLanguage }, settings: GameSettings): StoredLanguage {
  return agent.language ?? allowedLanguages(settings)[0] ?? "python";
}
