/**
 * Duration mode (settings.durationMode): a "fixed" game ends exactly at its configured world time, a "halfLife" game at
 * a hidden random moment drawn from that half-life. What would break: a fixed game still drawing a random end, or the
 * deadline of a fixed game not being exactly the configured length; a half-life game ending at its half-life every time.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const base = {
  languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 },
  startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600,
};

test("a fixed game ends exactly at its configured world time, and a half-life game at a drawn moment", { timeout: 240_000 }, async () => {
  const [host, ann, bob] = await gods("Duration Host", "Ann Duration", "Bob Duration");
  await touch(host);
  const ends: number[] = [];
  for (const mode of ["fixed", "halfLife"] as const) {
    const { roomId } = await roomWith([host, ann, bob], { ...base, durationMode: mode, halfLifeSeconds: 3 });
    const game = await startGame(host, roomId);
    const { game: stored } = await raw(game.gameId);
    ends.push(stored!.endAtWorld);
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
    await waitFor(async () => (await ann.c.query(api.player.observation, { roomId })).phase === "ended", `${mode} game ends`, 90_000);
    const { game: done } = await raw(game.gameId);
    assert.equal(done!.endReason, "lifetime");
    if (mode === "fixed") assert.equal(done!.worldSeconds, 3, "the world stopped exactly at the fixed time");
    await host.c.mutation(api.rooms.endActiveGame, { roomId }).catch(() => {});
  }
  assert.equal(ends[0], 3, "a fixed game's deadline is exactly its length");
  assert.ok(ends[1]! > 0 && ends[1] !== 3, "a half-life game's end is a random draw, not its half-life");
});
