/**
 * The practice partner (aiTemplates.ts PRACTICE_TEMPLATE_ID, lib/builtinPlayer.ts): a built-in AI seat that calls no
 * model and summons its own rule's example agent, the one a new player starts with, once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exampleAgent } from "@workspace/game-utilities/example-agents";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { admin, adminGods, api, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("two practice partners each summon their rule's example agent, and spend nothing on a model", { timeout: 300_000 }, async () => {
  const [host] = await adminGods("Practice Host");
  await touch(host);
  const { roomId } = await roomWith([host], { planningSeconds: 600 });
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  for (let i = 0; i < 2; i++) await host.c.mutation(api.rooms.addAi, { roomId, templateId: "practice-example" });
  const { gameId } = await startGame(host, roomId);
  const game = await waitFor(async () => {
    const g = await raw(gameId);
    return g.agents.length >= 2 ? g : undefined;
  }, "both practice partners summon", 180_000, 1000);
  const settings = game.game.settings as GameSettings;
  for (const agent of game.agents) {
    const deity = game.deities.find((d: any) => d.godId === agent.ownerId);
    assert.ok(deity?.aiAgent?.provider === "builtin", "the agent is a practice partner's");
    const language = agent.language as "python" | "typescript";
    assert.equal(agent.source, exampleAgent(deity.utility.familyId, deity.utility.params, instantiationOf(settings), language).source, "its rule's example agent");
  }
  const { room } = await admin.query(internal.testing.rawRoom, { roomId });
  assert.equal(room.aiUsed ?? 0, 0, "no model tokens");
});
