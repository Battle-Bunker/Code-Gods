/**
 * The assistant pane's starter chips, end to end against the live local backend with the mock ChatProvider (AI_MOCK=1):
 * each chip's exact text (lib/player-client chips.ts, the pane's own source) must end in a reply that does what the
 * chip says, or in something the pane shows. Under the mock a chip's answer is scripted to its intent with the real
 * tools (lib/ai-player chat-mock-chips.ts), on a room's default setup, for the player's own dealt rule.
 *
 * What would break: "Write me a first agent" ending without a tested draft and an offer to summon it, a draft that
 * does not validate for the player's game, a summon nobody asked for, "Explain my goal simply" without the player's
 * rule, another player's rule in either, or a turn that ends with nothing for the pane to show.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CHIP_TEXT, SUMMON_REPLY } from "@workspace/player-client/chips";
import { firstAgentIn } from "@workspace/player-client/first-agent";
import { EXAMPLE_AGENT_FAMILIES } from "@workspace/game-utilities/example-agents";
import { ruleScoreWording, usesReservedPoints } from "@workspace/game-utilities/card-text";
import { api, gods, makeAdmin, raw, roomWith, startGame, touch, waitFor, type God } from "./game-helpers.ts";
import { silentTurnNote, type MessageRow } from "../../player-web/src/core/chat/state.ts";

const DONE = ["done", "failed", "cancelled", "budget_exhausted"];
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;

/** Three humans on the room's default setup (what a new room plays), the assistant on, the game in planning. */
async function chipRoom(names: [string, string, string], budget = 500_000) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members);
  // Seats the owner whether or not rooms.create already did (a no-op when it did).
  await members[0].c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  await makeAdmin(members[0]);
  await members[0].c.mutation(api.rooms.setAiQuotas, { roomId, assistantQuota: budget });
  const game = await startGame(members[0], roomId);
  return { members, roomId, game };
}
async function ask(god: God, roomId: string, text: string, threadId?: string) {
  const sent = await god.c.mutation(api.assistant.send, { roomId, text, ...(threadId ? { threadId } : {}) });
  return waitFor(async () => {
    const t = await god.c.query(api.assistant.thread, { threadId: sent.threadId });
    const turn = t.turns.find((x: any) => x._id === sent.turnId);
    if (!DONE.includes(turn?.status)) return null;
    const messages = t.messages.filter((m: any) => m.turnId === sent.turnId);
    return { threadId: sent.threadId as string, turn, messages, calls: t.toolCalls.filter((c: any) => c.turnId === sent.turnId),
      text: messages.filter((m: any) => m.role === "assistant").map((m: any) => m.text).join("\n") };
  }, `the turn of "${text.slice(0, 30)}" finishes`, 150_000, 150);
}
/** What the pane has to show for a finished turn: its answer, else its error line, else the "no answer" line (player-web state.ts). */
const shown = (t: { turn: any; messages: any[]; text: string }) => t.text.trim() || t.turn.error?.message || silentTurnNote(t.turn, t.messages as MessageRow[]);

test("'Explain my goal simply' answers in a few plain sentences with the player's own rule, and nobody else's", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId } = await chipRoom(["Ann Chip", "Bob Chip", "Cyd Chip"]);
  const [mine, theirs] = await Promise.all([ann, bob].map(g => g.c.query(api.player.observation, { roomId })));
  const t = await ask(ann, roomId, CHIP_TEXT.explainGoal);
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  // The rule in the player's words: a card's "scores 1 point" is the rule score ("points" is the leaderboard's word).
  const rule = ruleScoreWording(mine.self.utility.summary);
  assert.ok(t.text.includes(rule), `the reply quotes the rule text "${rule}": ${t.text}`);
  assert.equal(usesReservedPoints(t.text.slice(t.text.indexOf(rule), t.text.indexOf(rule) + rule.length)), false, "never 'points' for the rule score");
  assert.ok(t.text.includes(mine.self.utility.name), "and names the rule");
  assert.match(t.text, /rule score/);
  assert.match(t.text, /points/);
  assert.doesNotMatch(t.text, /\bbits\b/, "energy and scores in the player's words");
  assert.ok(t.text.split(/\s+/).length <= 60 + rule.split(/\s+/).length, `short: ${t.text}`);
  if (theirs.self.utility.summary !== mine.self.utility.summary) assert.ok(!t.text.includes(ruleScoreWording(theirs.self.utility.summary)), "never another player's rule");
});

test("'Write me a first agent' drafts an agent for the player's game, shows it, tests it and offers to summon; 'Summon it' summons exactly that", { timeout: 300_000 }, async () => {
  const { members: [ann], roomId, game } = await chipRoom(["Ann Draft", "Bob Draft", "Cyd Draft"]);
  const mine = await ann.c.query(api.player.observation, { roomId });
  const t = await ask(ann, roomId, CHIP_TEXT.firstAgent);
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.deepEqual(t.calls.map((c: any) => [c.tool, c.status]), [["load_skill", "ok"], ["open_panel", "ok"], ["validate_agent", "ok"]], JSON.stringify(t.calls.map((c: any) => c.summary)));
  // The draft is the example the writing-agents skill gives a real model too.
  const example = firstAgentIn(JSON.parse(t.calls[0].resultJson).data.body);
  assert.ok(example, "the skill carries a first agent for this game");
  const draft = JSON.parse(t.calls[2].argsJson);
  assert.equal(draft.source, example.source);
  assert.deepEqual(JSON.parse(t.calls[1].argsJson).params, { source: draft.source, language: draft.language }, "the Agent code panel shows the same draft");
  // For a rule family with its own example (lib/game-utilities example-agents.ts), the draft pursues the player's rule.
  if (EXAMPLE_AGENT_FAMILIES.includes(mine.self.utility.familyId)) assert.match(draft.source, /My goal: /, `the ${mine.self.utility.familyId} example: ${draft.source}`);
  if (process.env.SHOW_DRAFT) console.log(mine.self.utility.familyId, "\n" + t.text);
  const lines = draft.source.split("\n");
  assert.ok(lines.length >= 5 && lines.length <= 20, `a short draft (the generator aims at 5 to 15 lines): ${lines.length}`);
  // It validates for the player's game: it compiles, runs on the reference objects and changes them.
  const tested = JSON.parse(t.calls[2].resultJson).data;
  assert.equal(tested.receipt.validation.valid, true, JSON.stringify(tested));
  assert.ok(["works", "warns"].includes(tested.assessment.verdict), `the draft works: ${tested.assessment.verdict}: ${tested.assessment.summary}`);
  for (const expected of [draft.source, ruleScoreWording(mine.self.utility.summary), `"${SUMMON_REPLY}"`]) assert.ok(t.text.includes(expected), `the reply has ${expected}: ${t.text}`);
  assert.match(t.text, /Summoning it costs \d+ energy, and you have \d+\./, `the price is in energy, never bits: ${t.text}`);
  assert.equal((await raw(game.gameId)).agents.length, 0, "an offer: nothing is summoned unasked");
  const affordable = tested.receipt.validation.affordable;
  assert.equal(/more than you have right now/.test(t.text), !affordable, "the reply says so when the player cannot pay for it yet");

  // The player's yes summons exactly the agent they were shown; when they cannot pay yet, the refusal is said, never silent.
  const yes = await ask(ann, roomId, SUMMON_REPLY, t.threadId);
  assert.equal(yes.turn.status, "done", JSON.stringify(yes.turn.error));
  assert.deepEqual(yes.calls.map((c: any) => c.tool), ["summon_agent"]);
  assert.equal(JSON.parse(yes.calls[0].argsJson).source, draft.source, "the agent the player was shown");
  const agents = (await raw(game.gameId)).agents.filter((a: any) => a.ownerId === ann.subject);
  if (affordable) {
    assert.match(yes.text, /is summoned/, yes.text);
    assert.equal(agents.length, 1, "summoned once");
    assert.equal(agents[0].source, draft.source);
  } else {
    assert.match(yes.text, /did not go through: .*energy/i, yes.text);
    assert.equal(agents.length, 0);
  }
});

test("a chip never ends in silence: a provider error, a used-up quota and an answerless turn each leave the pane a line to show", { timeout: 300_000 }, async () => {
  const { members: [ann], roomId } = await chipRoom(["Ann Fail", "Bob Fail", "Cyd Fail"]);
  const broken = await ask(ann, roomId, mock([{ fail: "stream cut" }]));
  assert.equal(broken.turn.status, "failed");
  assert.match(shown(broken)!, /model call failed/i, "the provider's failure is the turn's error line");

  // A model that ends on a tool call and says nothing: no error either, so the pane's own line stands in.
  const mute = await ask(ann, roomId, mock([{ tools: [{ name: "whoami" }] }]), broken.threadId);
  assert.equal(mute.turn.status, "done");
  assert.equal(mute.text.trim(), "");
  assert.match(shown(mute)!, /without an answer/);

  // A quota too small for one step: the chip's turn is refused with the reason.
  const small = await chipRoom(["Ann Small", "Bob Small", "Cyd Small"], 50);
  const refused = await ask(small.members[0], small.roomId, CHIP_TEXT.firstAgent);
  assert.equal(refused.turn.status, "budget_exhausted");
  assert.match(shown(refused)!, /quota|allowance|tokens/i, shown(refused) ?? "nothing shown");
});
