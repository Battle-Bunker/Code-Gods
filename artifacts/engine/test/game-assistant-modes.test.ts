/**
 * The assistant's modes (convex/assistant/mode.ts; docs/surface-architecture.md §6 "Modes") against the live local
 * backend with the scripted mock ChatProvider (AI_MOCK=1). No call waits for an approval any more.
 *
 * What would break: a Read-only assistant changing anything because the model asked for a tool (enforcement only in the
 * prompt), On request acting without a message, Autopilot not running on its own, running past its game, its budget or
 * its mode, a player's message waiting behind an autopilot turn, and the approval migration leaving a turn waiting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, makeAdmin, playerClient, raw, roomWith, startGame, touch, waitFor, TS, type God } from "./game-helpers.ts";

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
    { tools: [{ name: "summon_agent", input: { source: TS.Int, name: "Sneaky" } }, { name: "send_chat", input: { text: "read-only hello" } }, { name: "get_observation", input: { objectsLimit: 1 } }] },
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
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "summon_agent", input: { source: TS.Int, name: "Test agent" } }] }, { text: "Summoned." }]) });
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
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "Your answer." }]) });
  assert.equal(sent.queued, true);
  const stopped = await until(ann, slow, DONE, "the autopilot turn stops");
  assert.equal(stopped.turn.status, "cancelled");
  assert.equal(stopped.turn.error?.code, "PREEMPTED");
  const mine = await waitFor(async () => {
    const view = await thread(ann, slow.threadId);
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

test("migration: a turn waiting on an approval card ends, its call is denied, approval fields go; Only look becomes Read-only, the rest On request; a second run changes nothing", { timeout: 240_000 }, async () => {
  const { members: [ann, bob], roomId } = await modeRoom(["Mig Ann", "Mig Bob", "Mig Cyd"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "whoami" }] }, { text: "ok" }]) });
  const done = await until(ann, sent, DONE, "a turn to make legacy");
  await admin.mutation(internal.testing.legacyAssistantApprovals, { roomId, subject: ann.subject, turnId: sent.turnId, callId: done.calls[0]._id });
  // Bob chose "Only look" (a read assistant credential) and has no prefs row.
  const look = await bob.c.mutation(api.assistant.send, { roomId, permission: "read", text: mock([{ text: "ok" }]) });
  await until(bob, look, DONE, "Bob's read turn");
  assert.equal((await prefsOf(roomId, bob)), null);

  const runAll = async () => {
    const since = Date.now();
    await admin.mutation(internal.migrations.runAll, { reset: true });
    await waitFor(async () => {
      const statuses = await admin.query(internal.migrations.status, {}) as { state: string; latestStart?: number }[];
      assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
      return statuses.every(s => s.state === "success" && (s.latestStart ?? 0) >= since);
    }, "every migration reports success", 120_000, 250);
  };
  for (const run of [1, 2]) {
    await runAll();
    const t = await turnOf(ann, sent.threadId, sent.turnId);
    assert.equal(t.turn.status, "cancelled", `run ${run}: the waiting turn ended`);
    assert.equal(t.calls[0].status, "denied", `run ${run}`);
    assert.equal(t.thread.activeTurnId, undefined, `run ${run}: its thread is free`);
    const prefs = await prefsOf(roomId, ann);
    assert.deepEqual([prefs?.mode, prefs?.autoApproveSummonBits], ["onRequest", undefined], `run ${run}`);
    assert.equal((await prefsOf(roomId, bob))?.mode, "readOnly", `run ${run}: Only look became Read-only`);
    const raw = await admin.query(internal.testing.rawAssistantCall, { callId: done.calls[0]._id });
    assert.deepEqual([raw?.approved, raw?.confirmDeadline], [undefined, undefined], `run ${run}`);
  }
  // The player is free to talk again.
  const next = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "back" }]) });
  assert.equal(next.queued, false);
  assert.equal((await until(ann, next, DONE, "the next turn")).turn.status, "done");
});
