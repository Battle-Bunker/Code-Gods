/**
 * The energy model end to end (docs/energy-model.md): an act pays only what it does. An agent that reads one digit
 * and returns no calls skips: it pays exactly what it read (at READ_PRICE: 1/32 energy bit per bit), is never counted as a failure or remembered as futile, and
 * is offered at most MAX_AGENT_OPPORTUNITY_HZ opportunities per world second. An agent that acts pays its reads plus
 * its change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CHANGE_READ_RATIO, MAX_AGENT_OPPORTUNITY_HZ, READ_PRICE } from "@workspace/game-core";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

test("a skipper pays only what it read, never fails, is never futile, and is held to the per-agent cap", { timeout: 180000 }, async () => {
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
  const digit = Math.log2(10) * READ_PRICE; // one digit read (log2 10 bits) at 1/32: ≈ 0.104 energy bits

  // Skips: every act, each paying log2 10 bits read at the read price, none a failure, no futile memo.
  assert.equal(looker.skips, looker.acts);
  assert.equal(looker.transforms ?? 0, 0);
  assert.deepEqual(looker.failures, { collision: 0, noChange: 0, commit: 0, invalid: 0, error: 0 });
  assert.ok(Math.abs(looker.spent - looker.acts * digit) < 1e-6, `${looker.spent} for ${looker.acts} acts`);
  assert.ok(Math.abs(looker.spentRead - looker.spent) < 1e-9, "all of a skipper's spend is reading");
  const memo = await admin.query(internal.testing.futileActs, { gameId: game.gameId });
  assert.ok(memo.every((m: any) => m.agentId !== looker._id), "a skip is never remembered as futile");
  // The cap: it stayed rich (1000 bits/s) and still got at most 4 turns per world second.
  assert.ok(looker.acts <= MAX_AGENT_OPPORTUNITY_HZ * world + 2, `${looker.acts} acts in ${world} world seconds`);

  // The skip events carry the reads; the adder's transforms carry no reads, only their change.
  const events = state.batches.flatMap((b: any) => b.events);
  const skips = events.filter((e: any) => e.t === "skip");
  assert.ok(skips.length > 0);
  for (const e of skips) assert.deepEqual(e.cost, { read: digit, change: 0, total: digit });
  const transforms = events.filter((e: any) => e.t === "transform");
  assert.ok(transforms.length > 0);
  for (const e of transforms) { assert.equal(e.cost.read, 0); assert.ok(e.cost.change > 0); assert.equal(e.cost.total, e.cost.change); }
  assert.equal(state.batches.at(-1).schema, 9);

  // The owner sees the skips, and the estimate split into reading and changing (no decision bits, no floor).
  const obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  const [mine] = obs.agents;
  assert.ok((mine.skips ?? 0) > 0);
  assert.ok(Math.abs(mine.breakdown.read - digit) < 1e-6, JSON.stringify(mine.breakdown));
  assert.equal(obs.economy?.changeReadRatio, CHANGE_READ_RATIO);
  assert.equal(mine.breakdown.change, 0);
  assert.equal(mine.outcomes?.transforms ?? 0, 0);
  assert.equal(mine.diagnosis, undefined, "skips are not failures: nothing to diagnose");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
