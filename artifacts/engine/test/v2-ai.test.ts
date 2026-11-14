/**
 * Model-backed AI players (M3) on the live local backend with the offline mock provider (AI_MOCK=1): only an admin
 * seats one; once the game starts it takes turns whose tool calls run through the affordance directory as the AI's
 * principal, and each turn is counted against its allowance.
 *
 * What would break: a non-admin spending the model allowance; an AI turn that bypasses the directory or is not counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, admins, humans, perform } from "./v2-helpers.ts";

test("an admin seats an AI player; its turns run through the directory and are counted", { timeout: 120_000 }, async () => {
  const [boss] = await admins("AI Admin");
  const [plain] = await humans("AI Plain");
  const room = (await perform(plain!, "room.create", { name: "No AI" })).result.roomId;
  try { await perform(plain!, "seats.addAi", {}, { roomId: room }); assert.fail("only admins"); } catch (e) {
    assert.equal((e as any).data?.error?.code, "failed");
  }
  const { roomId } = (await perform(boss!, "room.create", { name: "AI room" })).result;
  const added = await perform(boss!, "seats.addAi", {}, { roomId });
  assert.equal(added.ok, true, JSON.stringify(added));
  await perform(boss!, "seats.fillPracticePartners", {}, { roomId });
  const gameId = (await perform(boss!, "game.start", {}, { roomId })).result.gameId;
  for (let i = 0; ; i++) {
    const used = await admin.query("v2/testing:aiUsage", { gameId, memberId: added.result.memberId });
    if (used?.calls >= 1) { assert.ok(used.tokens > 0); break; }
    assert.ok(i < 60, "the AI player took a turn");
    await new Promise(r => setTimeout(r, 500));
  }
  // The AI's principal reaches the directory's functions as a seated player, and only its own seat.
  const delegate = { userId: `member:${added.result.memberId}`, roomId, grant: "act", via: "assistant" };
  const me = await admin.query("v2/ops/game:getAs", { args: {}, gameId, delegate });
  assert.equal(me.ok, true, JSON.stringify(me));
  assert.ok(me.result.me, "seated");
  const rule = await admin.query("v2/ops/rule:explainAs", { args: {}, gameId, delegate });
  assert.equal(rule.ok, true);
  assert.equal((await admin.mutation("v2/ops/game:endAs", { args: {}, gameId, delegate })).error.code, "refused", "an AI player is no owner");
  await perform(boss!, "game.end", {}, { gameId });
});
