/**
 * The assistant pane's guidance, at zero tokens (docs/research/ui-redesign/player-client.md §4, architecture.md §4.2):
 * the empty-state copy of each phase and at most three prompt chips. With the assistant on, a chip sends its prompt;
 * off, it runs a palette command (core/palette/commands.ts ids) and says so in command form. The text a chip sends is
 * shared (lib/player-client chips.ts): the engine tests what the assistant answers to it. Pure; tested in
 * test/suggestions.test.ts.
 */
import type { Phase } from "@workspace/player-client/panels";
import { CHIP_TEXT as T } from "@workspace/player-client/chips";

export type Suggestion = { label: string; prompt?: string; command?: string };
export type SuggestionContext = {
  phase: Phase; seated: boolean; isOwner: boolean; agents: number; ready: boolean; players: number; assistantOn: boolean;
  /** AI seats exist in this room (its owner is an administrator); absent means yes. */
  aiEnabled?: boolean;
};

/** One chip in both forms: the question for the assistant, and the command that answers it without one. */
type Chip = { ask: string; prompt?: string; off: string; command: string };
const chip = (ask: string, off: string, command: string, prompt?: string): Chip => ({ ask, off, command, prompt });
const panel = (id: string) => `ui.panel.add.${id}`;

const RULES = chip(T.howItWorks, "How to play", panel("rules"));
const CHIPS: Record<Phase, Chip[]> = {
  lobby: [RULES, chip(T.whoIsHere, "Who's here", panel("overview")), chip("I'm ready", "Mark me ready", "ui.ready", T.ready)],
  planning: [chip(T.explainGoal, "Show my secret goal", panel("my-card")), chip(T.firstAgent, "Open the agent editor", "ui.forge.edit"),
    chip(T.whatShouldAgentDo, "How to play", panel("rules"))],
  running: [chip(T.whatNext, "Where am I", panel("overview")), chip(T.whichObjects, "Objects", panel("objects")),
    chip(T.whatOthersWant, "What others care about", panel("others-care"))],
  paused: [chip(T.whatChanged, "What just changed", panel("feed")), chip(T.draftProposal, "Public chat", panel("public-chat")),
    chip(T.changeAgents, "My agents", panel("agents"))],
  ended: [chip(T.whyFinished, "How the game went", panel("results")), chip(T.whatBetter, "My points over time", panel("bits-over-time")),
    chip(T.showResults, "Leaderboard race", panel("race"))],
};
const SPECTATOR = [chip(T.whatsHappening, "Where am I", panel("overview")), chip(T.whoIsWinning, "Leaderboard race", panel("race")),
  chip(T.howToJoin, "How to play", panel("rules"))];

function chipsFor(ctx: SuggestionContext): Chip[] {
  const live = ctx.phase === "planning" || ctx.phase === "running" || ctx.phase === "paused";
  if (live && !ctx.seated) return SPECTATOR;
  let chips = CHIPS[ctx.phase];
  if (ctx.phase === "lobby" && ctx.ready) chips = chips.filter(c => c.command !== "ui.ready");
  if (ctx.phase === "planning" && ctx.agents > 0) chips = chips.map((c, i) => (i === 1 ? chip(T.agentAnyGood, "My agents", panel("agents")) : c));
  if (ctx.phase === "running" && ctx.agents === 0) chips = [chip(T.writeAgent, "Open the agent editor", "ui.forge.edit"), ...chips.slice(1)];
  return chips;
}

/** At most three chips for the situation. */
export function suggestionsFor(ctx: SuggestionContext): Suggestion[] {
  const out: Suggestion[] = chipsFor(ctx).map(c => (ctx.assistantOn ? { label: c.ask, prompt: c.prompt ?? c.ask } : { label: c.off, command: c.command }));
  // An owner short of players needs seats before anything else; seating an AI is a form, never a prompt.
  if (ctx.phase === "lobby" && ctx.isOwner && ctx.players < 3 && ctx.aiEnabled !== false) out.unshift({ label: "Add an AI player", command: "rooms.addAi" });
  return out.slice(0, 3);
}

const COPY: Record<Phase, { greeting: string; body: string }> = {
  lobby: { greeting: "Hi, I'm your assistant.", body: "The game hasn't started yet. Ask me how Code Gods works, or tell me you're ready." },
  planning: { greeting: "Planning has started.", body: "Next: tell me in plain words what your agent should do. I'll explain your secret goal, write the agent, test it, and ask before spending your energy." },
  running: { greeting: "The world is live.", body: "Ask me what to do next. I'll point at what matters and explain why." },
  paused: { greeting: "The world is paused.", body: "A good moment to ask what changed, or to make a public proposal." },
  ended: { greeting: "Game over.", body: "Ask me why you finished where you did, and what to try next time." },
};

/** The empty state of the assistant pane: a greeting and one paragraph (under 40 words). */
export function emptyStateFor(phase: Phase, assistantOn: boolean): { greeting: string; body: string } {
  if (!assistantOn) {
    return { greeting: "Your assistant is off in this room.", body: "The room owner can give it a quota in the room's AI quotas. Everything works without it: pick a panel above, or search every command." };
  }
  return COPY[phase];
}
