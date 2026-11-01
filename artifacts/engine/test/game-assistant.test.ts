/**
 * The in-client assistant (convex/assistant.ts, convex/assistant/*; docs/surface-architecture.md §6) against the live
 * local backend with the scripted mock ChatProvider (AI_MOCK=1, set by `pnpm --filter @workspace/engine dev`).
 * A `/mock {json}` message scripts the model's steps (lib/ai-player chat-mock.ts).
 *
 * What would break: tools running outside the human's assistant credential, a second concurrent turn, cancellation
 * or confirmation leaking calls, command ids chosen by the model (double summons), the assistant pool spilling into
 * other players or the AI seats' pool, threads readable by another human, and disclosure through stored tool results.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { admin, api, envelope, gods, internal, playerClient, raw, rejects, roomWith, sleep, startGame, touch, waitFor, TS, type God } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";
import { commandIdFor } from "../convex/assistant/rules.ts";

const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());
const derived = (turnId: string, callId: string) => commandIdFor(turnId, callId, sha1);
const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

/** A room of three humans (first is owner) with the assistant enabled, optionally in a started game. */
async function assistantRoom(names: [string, string, string], { budget = 500_000, start = true, roomSettings = settings as Record<string, unknown> } = {}) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members, roomSettings);
  if (budget) await members[0].c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: budget });
  const game = start ? await startGame(members[0], roomId) : null;
  return { members, roomId, game };
}

const thread = (god: God, threadId: string) => god.c.query(api.assistant.thread, { threadId });
async function turnOf(god: God, threadId: string, turnId: string) {
  const t = await thread(god, threadId);
  return { ...t, turn: t.turns.find((x: any) => x._id === turnId), calls: t.toolCalls.filter((c: any) => c.turnId === turnId), messages: t.messages.filter((m: any) => m.turnId === turnId) };
}
async function until(god: God, sent: { threadId: string; turnId: string }, statuses: string[], label: string, ms = 90_000) {
  return waitFor(async () => {
    const t = await turnOf(god, sent.threadId, sent.turnId);
    return statuses.includes(t.turn?.status) ? t : null;
  }, label, ms, 150);
}
const finalText = (t: { messages: any[] }) => t.messages.filter(m => m.role === "assistant").map(m => m.text).join("");

test("a scripted turn reads, validates and answers as the human's assistant credential", { timeout: 180_000 }, async () => {
  const { members: [ann, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "get_observation", input: { objectsLimit: 3 } }] },
    { tools: [{ name: "validate_agent", input: { source: TS.Int, commandId: "00000000-0000-4000-8000-000000000000" } }] },
    { text: ["The agent ", "is valid."] },
  ]) });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.deepEqual(t.calls.map((c: any) => [c.tool, c.status]), [["get_observation", "ok"], ["validate_agent", "ok"]]);
  const validate = t.calls[1];
  assert.equal(validate.commandId, derived(sent.turnId, "mock_1_0"), "the command id is derived from (turn, call), never the model's");
  const receipt = await ann.c.query(api.receipts.get, { roomId, commandId: validate.commandId });
  assert.ok(receipt?.accepted && receipt.validation?.valid, "the validation ran as Ann and left her receipt");
  assert.match(JSON.parse(t.calls[0].resultJson).notice, /untrusted/i, "tool results are stored as untrusted data");
  assert.equal(finalText(t), "The agent is valid.");
  assert.ok(t.messages.every((m: any) => m.status === "done"));
  assert.ok(t.turn.usage.inputTokens > 0 && t.turn.usage.outputTokens > 0 && t.turn.step === 3, JSON.stringify(t.turn.usage));
  assert.equal(t.thread.activeTurnId, undefined, "the thread is free again");

  const credentials = await ann.c.query(api.auth.credentials.list, {});
  const assistant = credentials.filter((c: any) => c.kind === "assistant" && c.roomId === roomId);
  assert.equal(assistant.length, 1, "one assistant credential, listed like any other");
  assert.equal(assistant[0].permission, "act", "default permission");
  assert.equal(t.turn.credentialId, assistant[0].credentialId);
  // Another send reuses the credential.
  const again = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "ok" }]) });
  await until(ann, again, DONE, "the second turn finishes");
  assert.equal((await ann.c.query(api.auth.credentials.list, {})).filter((c: any) => c.kind === "assistant" && c.roomId === roomId).length, 1);
  const { room } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed, 0, "the AI seats' pool is untouched");
  assert.deepEqual(await bob.c.query(api.assistant.threads, { roomId }), []);
});

test("each turn starts with a briefing of the player's live situation, kept for every step; the prompt indexes the tools beyond the loaded core", { timeout: 180_000 }, async () => {
  const { members: [ann, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const [mine, theirs] = await Promise.all([ann, bob].map(g => g.c.query(api.player.observation, { roomId })));
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ echo: true, tools: [{ name: "whoami" }] }, { echo: true }]) });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  const [first, second] = t.messages.filter((m: any) => m.role === "assistant").map((m: any) => JSON.parse(m.text));
  assert.deepEqual(second, first, "the same briefing, system prompt and tools at every step of the turn");
  const [briefing] = first.context as string[];
  assert.ok(briefing.startsWith("<briefing>"), briefing);
  for (const expected of [mine.self.utility.name, mine.self.utility.summary, "phase: planning", "Panes on the player's screen"]) {
    assert.ok(briefing.includes(expected), `the briefing has ${expected}`);
  }
  assert.ok(!briefing.includes("Room rules:") && !briefing.includes("Mutators") && briefing.length < 2_500, "rules and helpers are skills now");
  if (theirs.self.utility.name !== mine.self.utility.name) assert.ok(!briefing.includes(theirs.self.utility.name), "never another god's utility");
  assert.deepEqual(first.tools, ["load_tools", "get_observation", "load_skill", "send_chat", "open_panel", "set_panel_params"], "only the loader and the core tools are in context");
  for (const name of ["summon_agent", "validate_agent", "move_pane", "get_rules"]) assert.ok(first.system.includes(`\n- ${name}: `), `the index lists ${name}`);
  assert.ok(!first.system.includes("\n- start_game: "), "no owner tools for an act grant");
  assert.equal(first.maxOutputTokens, 2048, "the default output ceiling");

  const lobby = await assistantRoom(["Lia Lobby", "Max Lobby", "Ned Lobby"], { start: false });
  const inLobby = await lobby.members[0].c.mutation(api.assistant.send, { roomId: lobby.roomId, text: mock([{ echo: true }]) });
  const l = await until(lobby.members[0], inLobby, DONE, "the lobby turn finishes");
  assert.match(JSON.parse(finalText(l)).context[0], /no game is running/i);
});

test("load_tools puts index tools in context for the rest of the thread; load_skill returns the skill with live data", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Load", "Bob Load", "Cyd Load"]);
  const mineObs = await ann.c.query(api.player.observation, { roomId });
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "load_tools", input: { names: ["validate_agent", "move_pane"] } }, { name: "load_skill", input: { name: "writing-agents" } }, { name: "load_tools", input: { names: ["start_game"] } }] },
    { echo: true },
  ]) });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.deepEqual(t.calls.map((c: any) => [c.tool, c.status]), [["load_tools", "ok"], ["load_skill", "ok"], ["load_tools", "error"]]);
  assert.equal(t.calls[0].summary, "Loaded validate_agent, move_pane");
  assert.match(JSON.parse(t.calls[2].resultJson).error.message, /Not in this grant's index: start_game/, "an act grant cannot load owner tools");
  const skill = JSON.parse(t.calls[1].resultJson).data;
  assert.equal(skill.name, "writing-agents");
  assert.ok(skill.body.includes("validate_agent") && skill.body.includes("Mutators") && skill.body.includes(mineObs.self.utility.source.slice(0, 30)), "guidance, helpers and the player's own utility source");
  const echoed = JSON.parse(finalText(t));
  assert.deepEqual(echoed.tools, ["load_tools", "get_observation", "load_skill", "send_chat", "open_panel", "set_panel_params", "validate_agent", "move_pane",
    "evaluate_value", "summon_agent", "destroy_agent"], "load_tools' tools, then the skill's own (where the adapter manages context)");
  assert.equal(echoed.maxOutputTokens, 8192, "a code-writing tool is loaded: the full ceiling");
  // The next turn of the thread keeps them (the load is in its history).
  const again = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ echo: true }]) });
  const a = await until(ann, again, DONE, "the next turn finishes");
  assert.ok(JSON.parse(finalText(a)).tools.includes("validate_agent"));
});

/** The room of the 1WB8 loop: a 4×4 Grid with Python agents (61 helpers, 22 mutators: a large writing-agents skill). */
const GRID = { languages: ["python"], objectType: "Grid", typeArgs: { colours: "rgb", size: 4, symbols: "base10" },
  startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9 };
const FAILING_PY = "def agent(grid):\n    return [paint(cell_at(0, 0), \"red\")]";

test("the 1WB8 loop: the whole skill arrives, a failing validation says it fails, and repeating it makes the next step the last", { timeout: 300_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Loop", "Bob Loop", "Cyd Loop"], { roomSettings: GRID });
  const mine = await ann.c.query(api.player.observation, { roomId });
  const validate = { name: "validate_agent", input: { source: FAILING_PY, language: "python" } };
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "load_skill", input: { name: "writing-agents" } }] },
    { tools: [validate] }, { tools: [validate] }, { tools: [validate] },
    { text: "I got stuck: cell_at is not a helper." },
  ]) });
  const t = await until(ann, sent, DONE, "the turn finishes", 180_000);
  assert.deepEqual(t.calls.map((c: any) => [c.tool, c.status]), [["load_skill", "ok"], ["validate_agent", "ok"], ["validate_agent", "ok"], ["validate_agent", "ok"]]);
  assert.equal(t.turn.status, "done");
  assert.equal(t.turn.error, null, "the model answered in its last step");
  assert.equal(t.turn.maxSteps, 5, "the step after the second repeat was the turn's last");
  assert.equal(finalText(t), "I got stuck: cell_at is not a helper.");

  const skill = JSON.parse(t.calls[0].resultJson);
  assert.equal(skill.TRUNCATED, undefined, "the skill is not cut");
  assert.ok(skill.data.body.includes("paint(") && skill.data.body.includes("grid.cell(row, col)"), "the mutators and the read helpers (how to reach a cell)");
  assert.ok(skill.data.body.includes(mine.self.utility.source.slice(-40)), "the player's whole utility source");

  const [first, second, third] = t.calls.slice(1).map((c: any) => JSON.parse(c.resultJson));
  assert.equal(first.data.receipt.validation.valid, true, "the engine still calls it valid (it compiles)");
  assert.equal(first.data.receipt.validation.invalidRate, 1);
  assert.ok(Math.abs(first.data.receipt.validation.energy - mine.self.energy) < 60, "the player's energy when validated");
  assert.equal(typeof first.data.receipt.validation.affordable, "boolean");
  assert.equal(first.data.assessment.verdict, "fails");
  assert.match(first.data.assessment.summary, /^Fails or is invalid on 100% of reference objects: .*NameError: name 'cell_at' is not defined/);
  assert.match(t.calls[1].summary, /^Fails or is invalid on 100%/, "the chip says it fails, not Accepted");
  assert.equal(first.ENGINE_NOTE, undefined);
  assert.match(second.ENGINE_NOTE, /just called validate_agent with these exact arguments once in a row/);
  assert.match(third.ENGINE_NOTE, /2 times in a row.*ends this turn after your next step. Do not call tools/);

  // A model that ignores the note and calls again: the turn stops, saying why.
  const again = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ tools: [validate] }, { tools: [validate] }, { tools: [validate] }, { tools: [validate] }, { text: "never" }]) });
  const a = await until(ann, again, DONE, "the ignoring turn finishes", 180_000);
  assert.equal(a.calls.length, 4, "the last step's call still ran");
  assert.equal(a.turn.error?.code, "REPEATING");
  assert.match(a.turn.error.message, /kept repeating the same call/);
  assert.ok(!finalText(a).includes("never"));
});

test("before the turn's last model step, the last result tells the model to answer the player now", { timeout: 240_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Last", "Bob Last", "Cyd Last"]);
  // Eleven tool steps of distinct reads (no repeats), then the twelfth and last step answers.
  const reads = Array.from({ length: 11 }, (_, n) => ({ tools: [{ name: "get_observation", input: { objectsLimit: n + 1 } }] }));
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([...reads, { text: "Here is where I got to." }]) });
  const t = await until(ann, sent, DONE, "the turn finishes", 180_000);
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.equal(t.turn.error, null, "it finished within the step limit");
  const notes = t.calls.map((c: any) => JSON.parse(c.resultJson).ENGINE_NOTE);
  assert.deepEqual(notes.slice(0, 10), Array(10).fill(undefined));
  assert.match(notes[10], /next step is the last of this turn. Do not call tools/);
  assert.equal(finalText(t), "Here is where I got to.");
});

test("a step cut by the default output ceiling is billed, never acted on, and run again with the full ceiling", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Cut", "Bob Cut", "Cyd Cut"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ cutBelow: 8192, text: "A long answer.", tools: [{ name: "get_observation", input: { objectsLimit: 1 } }] }]) });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  const steps = t.messages.filter((m: any) => m.role === "assistant");
  assert.equal(steps.length, 3, "the cut step, its retry, and the (empty) end of the script");
  assert.equal(steps[0].status, "error");
  assert.equal(steps[0].text, "", "the cut answer is not kept");
  assert.ok(steps[0].billedTokens > 0 && steps[0].outputTokens === 2048, "the cut step is billed");
  assert.equal(steps[1].text, "A long answer.");
  assert.deepEqual(t.calls.map((c: any) => c.tool), ["get_observation"], "only the retry's call exists");
  assert.equal(t.turn.usage.billedTokens, steps.reduce((sum: number, m: any) => sum + m.billedTokens, 0), "the turn bills every step, the cut one included");
  assert.equal(t.turn.step, 2, "the cut step does not count against the step ceiling");
  // The thread keeps the raised ceiling for its next turns.
  const next = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ echo: true }]) });
  assert.equal(JSON.parse(finalText(await until(ann, next, DONE, "the next turn"))).maxOutputTokens, 8192);
});

test("streaming text grows in the message document before the step ends", { timeout: 120_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["one ", "two ", "three ", "four "], delayMs: 700 }]) });
  const seen: string[] = [];
  await waitFor(async () => {
    const t = await turnOf(ann, sent.threadId, sent.turnId);
    const m = t.messages.find((x: any) => x.role === "assistant");
    if (m?.status === "streaming" && m.text && seen.at(-1) !== m.text) seen.push(m.text);
    return DONE.includes(t.turn?.status) ? t : null;
  }, "the turn finishes", 60_000, 100);
  assert.ok(seen.length >= 2, `partial texts seen while streaming: ${JSON.stringify(seen)}`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].startsWith(seen[i - 1]) && seen[i].length > seen[i - 1].length, "each flush extends the last");
  assert.equal(finalText(await turnOf(ann, sent.threadId, sent.turnId)), "one two three four ");
});

test("one active turn per human and room: a second send conflicts, another player runs concurrently", { timeout: 120_000 }, async () => {
  const { members: [ann, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  const slow = mock([{ text: ["a", "b", "c"], delayMs: 1000 }]);
  const first = await ann.c.mutation(api.assistant.send, { roomId, text: slow });
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, text: "again" })), "CONFLICT");
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, threadId: first.threadId, text: "again" })), "CONFLICT");
  const other = await bob.c.mutation(api.assistant.send, { roomId, text: slow });
  const [a, b] = await Promise.all([until(ann, first, DONE, "Ann's turn"), until(bob, other, DONE, "Bob's turn")]);
  assert.equal(a.turn.status, "done");
  assert.equal(b.turn.status, "done");
  assert.equal(finalText(a), "abc");
  assert.equal(finalText(b), "abc");
});

test("cancel during a streaming delay: the turn is cancelled and runs no further tool calls", { timeout: 120_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["a", "b", "c", "d", "e", "f"], delayMs: 800, tools: [{ name: "whoami" }] }, { text: "never" }]) });
  await waitFor(async () => (await turnOf(ann, sent.threadId, sent.turnId)).messages.some((m: any) => m.role === "assistant" && m.text), "text streams", 30_000, 100);
  await ann.c.mutation(api.assistant.cancel, { turnId: sent.turnId });
  const t = await until(ann, sent, DONE, "the turn ends");
  assert.equal(t.turn.status, "cancelled");
  await sleep(1500);
  const after = await turnOf(ann, sent.threadId, sent.turnId);
  assert.deepEqual(after.calls, [], "no tool call ran");
  assert.ok(!finalText(after).includes("never"));
  assert.equal(after.thread.activeTurnId, undefined);
  // The cancelled step is billed from what was known (the mock reports its input usage when it opens, as Anthropic
  // does, and the characters it streamed), not its whole reservation; the allowance keeps exactly that.
  const cancelled = after.messages.find((m: any) => m.role === "assistant");
  assert.equal(cancelled.usageEstimated, true);
  assert.ok(cancelled.inputTokens > 0 && cancelled.outputTokens > 0, JSON.stringify(cancelled));
  assert.ok(cancelled.outputTokens <= Math.ceil(6 / 2.5) + 8, `at most the six streamed characters' tokens: ${cancelled.outputTokens}`);
  assert.equal(cancelled.billedTokens, cancelled.inputTokens + cancelled.outputTokens, "uncached input + output");
  assert.ok(cancelled.billedTokens < cancelled.reservedTokens, `${cancelled.billedTokens} < ${cancelled.reservedTokens}`);
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).allowance.used, cancelled.billedTokens);
  const next = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "back" }]) });
  assert.equal((await until(ann, next, DONE, "a new turn")).turn.status, "done");
});

test("a turn still streaming when the next game starts is stopped, and does not block the player's first message of the new game", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Next", "Bob Next", "Cyd Next"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["a", "b", "c", "d", "e", "f", "g", "h"], delayMs: 1500, tools: [{ name: "whoami" }] }, { text: "never" }]) });
  await waitFor(async () => (await turnOf(ann, sent.threadId, sent.turnId)).messages.some((m: any) => m.role === "assistant" && m.text), "text streams", 30_000, 100);
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  await startGame(ann, roomId);
  const next = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "new game" }]) });
  assert.notEqual(next.threadId, sent.threadId);
  const old = await until(ann, sent, DONE, "the last game's turn ends");
  assert.equal(old.turn.status, "cancelled");
  assert.deepEqual(old.calls, [], "it ran no tool call into the new game");
  assert.equal((await until(ann, next, DONE, "the new game's turn")).turn.status, "done");
});

test("permissions: a read assistant cannot summon; act has no owner tools; owner needs the owner and consent", { timeout: 180_000 }, async () => {
  const { members: [ann, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const sent = await bob.c.mutation(api.assistant.send, { roomId, permission: "read", text: mock([{ tools: [{ name: "summon_agent", input: { source: TS.Int } }] }, { text: "ok" }]) });
  const t = await until(bob, sent, DONE, "the read turn ends");
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].status, "error", "refused at once, no confirmation card");
  assert.match(t.calls[0].resultJson, /FORBIDDEN/);
  assert.equal(await bob.c.query(api.receipts.get, { roomId, commandId: derived(sent.turnId, "mock_0_0") }), null, "no receipt");
  assert.ok(t.turn.tools.includes("get_observation") && !t.turn.tools.includes("summon_agent"), "the model was offered read tools only");

  const act = await bob.c.mutation(api.assistant.send, { roomId, permission: "act", text: mock([{ text: "ok" }]) });
  const actTurn = await until(bob, act, DONE, "the act turn ends");
  assert.ok(actTurn.turn.tools.includes("summon_agent") && !actTurn.turn.tools.includes("start_game") && !actTurn.turn.tools.includes("get_room_state"));
  const creds = (await bob.c.query(api.auth.credentials.list, {})).filter((c: any) => c.kind === "assistant" && c.roomId === roomId);
  assert.deepEqual(creds.map((c: any) => c.permission), ["act"], "a new permission replaces (revokes) the old assistant credential");

  assert.equal(await errorCode(bob.c.mutation(api.assistant.send, { roomId, permission: "owner", ownerConsent: true, text: "hi" })), "FORBIDDEN", "only the owner");
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, permission: "owner", text: "hi" })), "FORBIDDEN", "explicit consent");
  const owner = await ann.c.mutation(api.assistant.send, { roomId, permission: "owner", ownerConsent: true, text: mock([{ text: "ok" }]) });
  assert.ok((await until(ann, owner, DONE, "the owner turn")).turn.tools.includes("start_game"));
});

test("a read-only player connection gets a read assistant by default and never drives a stronger one", { timeout: 120_000 }, async () => {
  const { members: [, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  // Bob's browser session first makes an act assistant.
  const first = await bob.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "ok" }]) });
  await until(bob, first, DONE, "the browser turn");
  const readApp = { ...bob, c: await playerClient(bob, roomId, "read") };
  const sent = await readApp.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "ok" }]) });
  const t = await until(readApp, sent, DONE, "the read-app turn");
  assert.equal(t.turn.status, "done");
  assert.ok(!t.turn.tools.includes("summon_agent"), "the read connection's assistant has read tools only");
  const creds = (await bob.c.query(api.auth.credentials.list, {})).filter((c: any) => c.kind === "assistant" && c.roomId === roomId);
  assert.deepEqual(creds.map((c: any) => c.permission), ["read"]);
  assert.ok(creds[0].expiresAt <= Date.now() + 3600_000 + 5000, "capped at the read credential's own expiry");
  assert.equal((await readApp.c.query(api.assistant.status, { roomId })).maxPermission, "read");
});

test("revoking the assistant credential mid-turn fails its next call and ends the turn", { timeout: 120_000 }, async () => {
  const { members: [, bob], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  const sent = await bob.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["a", "b"], delayMs: 1500, tools: [{ name: "whoami" }] }, { text: "after" }]) });
  await waitFor(async () => (await turnOf(bob, sent.threadId, sent.turnId)).messages.some((m: any) => m.role === "assistant" && m.text), "text streams", 30_000, 100);
  const { turn } = await turnOf(bob, sent.threadId, sent.turnId);
  await bob.c.mutation(api.auth.credentials.revoke, { credentialId: turn.credentialId });
  const t = await until(bob, sent, DONE, "the turn ends");
  assert.equal(t.calls[0].status, "error");
  assert.match(t.calls[0].resultJson, /UNAUTHENTICATED/);
  assert.equal(t.turn.status, "failed");
  assert.ok(!finalText(t).includes("after"));
});

test("confirmation: a summon waits for the player; approve runs it once with the derived id; deny never sends chat", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId, game } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "summon_agent", input: { source: TS.Int } }] }, { text: "Summoned." }]) });
  const waiting = await until(ann, sent, ["awaiting_confirmation"], "the turn waits for confirmation");
  const call = waiting.calls[0];
  assert.equal(call.status, "awaiting_confirmation");
  const commandId = derived(sent.turnId, "mock_0_0");
  assert.equal(JSON.parse(call.argsJson).commandId, commandId, "the card shows the exact payload, with the derived id");
  assert.equal((await raw(game!.gameId)).agents.length, 0, "nothing ran yet");
  assert.equal(await errorCode(bob.c.mutation(api.assistant.confirm, { toolCallId: call._id, decision: "approve" })), "NOT_FOUND", "only Ann decides");

  await ann.c.mutation(api.assistant.confirm, { toolCallId: call._id, decision: "approve" });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done");
  assert.equal(t.calls[0].status, "ok");
  assert.equal(t.calls[0].commandId, commandId);
  const receipt = await ann.c.query(api.receipts.get, { roomId, commandId });
  assert.ok(receipt?.accepted, receipt?.message);
  assert.equal(finalText(t), "Summoned.");
  // A replayed approval changes nothing.
  await ann.c.mutation(api.assistant.confirm, { toolCallId: call._id, decision: "approve" });
  await sleep(1500);
  assert.equal((await raw(game!.gameId)).agents.filter((a: any) => a.ownerId === ann.subject).length, 1, "summoned exactly once");

  const chat = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ tools: [{ name: "send_chat", input: { text: "assistant hello" } }] }, { text: "Not sent." }]) });
  const card = await until(ann, chat, ["awaiting_confirmation"], "the chat waits");
  await ann.c.mutation(api.assistant.confirm, { toolCallId: card.calls[0]._id, decision: "deny" });
  const denied = await until(ann, chat, DONE, "the chat turn ends");
  assert.equal(denied.calls[0].status, "denied");
  assert.equal(denied.turn.status, "done");
  const obs = await ann.c.query(api.player.observation, { roomId });
  assert.ok(!obs.chat.some((m: any) => m.text === "assistant hello"), "public chat was never sent");
});

test("budget: the assistant pool is per human and game, separate from seats; 0 means off", { timeout: 180_000 }, async () => {
  const off = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { budget: 0, start: false });
  const message = await rejects(off.members[0].c.mutation(api.assistant.send, { roomId: off.roomId, text: "hi" }));
  assert.match(message, /owner has not enabled the assistant/i);

  const { members: [ann, bob, cyd], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const probe = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "whoami" }] }, { text: "x" }]) });
  const measured = await until(ann, probe, DONE, "the probe turn");
  const firstStep = measured.messages.find((m: any) => m.role === "assistant").reservedTokens;
  assert.ok(firstStep > 0);
  const annUsed = (await ann.c.query(api.assistant.status, { roomId })).allowance.used;
  // After trustworthy usage the room's assistant USD keeps only the actual cost, not the worst-case reservation.
  const counters = await admin.query(internal.testing.rawAssistantPool, { roomId });
  assert.ok(counters.roomUsd > 0 && counters.roomUsd < measured.turn.usage.reservedUsd, `room USD ${counters.roomUsd} < reserved ${measured.turn.usage.reservedUsd}`);
  // Cache reads count at their price relative to input (the mock's are 0.1x) in the allowance; settled exactly.
  const cachedTurn = await ann.c.mutation(api.assistant.send, { roomId, threadId: probe.threadId, text: mock([{ text: "cached", cache: { read: 0.8, write: 0.1 } }]) });
  const cached = await until(ann, cachedTurn, DONE, "the cached turn");
  const step = cached.messages.find((m: any) => m.role === "assistant");
  assert.ok(step.cacheReadTokens > 0 && step.cacheWriteTokens > 0, JSON.stringify(step));
  const uncached = step.inputTokens - step.cacheReadTokens - step.cacheWriteTokens;
  assert.equal(step.billedTokens, uncached + Math.ceil(step.cacheReadTokens * 0.1) + Math.ceil(step.cacheWriteTokens * 1.25) + step.outputTokens);
  assert.ok(step.billedTokens < step.inputTokens, "cheaper than uncached");
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).allowance.used, annUsed + step.billedTokens);
  // The reservation was made from an input estimate no smaller than the actual input.
  assert.ok(step.inputEstimate >= step.inputTokens, `${step.inputEstimate} >= ${step.inputTokens}`);
  // An allowance that covers one step but not two.
  await ann.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: firstStep + 1000 });
  const sent = await bob.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "whoami" }] }, { text: "never" }]) });
  const t = await until(bob, sent, DONE, "Bob's turn ends");
  assert.equal(t.turn.status, "budget_exhausted");
  assert.match(t.turn.error.message, /allowance/i);
  // Not "used up" while tokens remain: how many are left, what the next step may need, and who can raise it.
  assert.match(t.turn.error.message, /^Your assistant allowance for this game is too low for another step: [\d,]+ of [\d,]+ tokens used \([\d,]+ left\), and the next step may need up to [\d,]+\. The room owner can raise it\.$/);
  assert.deepEqual(t.calls.map((c: any) => c.status), ["ok"], "the first step ran");
  assert.ok(!finalText(t).includes("never"));
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).allowance.used, annUsed + step.billedTokens, "Ann's allowance is untouched");
  const cydTurn = await cyd.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "fine" }]) });
  assert.equal((await until(cyd, cydTurn, DONE, "Cyd's turn")).turn.status, "done", "other players keep their allowance");
  const { room } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed, 0, "the seats pool is untouched");
  const status = await bob.c.query(api.assistant.status, { roomId });
  assert.equal(status.enabled, true);
  assert.ok(status.allowance.used <= status.allowance.limit);
  // Bob's unanswered message is not silent context for his next turn: the model sees it marked as unanswered.
  await ann.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  const next = await bob.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ echo: true }]) });
  const n = await until(bob, next, DONE, "Bob's next turn");
  assert.equal(n.turn.status, "done");
  const earlier: string[] = JSON.parse(finalText(n)).earlier;
  assert.match(earlier.at(-1)!, /^Engine note \(not from the player\): the turn above stopped before you answered it, because the player's assistant allowance ran out\./);
});

test("disclosure: threads are their human's only; stored tool results pass the disclosure checker", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId, game } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const SECRET = "bob_assistant_marker";
  const r = await bob.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", language: "typescript", source: `function agent(x) { const ${SECRET} = 1; return [add(${SECRET})]; }` }, game!.gameId) });
  assert.equal(r.accepted, true, r.message);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [
    { name: "get_observation" }, { name: "get_events" }, { name: "get_trajectories" }, { name: "get_my_utility" }, { name: "get_chat" },
  ] }, { text: "ok" }]) });
  const t = await until(ann, sent, DONE, "the reads finish");
  assert.equal(t.turn.status, "done");
  assert.ok(t.calls.every((c: any) => c.status === "ok"), JSON.stringify(t.calls.map((c: any) => [c.tool, c.status, c.summary])));
  const check = disclosureChecker(game!.gameId, ann.subject, [SECRET]);
  for (const c of t.calls) await check(`assistant ${c.tool}`, JSON.parse(c.resultJson));
  await check("assistant thread", t);
  assert.equal(await errorCode(bob.c.query(api.assistant.thread, { threadId: sent.threadId })), "NOT_FOUND");
  assert.deepEqual(await bob.c.query(api.assistant.threads, { roomId }), []);
  assert.deepEqual(await bob.c.query(api.assistant.threads, { roomId, gameId: game!.gameId }), [], "nor by naming the game");
  assert.equal((await ann.c.query(api.assistant.threads, { roomId })).length, 1);
  assert.equal(await errorCode(bob.c.mutation(api.assistant.cancel, { turnId: sent.turnId })), "NOT_FOUND");
});

test("the transcript is a query of (room, game): a new game's has no thread, whatever thread the client names; send refuses a game that is no longer current", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId, game } = await assistantRoom(["Ann Script", "Bob Script", "Cyd Script"]);
  const g1 = game!.gameId as string;
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).game, g1, "status names the current game");
  assert.equal((await ann.c.query(api.assistant.transcript, { roomId, gameId: g1 })).thread, null, "no conversation yet");
  const first = await ann.c.mutation(api.assistant.send, { roomId, gameId: g1, text: mock([{ text: "one" }]) });
  await until(ann, first, DONE, "game 1's turn");
  const t1 = await ann.c.query(api.assistant.transcript, { roomId, gameId: g1 });
  assert.deepEqual([t1.thread._id, t1.thread.gameId, t1.messages.at(-1).text], [first.threadId, g1, "one"], "the latest conversation of the game by default");
  assert.equal((await ann.c.query(api.assistant.transcript, { roomId, gameId: g1, threadId: first.threadId })).thread._id, first.threadId);
  assert.equal((await bob.c.query(api.assistant.transcript, { roomId, gameId: g1, threadId: first.threadId })).thread, null, "never another player's");

  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  const g2 = (await ann.c.action(api.owner.start, { roomId })).gameId as string;
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).game, g2);
  for (const args of [{}, { threadId: first.threadId }]) {
    const t2 = await ann.c.query(api.assistant.transcript, { roomId, gameId: g2, ...args });
    assert.deepEqual([t2.thread, t2.messages, t2.turns, t2.toolCalls], [null, [], [], []], `game 2's transcript is empty, even naming game 1's thread (${JSON.stringify(args)})`);
  }
  assert.equal((await ann.c.query(api.assistant.transcript, { roomId, gameId: g1 })).thread._id, first.threadId, "game 1's stays readable for game 1");
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, gameId: g1, text: "late" })), "CONFLICT", "a message meant for the last game is not sent");
  const second = await ann.c.mutation(api.assistant.send, { roomId, gameId: g2, text: mock([{ text: "two" }]) });
  await until(ann, second, DONE, "game 2's turn");
  const t2 = await ann.c.query(api.assistant.transcript, { roomId, gameId: g2 });
  assert.deepEqual(t2.messages.map((m: any) => m.text).at(-1), "two");
  assert.ok(!t2.messages.some((m: any) => m.text === "one"));
  assert.equal((await ann.c.query(api.assistant.transcript, { roomId, gameId: g2, threadId: first.threadId })).thread._id, second.threadId,
    "naming the last game's thread gets this game's conversation");
  assert.equal(await errorCode(ann.c.query(api.assistant.transcript, { roomId, gameId: "not-a-game" })), "NOT_FOUND");
});

test("a new game starts the assistant afresh: no thread, card, run, note or allowance of the last game; that game's stay readable by its player only", { timeout: 300_000 }, async () => {
  const { members: [ann, bob], roomId, game } = await assistantRoom(["Ann Fresh", "Bob Fresh", "Cyd Fresh"]);
  // Game 1: a conversation that runs code keeping a note and saving the script, then a summon card left waiting.
  const first = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "run_code", input: { language: "typescript", source: "function main(d) { store.put('notes/plan', 'game one plan'); return 1; }", datasets: [], saveAs: "plan" } }] },
    { text: "game one answer" },
  ]) });
  const one = await until(ann, first, DONE, "game 1's turn");
  assert.equal(one.turn.status, "done", JSON.stringify(one.turn.error));
  const run1 = JSON.parse(one.calls[0].resultJson).data;
  assert.deepEqual(run1.store, { written: ["notes/plan", "scripts/plan"], deleted: [] }, JSON.stringify(run1));
  const waiting = await ann.c.mutation(api.assistant.send, { roomId, threadId: first.threadId, text: mock([{ tools: [{ name: "summon_agent", input: { source: TS.Int } }] }, { text: "never" }]) });
  const card = await until(ann, waiting, ["awaiting_confirmation"], "the card waits");
  assert.ok((await ann.c.query(api.assistant.status, { roomId })).allowance.used > 0);

  // Game 2 in the same room: the waiting turn ends with game 1, its card denied; an approval afterwards runs nothing.
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  const game2 = await startGame(ann, roomId);
  const ended = await until(ann, waiting, DONE, "the waiting turn ends when the next game starts");
  assert.equal(ended.turn.status, "cancelled");
  assert.equal(ended.calls[0].status, "denied");
  assert.equal((await ann.c.mutation(api.assistant.confirm, { toolCallId: card.calls[0]._id, decision: "approve" })).status, "denied");
  assert.equal((await raw(game2.gameId)).agents.length, 0, "nothing was summoned");
  const status = await ann.c.query(api.assistant.status, { roomId });
  assert.equal(status.activeTurn, null);
  assert.deepEqual([status.allowance.epoch, status.allowance.used], [game2.gameId, 0], "a fresh allowance for the new game");
  assert.deepEqual(await ann.c.query(api.assistant.threads, { roomId }), [], "no conversation yet in this game");
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, threadId: first.threadId, text: "continue" })), "CONFLICT", "game 1's thread cannot be continued");

  // A new conversation: nothing earlier in its history, no run or note of game 1; the saved script stays the player's.
  const fresh = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [
      { name: "list_code_runs", input: {} }, { name: "list_code_objects", input: {} }, { name: "get_code_run", input: { runId: run1.runId } },
      { name: "run_code", input: { language: "typescript", source: "function main(d) { return store.get('notes/plan', 'none'); }", load: ["notes/*"], datasets: [] } },
    ] },
    { echo: true },
  ]) });
  const two = await until(ann, fresh, DONE, "game 2's turn");
  assert.equal(two.turn.status, "done", JSON.stringify(two.turn.error));
  const [runs, objects, oldRun, rerun] = [...two.calls].sort((a: any, b: any) => a.index - b.index).map((c: any) => JSON.parse(c.resultJson));
  assert.deepEqual([runs.data.runs, runs.data.budget.used.runs], [[], 0], "no code run of game 1");
  assert.deepEqual(objects.data.objects.map((o: any) => o.key), ["scripts/plan"], "game 1's note and run result are not in game 2's store");
  assert.equal(oldRun.error?.code, "NOT_FOUND", JSON.stringify(oldRun));
  assert.equal(rerun.data.result, "none", JSON.stringify(rerun));
  assert.deepEqual(JSON.parse(finalText(two)).earlier, [], "the model sees no earlier conversation");
  assert.deepEqual((await ann.c.query(api.assistant.threads, { roomId })).map((t: any) => t._id), [fresh.threadId]);

  // Game 1's conversation and runs stay readable by Ann, for game 1.
  const old = await ann.c.query(api.assistant.threads, { roomId, gameId: game!.gameId });
  assert.deepEqual(old.map((t: any) => [t._id, t.gameId]), [[first.threadId, game!.gameId]]);
  const kept = await thread(ann, first.threadId);
  assert.equal(kept.thread.gameId, game!.gameId);
  assert.ok(kept.messages.some((m: any) => m.text === "game one answer"));
  assert.equal((await ann.c.query(api.code.runs.get, { roomId, runId: run1.runId })).status, "ok");
  // Never another player's.
  assert.deepEqual(await bob.c.query(api.assistant.threads, { roomId, gameId: game!.gameId }), []);
  assert.equal(await errorCode(thread(bob, first.threadId)), "NOT_FOUND");
  assert.equal(await errorCode(bob.c.query(api.code.runs.get, { roomId, runId: run1.runId })), "NOT_FOUND");
  const elsewhere = await assistantRoom(["Ann Else", "Bob Else", "Cyd Else"]);
  assert.equal(await errorCode(ann.c.query(api.assistant.threads, { roomId, gameId: elsewhere.game!.gameId })), "NOT_FOUND", "a game of another room");
});

test("the assistant arranges the player's screen: open_panel changes the layout row at once, chips name it, a third layout change in one step is refused", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "open_panel", input: { panelId: "objects", params: { limit: 4, filter: "chips" } } }] },
    { tools: [
      { name: "open_panel", input: { panelId: "race", place: { relativeTo: "p1", direction: "below" } } },
      { name: "get_layout" },
      { name: "move_pane", input: { paneId: "p2", place: { relativeTo: "p1", direction: "right" } } },
      { name: "close_pane", input: { paneId: "p1" } },
    ] },
    { text: "Arranged." },
  ]) });
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.deepEqual(t.calls.map((c: any) => [c.tool, c.status]), [["open_panel", "ok"], ["open_panel", "ok"], ["get_layout", "ok"], ["move_pane", "ok"], ["close_pane", "error"]]);
  // The objects panel is the default pane, so the first open_panel reuses it (parameters replaced) rather than adding one.
  assert.equal(t.calls[0].summary, "Updated Top 4 by payoff · only ones others care about", "the chip names the change; no confirmation card");
  assert.match(t.calls[4].resultJson, /At most 2 layout changes/, "get_layout is a read; the third change is refused before it runs");
  const layout = await ann.c.query(api.layout.current, { roomId });
  assert.equal(layout.source, "room");
  assert.equal(layout.setBy?.kind, "assistant");
  const panels = Object.values(layout.layout.panes).filter((p: any) => p.kind === "panel") as any[];
  assert.deepEqual(panels.map(p => [p.panelId, p.setBy]).sort(), [["objects", "assistant"], ["race", "assistant"]]);
  assert.equal(panels.find(p => p.panelId === "objects").params.limit, 4);
  const assistantPane = (Object.values(layout.layout.panes) as any[]).find(p => p.kind === "assistant");
  const parentOf = (node: any, id: string): any => node.type === "tabs" ? (node.panes.includes(id) ? node : null)
    : node.children.map((c: any) => parentOf(c, id)).find(Boolean) && (node.children.some((c: any) => c.type === "tabs" && c.panes.includes(id)) ? node : node.children.map((c: any) => parentOf(c, id)).find(Boolean));
  assert.equal(parentOf(layout.layout.root, assistantPane.id).direction, "row", "the assistant pane moved beside the objects pane");
  assert.ok(Object.values(layout.layout.panes).some((p: any) => p.kind === "assistant"), "the assistant pane is still there");
});

test("a stored panel saved by the assistant is listed with author kind assistant", { timeout: 120_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  const source = `import { definePanel } from "@sdk";\nexport default definePanel({ title: "Made by assistant", placement: "left", Component() { return <p>hi</p>; } });\n`;
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "save_panel", input: { slug: "assistant-made", source } }] }, { text: "Saved." }]) });
  const t = await until(ann, sent, DONE, "the save finishes");
  assert.equal(t.calls[0].status, "ok", t.calls[0].resultJson);
  const panel = (await ann.c.query(api.panels.list, {})).find((p: any) => p.slug === "assistant-made");
  assert.equal(panel?.author.kind, "assistant");
});

test("a provider refusal (out of credit) tells the player who can fix it and gives the reservation back", { timeout: 120_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Alpha", "Bob Bravo", "Cyd Charl"], { start: false });
  // OpenAI's answer on the cloud environment's first real call: HTTP 429 insufficient_quota.
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ fail: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.", status: 429 }]) });
  const t = await until(ann, sent, DONE, "the turn fails");
  assert.equal(t.turn.status, "failed");
  assert.equal(t.turn.error.code, "MODEL");
  assert.match(t.turn.error.message, /out of credit[\s\S]*whoever runs this server/i);
  assert.doesNotMatch(t.turn.error.message, /platform\.openai\.com/);
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).allowance.used, 0, "a refused request cost nothing, so its reservation is released");

  // A failure without an HTTP status (the stream broke after it started) may have been billed: the reservation stays.
  const broken = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ fail: "stream cut" }]) });
  const b = await until(ann, broken, DONE, "the second turn fails");
  assert.equal(b.turn.error.message, "The model call failed: stream cut");
  assert.ok((await ann.c.query(api.assistant.status, { roomId })).allowance.used > 0);
});
