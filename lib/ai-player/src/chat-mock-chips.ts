/**
 * The scripted mock's answers to the assistant pane's starter chips (lib/player-client chips.ts), so that offline a
 * chip ends in a reply that does what it says and a regression in that path fails a test. Each script walks the path
 * the system prompt gives a real model, with the real tools:
 *   "Explain my goal simply"   answers from the briefing: two or three plain sentences quoting the player's own rule;
 *   "Write me a first agent"   (and, mock only, any typed request to write or make an agent) load_skill writing-agents, take its first agent example for the player's rule, show it
 *                              in the Agent code panel, validate it, report and offer to summon;
 *   "Summon it" (the yes)      summon_agent with the source that was validated, then say what happened;
 *   an autopilot tick          with no agent yet, the same first agent, tested, summoned, and named in the chat.
 * Every script ends in text, also when a step fails (no game yet, a refused tool, a failed test): never silence.
 */
import { chipIntent, SUMMON_REPLY, type ChipIntent } from "@workspace/player-client/chips";
import { firstAgentIn } from "@workspace/player-client/first-agent";
import type { ChatMessage, ChatRequest, ChatToolUse } from "./chat.ts";

/** A mock step before defaults (chat-mock.ts MockStep without its bookkeeping). */
export type ChipStep = { text: string[]; delayMs: 0; tools: { name: string; input: Record<string, unknown> }[] };
const say = (text: string, tools: ChipStep["tools"] = []): ChipStep => ({ text: [text], delayMs: 0, tools });

type Json = Record<string, unknown>;
const rec = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const str = (v: unknown): string | undefined => typeof v === "string" && v ? v : undefined;
const parse = (json: string): Json => { try { return rec(JSON.parse(json)); } catch { return {}; } };

const uses = (messages: readonly ChatMessage[]): ChatToolUse[] =>
  messages.flatMap(m => m.role === "assistant" && typeof m.content !== "string" ? m.content.filter((b): b is ChatToolUse => b.type === "tool_use") : []);
/** The parsed result of the latest call of a tool in these messages: `data` when it ran, `error` when it did not; undefined when never called. */
function resultOf(messages: readonly ChatMessage[], tool: string): { use: ChatToolUse; data: Json; error?: string } | undefined {
  const use = uses(messages).filter(u => u.name === tool).at(-1);
  if (!use) return undefined;
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      if (b.type !== "tool_result" || b.toolUseId !== use.id) continue;
      const body = parse(b.content);
      const error = str(rec(body.error).message);
      return { use, data: rec(body.data), ...(error || b.isError ? { error: error ?? "it did not run" } : {}) };
    }
  }
  return { use, data: {}, error: "it did not run" };
}

/** The player's rule as the briefing states it: "Your utility (private; …): 🪞 Name — what it rewards". */
export function ruleInBriefing(briefing: string): { name: string; text?: string } | null {
  const line = /^Your utility \(private[^)]*\): (.+)$/m.exec(briefing)?.[1];
  if (!line) return null;
  const at = line.indexOf(" — ");
  return at < 0 ? { name: line } : { name: line.slice(0, at), text: line.slice(at + 3) };
}

const NO_GAME = "There is no game running yet, so you have no secret goal yet. It arrives when the game starts. Ask me again then.";

function explainGoal(briefing: string): ChipStep {
  const rule = ruleInBriefing(briefing);
  if (!rule) return say(NO_GAME);
  return say(`Your secret goal is ${rule.name}${rule.text ? `: ${rule.text}` : "."}\n`
    + "Your rule score goes up when an object fits that rule. You win points on the leaderboard when it fits your rule and the other players, overall, like the object too. "
    + "Acting costs energy, so small moves are best.\nNext: ask me to write you a first agent.");
}

function writeAgent(step: number, turn: readonly ChatMessage[], briefing: string): ChipStep | undefined {
  if (step === 0) return say("Let me read up on your rule.", [{ name: "load_skill", input: { name: "writing-agents" } }]);
  const skill = resultOf(turn, "load_skill");
  const example = skill && !skill.error ? firstAgentIn(str(skill.data.body) ?? "") : null;
  if (!example) {
    return step > 1 ? undefined : say(ruleInBriefing(briefing)
      ? "I could not find a first agent to start from for this game. Open the agent editor from the command palette to write one yourself."
      : "I can write your first agent once a game has started: your secret goal comes with the game. Ask me again in planning.");
  }
  if (step === 1) {
    return say("Here is a first agent for your rule. I am showing it in the Agent code panel and testing it.", [
      { name: "open_panel", input: { panelId: "forge", params: { source: example.source, language: example.language } } },
      { name: "validate_agent", input: { source: example.source, language: example.language } },
    ]);
  }
  if (step > 2) return undefined;
  const rule = ruleInBriefing(briefing);
  const test = resultOf(turn, "validate_agent");
  const assessment = rec(test?.data.assessment);
  const verdict = str(assessment.verdict);
  const draft = `${rule ? `Your rule is ${rule.name}${rule.text ? `: ${rule.text}` : "."}\n` : ""}I wrote you a first agent called ${example.name}:\n\n${example.source}\n\n`;
  if (!test || test.error) return say(`${draft}I could not test it: ${test?.error ?? "the test did not run"}. Nothing was summoned.`);
  if (verdict !== "works" && verdict !== "warns") {
    return say(`${draft}The test did not pass${str(assessment.summary) ? `: ${str(assessment.summary)}` : "."} Nothing was summoned. The draft is in the Agent code panel for you to change.`);
  }
  // The price in the player's words (the assessment's own summary counts energy in bits).
  const { cost, energy, affordable, warning } = priceOf(test.data);
  const price = cost === undefined ? "Summoning it spends some of your energy." : `Summoning it costs ${cost} energy${energy === undefined ? "" : `, and you have ${energy}`}.`;
  const tested = `I tested it and it works.${warning ? ` One warning: ${warning}` : ""}\n${price}`;
  if (affordable === false) {
    const wait = secondsUntil(cost, energy, briefing);
    return say(`${draft}${tested}\nThat is more than you have right now. ${wait === undefined ? "Your energy grows while the world runs" : `You will have enough about ${wait} seconds after the world starts running`}: say "${SUMMON_REPLY}" then.`);
  }
  return say(`${draft}${tested} Say "${SUMMON_REPLY}" and I will summon it for you.`);
}

/** Seconds of running world until `energy` reaches `cost`, at the power the briefing's economy states; undefined when unknown. */
function secondsUntil(cost: number | undefined, energy: number | undefined, briefing: string): number | undefined {
  const power = Number(/"powerPerSecond":([0-9.]+)/.exec(briefing)?.[1]);
  return cost !== undefined && energy !== undefined && power > 0 ? Math.max(1, Math.ceil((cost - energy) / power)) : undefined;
}

const whole = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.ceil(v) : undefined;
/** A validation's summon price and the player's energy then (whole numbers), whether they can pay, and its first warning. */
function priceOf(data: Json): { cost?: number; energy?: number; affordable?: boolean; warning?: string } {
  const v = rec(rec(data.receipt).validation);
  const energy = typeof v.energy === "number" && Number.isFinite(v.energy) ? Math.floor(v.energy) : undefined;
  return { cost: whole(v.cost), energy, ...(typeof v.affordable === "boolean" ? { affordable: v.affordable } : {}), warning: Array.isArray(v.warnings) ? str(v.warnings[0]) : undefined };
}

function summon(step: number, before: readonly ChatMessage[], turn: readonly ChatMessage[]): ChipStep | undefined {
  // The agent the player says yes to: the one this conversation validated last.
  const drafted = uses(before).filter(u => u.name === "validate_agent").at(-1);
  const source = str(drafted?.input.source);
  if (!source) return undefined;
  const language = str(drafted!.input.language);
  // Its name is in the draft's own reply ("… a first agent called Row slider:").
  const said = before.flatMap(m => m.role === "assistant" && typeof m.content !== "string" ? m.content.flatMap(b => b.type === "text" ? [b.text] : []) : []).join("\n");
  const name = [...said.matchAll(/a first agent called ([^:\n]{1,40}):/g)].at(-1)?.[1] ?? "First agent";
  if (step === 0) {
    return say("Summoning your agent.", [{ name: "summon_agent", input: { source, ...(language ? { language } : {}), name, description: "A first agent: one small move that keeps changing objects." } }]);
  }
  if (step > 1) return undefined;
  const done = resultOf(turn, "summon_agent");
  const receipt = rec(done?.data.receipt);
  if (!done || done.error || receipt.accepted === false || done.data.status === "failed") {
    return say(`The summon did not go through: ${done?.error ?? str(receipt.message) ?? str(done?.data.message) ?? "the game refused it"}. Nothing was spent.`);
  }
  return say(`Done: your agent ${name} is summoned. Open My agents to watch it act. Your rule score and your points change as it works.`);
}

/**
 * Mock only: a typed request to write or make an agent ("please make an agent that …") takes the first-agent path
 * too, so a local tester gets a draft instead of the default summary. Questions about an agent do not.
 */
const asksForAgent = (text: string) => !text.startsWith("/") && !/\?\s*$/.test(text)
  && /\b(write|make|create|build|draft|code|give)\b[^.?!]{0,40}\b(agent|bot)\b/i.test(text);

const AUTOPILOT_IDLE = "Autopilot: nothing is worth doing right now.";
/**
 * An autopilot tick (the engine's "(autopilot)" prompt): with a game on and no agent yet, summon the first agent for
 * the player's rule (tested first) and SAY what was summoned; otherwise say that nothing is worth doing.
 */
function autopilot(step: number, turn: readonly ChatMessage[], briefing: string): ChipStep | undefined {
  const rule = ruleInBriefing(briefing);
  const playing = /phase: (planning|running);/.test(briefing) && /your live agents: 0 live agents/.test(briefing);
  if (!rule || !playing) return step === 0 ? say(AUTOPILOT_IDLE) : undefined;
  if (step === 0) return say("", [{ name: "load_skill", input: { name: "writing-agents" } }]);
  const skill = resultOf(turn, "load_skill");
  const example = skill && !skill.error ? firstAgentIn(str(skill.data.body) ?? "") : null;
  if (!example) return step === 1 ? say("Autopilot: I found no first agent to start from for this game, so I summoned nothing.") : undefined;
  if (step === 1) return say("", [{ name: "validate_agent", input: { source: example.source, language: example.language } }]);
  const test = resultOf(turn, "validate_agent");
  const verdict = str(rec(test?.data.assessment).verdict);
  if (!test || test.error || (verdict !== "works" && verdict !== "warns")) {
    return step === 2 ? say(`Autopilot: my first agent for your rule did not pass its test (${test?.error ?? str(rec(test?.data.assessment).summary) ?? "no result"}), so I summoned nothing.`) : undefined;
  }
  if (priceOf(test.data).affordable === false) {
    const { cost, energy } = priceOf(test.data);
    return step === 2 ? say(`Autopilot: a first agent for your rule, ${example.name}, costs ${cost ?? "more"} energy to summon and you have ${energy ?? "less"}. I summoned nothing; I will try again when you have enough${secondsUntil(cost, energy, briefing) === undefined ? "" : ` (about ${secondsUntil(cost, energy, briefing)} seconds of running world)`}.`) : undefined;
  }
  if (step === 2) {
    return say("", [{ name: "summon_agent", input: { source: example.source, language: example.language, name: example.name, description: "A first agent, summoned by Autopilot: one small move that keeps changing objects." } }]);
  }
  if (step > 3) return undefined;
  const done = resultOf(turn, "summon_agent");
  const receipt = rec(done?.data.receipt);
  if (!done || done.error || receipt.accepted === false || done.data.status === "failed") {
    return say(`Autopilot: I tried to summon a first agent called ${example.name}, but it did not go through: ${done?.error ?? str(receipt.message) ?? "the game refused it"}.`);
  }
  return say(`Autopilot: I summoned an agent called ${example.name} for your rule, ${rule.name}. It spent some of your energy. Its code is in My agents:\n\n${example.source}`);
}

/**
 * The mock's step for a chip message, or undefined when the message is no chip (or the script is past its last
 * step): `prompt` is the player's text, `context` the briefing in front of it, `before` the conversation up to that
 * message and `turn` the messages after it.
 */
export function chipStep(prompt: string, context: string, step: number, request: Pick<ChatRequest, "messages">, promptAt: number): { intent: ChipIntent | "autopilot"; step: ChipStep | undefined } | undefined {
  if (prompt.startsWith("(autopilot)")) return { intent: "autopilot", step: autopilot(step, request.messages.slice(promptAt + 1), context) };
  const intent = chipIntent(prompt) ?? (asksForAgent(prompt) ? "writeAgent" : null);
  if (!intent) return undefined;
  const before = request.messages.slice(0, Math.max(0, promptAt)), turn = request.messages.slice(promptAt + 1);
  if (intent === "explainGoal") return { intent, step: step === 0 ? explainGoal(context) : undefined };
  if (intent === "writeAgent") return { intent, step: writeAgent(step, turn, context) };
  // A yes with nothing drafted is an ordinary message.
  if (!uses(before).some(u => u.name === "validate_agent")) return undefined;
  return { intent, step: summon(step, before, turn) };
}
