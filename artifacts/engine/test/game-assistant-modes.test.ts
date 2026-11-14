/**
 * The assistant's modes (convex/assistant/mode.ts; docs/surface-architecture.md §6 "Modes") against the live local
 * backend with the scripted mock ChatProvider (AI_MOCK=1). No call waits for an approval any more.
 *
 * What would break: a Read-only assistant changing anything because the model asked for a tool (enforcement only in the
 * prompt), On request acting without a message, Autopilot not running on its own, running past its game, its budget or
 * its mode, and a player's message waiting behind an autopilot turn.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, makeAdmin, playerClient, raw, roomWith, startGame, touch, waitFor, TS, type God } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Grid",
  typeArgs: { size: 4, symbols: "base10", colours: "mono" }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

async function modeRoom(names: [string, string, string], { start = true } = {}) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members, settings);
  await makeAdmin(members[0]);
  await members[0].c.mutation(api.rooms.setAiQuotas, { roomId, assistantQuota: 500_000 });
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
const tick = (roomId: string, subject: string, chain: number) => admin.mutation(internal.assistant.autopilot.tick, { roomId, subject, chain });
const prefsOf = (roomId: string, god: God) => admin.query(internal.testing.rawAssistantPrefs, { roomId, subject: god.subject });

test("Read-only: the model may ask for any tool, but nothing that changes anything runs; reads do", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId, game } = await modeRoom(["Ro Ann", "Ro Bob", "Ro Cyd"]);
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).mode, "onRequest", "the default");
  await ann.c.mutation(api.assistant.setMode, { roomId, mode: "readOnly" });
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).mode, "readOnly");
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "summon_agent", input: { source: TS.Grid, name: "Sneaky" } }, { name: "send_chat", input: { text: "read-only hello" } }, { name: "get_observation", input: { objectsLimit: 1 } }] },
    { text: "ok" },
  ]) });
  const t = await until(ann, sent, DONE, "the read-only turn ends");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  const [summon, chat, look] = [...t.calls].sort((a: any, b: any) => a.index - b.index);
  for (const call of [summon, chat]) {
    assert.equal(call.status, "error", call.tool);
    assert.match(call.resultJson, /READ_ONLY/);
  }
  assert.equal(look.status, "ok", "reads run");
  assert.ok(!t.turn.tools.includes("summon_agent") && !t.turn.tools.includes("send_chat") && t.turn.tools.includes("get_observation"), "only read tools were offered");
  assert.equal((await raw(game!.gameId)).agents.length, 0, "nothing was summoned");
  const obs = await ann.c.query(api.player.observation, { roomId });
  assert.ok(!obs.chat.some((m: any) => m.text === "read-only hello"), "no chat was sent");
});

test("On request: a summon the player asks for runs at once, with no approval; no turn opens without a message", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId, game } = await modeRoom(["Or Ann", "Or Bob", "Or Cyd"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "summon_agent", input: { source: TS.Grid, name: "Test agent" } }] }, { text: "Summoned." }]) });
  const t = await until(ann, sent, DONE, "the turn ends");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.equal(t.calls[0].status, "ok", t.calls[0].resultJson);
  assert.equal((await raw(game!.gameId)).agents.filter((a: any) => a.ownerId === ann.subject).length, 1, "summoned once, without a card");

  // An autopilot tick (a stale chain from before, or a forged one) opens nothing in On request.
  const before = (await ann.c.query(api.assistant.threads, { roomId })).length;
  const { stopped } = await tick(roomId, ann.subject, (await prefsOf(roomId, ann))?.autopilotChain ?? 0);
  assert.equal(stopped, "stale");
  const status = await ann.c.query(api.assistant.status, { roomId });
  assert.equal(status.activeTurn, null);
  assert.equal((await ann.c.query(api.assistant.threads, { roomId })).length, before);
});

test("Autopilot: turns open on their own in the game's thread, labelled, paid from the player's quota; a message preempts one; game end stops it", { timeout: 300_000 }, async () => {
  const { members: [ann, bob], roomId } = await modeRoom(["Ap Ann", "Ap Bob", "Ap Cyd"]);
  // Nobody else's mode changes.
  await ann.c.mutation(api.assistant.setMode, { roomId, mode: "autopilot" });
  assert.equal((await bob.c.query(api.assistant.status, { roomId })).mode, "onRequest");
  const first = await waitFor(async () => {
    const [t] = await ann.c.query(api.assistant.threads, { roomId });
    if (!t) return null;
    const view = await thread(ann, t._id);
    return view.turns.some((x: any) => x.trigger === "autopilot" && DONE.includes(x.status)) ? view : null;
  }, "an autopilot turn runs without a message", 60_000, 250);
  const turn = first.turns.find((x: any) => x.trigger === "autopilot");
  assert.equal(turn.status, "done", JSON.stringify(turn.error));
  const prompt = first.messages.find((m: any) => m.turnId === turn._id && m.role === "user");
  assert.equal(prompt.autopilot, true, "its message is the engine's, labelled");
  assert.match(prompt.text, /^\(autopilot\)/);
  assert.ok(turn.maxSteps <= 6, "a short turn");
  assert.ok(!turn.tools.includes("wake_engine"), "autopilot cannot keep the engine awake");
  const status = await ann.c.query(api.assistant.status, { roomId });
  assert.ok(status.allowance.used > 0, "it counts against the player's quota for this game");
  assert.equal(status.mode, "autopilot");

  // Leaving Autopilot ends the chain.
  const chain = (await prefsOf(roomId, ann))!.autopilotChain!;
  await ann.c.mutation(api.assistant.setMode, { roomId, mode: "onRequest" });
  assert.equal((await tick(roomId, ann.subject, chain)).stopped, "stale");

  // The player's message comes first: sent while an autopilot turn runs, it stops that turn and starts its own.
  const slow = await admin.mutation(internal.testing.openAutopilotTurn, { roomId, subject: ann.subject, text: mock([{ text: ["a", "b", "c", "d", "e", "f"], delayMs: 1500 }]) });
  await waitFor(async () => (await turnOf(ann, slow.threadId, slow.turnId)).messages.some((m: any) => m.role === "assistant"), "the autopilot turn streams", 30_000, 100);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, threadId: slow.threadId, text: mock([{ text: "Your answer." }]) });
  assert.deepEqual([sent.queued, sent.threadId], [true, slow.threadId], "in the conversation on the player's screen");
  const stopped = await until(ann, slow, DONE, "the autopilot turn stops");
  assert.equal(stopped.turn.status, "cancelled");
  assert.equal(stopped.turn.error?.code, "PREEMPTED");
  const mine = await waitFor(async () => {
    const view = await thread(ann, sent.threadId);
    return view.turns.find((x: any) => x.trigger === null && x.createdAt > stopped.turn.createdAt && DONE.includes(x.status)) ?? null;
  }, "the player's message runs next", 60_000, 200);
  assert.equal(mine.status, "done");

  // Its budget: down to the last tenth of the player's quota, the chain stops (the rest is theirs to ask with).
  await admin.mutation(internal.testing.setAssistantUsed, { roomId, subject: ann.subject, usedTokens: 460_000 });
  await ann.c.mutation(api.assistant.setMode, { roomId, mode: "autopilot" });
  const again = (await prefsOf(roomId, ann))!.autopilotChain!;
  assert.ok(again > chain, "choosing Autopilot again starts a new chain");
  assert.equal((await tick(roomId, ann.subject, again)).stopped, "budget");
  await admin.mutation(internal.testing.setAssistantUsed, { roomId, subject: ann.subject, usedTokens: 0 });
  // It stops with the game.
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  assert.equal((await tick(roomId, ann.subject, again)).stopped, "no game");
});

test("Autopilot needs a connection that may act, and an assistant that is on", { timeout: 120_000 }, async () => {
  const { members: [, bob], roomId } = await modeRoom(["Apr Ann", "Apr Bob", "Apr Cyd"], { start: false });
  const readApp = await playerClient(bob, roomId, "read");
  assert.equal(await errorCode(readApp.mutation(api.assistant.setMode, { roomId, mode: "autopilot" })), "FORBIDDEN");
});

test("a message from another conversation, or with new rights, still preempts autopilot and runs in its own conversation", { timeout: 240_000 }, async () => {
  const { members: [ann], roomId } = await modeRoom(["Pre Ann", "Pre Bob", "Pre Cyd"]);
  const older = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "older" }]) });
  await until(ann, older, DONE, "the older conversation's turn");
  const latest = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "latest" }]) });
  await until(ann, latest, DONE, "the latest conversation's turn");
  assert.notEqual(older.threadId, latest.threadId);
  const slow = await admin.mutation(internal.testing.openAutopilotTurn, { roomId, subject: ann.subject, text: mock([{ text: ["a", "b", "c", "d", "e", "f"], delayMs: 1500 }]) });
  assert.equal(slow.threadId, latest.threadId, "autopilot plays in the latest conversation");
  await waitFor(async () => (await turnOf(ann, slow.threadId, slow.turnId)).messages.some((m: any) => m.role === "assistant"), "the autopilot turn streams", 30_000, 100);
  // Catches: CONFLICT ("answering in another conversation", or "working with act rights") leaving autopilot running.
  const sent = await ann.c.mutation(api.assistant.send, { roomId, threadId: older.threadId, permission: "owner", ownerConsent: true, text: mock([{ text: "Mine." }]) });
  assert.deepEqual([sent.queued, sent.threadId], [true, older.threadId]);
  const stopped = await until(ann, slow, DONE, "the autopilot turn stops");
  assert.equal(stopped.turn.error?.code, "PREEMPTED");
  const mine = await waitFor(async () => (await thread(ann, older.threadId)).turns.find((x: any) => x.createdAt > stopped.turn.createdAt && DONE.includes(x.status)) ?? null,
    "the player's message runs in its conversation", 60_000, 200);
  assert.equal(mine.status, "done");
  assert.ok(mine.tools.includes("start_game"), "with the rights the player chose");
});

test("a message sent from a replay runs read-only, whatever the mode: nothing lands in the live room", { timeout: 180_000 }, async () => {
  const { members: [ann, bob], roomId, game } = await modeRoom(["Rep Ann", "Rep Bob", "Rep Cyd"]);
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  const at = { gameId: game!.gameId, cursor: 1, events: 10, worldSeconds: 1, povGodId: bob.subject };
  const sent = await ann.c.mutation(api.assistant.send, { roomId, replay: at, text: mock([{ tools: [{ name: "send_chat", input: { text: "from the replay" } }] }, { text: "ok" }]) });
  const t = await until(ann, sent, DONE, "the replay turn ends");
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).mode, "onRequest");
  assert.equal(t.calls[0].status, "error");
  assert.match(t.calls[0].resultJson, /READ_ONLY/);
  assert.ok(!t.turn.tools.includes("send_chat"), "only read tools were offered");
});
