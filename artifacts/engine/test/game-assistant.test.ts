/**
 * The in-client assistant (convex/assistant.ts, convex/assistant/*; docs/surface-architecture.md §6) against the live
 * local backend with the scripted mock ChatProvider (CODE_GODS_AI_MOCK=1, set by `pnpm --filter @workspace/engine dev`).
 * A `/mock {json}` message scripts the model's steps (lib/ai-player chat-mock.ts).
 *
 * What would break: tools running outside the human's assistant credential, a second concurrent turn, cancellation
 * or confirmation leaking calls, command ids chosen by the model (double summons), the assistant pool spilling into
 * other players or the AI seats' pool, threads readable by another human, and disclosure through stored tool results.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, sleep, touch, waitFor, TS, type God } from "./game-helpers.ts";
import { disclosureChecker } from "./disclosure.ts";
import { commandIdFor } from "../convex/assistant/rules.ts";

const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());
const derived = (turnId: string, callId: string) => commandIdFor(turnId, callId, sha1);
const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try { await promise; } catch (error) { return (error as { data?: { code?: string } }).data?.code ?? `untyped: ${(error as Error).message}`; }
  return "no error";
}

/** A room of three humans (first is owner) with the assistant enabled, optionally in a started game. */
async function assistantRoom(names: [string, string, string], { budget = 500_000, start = true } = {}) {
  const members = await gods(...names);
  await touch(members[0]);
  const { roomId } = await roomWith(members, settings);
  if (budget) await members[0].c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: budget });
  const game = start ? await members[0].c.action(api.owner.start, { roomId }) : null;
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
  const next = await ann.c.mutation(api.assistant.send, { roomId, threadId: sent.threadId, text: mock([{ text: "back" }]) });
  assert.equal((await until(ann, next, DONE, "a new turn")).turn.status, "done");
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
  // An allowance that covers one step but not two.
  await ann.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 0, assistantBudget: firstStep + 1000 });
  const sent = await bob.c.mutation(api.assistant.send, { roomId, text: mock([{ tools: [{ name: "whoami" }] }, { text: "never" }]) });
  const t = await until(bob, sent, DONE, "Bob's turn ends");
  assert.equal(t.turn.status, "budget_exhausted");
  assert.match(t.turn.error.message, /allowance/i);
  assert.deepEqual(t.calls.map((c: any) => c.status), ["ok"], "the first step ran");
  assert.ok(!finalText(t).includes("never"));
  assert.equal((await ann.c.query(api.assistant.status, { roomId })).allowance.used, annUsed, "Ann's allowance is untouched");
  const cydTurn = await cyd.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "fine" }]) });
  assert.equal((await until(cyd, cydTurn, DONE, "Cyd's turn")).turn.status, "done", "other players keep their allowance");
  const { room } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed, 0, "the seats pool is untouched");
  const status = await bob.c.query(api.assistant.status, { roomId });
  assert.equal(status.enabled, true);
  assert.ok(status.allowance.used <= status.allowance.limit);
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
  assert.equal((await ann.c.query(api.assistant.threads, { roomId })).length, 1);
  assert.equal(await errorCode(bob.c.mutation(api.assistant.cancel, { turnId: sent.turnId })), "NOT_FOUND");
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
