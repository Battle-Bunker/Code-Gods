/**
 * AI quotas and the admin gate (rooms.setAiQuotas, ai/seats.ts reserve, assistant.send, owner.start; lib/aiAccess.ts).
 * Every room has two per-game token quotas, 300,000 by default with no approval step: the AI players' pool and each
 * player's assistant. AI is used only in rooms whose owner is an administrator (ADMIN_EMAILS), checked when tokens are
 * spent, so a change of owner or of the allowlist takes effect at once.
 *
 * What would break: a room that needs an approval before its AI seats or assistant work, a non-admin room spending
 * tokens (seat turns, assistant turns, a start with AI seats), a non-admin room unable to start without AI seats, or
 * a quota a non-owner can change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, adminGods, api, makeAdmin, gods, internal, rejects, roomWith, startGame, touch, waitFor, type God } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Grid",
  typeArgs: { size: 4, symbols: "base10", colours: "mono" }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const ADMIN_ONLY = /AI is only available in rooms run by an administrator for now/;
const mock = (steps: unknown[]) => `/mock ${JSON.stringify({ steps })}`;
const DONE = ["done", "failed", "cancelled", "budget_exhausted"];

async function turnStatus(god: God, sent: { threadId: string; turnId: string }) {
  return waitFor(async () => {
    const t = await god.c.query(api.assistant.thread, { threadId: sent.threadId });
    const turn = t.turns.find((x: any) => x._id === sent.turnId);
    return DONE.includes(turn?.status) ? turn : null;
  }, "the assistant turn ends", 90_000, 150);
}
const seat = async (roomId: string, godId: string) => (await admin.query(internal.testing.rawRoom, { roomId })).members.find((m: any) => m.godId === godId);

test("a new room has 300k quotas and an admin's room plays AI seats and the assistant with no approval step", { timeout: 300_000 }, async () => {
  const [host] = await adminGods("Quota Admin");
  const [ada, bo] = await gods("Quota Ada", "Quota Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.aiQuota, 300_000);
  assert.equal(room.assistantQuota, 300_000);
  assert.equal(room.aiEnabled, true);
  assert.equal("aiBudget" in room || "assistantBudget" in room, false, "no approval fields");
  // The assistant works at once, for any member.
  const status = await ada.c.query(api.assistant.status, { roomId });
  assert.equal(status.enabled, true);
  assert.equal(status.allowance.limit, 300_000);
  const sent = await ada.c.mutation(api.assistant.send, { roomId, text: mock([{ text: "hello" }]) });
  assert.equal((await turnStatus(ada, sent)).status, "done");
  // An AI seat starts and plays.
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await startGame(host, roomId);
  await waitFor(async () => (await admin.query(internal.testing.rawRoom, { roomId })).room.aiUsed > 0, "the AI seat reserves tokens", 90_000, 500);
  assert.equal((await seat(roomId, godId)).aiFailures ?? 0, 0);
});

test("the owner changes the quotas (also during a game); others cannot; values are checked", { timeout: 180_000 }, async () => {
  const [host] = await adminGods("Quota Setter");
  const [ada, bo] = await gods("Quota Ann", "Quota Ben");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  assert.match(await rejects(ada.c.mutation(api.rooms.setAiQuotas, { roomId, aiQuota: 1 })), /owner/i);
  await host.c.mutation(api.rooms.setAiQuotas, { roomId, aiQuota: 50_000, assistantQuota: 0 });
  let room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.aiQuota, room.assistantQuota], [50_000, 0]);
  // A quota of 0 is a configured "none", said as such.
  const status = await ada.c.query(api.assistant.status, { roomId });
  assert.equal(status.enabled, false);
  assert.match(await rejects(ada.c.mutation(api.assistant.send, { roomId, text: "hi" })), /assistant quota.*0 tokens/i);
  assert.match(await rejects(host.c.mutation(api.rooms.setAiQuotas, { roomId, aiQuota: -1 })), /quota/i);
  assert.match(await rejects(host.c.mutation(api.rooms.setAiQuotas, { roomId, assistantQuota: 1.5 })), /quota/i);
  await startGame(host, roomId);
  await host.c.mutation(api.rooms.setAiQuotas, { roomId, assistantQuota: 120_000 });
  room = await host.c.query(api.rooms.get, { room: roomId });
  assert.deepEqual([room.aiQuota, room.assistantQuota], [50_000, 120_000]);
  // The owner tools' command takes the same change.
  await host.c.action(api.owner.command, { roomId, action: "quotas", requestId: crypto.randomUUID(), aiQuota: 70_000 });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).aiQuota, 70_000);
});

test("an AI seat past the AI players' quota is refused before the provider, saying which quota", { timeout: 240_000 }, async () => {
  const [host] = await adminGods("Quota Low Host");
  const [ada] = await gods("Quota Low Ada");
  await touch(host);
  const { roomId } = await roomWith([host, ada], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.setAiQuotas, { roomId, aiQuota: 50 });
  await startGame(host, roomId);
  await waitFor(async () => ((await seat(roomId, godId)).aiFailures ?? 0) >= 1, "the first turn fails on the quota", 60_000, 500);
  const { room } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed, 0, "nothing reserved");
  assert.equal(room.aiInputTokens, 0, "no provider call");
  assert.match((await seat(roomId, godId)).status, /AI players' quota/);
});

test("a room whose owner is not an administrator offers no AI and refuses to spend tokens, but plays without AI seats", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Plain Host", "Plain Ada", "Plain Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const room = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(room.aiEnabled, false);
  assert.equal((await ada.c.query(api.assistant.status, { roomId })).enabled, false);
  assert.match(await rejects(ada.c.mutation(api.assistant.send, { roomId, text: "hi" })), ADMIN_ONLY);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  assert.match(await rejects(host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" })), ADMIN_ONLY);
  assert.match(await rejects(host.c.mutation(api.rooms.setAiQuotas, { roomId, aiQuota: 1000 })), ADMIN_ONLY);
  // A seat added while the owner was an administrator (then taken off ADMIN_EMAILS) cannot start a game here.
  await makeAdmin(host);
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await admin.mutation(internal.testing.seedUser, { subject: host.subject, name: host.name, email: "plain@test.local", emailVerified: true });
  assert.match(await rejects(host.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() })), ADMIN_ONLY);
  // Without AI seats it starts.
  await host.c.mutation(api.rooms.removeAi, { roomId, godId });
  await startGame(host, roomId);
});

test("an admin room handed to a non-admin stops its AI seats and assistant at their next call", { timeout: 300_000 }, async () => {
  const [host] = await adminGods("Handover Admin");
  const [ada, bo] = await gods("Handover Ada", "Handover Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await admin.mutation(internal.auth.testing.setRoomOwner, { roomId, ownerId: ada.subject });
  // The start itself is the new owner's, and refused.
  assert.match(await rejects(ada.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() })), ADMIN_ONLY);
  // Started by the admin, then handed over mid-game: the seat's next reservation is refused with the reason.
  await admin.mutation(internal.auth.testing.setRoomOwner, { roomId, ownerId: host.subject });
  await startGame(host, roomId);
  await admin.mutation(internal.auth.testing.setRoomOwner, { roomId, ownerId: ada.subject });
  await waitFor(async () => ADMIN_ONLY.test((await seat(roomId, godId)).status ?? ""), "the seat reports the admin gate", 90_000, 500);
  assert.match(await rejects(bo.c.mutation(api.assistant.send, { roomId, text: "hi" })), ADMIN_ONLY);
});
