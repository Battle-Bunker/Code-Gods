/**
 * Power (docs/energy-model.md §6) end to end: each deity's fixed budget is split into its agents' shares, the rest is its
 * own income. A summon takes half the unallocated power by default (or the share it names), allocatePower re-allocates
 * within the budget, destroying an agent returns its share, and every change is in the event log.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("power: shares out of a fixed budget, re-allocation, destroy returns the share; incomes follow", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Power Host", "Power Ada", "Power Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 5,
  });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const observe = async () => observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));

  const first = await send({ type: "summon", name: "One", language: "typescript", source: "function agent(n) { return []; }" });
  assert.equal(first.accepted, true, first.message);
  const second = await send({ type: "summon", name: "Two", language: "typescript", source: "function agent(n) { return [add(1)]; }", powerShare: 0.3 });
  assert.equal(second.accepted, true, second.message);
  let obs = await observe();
  const [one, two] = ["One", "Two"].map(n => obs.agents.find(a => a.name === n)!);
  assert.equal(one.powerShare, 0.5, "the default: half of the unallocated power");
  assert.equal(two.powerShare, 0.3, "or the share the summon names");
  assert.equal(obs.economy!.powerPerSecond, 40);
  assert.equal(obs.self.allocated, 0.8);
  assert.ok(Math.abs(obs.self.income! - 8) < 1e-9, "the deity keeps 20% of 40 bits/s");
  assert.ok(Math.abs(one.income! - 20) < 1e-9 && Math.abs(two.income! - 12) < 1e-9);

  // The budget binds: shares total at most 1.
  const over = await send({ type: "summon", name: "Three", language: "typescript", source: "function agent(n) { return [add(2)]; }", powerShare: 0.5 });
  assert.equal(over.accepted, false);
  assert.match(over.message, /unallocated/);
  const tooMuch = await send({ type: "allocatePower", agentId: two.id, share: 0.6 });
  assert.equal(tooMuch.accepted, false);
  assert.match(tooMuch.message, /at most 50%/);
  // Re-allocate: Two takes everything One gives up.
  assert.equal((await send({ type: "allocatePower", agentId: one.id, share: 0.1 })).accepted, true);
  assert.equal((await send({ type: "allocatePower", agentId: two.id, share: 0.7 })).accepted, true);
  obs = await observe();
  assert.equal(obs.agents.find(a => a.id === two.id)!.powerShare, 0.7);
  assert.equal(obs.self.allocated, 0.8);
  // Only the owner allocates its agents.
  const stolen = await bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "allocatePower", agentId: one.id, share: 0 }, game.gameId) });
  assert.equal(stolen.accepted, false);

  // Destroying returns the share; the deity's income rises.
  assert.equal((await send({ type: "destroy", agentId: one.id })).accepted, true);
  obs = await observe();
  assert.equal(obs.self.allocated, 0.7);
  assert.ok(Math.abs(obs.self.income! - 12) < 1e-9);

  // Running: the deity's own energy grows at its income on world time; the log has every share.
  const before = obs.self.energy;
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 3, "the world runs", 60000, 250);
  obs = await observe();
  assert.ok(obs.self.energy > before + 2 * 12, `${obs.self.energy} vs ${before}`);
  const events = (await raw(game.gameId)).batches.flatMap((b: any) => b.events);
  assert.deepEqual(events.filter((e: any) => e.t === "power").map((e: any) => e.share), [0.1, 0.7]);
  assert.deepEqual(events.filter((e: any) => e.t === "summon").map((e: any) => e.powerShare), [0.5, 0.3]);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
