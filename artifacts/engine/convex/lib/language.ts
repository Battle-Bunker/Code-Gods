/**
 * Agent languages in the engine. The list is game-core's LANGUAGE_SPECS (one entry per language), so adding a language
 * there also extends every validator built here.
 */
import { v, type VLiteral } from "convex/values";
import { LANGUAGES, allowedLanguages, type GameSettings, type Language } from "@workspace/game-core";

/** One supported agent language. */
export const languageV = v.union(...(LANGUAGES.map(l => v.literal(l)) as [VLiteral<Language>, VLiteral<Language>]));

/**
 * The language a stored agent is written in. Agents summoned before a game allowed several languages carry none: they
 * were written in the game's one language, which `allowedLanguages` reads from old and new settings alike.
 */
export function agentLanguage(agent: { language?: Language }, settings: GameSettings): Language {
  return agent.language ?? allowedLanguages(settings)[0] ?? "python";
}
