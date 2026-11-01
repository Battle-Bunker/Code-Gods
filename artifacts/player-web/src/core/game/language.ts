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

/**
 * Whether the forge can validate and summon in `language` now: its agent sandbox must be ready (observation.sandboxes).
 * Warming or failed turns both buttons off and says why. An observation without sandboxes (an older engine) is ready.
 */
export function forgeSandbox(obs: { sandboxes?: readonly { language: string; state: string; reason?: string }[] } | null | undefined, language: Language): { ready: boolean; warming?: boolean; text?: string } {
  const sandbox = obs?.sandboxes?.find(s => s.language === language);
  if (!sandbox || sandbox.state === "ready") return { ready: true };
  if (sandbox.state === "failed") return { ready: false, text: `Agent sandbox failed to start: ${sandbox.reason ?? "unknown error"}. It is retried automatically.` };
  return { ready: false, warming: true, text: "Agent sandbox warming up…" };
}
