/**
 * The energy model end to end (docs/energy-model.md): an act pays only what it does. An agent that reads one digit
 * and returns no calls skips: it pays exactly what it read (at READ_PRICE: 1/32 energy bit per bit), is never counted as a failure or remembered as futile, and
 * is offered opportunities in proportion to its energy, with no limit per agent. An agent that acts pays its reads plus
 * its change. Agent-count neutrality (§7): the same power split over four agents gets the turns of one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CHANGE_READ_RATIO, READ_PRICE } from "@workspace/game-core";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("a skipper pays only what it read, never fails, is never futile, and has no rate limit of its own", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Energy Host", "Energy Ada", "Energy Bo");
  await touch(host);
  const settings = {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 2000, interactionRateHz: 50,
  };
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  // Reads the ones digit (log2 10 bits) and does nothing: a pure skipper.
  const skipper = await send(ada, { type: "summon", name: "Looker", language: "typescript", source: "function agent(n) { n.digit(0); return []; }" });
  assert.equal(skipper.accepted, true, skipper.message);
  // Reads nothing and adds one: it pays its change only.
  const adder = await send(bo, { type: "summon", name: "Adder", language: "typescript", source: "function agent(n) { return [add(1)]; }" });
  assert.equal(adder.accepted, true, adder.message);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });

  const mineOf = async (god: typeof ada) => (await raw(game.gameId)).agents.find((a: any) => a.ownerId === god.subject);
  await waitFor(async () => (await mineOf(ada))?.acts >= 12 && (await mineOf(bo))?.transforms >= 3, "both agents act", 90000, 250);
  const state = await raw(game.gameId);
  const looker = state.agents.find((a: any) => a.ownerId === ada.subject);
  const world = state.game.worldSeconds;
  const offer = Math.log2(5) * READ_PRICE;  // the offer itself: which of the 5 live objects (log2 5 bits) at 1/32: ≈ 0.073
  const digit = Math.log2(10) * READ_PRICE + offer; // plus one digit read (log2 10 bits): ≈ 0.176 energy bits in all

  // Skips: every act, each paying log2 10 bits read at the read price, none a failure, no futile memo.
  assert.equal(looker.skips, looker.acts);
  assert.equal(looker.transforms ?? 0, 0);
  assert.deepEqual(looker.failures, { collision: 0, noChange: 0, commit: 0, invalid: 0, error: 0 });
  assert.ok(Math.abs(looker.spent - looker.acts * digit) < 1e-6, `${looker.spent} for ${looker.acts} acts`);
  assert.ok(Math.abs(looker.spentRead - looker.spent) < 1e-9, "all of a skipper's spend is reading");
  const memo = await admin.query(internal.testing.futileActs, { gameId: game.gameId });
  assert.ok(memo.every((m: any) => m.agentId !== looker._id), "a skip is never remembered as futile");
  // No rate limit per agent: it stays as rich as the adder (both stores full), so it gets about half of the 50 turns a
  // second, far more than the 4 a second an agent was once held to.
  assert.ok(looker.acts > 8 * world, `${looker.acts} acts in ${world} world seconds`);

  // The skip events carry the reads; the adder's transforms carry no reads, only their change.
  const events = state.batches.flatMap((b: any) => b.events);
  const skips = events.filter((e: any) => e.t === "skip");
  assert.ok(skips.length > 0);
  for (const e of skips) { assert.ok(Math.abs(e.cost.read - digit) < 1e-12 && e.cost.change === 0 && Math.abs(e.cost.total - digit) < 1e-12, JSON.stringify(e.cost)); }
  const transforms = events.filter((e: any) => e.t === "transform");
  assert.ok(transforms.length > 0);
  // An agent that reads nothing still pays for the offer (docs/energy-model.md §7.1).
  for (const e of transforms) { assert.ok(Math.abs(e.cost.read - offer) < 1e-12); assert.ok(e.cost.change > 0); assert.ok(Math.abs(e.cost.total - e.cost.change - offer) < 1e-9); }
  assert.equal(state.batches.at(-1).schema, 10);

  // The owner sees the skips, and the estimate split into reading and changing (no decision bits, no floor).
  const obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  const [mine] = obs.agents;
  assert.ok((mine.skips ?? 0) > 0);
  // The summon-time estimate is of the act alone (the offer's price depends on how many objects are live).
  assert.ok(Math.abs(mine.breakdown.read - (digit - offer)) < 1e-6, JSON.stringify(mine.breakdown));
  assert.equal(obs.economy?.changeReadRatio, CHANGE_READ_RATIO);
  assert.equal(mine.breakdown.change, 0);
  assert.equal(mine.outcomes?.transforms ?? 0, 0);
  assert.equal(mine.diagnosis, undefined, "skips are not failures: nothing to diagnose");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

/**
 * Agent-count neutrality (docs/energy-model.md §7; owner, 11 Nov 2026: "the discrete quantity of agents [offers] no
 * opportunity for advantage"). Ada gives 80% of her power to ONE agent; Bo gives 20% to each of FOUR running the same
 * code. Their stores fill to the same total (0.8 × 40 bits/s × 30 s = 960 bits), so the room's 20 turns a second must
 * split evenly between the two gods. With a rate limit per agent (4 a second, removed), Ada got 4 a second and Bo the
 * other 16; with agents in the tick's wave left out of the draw, Ada got at most one turn per wave.
 */
test("agent-count neutrality: one agent with 80% of the power gets the turns of four with 20% each", { timeout: 240000 }, async () => {
  const [host, ada, bo] = await gods("Neutral Host", "Neutral Ada", "Neutral Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 40, startingEnergy: 5000, interactionRateHz: 20, fullChargeSeconds: 30,
  });
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const source = "function agent(n) { return []; }";
  const one = await send(ada, { type: "summon", name: "Solo", language: "typescript", source, powerShare: 0.8 });
  assert.equal(one.accepted, true, one.message);
  for (let i = 0; i < 4; i++) {
    const r = await send(bo, { type: "summon", name: `Quad ${i + 1}`, language: "typescript", source, powerShare: 0.2 });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.worldSeconds >= 45, "the world runs 45 seconds", 150000, 500);
  const state = await raw(game.gameId);
  const total = (god: typeof ada, key: "acts" | "spent") => state.agents.filter((a: any) => a.ownerId === god.subject).reduce((sum: number, a: any) => sum + a[key], 0);
  const solo = total(ada, "acts"), quad = total(bo, "acts");
  // About 900 turns in all: each god's share of them has a standard error of about 15 (binomial), so 15% is many of them.
  assert.ok(solo + quad > 500, `the room's turns were offered: ${solo} + ${quad}`);
  assert.ok(Math.abs(solo - quad) <= 0.15 * (solo + quad) / 2, `one agent got ${solo} turns, four agents with the same power ${quad}`);
  // Each offer cost log2(5)/32 bits, so the two gods also spent alike: exposure is priced per offer, not per agent.
  const offer = Math.log2(5) * READ_PRICE;
  assert.ok(Math.abs(total(ada, "spent") - solo * offer) < 1e-6 && Math.abs(total(bo, "spent") - quad * offer) < 1e-6, `${total(ada, "spent")} and ${total(bo, "spent")}`);
  // Within Bo's four, equal shares get about equal turns.
  const each = state.agents.filter((a: any) => a.ownerId === bo.subject).map((a: any) => a.acts);
  assert.ok(Math.min(...each) > 0.5 * quad / 4 && Math.max(...each) < 1.5 * quad / 4, `Bo's agents: ${each}`);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
