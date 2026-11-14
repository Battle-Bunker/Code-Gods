/**
 * Futile acts (docs/rules-design.md §10, convex/lib/futility.ts) end to end: a deterministic agent that writes one
 * constant value acts once per object version and then is never offered those objects again (no endless collisions),
 * its owner sees the failure breakdown, and another agent changing the objects makes it worth trying again.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, sleep, startGame, touch, waitFor } from "./game-helpers.ts";

test("a constant agent stops colliding: one act per object version, then a diagnosis; a changed object is tried again", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Futile Host", "Futile Ada", "Futile Bo");
  await touch(host);
  const settings = {
    objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "mono" }, languages: ["typescript"],
    startingObjectCount: 5, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 2000, interactionRateHz: 50, startingEnergy: 1000,
  };
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  const summoned = await send(ada, { type: "summon", name: "Seven", language: "typescript", source: "function agent(grid) { return [write(everything(), 7)]; }" });
  assert.equal(summoned.accepted, true, summoned.message);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });

  // Five objects: one becomes all 7s; the others collide once each, and on the holder the act changes nothing, once.
  const agentOf = async () => (await raw(game.gameId)).agents.find((a: any) => a.ownerId === ada.subject);
  await waitFor(async () => (await agentOf())?.acts >= 6, "the agent tries every object", 60000, 250);
  await sleep(4000); // several more ticks at 50 opportunities a second: without the memo, hundreds more acts
  const agent = await agentOf();
  assert.equal(agent.acts, 6, "one act per object version, then nothing more to try");
  assert.equal(agent.transforms, 1);
  assert.deepEqual(agent.failures, { collision: 4, noChange: 1, commit: 0, invalid: 0, error: 0, unaffordable: 0 });
  const memo = await admin.query(internal.testing.futileActs, { gameId: game.gameId });
  assert.equal(memo.length, 1);
  assert.equal(memo[0].entries.length, 5, "every object is a futile pair");

  // The owner reads why, and how to fix it.
  const obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  const [mine] = obs.agents;
  assert.deepEqual(mine.outcomes?.failures, { collision: 4, noChange: 1, commit: 0, invalid: 0, error: 0, unaffordable: 0 });
  assert.equal(mine.diagnosis?.summary, "5 of 6 acts failed: another object already has this value ×4, the act changed nothing ×1");
  assert.match(mine.diagnosis?.hint ?? "", /depend on the object/);

  // Another agent changes the objects: the pairs are worth trying again.
  assert.equal((await send(host, { type: "summon", name: "Adder", language: "typescript", source: "function agent(grid) { return [slide(row(0), 1)]; }" })).accepted, true);
  await waitFor(async () => (await agentOf()).acts > 6, "the constant agent is offered changed objects again", 60000, 250);
  const values = (await raw(game.gameId)).objects.map((o: any) => o.value);
  assert.equal(new Set(values).size, values.length, "every object stays unique");

  // Destroying the agent drops its memo.
  assert.equal((await send(ada, { type: "destroy", agentId: mine.id })).accepted, true);
  await waitFor(async () => (await admin.query(internal.testing.futileActs, { gameId: game.gameId })).every((m: any) => m.agentId !== mine.id), "the memo goes with the agent", 30000, 250);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("validation warns before the summon: a constant agent, an idempotent one, and copies of the player's own agent", { timeout: 180000 }, async () => {
  const [host, ada, bo] = await gods("Warn Host", "Warn Ada", "Warn Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "mono" }, languages: ["typescript"], startingObjectCount: 8, spawnRateHz: 0, planningSeconds: 3600, startingEnergy: 5000 });
  const game = await startGame(host, roomId);
  const send = (command: Record<string, unknown>) => ada.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });

  const constant = (await send({ type: "validate", language: "typescript", source: "function agent(grid) { return [write(everything(), 7)]; }" })).validation;
  assert.equal(constant.valid, true);
  assert.equal(constant.futility.constant, true);
  assert.ok(constant.expectedSuccessRate < 0.2, `${constant.expectedSuccessRate}`);
  assert.match(constant.warnings.join(" "), /only one object can ever hold this value/);

  const rounding = (await send({ type: "validate", language: "typescript", source: "function agent(grid) { return [sortLine(row(0))]; }" })).validation;
  assert.equal(rounding.futility.idempotent, true);
  assert.equal(rounding.futility.secondPass, 0);
  assert.match(rounding.warnings.join(" "), /acts once per object, then wastes acts/);

  const adder = "function agent(grid) { return [slide(row(0), 1)]; }";
  const working = (await send({ type: "validate", language: "typescript", source: adder })).validation;
  assert.equal(working.warnings, undefined, "a working agent has nothing to warn about");
  // A row slide fails only on a sample whose row is already one digit (nothing moves): almost always.
  assert.ok(working.expectedSuccessRate >= 0.9, `${working.expectedSuccessRate}`);

  // The summon is never refused for a warning; the receipt carries it.
  const summoned = await send({ type: "summon", name: "Seven", language: "typescript", source: "function agent(grid) { return [write(everything(), 7)]; }" });
  assert.equal(summoned.accepted, true);
  assert.match(summoned.warnings.join(" "), /only one object can ever hold/);
  // Code the player already runs: a copies warning.
  const second = await send({ type: "summon", name: "Adder", language: "typescript", source: adder });
  assert.equal(second.accepted, true, second.message);
  const copy = (await send({ type: "validate", language: "typescript", source: adder })).validation;
  assert.match(copy.warnings.join(" "), /You already have an agent with this exact code/);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
