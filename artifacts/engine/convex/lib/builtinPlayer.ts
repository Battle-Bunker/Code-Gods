/**
 * A built-in AI player (lib/aiModels.ts BUILTIN_AI_MODELS), which calls no model: "example-agent" summons its rule's
 * example agent (game-utilities starterAgents, the one the forge pre-fills for a new player) once, in the game's
 * default language, and then leaves it alone. Pure: from the seat's own observation to the command it sends, if any.
 */
import { boardFacts, buildExampleAgent, mutatorNames, type ExampleLanguage } from "@workspace/game-utilities/example-agents";
import type { Command, Observation } from "@workspace/player-client";
import { BUILTIN_AI_MODELS } from "./aiModels";
import { BEGINNER_AGENT_BUDGET_BITS, firstAgentShare, isBeginnerGoal } from "@workspace/game-core";

export function builtinCommand(model: string, observation: Observation): Command | null {
  if (model !== BUILTIN_AI_MODELS[0].id) return null;
  const card = observation.self.utility, instance = observation.instance;
  if (!card || !instance || observation.seated === false || observation.agents.length > 0) return null;
  if (observation.phase !== "planning" && observation.phase !== "running") return null;
  const language = card.language as ExampleLanguage;
  if (!observation.languages.includes(language)) return null;
  const example = buildExampleAgent({ familyId: card.familyId, language, summary: card.summary, cardSource: card.source, mutators: mutatorNames(instance, language), ...boardFacts(instance) });
  // On the same terms as a beginner who presses "Summon my first agent" (player-web first-agent.ts summonShare): a
  // beginner's first agent takes as much power as still leaves a store for the dearest starter; elsewhere the default.
  const beginner = language === "python" && isBeginnerGoal({ boardKey: instance.key, familyId: card.familyId });
  const economy = observation.economy;
  const powerShare = beginner && economy && observation.self.allocated !== undefined
    ? firstAgentShare({ allocated: observation.self.allocated, powerPerSecond: economy.powerPerSecond, fullChargeSeconds: economy.fullChargeSeconds, need: BEGINNER_AGENT_BUDGET_BITS })
    : undefined;
  return { type: "summon", language, source: example.source, name: "Example agent", description: "The example agent for its rule, summoned once and left alone.", ...(powerShare !== undefined ? { powerShare } : {}) };
}
