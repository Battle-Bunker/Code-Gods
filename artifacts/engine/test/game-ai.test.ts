/**
 * AI seats with the mock provider (AI_MOCK=1 on the local deployment): the seat's chain plays
 * turns through the same command path, within the room's token budget and the $2-per-game ceiling, and a
 * seat whose budget cannot cover a call never calls the provider.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { admin, api, clientFor, gods, internal, raw, roomWith, startGame, touch, waitFor, type God } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600,
};

async function aiRoom(aiBudget: number) {
  const [host, ada] = await gods("AI Host", "AI Ada");
  await touch(host);
  const { roomId } = await roomWith([host, ada], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget });
  // The deal may need a table computed first (a "preparing" start): wait for the game.
  const game = await startGame(host, roomId);
  return { host, ada, roomId, godId, game };
}

test("a mock AI seat validates, summons a valid agent and chats, within its budgets", { timeout: 300000 }, async () => {
  const { ada, roomId, godId, game } = await aiRoom(300_000);
  await waitFor(async () => (await raw(game.gameId)).agents.some((a: any) => a.ownerId === godId), "the AI seat summons an agent", 90000, 500);
  const obs = await ada.c.query(api.player.observation, { roomId });
  const said = obs.chat.find((m: any) => m.godId === godId);
  assert.ok(said && said.isAI, "the AI seat chats publicly, visibly labelled");
  const secret = await raw(game.gameId);
  const agent = secret.agents.find((a: any) => a.ownerId === godId);
  assert.equal(agent.source, "function agent(x) { return [add(1)]; }");
  assert.ok(secret.deities.find((d: any) => d.godId === godId).spent > 0, "the seat paid its summon from god energy");
  const { room, members } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.ok(room.aiUsed > 0 && room.aiUsed <= room.aiBudget, `tokens within the room budget: ${room.aiUsed}/${room.aiBudget}`);
  assert.ok(room.aiReservedUsd > 0 && room.aiReservedUsd <= 2, "USD reserved within the $2 game ceiling");
  assert.ok(room.aiInputTokens > 0 && room.aiOutputTokens > 0, "settled usage is recorded");
  const seat = members.find((m: any) => m.godId === godId);
  assert.ok(seat.aiChain >= 1 && (seat.aiFailures ?? 0) === 0, `the seat's chain is healthy: ${seat.status}`);
  // The AI sees exactly its own projection: receipts are stored under its own god id.
  const receipts = await admin.query(internal.testing.rawGame, { gameId: game.gameId });
  assert.ok(receipts.agents.every((a: any) => a.ownerId !== godId || a.source.includes("add(1)")));
});

test("an AI seat without budget for a call never reaches the provider", { timeout: 240000 }, async () => {
  const { roomId, godId, game } = await aiRoom(50);
  await waitFor(async () => {
    const { members } = await admin.query(internal.testing.rawRoom, { roomId });
    return (members.find((m: any) => m.godId === godId).aiFailures ?? 0) >= 1;
  }, "the first turn fails on the budget", 60000, 500);
  const { room, members } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed, 0, "nothing reserved");
  assert.equal(room.aiInputTokens, 0, "no provider call");
  assert.match(members.find((m: any) => m.godId === godId).status, /budget/i);
  assert.equal((await raw(game.gameId)).agents.length, 0);
});

/** An admin (verified ADMIN_EMAILS address on the test-only "fake" provider) may author AI templates. */
async function adminGod(name: string): Promise<God> {
  const subject = `test|${randomUUID()}`;
  const sid = await admin.mutation(internal.testing.seedUser, { subject, name, email: "admin@example.test", emailVerified: true, provider: "fake" });
  return { subject, name, sid, c: clientFor(subject, "browser", { sessionId: sid }) };
}

test("a seat whose model answers with no decision says why, retries, and is ready again in the lobby", { timeout: 120000 }, async () => {
  // Seen on the dev deployment: Sonnet 5.5 replied with a tool call written as text, every turn failed with a JSON
  // parse error and the seat showed a bare "Turn failed". The mock replays that reply (mock-reply in the strategy).
  const host = await adminGod("AI Host");
  const [ada] = await gods("AI Ada");
  await touch(host);
  const { roomId } = await roomWith([host, ada], settings);
  const reply = '<invoke name="validate"><parameter name="source">my private plan</parameter></invoke>';
  const template = await host.c.mutation(api.aiTemplates.create, { name: "Broken Replier", provider: "anthropic", model: "claude-sonnet-5-5", prompt: `mock-reply: ${reply}` });
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: template.id });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 300_000 });
  await startGame(host, roomId);
  const seat = async () => (await admin.query(internal.testing.rawRoom, { roomId })).members.find((m: any) => m.godId === godId);
  await waitFor(async () => ((await seat()).aiFailures ?? 0) >= 1, "the first turn fails on the reply", 60000, 500);
  const failed = await seat();
  assert.match(failed.status, /^Turn failed: the model's reply was not a valid move; retrying in \d+ s$/, failed.status);
  assert.equal(failed.status.includes("invoke") || failed.status.includes("private plan"), false, "the reply itself stays private");
  assert.ok((await admin.query(internal.testing.rawRoom, { roomId })).room.aiInputTokens > 0, "the call was made and settled");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await waitFor(async () => (await seat()).status === "Ready; awaiting game start", "the seat is ready again once the game ends", 20000, 250);
  assert.equal((await seat()).aiFailures, 0);
});

test("an OpenAI seat whose reply is JSON but no decision says so and keeps the reply private", { timeout: 120000 }, async () => {
  // JSON mode (the OpenAI path before strict structured outputs) guaranteed JSON, not the decision's shape.
  const host = await adminGod("AI Host O");
  const [ada] = await gods("AI Ada O");
  await touch(host);
  const { roomId } = await roomWith([host, ada], settings);
  const template = await host.c.mutation(api.aiTemplates.create, { name: "Loose Replier", provider: "openai", model: "gpt-4.1-mini", prompt: 'mock-reply: {"move":"summon","plan":"my private plan"}' });
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: template.id });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 300_000 });
  await startGame(host, roomId);
  const seat = async () => (await admin.query(internal.testing.rawRoom, { roomId })).members.find((m: any) => m.godId === godId);
  await waitFor(async () => ((await seat()).aiFailures ?? 0) >= 1, "the first turn fails on the reply", 60000, 500);
  const failed = await seat();
  assert.match(failed.status, /^Turn failed: the model's reply was not a valid move; retrying in \d+ s$/, failed.status);
  assert.equal(failed.status.includes("private plan"), false, "the reply itself stays private");
});
