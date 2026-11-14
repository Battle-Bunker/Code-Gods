/**
 * Players never wait for agent sandboxes (v1's rule, restored; convex/v2/readiness.ts): while a language's runtime is
 * still starting, planning holds past its deadline (world time starts for everyone at once) and a program check says
 * "not ready yet" instead of waiting; once ready, the world starts by itself.
 *
 * What would break: a world that starts while agents cannot act, or a player waiting seconds on a boot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("planning holds and checks answer 'not ready' until every language's sandbox is ready", { timeout: 120_000 }, async () => {
  const [ada] = await humans("Ready Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Ready room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  try {
    await admin.mutation("v2/testing:setReadiness", { language: "python", state: "warming" });
    const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
    await perform(ada!, "game.startWorldNow", {}, { gameId });
    await new Promise(r => setTimeout(r, 2500));
    assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "planning", "held while Python is still starting");
    const check = await perform(ada!, "agent.check", { language: "python", source: "def agent(offer):\n    return []\n" }, { gameId }, "action").catch((e: any) => e.data);
    assert.equal(check.ok, false);
    assert.match(check.error.message, /still starting/);
    await admin.mutation("v2/testing:setReadiness", { language: "python", state: "ready" });
    for (let i = 0; (await ada!.query("v2/games:header", { gameId })).phase !== "live"; i++) {
      assert.ok(i < 40, "the world starts once every language is ready");
      await new Promise(r => setTimeout(r, 250));
    }
    await perform(ada!, "game.end", {}, { gameId });
  } finally {
    await admin.mutation("v2/testing:setReadiness", { language: "python", state: "ready" });
  }
});
