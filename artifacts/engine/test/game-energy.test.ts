/**
 * The energy model end to end (docs/energy-model.md): an act pays only what it does. An agent that reads one digit
 * and returns no calls skips: it pays exactly what it read (at READ_PRICE: 1/32 energy bit per bit), is never counted as a failure or remembered as futile, and
 * is offered at most MAX_AGENT_OPPORTUNITY_HZ opportunities per world second. An agent that acts pays its reads plus
 * its change. What the change costs follows the room's cost model (settings.costModel; docs/mutation-cost-design.md §0):
 * "distance-v1" charges a number by how far it moved, "set-v1" every changed cell the same, at the tick and in the
 * summon-time estimate alike.
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
  assert.equal(state.batches.at(-1).schema, 10);

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

test("a room's cost model prices the change: by distance a nudge costs 7.14 and a jump of 5 costs 19.0; by set both cost 16.3 (tick and estimate)", { timeout: 420000 }, async () => {
  // By hand (docs/mutation-cost-design.md §0), on the 4×4 numbers-only board: energy C = W + 0.05·W².
  //   distance-v1: W = log2 16 cells + 1.585 bits per step: +1 → 5.585 (C 7.14); 5 away → 11.925 (C 19.03).
  //   set-v1:      W = log2 16 + 2·log2 10 = 10.644 for any changed digit (C 16.31).
  const C = (w: number) => w + 0.05 * w * w, STEP = 1.58496;
  const expected = { "distance-v1": { nudge: C(4 + STEP), jump: C(4 + 5 * STEP) }, "set-v1": { nudge: C(4 + 2 * Math.log2(10)), jump: C(4 + 2 * Math.log2(10)) } } as const;
  assert.deepEqual(Object.values(expected).flatMap(e => [e.nudge, e.jump]).map(x => x.toFixed(2)), ["7.14", "19.03", "16.31", "16.31"]);
  const digit = Math.log2(10) * READ_PRICE;

  for (const costModel of ["distance-v1", "set-v1"] as const) {
    const want = expected[costModel];
    const [host, ada, bo] = await gods(`Cost Host ${costModel}`, `Cost Ada ${costModel}`, `Cost Bo ${costModel}`);
    await touch(host);
    const { roomId } = await roomWith([host, ada, bo], {
      objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "mono" }, languages: ["typescript"], costModel,
      startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 2000, startingEnergy: 2000, interactionRateHz: 50,
    });
    const room = await host.c.query(api.rooms.get, { room: roomId });
    assert.equal(room.settings.costModel, costModel === "set-v1" ? undefined : costModel, "the default model is never stored");
    const game = await startGame(host, roomId);
    const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
    // Reads nothing and adds 1 to the top-left number (on a 9 the add does not fit: a failed act, no change charged).
    const nudger = await send(ada, { type: "summon", name: "Nudger", language: "typescript", source: "function agent(g) { return [add([0, 0], 1)]; }" });
    assert.equal(nudger.accepted, true, nudger.message);
    // Reads one number (log2 10 bits) and writes the digit 5 away from it: always a change, always 5 steps.
    const jumper = await send(bo, { type: "summon", name: "Jumper", language: "typescript",
      source: "function agent(g) { const d = g.cell(0, 1).value; return [write([0, 1], (d + 5) % 10)]; }" });
    assert.equal(jumper.accepted, true, jumper.message);

    // The summon-time estimate (measureAgent) is priced under the room's model, before any act.
    for (const [god, name, change] of [[ada, "nudge", want.nudge], [bo, "jump", want.jump]] as const) {
      const obs = observationSchema.parse(await god.c.query(api.player.observation, { roomId }));
      assert.equal(obs.economy?.costModel, costModel);
      const { breakdown } = obs.agents[0];
      if (name === "jump") {
        assert.ok(Math.abs(breakdown.change - change) < 1e-3, `${costModel} ${name}: estimated change ${breakdown.change}, by hand ${change}`);
        assert.ok(Math.abs(breakdown.read - digit) < 1e-6);
      } else {
        // The nudge fails on a 9 (about a tenth of reference boards), so its expected change is a little under one nudge.
        assert.ok(breakdown.change <= change + 1e-9 && breakdown.change > 0.7 * change, `${costModel} ${name}: estimated change ${breakdown.change}, one nudge ${change}`);
      }
    }

    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
    const mineOf = async (god: typeof ada) => (await raw(game.gameId)).agents.find((a: any) => a.ownerId === god.subject);
    await waitFor(async () => (await mineOf(ada))?.transforms >= 2 && (await mineOf(bo))?.transforms >= 2, `${costModel}: both agents change objects`, 90000, 250);
    const state = await raw(game.gameId);
    assert.equal(state.game.settings.costModel, costModel === "set-v1" ? undefined : costModel);
    const transforms = state.batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "transform");
    const by = (god: typeof ada) => transforms.filter((e: any) => e.ownerId === god.subject);
    assert.ok(by(ada).length >= 2 && by(bo).length >= 2);
    for (const e of by(ada)) assert.ok(Math.abs(e.cost.change - want.nudge) < 1e-3 && e.cost.read === 0, `${costModel}: a nudge was charged ${JSON.stringify(e.cost)}, by hand ${want.nudge}`);
    for (const e of by(bo)) {
      assert.ok(Math.abs(e.cost.change - want.jump) < 1e-3, `${costModel}: a jump of 5 was charged ${JSON.stringify(e.cost)}, by hand ${want.jump}`);
      assert.ok(Math.abs(e.cost.read - digit) < 1e-9 && Math.abs(e.cost.total - e.cost.read - e.cost.change) < 1e-9);
    }
    // The log is stamped with the schema that says "priced under the game's cost model" (lib/world.ts EVENT_LOG_SCHEMA 10).
    assert.ok(state.batches.every((b: any) => b.schema === 10));
    await host.c.mutation(api.rooms.endActiveGame, { roomId });
  }
});
