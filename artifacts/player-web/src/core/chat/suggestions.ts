/**
 * The assistant pane's guidance, at zero tokens (docs/research/ui-redesign/player-client.md §4, architecture.md §4.2):
 * the empty-state copy of each phase and at most three prompt chips. With the assistant on, a chip sends its prompt;
 * off, it runs a palette command (core/palette/commands.ts ids) and says so in command form. Pure; tested in
 * test/suggestions.test.ts.
 */
import type { Phase } from "@workspace/player-client/lenses";

export type Suggestion = { label: string; prompt?: string; command?: string };
export type SuggestionContext = {
  phase: Phase; seated: boolean; isOwner: boolean; agents: number; ready: boolean; members: number; assistantOn: boolean; pauseUsed: boolean;
};

/** One chip in both forms: the question for the assistant, and the command that answers it without one. */
type Chip = { ask: string; prompt?: string; off: string; command: string };
const chip = (ask: string, off: string, command: string, prompt?: string): Chip => ({ ask, off, command, prompt });
const lens = (id: string) => `ui.lens.add.${id}`;

const RULES = chip("How does this game work?", "How to play", lens("rules"));
const CHIPS: Record<Phase, Chip[]> = {
  lobby: [RULES, chip("Who's in the room?", "Who's here", lens("overview")), chip("I'm ready", "Mark me ready", "ui.ready", "I'm ready for the next game.")],
  planning: [chip("Explain my goal simply", "Show my secret goal", lens("my-card")), chip("Write me a first agent", "Open the agent editor", "ui.forge.edit"),
    chip("What should my agent do?", "How to play", lens("rules"))],
  running: [chip("What should I do next?", "Where am I", lens("overview")), chip("Which objects matter to me?", "Objects by payoff", lens("objects")),
    chip("What do the others want?", "What others care about", lens("others-care"))],
  paused: [chip("What changed?", "What just changed", lens("feed")), chip("Draft a public proposal", "Public chat", lens("public-chat")),
    chip("Should I change my agents?", "My agents", lens("agents"))],
  ended: [chip("Why did I finish there?", "How the game went", lens("results")), chip("What would have worked better?", "My points over time", lens("bits-over-time")),
    chip("Show the results", "Leaderboard race", lens("race"))],
};
const SPECTATOR = [chip("What's happening?", "Where am I", lens("overview")), chip("Who's winning?", "Leaderboard race", lens("race")),
  chip("How do I join the next game?", "How to play", lens("rules"))];

function chipsFor(ctx: SuggestionContext): Chip[] {
  const live = ctx.phase === "planning" || ctx.phase === "running" || ctx.phase === "paused";
  if (live && !ctx.seated) return SPECTATOR;
  let chips = CHIPS[ctx.phase];
  if (ctx.phase === "lobby" && ctx.ready) chips = chips.filter(c => c.command !== "ui.ready");
  if (ctx.phase === "planning" && ctx.agents > 0) chips = chips.map((c, i) => (i === 1 ? chip("Is my agent any good?", "My agents", lens("agents")) : c));
  if (ctx.phase === "running" && ctx.agents === 0) chips = [chip("Write me an agent", "Open the agent editor", "ui.forge.edit"), ...chips.slice(1)];
  return chips;
}

/** At most three chips for the situation. */
export function suggestionsFor(ctx: SuggestionContext): Suggestion[] {
  const out: Suggestion[] = chipsFor(ctx).map(c => (ctx.assistantOn ? { label: c.ask, prompt: c.prompt ?? c.ask } : { label: c.off, command: c.command }));
  // An owner short of players needs seats before anything else; seating an AI is a form, never a prompt.
  if (ctx.phase === "lobby" && ctx.isOwner && ctx.members < 3) out.unshift({ label: "Add an AI player", command: "rooms.addAi" });
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
    return { greeting: "Your assistant is off in this room.", body: "The room owner turns it on in the room's AI budget. Everything works without it: pick a view above, or search every command." };
  }
  return COPY[phase];
}
