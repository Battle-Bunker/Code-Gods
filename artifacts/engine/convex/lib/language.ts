/**
 * Agent languages in the engine. The list is game-core's LANGUAGE_SPECS (one entry per language), so adding a language
 * there also extends every validator built here.
 */
import { v, type VLiteral } from "convex/values";
import { LANGUAGES, allowedLanguages, type GameSettings, type Language } from "@workspace/game-core";

/** One supported agent language. */
export const languageV = v.union(...(LANGUAGES.map(l => v.literal(l)) as [VLiteral<Language>, VLiteral<Language>]));

/**
 * Languages agents were once written in and no longer can be: stored agents of past games keep them (their history),
 * and the engine refuses to run them (engine/runtime.ts act). Haskell was retired on 2026-11-02 (stored settings
 * drop it: game-core upgradeStoredSettings, migrations.ts retireHaskell).
 */
export const RETIRED_LANGUAGES = ["haskell"] as const;
export type RetiredLanguage = typeof RETIRED_LANGUAGES[number];
export type StoredLanguage = Language | RetiredLanguage;
/** A language a stored agent may carry: a supported one, or a retired one. */
export const storedLanguageV = v.union(...([...LANGUAGES, ...RETIRED_LANGUAGES].map(l => v.literal(l)) as [VLiteral<StoredLanguage>, VLiteral<StoredLanguage>]));

/**
 * The language a stored agent is written in. Agents summoned before a game allowed several languages carry none: they
 * were written in the game's one language, which `allowedLanguages` reads from old and new settings alike.
 */
export function agentLanguage(agent: { language?: StoredLanguage }, settings: GameSettings): StoredLanguage {
  return agent.language ?? allowedLanguages(settings)[0] ?? "python";
}
