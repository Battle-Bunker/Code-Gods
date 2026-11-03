/**
 * rooms.startWorldNow: the owner ends the planning countdown early (the owner's "Start the world now").
 * What would break: a non-owner ending planning, the world not starting before the long deadline, a second call or a
 * call after the world started being accepted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { api, gods, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 10, spawnRateHz: 1,
  interactionRateHz: 20, planningSeconds: 3600, halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000, scoreIntervalSeconds: 2,
};

test("the owner starts the world during planning; a non-owner cannot; it works once", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Now Host", "Now Ada", "Now Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const phase = async () => (await host.c.query(api.games.header, { code: game.shortCode })).phase;
  assert.equal(await phase(), "planning");
  assert.match(await rejects(ada.c.mutation(api.rooms.startWorldNow, { roomId })), /owner/i, "only the owner");
  assert.equal(await phase(), "planning");
  await host.c.mutation(api.rooms.startWorldNow, { roomId });
  await waitFor(async () => (await phase()) === "running", "the world runs without waiting an hour", 60_000);
  assert.match(await rejects(host.c.mutation(api.rooms.startWorldNow, { roomId })), /planning/i, "not after the world started");
});
