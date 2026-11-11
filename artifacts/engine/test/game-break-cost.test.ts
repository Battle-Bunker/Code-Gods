/**
 * "Breaking costs extra" end to end (docs/energy-model.md §2.2). In a room with settings.breakCost = b > 0, a committed
 * change pays changeCost(W + b·D), where D is how far the object's disclosed salience fell: the sum of every god's net
 * bits plus the value's disclosure noise, before against after. Every expectation here is derived by hand from the raw
 * event log (each event's recorded net bits and noise) and the documented formulas, never from the engine's helpers.
 * The cost is the owner's alone: another god and a spectator never see it. Rooms without the rule: game-energy.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

/** W + β·W², β = 0.05 (docs/energy-model.md §4). */
const changeCost = (W: number) => W + 0.05 * W * W;
/** One digit add on an Int whose largest magnitude has 7 digits (§4.1): 1 + log2 P + log2 18, P = 7. */
const W_DIGIT = 1 + Math.log2(7) + Math.log2(18);
const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * Every transform of a raw log with the salience it started from: the previous event of that object (its spawn, a
 * rescore or a transform) gives every god's net bits and the value's noise before; the transform's own, after.
 */
function transformsOf(batches: any[]) {
  const last = new Map<string, number>();
  const out: { e: any; before: number; after: number }[] = [];
  for (const e of batches.flatMap((b: any) => b.events)) {
    if (e.t !== "spawn" && e.t !== "rescore" && e.t !== "transform") continue;
    const disclosed = sum(e.net) + (e.noise ?? 0);
    if (e.t === "transform") {
      const before = last.get(e.objectId);
      assert.ok(before !== undefined, `the log has object ${e.objectId} before it changes`);
      out.push({ e, before: before!, after: disclosed });
    }
    last.set(e.objectId, disclosed);
  }
  return out;
}

async function play(names: string[], breakCost: number, peerNoiseBits: number) {
  const [host, ada, bo] = await gods(...names);
  await touch(host);
  const settings = {
    objectType: "Int", typeArgs: { min: -1000000, max: 1000000 }, languages: ["typescript"],
    startingObjectCount: 12, spawnRateHz: 0, planningSeconds: 3600, powerPerSecond: 2000, interactionRateHz: 50,
    breakCost, peerNoiseBits,
  };
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const send = (god: typeof ada, command: Record<string, unknown>) => god.c.action(api.commands.submit, { roomId, envelope: envelope(command, game.gameId) });
  // Three blind agents, each adding to one decimal place: every committed act is one digit add (W_DIGIT), reading nothing.
  for (const [god, k] of [[host, 100], [ada, 1], [bo, 10]] as const) {
    const r = await send(god, { type: "summon", name: `Adds ${k}`, language: "typescript", source: `function agent(n) { return [add(${k})]; }` });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  // Until the log holds changes that destroyed bits and changes that did not, by each of Ada and Bo.
  await waitFor(async () => {
    const ts = transformsOf((await raw(game.gameId)).batches);
    return [ada, bo].every(g => ts.some(t => t.e.ownerId === g.subject && t.before - t.after > 1e-6) && ts.some(t => t.e.ownerId === g.subject && t.before - t.after <= 0));
  }, "changes that break and changes that do not", 90000, 250);
  return { host, ada, bo, roomId, game };
}

test("a committed change pays changeCost(W + breakCost × the disclosed salience it destroyed); only its owner sees the cost", { timeout: 240000 }, async () => {
  const { host, ada, bo, roomId, game } = await play(["Break Host", "Break Ada", "Break Bo"], 2, 0);
  const [watcher] = await gods("Break Watcher");
  const state = await raw(game.gameId);
  assert.equal(state.game.settings.breakCost, 2);
  assert.equal(state.batches.at(-1).schema, 10);
  const transforms = transformsOf(state.batches);
  assert.ok(transforms.length >= 4);
  for (const { e, before, after } of transforms) {
    assert.equal(e.noise ?? 0, 0, "peerNoiseBits 0: the disclosed sums are the exact ones");
    const D = Math.max(0, before - after);
    const expected = changeCost(W_DIGIT + 2 * D);
    close(e.cost.change, expected, `change, ${D} bits destroyed`);
    close(e.cost.broke, D, "the bits destroyed are recorded");
    close(e.cost.breaking, expected - changeCost(W_DIGIT), "and what they cost");
    assert.equal(e.cost.read, 0, "a blind agent reads nothing");
    assert.equal(e.cost.total, e.cost.change);
    assert.deepEqual(Object.keys(e.cost).sort(), ["breaking", "broke", "change", "read", "total"]);
  }
  const raising = transforms.filter(t => t.before <= t.after);
  for (const t of raising) close(t.e.cost.change, changeCost(W_DIGIT), "a change that keeps or raises the object's worth pays today's price");
  assert.ok(transforms.some(t => t.e.cost.breaking > 1), "some change paid for breaking");
  // Acts that did not commit (here: collisions) pay their reads only, with no breaking fields.
  for (const e of state.batches.flatMap((b: any) => b.events).filter((e: any) => e.t === "fail" || e.t === "skip")) {
    assert.deepEqual(e.cost, { read: 0, change: 0, total: 0 });
  }
  // Each agent's account was charged exactly its recorded totals.
  for (const agent of state.agents) {
    const mine = state.batches.flatMap((b: any) => b.events).filter((e: any) => "cost" in e && e.agentId === agent._id);
    assert.ok(Math.abs(agent.spent - sum(mine.map((e: any) => e.cost.total))) < 1e-6, `${agent.name} spent what its acts were charged`);
  }

  // The player is told the rule and sees the breaking part of its OWN changes; never another god's cost.
  const obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  assert.equal(obs.economy?.breakCost, 2);
  const adaEvents = (await ada.c.query(api.player.events, { roomId, after: -1, limit: 50 })).events.filter((e: any) => e.type === "object.transformed");
  const own = adaEvents.filter((e: any) => e.mine), theirs = adaEvents.filter((e: any) => !e.mine);
  assert.ok(own.length > 0 && theirs.length > 0);
  for (const e of own) {
    const logged = transforms.find(t => t.e.objectId === e.objectId && t.e.version === e.version)!;
    assert.deepEqual(e.cost, logged.e.cost, "its own change, with the recorded split");
  }
  for (const e of theirs) assert.equal("cost" in e, false, "another god's change carries no cost");
  assert.equal(/"broke"|"breaking"/.test(JSON.stringify(theirs)), false);
  // A spectator of the game (not seated in it) reads no act cost at all.
  const objectIds = await watcher.c.query(api.games.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 50, cursor: null } });
  const watched = {
    header: await watcher.c.query(api.games.header, { code: game.shortCode }),
    standings: await watcher.c.query(api.games.standings, { gameId: game.gameId }),
    objectIds,
    objects: await Promise.all(objectIds.page.map((r: any) => watcher.c.query(api.games.object, { objectId: r.id }))),
  };
  assert.equal(/"broke"|"breaking"|"cost"/.test(JSON.stringify(watched)), false, "the spectator's queries carry no act cost");

  // Validation says the estimate leaves the surcharge out.
  const validated = await ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "validate", language: "typescript", source: "function agent(n) { return [add(7)]; }" }, game.gameId) });
  assert.match(JSON.stringify(validated), /charges extra for breaking/);

  // Ended: the replay plays the recorded charges back, breaking included.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  const final = await raw(game.gameId);
  const page = await bo.c.query(api.player.replay, { roomId, gameId: game.gameId, limit: 50, maxEvents: 2000 });
  assert.equal(page.game.logSchema, 10);
  const replayed = page.batches.flatMap((b: any) => b.events).filter((e: any) => e.type === "object.transformed");
  const logged = transformsOf(final.batches.filter((b: any) => b.seq <= page.batches.at(-1).seq));
  assert.ok(replayed.length > 0);
  assert.deepEqual(replayed.map((e: any) => e.cost), logged.slice(0, replayed.length).map(t => t.e.cost));
});

test("with disclosure noise the bits destroyed are measured on the noisy sums the owner is shown, not the exact ones", { timeout: 240000 }, async () => {
  const { host, roomId, game } = await play(["Noisy Break Host", "Noisy Break Ada", "Noisy Break Bo"], 1, 8);
  const state = await raw(game.gameId);
  const transforms = transformsOf(state.batches);
  let differs = 0;
  for (const { e, before, after } of transforms) {
    const D = Math.max(0, before - after);
    close(e.cost.change, changeCost(W_DIGIT + 1 * D), `change, ${D} disclosed bits destroyed`);
    close(e.cost.broke, D, "the disclosed bits destroyed");
  }
  // The exact sums would charge differently: the noise is part of what is priced (it is what the owner sees).
  const exact = new Map<string, number>();
  for (const e of state.batches.flatMap((b: any) => b.events)) {
    if (e.t !== "spawn" && e.t !== "rescore" && e.t !== "transform") continue;
    if (e.t === "transform" && Math.abs(Math.max(0, exact.get(e.objectId)! - sum(e.net)) - e.cost.broke) > 1e-6) differs++;
    exact.set(e.objectId, sum(e.net));
  }
  assert.ok(differs > 0, "σ = 8 bits: the disclosed drop is not the exact drop");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
