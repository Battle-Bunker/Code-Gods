/**
 * AI seats with the mock provider (CODE_GODS_AI_MOCK=1 on the local deployment): the seat's chain plays
 * turns through the same command path, within the room's token budget and the $2-per-game ceiling, and a
 * seat whose budget cannot cover a call never calls the provider.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, raw, roomWith, touch, waitFor } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 4, spawnRateHz: 0, planningSeconds: 3600,
};

async function aiRoom(aiBudget: number) {
  const [host, ada] = await gods("AI Host", "AI Ada");
  await touch(host);
  const { roomId } = await roomWith([host, ada], settings);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget });
  const game = await host.c.action(api.owner.start, { roomId });
  return { host, ada, roomId, godId, game };
}

test("a mock AI seat validates, summons a valid agent and chats, within its budgets", { timeout: 180000 }, async () => {
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

test("an AI seat without budget for a call never reaches the provider", { timeout: 120000 }, async () => {
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
