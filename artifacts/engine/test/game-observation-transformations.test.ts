/**
 * The observation's recent own transformations (player.observation `transformations`): each god's transforms in the
 * game's latest 16 tickBatches docs, oldest first, at most 500, with ids `<seq>:<index in the batch>`. They are read
 * from objectEvents (index by_game_owner_seq), not by scanning every god's batches; the output must not change.
 *
 * What would break: another god's transform in the feed, a transform missing or out of order, an id that no longer
 * names the event's place in the log, a lost cost or calls field, or a window that is not the latest 16 batches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, TS, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
const RECENT_BATCHES = 16;

/** The observation's transformations as the batch scan computed them (the behaviour this read must keep). */
function fromBatches(batches: any[], godId: string) {
  const out: unknown[] = [];
  for (const batch of [...batches].sort((a, b) => a.seq - b.seq).slice(-RECENT_BATCHES)) {
    batch.events.forEach((e: any, i: number) => {
      if (e.t === "transform" && e.ownerId === godId) out.push({ id: `${batch.seq}:${i}`, agentId: e.agentId, before: e.before, after: e.value, calls: e.calls, cost: e.cost.total });
    });
  }
  return out.slice(-500);
}

test("the observation's transformations are each god's own, from the latest 16 batches, as the batch scan read them", { timeout: 240_000 }, async () => {
  const [host, ann, bob, cy] = await gods("Obs Host", "Ann Obs", "Bob Obs", "Cy Obs");
  const players = [ann, bob, cy];
  const { roomId } = await roomWith([host, ...players], settings);
  const game = await startGame(host, roomId);
  for (const god of players) {
    const result = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Test agent", language: "typescript", source: TS.Int }, game.gameId) });
    assert.equal(result.accepted, true, JSON.stringify(result));
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  // Long enough that the earliest transforms have left the 16-batch window.
  await waitFor(async () => (await raw(game.gameId)).batches.length > RECENT_BATCHES + 8, "more batches than the window", 120_000, 500);
  await waitFor(async () => {
    const { batches } = await raw(game.gameId);
    return players.every(g => fromBatches(batches, g.subject).length > 0);
  }, "every god's agents transform in the window", 60_000, 500);
  // Frozen at the end, so the observation and the raw log are the same world.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });

  const { batches } = await raw(game.gameId);
  const transforms = batches.flatMap((b: any) => b.events.filter((e: any) => e.t === "transform"));
  assert.ok(new Set(transforms.map((e: any) => e.ownerId)).size === 3, "three gods' agents transform");
  assert.ok(fromBatches(batches, ann.subject).length < transforms.filter((e: any) => e.ownerId === ann.subject).length,
    "some of Ann's transforms are older than the window");

  const observed = async () => Object.fromEntries(await Promise.all(players.map(async g =>
    [g.name, (await g.c.query(api.player.observation, { roomId })).transformations] as const)));
  const expected = Object.fromEntries(players.map(g => [g.name, fromBatches(batches, g.subject)]));
  assert.deepEqual(await observed(), expected);
});
