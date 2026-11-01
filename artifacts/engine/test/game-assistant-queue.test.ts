/**
 * The assistant's message queue (convex/assistant.ts send/editQueued/removeQueued/sendQueued, assistant/store.ts
 * deliverQueued; docs/surface-architecture.md §6 "Queued messages") against the live local backend with the scripted
 * mock ChatProvider. A `/mock {json}` message scripts the model's steps; `echo` answers with what the model was given
 * (`later`: the text of the turn's user messages after its prompt, i.e. queued messages delivered after tool results).
 *
 * What would break: a message sent while the assistant works being refused, lost, delivered twice, delivered out of
 * order or in the wrong place (before the tool results, or as a new turn while the turn still has steps); a queue that
 * lives only in one tab; Stop sending held messages anyway; a queued message approving a confirmation card.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, playerClient, roomWith, sleep, startGame, touch, waitFor, type God } from "./game-helpers.ts";
import { QUEUED_NOTE } from "../convex/assistant/rules.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];
/** A first step that streams slowly (time to queue) and then calls a tool. */
const slowToolStep = { text: ["a", "b", "c", "d"], delayMs: 700, tools: [{ name: "whoami" }] };

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

async function assistantRoom(names: [string, string, string]) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members, settings);
  await members[0].c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: 500_000 });
  await startGame(members[0], roomId);
  return { members, roomId };
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
const streaming = (god: God, sent: { threadId: string; turnId: string }) =>
  waitFor(async () => (await turnOf(god, sent.threadId, sent.turnId)).messages.some((m: any) => m.role === "assistant" && m.status === "streaming" && m.text), "text streams", 60_000, 100);
const echoes = (t: { messages: any[] }) => t.messages.filter(m => m.role === "assistant" && m.text.startsWith("{")).map(m => JSON.parse(m.text));
const queuedOf = async (god: God, roomId: string) => (await god.c.query(api.assistant.status, { roomId })).queued;

test("messages sent during a tool step reach the model after that step's tool results, in order, exactly once, in the same turn", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Queue", "Bob Queue", "Cyd Queue"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([slowToolStep, { echo: true, tools: [{ name: "whoami" }] }, { echo: true }]) });
  await streaming(ann, sent);
  const first = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "use add(2)", clientId: "q-1" });
  const second = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "and keep it cheap", clientId: "q-2" });
  assert.equal(first.queued, true, "the composer stays usable: the message is queued, not refused");
  assert.equal(first.turnId, null);
  // The same clientId again (a retried send) is the same message, not a third one.
  const retried = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "use add(2)", clientId: "q-1" });
  assert.equal(retried.queueId, first.queueId);
  assert.deepEqual((await queuedOf(ann, roomId)).map((q: any) => q.text), ["use add(2)", "and keep it cheap"], "visible as queued, oldest first");

  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.turn.status, "done", JSON.stringify(t.turn.error));
  assert.deepEqual(t.messages.map((m: any) => m.role === "user" ? `user:${m.text.startsWith("/mock") ? "prompt" : m.text}` : "assistant"),
    ["user:prompt", "assistant", "user:use add(2)", "user:and keep it cheap", "assistant", "assistant"], "delivered between the tool step and the next model step, in the same turn");
  const [afterDelivery, nextStep] = echoes(t);
  assert.deepEqual(afterDelivery.later, [QUEUED_NOTE, "use add(2)", "and keep it cheap"], "after the tool results, in order");
  assert.deepEqual(nextStep.later, afterDelivery.later, "exactly once: the next step sees them once, at the same place");
  assert.deepEqual(await queuedOf(ann, roomId), [], "nothing left queued");
  // A retry after delivery still changes nothing.
  const late = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "use add(2)", clientId: "q-1" });
  assert.equal(late.queueId, first.queueId);
  assert.equal((await thread(ann, sent.threadId)).turns.length, 1, "no new turn from a replayed clientId");
});

test("a turn that ends with no tool calls starts the next turn at once with the queued messages, in order, in the same thread", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Next", "Bob Next", "Cyd Next"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["a", "b", "c", "d"], delayMs: 700 }]) });
  await streaming(ann, sent);
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "first thought" });
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ echo: true }]) });
  const done = await until(ann, sent, DONE, "the first turn finishes");
  assert.equal(done.turn.status, "done");
  assert.deepEqual(done.messages.map((m: any) => m.role), ["user", "assistant"], "nothing was injected into a turn with no tool step");
  const next = await waitFor(async () => {
    const t = await thread(ann, sent.threadId);
    const turn = t.turns.find((x: any) => x._id !== sent.turnId);
    return turn && DONE.includes(turn.status) ? { ...t, turn, messages: t.messages.filter((m: any) => m.turnId === turn._id) } : null;
  }, "the queued messages' turn finishes", 60_000, 150);
  assert.equal(next.turn.status, "done");
  assert.deepEqual(next.messages.filter((m: any) => m.role === "user").map((m: any) => m.text.startsWith("/mock") ? "the script" : m.text), ["first thought", "the script"], "both queued messages, in order");
  const [echo] = echoes(next);
  assert.equal(echo.context.at(-1), "first thought", "the model reads both: the earlier one before the last, after the briefing");
  assert.ok(echo.context[0].startsWith("<briefing>"));
  assert.deepEqual(await queuedOf(ann, roomId), []);
});

test("the queue lives in Convex: another tab sees it, edits and removals apply until delivery, and only queued messages can change", { timeout: 180_000 }, async () => {
  const { members: [ann, bob], roomId } = await assistantRoom(["Ann Tabs", "Bob Tabs", "Cyd Tabs"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ ...slowToolStep, text: ["a", "b", "c", "d", "e", "f", "g", "h"] }, { echo: true }]) });
  await streaming(ann, sent);
  const keep = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "typo heer" });
  const drop = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "never mind this" });
  // A second tab (the player's own app connection) and a reload see the same queue.
  const app = await playerClient(ann, roomId, "act");
  assert.deepEqual((await app.query(api.assistant.status, { roomId })).queued.map((q: any) => q.text), ["typo heer", "never mind this"]);
  assert.deepEqual(await queuedOf(bob, roomId), [], "another player never sees it");
  assert.equal(await errorCode(bob.c.mutation(api.assistant.removeQueued, { queueId: keep.queueId })), "NOT_FOUND");
  await app.mutation(api.assistant.editQueued, { queueId: keep.queueId, text: "typo here" });
  await ann.c.mutation(api.assistant.removeQueued, { queueId: drop.queueId });
  assert.deepEqual((await queuedOf(ann, roomId)).map((q: any) => q.text), ["typo here"]);

  const t = await until(ann, sent, DONE, "the turn finishes");
  const [echo] = echoes(t);
  assert.deepEqual(echo.later, [QUEUED_NOTE, "typo here"], "the edited text, and not the removed one");
  assert.deepEqual(await ann.c.mutation(api.assistant.editQueued, { queueId: keep.queueId, text: "too late" }), { status: "delivered" }, "a delivered message no longer changes");
  assert.equal(t.messages.filter((m: any) => m.role === "user").at(-1).text, "typo here");
});

test("two deliveries racing at the same boundary deliver each queued message once", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Race", "Bob Race", "Cyd Race"]);
  // The second step streams slowly after a tool step, so the turn is past a boundary (its latest step called tools).
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "whoami" }] }, { ...slowToolStep, text: ["a", "b", "c", "d", "e", "f"] }, { echo: true }]) });
  await streaming(ann, sent);
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "only once" });
  const { gen } = await admin.query(internal.testing.rawAssistantTurn, { turnId: sent.turnId });
  const results = await Promise.all([1, 2, 3].map(() => admin.mutation(internal.assistant.store.deliverQueued, { turnId: sent.turnId, gen })));
  assert.deepEqual(results.map(r => r.delivered).sort(), [0, 0, 1], "one delivery wins; the others find nothing queued");
  const t = await until(ann, sent, DONE, "the turn finishes");
  assert.equal(t.messages.filter((m: any) => m.text === "only once").length, 1);
  assert.deepEqual(echoes(t)[0].later, [QUEUED_NOTE, "only once"], "once, after the streaming step's tool results");
});

test("Stop keeps queued messages, held: nothing starts until the player sends; a message sent while stopping is not held", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Stop", "Bob Stop", "Cyd Stop"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ ...slowToolStep, text: ["a", "b", "c", "d", "e", "f"] }, { text: "never" }]) });
  await streaming(ann, sent);
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "held reply" }]) });
  await ann.c.mutation(api.assistant.cancel, { turnId: sent.turnId });
  const t = await until(ann, sent, DONE, "the turn ends");
  assert.equal(t.turn.status, "cancelled");
  await sleep(1500);
  const held = await queuedOf(ann, roomId);
  assert.equal(held.length, 1);
  assert.equal(held[0].held, true, "kept, and marked held");
  assert.equal((await thread(ann, sent.threadId)).turns.length, 1, "no turn started from it");
  const resumed = await ann.c.mutation(api.assistant.sendQueued, { roomId });
  const r = await until(ann, { threadId: sent.threadId, turnId: resumed.turnId }, DONE, "the held message's turn");
  assert.equal(r.messages.find((m: any) => m.role === "assistant")?.text, "held reply");
  assert.deepEqual(await queuedOf(ann, roomId), []);

  // Sent after Stop but before the step acknowledged it: it starts its own turn once the cancellation lands.
  const again = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: ["x", "y", "z", "w"], delayMs: 700 }]) });
  await streaming(ann, again);
  await ann.c.mutation(api.assistant.cancel, { turnId: again.turnId });
  const after = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "after stop" }]) });
  assert.equal(after.queued, true);
  await until(ann, again, DONE, "the second turn ends");
  const started = await waitFor(async () => {
    const th = await thread(ann, sent.threadId);
    const last = th.turns.at(-1);
    return last && last._id !== again.turnId && DONE.includes(last.status) ? th.messages.filter((m: any) => m.turnId === last._id) : null;
  }, "the message sent while stopping runs", 60_000, 150);
  assert.equal(started.find((m: any) => m.role === "assistant")?.text, "after stop");
});

test("a queued message never approves a waiting card: it declines it, and the model reads the message with the declined result", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Card", "Bob Card", "Cyd Card"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([
    { tools: [{ name: "send_chat", input: { text: "hello everyone" } }] },
    { echo: true },
  ]) });
  const card = await waitFor(async () => (await turnOf(ann, sent.threadId, sent.turnId)).calls.find((c: any) => c.status === "awaiting_confirmation"), "the card waits", 30_000, 150);
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "don't post that, ask me first" });
  const t = await until(ann, sent, DONE, "the turn finishes");
  const call = t.calls.find((c: any) => c._id === card._id);
  assert.equal(call.status, "denied");
  assert.match(JSON.parse(call.resultJson).error.message, /sent a message instead/);
  assert.deepEqual(echoes(t)[0].later, [QUEUED_NOTE, "don't post that, ask me first"], "with the declined result, before the next step");
  const chat = await ann.c.query(api.player.observation, { roomId });
  assert.ok(!JSON.stringify(chat).includes("hello everyone"), "nothing was posted");
});

test("the queue is bounded and needs the assistant on; an earlier conversation of the game is not where a busy assistant reads", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Bound", "Bob Bound", "Cyd Bound"]);
  const old = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "ok" }]) });
  await until(ann, old, DONE, "an earlier conversation");
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: ["a", "b", "c", "d", "e", "f", "g", "h"], delayMs: 700 }]) });
  await streaming(ann, sent);
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, threadId: old.threadId, text: "here?" })), "CONFLICT");
  for (let i = 0; i < 5; i++) await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: `q${i}` });
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "one too many" })), "BAD_REQUEST");
  await ann.c.mutation(api.assistant.cancel, { turnId: sent.turnId });
});

test("a turn that fails holds its queued messages instead of spending them on a turn bound to fail; the queue keeps the busy turn's rights", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Fail", "Bob Fail", "Cyd Fail"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ fail: "provider down", delayMs: 3000 }]) });
  await waitFor(async () => (await turnOf(ann, sent.threadId, sent.turnId)).messages.some((m: any) => m.role === "assistant" && m.status === "streaming"), "the step opens", 60_000, 100);
  assert.equal(await errorCode(ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, permission: "read", text: "just watch" })), "CONFLICT",
    "a change of rights is not slipped into the running turn's queue");
  const queued = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "try again", clientId: "fail-1" });
  await ann.c.mutation(api.assistant.editQueued, { queueId: queued.queueId, text: "try again, please" });
  assert.equal((await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "try again", clientId: "fail-1" })).queueId, queued.queueId,
    "a retry after an edit is still the same message");
  const t = await until(ann, sent, DONE, "the turn fails");
  assert.equal(t.turn.status, "failed");
  await sleep(1000);
  assert.deepEqual((await queuedOf(ann, roomId)).map((q: any) => [q.text, q.held]), [["try again, please", true]], "held, not spent");
  assert.equal((await thread(ann, sent.threadId)).turns.length, 1);
});

test("starting the next game drops the last game's queued messages with its conversation; the new game starts with an empty queue", { timeout: 180_000 }, async () => {
  const { members: [ann], roomId } = await assistantRoom(["Ann Drop", "Bob Drop", "Cyd Drop"]);
  const sent = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ ...slowToolStep, text: ["a", "b", "c", "d", "e", "f", "g", "h"], delayMs: 1500 }, { text: "never" }]) });
  await streaming(ann, sent);
  await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: "for the old game" });
  await ann.c.mutation(api.rooms.endActiveGame, { roomId });
  await startGame(ann, roomId);
  assert.deepEqual(await queuedOf(ann, roomId), [], "the new game's queue is empty");
  const old = await until(ann, sent, DONE, "the last game's turn ends");
  assert.equal(old.turn.status, "cancelled");
  await sleep(1500);
  assert.ok(!(await thread(ann, sent.threadId)).messages.some((m: any) => m.text === "for the old game"), "never delivered into the old conversation");
  assert.equal((await thread(ann, sent.threadId)).turns.length, 1, "and no turn started from it");
  const fresh = await ann.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "new game" }]) });
  assert.equal(fresh.queued, false, "the new game's first message starts a turn");
  assert.notEqual(fresh.threadId, sent.threadId);
});
