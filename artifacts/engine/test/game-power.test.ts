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
    fullChargeSeconds: 3600,   // a store far larger than this test fills: capacity has its own test below
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

/**
 * Capacity (docs/energy-model.md §6.1): every account holds at most its power × fullChargeSeconds. Hand-derived: P = 40
 * bits/s and T = 10 s, so a god with nothing allocated holds 400 bits, an agent with half the power 200, and the god's
 * own account then 200. Lowering a share drops what is held above the new capacity at once. A game stored without the
 * setting has no capacity.
 */
test("capacity: accounts fill to power × fullChargeSeconds and stop; lowering a share loses the excess", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Cap Host", "Cap Ada", "Cap Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 5,
    fullChargeSeconds: 10,
  });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const observe = async () => observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

  let obs = await observe();
  assert.equal(obs.economy!.fullChargeSeconds, 10);
  near(obs.self.capacity!, 400, "nothing allocated: 40 bits/s × 10 s");
  near(obs.self.energy, 400, "startingEnergy above the capacity is not held");

  // A summon far above what the unallocated power can ever store is refused, and says why.
  const huge = await send({ type: "summon", name: "Huge", language: "typescript",
    source: `function agent(n) { const table = [${Array.from({ length: 400 }, (_, i) => 7919 * (i + 3)).join(", ")}]; return [add(table[0])]; }` });
  assert.equal(huge.accepted, false);
  assert.match(huge.message, /holds at most 400 bits/);

  const first = await send({ type: "summon", name: "Saver", language: "typescript", source: "function agent(n) { return []; }" });
  assert.equal(first.accepted, true, first.message);
  obs = await observe();
  const saver = obs.agents.find(a => a.name === "Saver")!;
  assert.equal(saver.powerShare, 0.5);
  near(saver.capacity!, 200, "half of 40 bits/s × 10 s");
  assert.equal(saver.energy, 0, "an agent starts empty");
  near(obs.self.capacity!, 200, "the god keeps the other half");
  near(obs.self.energy, 200, "what the god held above its new capacity is lost");

  // Running: both fill to their capacity and stop there (the saver never acts: it pays at most the price of its offers).
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 12, "the world runs past a full charge", 90000, 250);
  obs = await observe();
  const full = obs.agents.find(a => a.id === saver.id)!;
  assert.ok(full.energy <= 200 + 1e-6 && full.energy > 180, `the saver is full: ${full.energy}`);
  near(obs.self.energy, 200, "the god's own energy stays at its capacity");

  // Lowering the saver's share to 10% (4 bits/s: holds 40) loses the rest at once; the god's capacity rises to 360.
  assert.equal((await send({ type: "allocatePower", agentId: saver.id, share: 0.1 })).accepted, true);
  obs = await observe();
  const lowered = obs.agents.find(a => a.id === saver.id)!;
  near(lowered.capacity!, 40, "10% of 40 bits/s × 10 s");
  assert.ok(lowered.energy <= 40 + 1e-6, `energy above the new capacity is lost: ${lowered.energy}`);
  near(obs.self.capacity!, 360, "90% unallocated");
  assert.ok(obs.self.energy >= 200 - 1e-6 && obs.self.energy <= 360 + 1e-6, `the god keeps what it had and refills: ${obs.self.energy}`);
  const world = (await raw(game.gameId)).game.worldSeconds;
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= world + 6, "the god's store refills", 60000, 250);
  near((await observe()).self.energy, 360, "full again: 160 bits at 36 bits/s takes under 5 s");

  // A game stored without the setting (started before it existed) has no capacity: nothing is reported, energy keeps growing.
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: {}, unsetSettings: ["fullChargeSeconds"] });
  const then = (await raw(game.gameId)).game.worldSeconds;
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= then + 3, "the legacy game runs", 60000, 250);
  obs = await observe();
  assert.equal(obs.self.capacity, undefined);
  assert.equal(obs.economy!.fullChargeSeconds, undefined);
  assert.equal(obs.agents.find(a => a.id === saver.id)!.capacity, undefined);
  assert.ok(obs.self.energy > 360 + 2 * 36, `no capacity: ${obs.self.energy}`);
  // Such a game is still examined and summoned into: its settings validate without the field.
  const checked = await send({ type: "validate", language: "typescript", source: "function agent(n) { return [add(3)]; }" });
  assert.equal(checked.accepted, true, checked.message);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
