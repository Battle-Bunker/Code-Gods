/**
 * The forge's agent language: a dropdown of the languages the room's game allows (observation.languages), defaulting to
 * the agent's own language when the game allows it, otherwise the first allowed one. Each agent is written in one of
 * them, and validate and summon carry it.
 */
import { allowedLanguages, type Language } from "@workspace/game-core";

/** The languages the forge offers: the game's allowed set (an observation from before the set has only `language`). */
export function forgeLanguages(obs: { languages?: readonly string[]; language?: string } | null | undefined): Language[] {
  return [...allowedLanguages(obs)];
}

/**
 * The language to edit in: the first preference (the player's pick, then the agent's own language) the game allows,
 * else the first allowed language. Before the observation arrives (nothing allowed yet) the first preference stands.
 */
export function forgeLanguage(allowed: readonly Language[], ...preferred: (Language | null | undefined)[]): Language {
  const wanted = preferred.filter((l): l is Language => !!l);
  if (!allowed.length) return wanted[0] ?? "python";
  return wanted.find(l => allowed.includes(l)) ?? allowed[0]!;
}
