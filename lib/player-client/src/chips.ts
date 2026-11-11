/**
 * The assistant pane's starter chips that ask the assistant something: the exact text each one sends. One source of
 * truth for the pane (artifacts/player-web src/core/chat/suggestions.ts), the scripted mock provider (lib/ai-player
 * chat-mock.ts, which answers a chip by its intent) and the engine's live tests (test/game-assistant-chips.test.ts),
 * so a reworded chip cannot drift away from what answers it. Pure: no Convex or provider code.
 */
export const CHIP_TEXT = {
  howItWorks: "How does this game work?",
  whoIsHere: "Who's in the room?",
  ready: "I'm ready for the next game.",
  explainGoal: "Explain my goal simply",
  firstAgent: "Write me a first agent",
  writeAgent: "Write me an agent",
  whatShouldAgentDo: "What should my agent do?",
  agentAnyGood: "Is my agent any good?",
  whatNext: "What should I do next?",
  whichObjects: "Which objects matter to me?",
  whatOthersWant: "What do the others want?",
  whatChanged: "What changed?",
  draftProposal: "Draft a public proposal",
  changeAgents: "Should I change my agents?",
  whyFinished: "Why did I finish there?",
  whatBetter: "What would have worked better?",
  showResults: "Show the results",
  whatsHappening: "What's happening?",
  whoIsWinning: "Who's winning?",
  howToJoin: "How do I join the next game?",
} as const;
export type ChipId = keyof typeof CHIP_TEXT;

/**
 * What a message asks for, when it is one of the chips whose answer is an action with a fixed shape:
 *   explainGoal  a short plain explanation that quotes the player's own rule;
 *   writeAgent   a first agent for the player's rule, drafted, shown, tested, then an offer to summon it;
 *   summon       the player's yes to that offer.
 * Null for anything else. The scripted mock follows it; a real model reads the same words with its system prompt.
 */
export type ChipIntent = "explainGoal" | "writeAgent" | "summon";
/** The words that accept the offer to summon the drafted agent (the draft's reply names the first). */
export const SUMMON_REPLY = "Summon it";
export function chipIntent(text: string): ChipIntent | null {
  const said = text.trim().replace(/[.!]+$/, "").toLowerCase();
  if (said === CHIP_TEXT.explainGoal.toLowerCase()) return "explainGoal";
  if (said === CHIP_TEXT.firstAgent.toLowerCase() || said === CHIP_TEXT.writeAgent.toLowerCase()) return "writeAgent";
  if (said === SUMMON_REPLY.toLowerCase() || said === "yes, summon it" || said === "yes") return "summon";
  return null;
}
