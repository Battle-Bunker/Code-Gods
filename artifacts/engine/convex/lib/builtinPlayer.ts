/**
 * A built-in AI player (lib/aiModels.ts BUILTIN_AI_MODELS), which calls no model: "example-agent" summons its rule's
 * example agent (game-utilities starterAgents, the one the forge pre-fills for a new player) once, in the game's
 * default language, and then leaves it alone. Pure: from the seat's own observation to the command it sends, if any.
 */
import { boardFacts, buildExampleAgent, mutatorNames, type ExampleLanguage } from "@workspace/game-utilities/example-agents";
import type { Command, Observation } from "@workspace/player-client";
import { BUILTIN_AI_MODELS } from "./aiModels";

export function builtinCommand(model: string, observation: Observation): Command | null {
  if (model !== BUILTIN_AI_MODELS[0].id) return null;
  const card = observation.self.utility, instance = observation.instance;
  if (!card || !instance || observation.seated === false || observation.agents.length > 0) return null;
  if (observation.phase !== "planning" && observation.phase !== "running") return null;
  const language = card.language as ExampleLanguage;
  if (!observation.languages.includes(language)) return null;
  const example = buildExampleAgent({ familyId: card.familyId, language, summary: card.summary, cardSource: card.source, mutators: mutatorNames(instance, language), ...boardFacts(instance) });
  return { type: "summon", language, source: example.source, name: "Example agent", description: "The example agent for its rule, summoned once and left alone." };
}
