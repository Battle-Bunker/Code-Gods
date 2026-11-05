/**
 * Hold rarity in a game (docs/energy-model.md §8). What would break: a game with more than one player starting its world
 * on static rarity (its corrections never computed, or computed after world time began), the starting objects keeping
 * their static scores, the log or the per-object history disagreeing with the objects.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const GRID = { languages: ["typescript"], startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600 };

test("three players: planning holds until the hold corrections are in; the starting objects are re-scored and logged", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Hold Host", "Hold Ada", "Hold Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], GRID);
  // Without waiting for the corrections: this test watches them arrive.
  const game = await startGame(host, roomId, { holdSettled: false });
  const first = await raw(game.gameId);
  const staticScores = new Map<string, any[]>(first.objects.map((o: any) => [o._id, o.scores]));

  // The deadline passes at once: the world does not start before the corrections are applied.
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  const seen = new Set<string>();
  const done = await waitFor(async () => {
    const g = (await raw(game.gameId)).game;
    seen.add(`${g.phase}:${g.holdState}`);
    return g.phase === "running" ? g : undefined;
  }, "world time starts", 180_000, 100);
  assert.equal(done.holdState, "ready", done.holdError);
  assert.ok(!seen.has("running:computing"), "world time never ran while the corrections were computing");

  const state = await raw(game.gameId);
  const events = state.batches.flatMap((b: any) => b.events);
  const rescores = events.filter((e: any) => e.t === "rescore");
  assert.equal(rescores.length, first.objects.length, "every starting object is re-scored once");
  const roster = state.game.roster.map((m: any) => m.id);
  for (const o of state.objects) {
    const before = staticScores.get(o._id) as any[];
    // The correction only adds bits to the reward (never below static rarity), and never changes the ordinal.
    for (const s of o.scores) {
      const b = before.find(x => x.god === s.god);
      assert.deepEqual(s.ordinal, b.ordinal);
      assert.ok(s.rewardBits >= b.rewardBits - 1e-9, `${s.rewardBits} < static ${b.rewardBits}`);
    }
    const logged = rescores.find((e: any) => e.objectId === o._id);
    assert.deepEqual(logged.net, roster.map((id: string) => o.scores.find((s: any) => s.god === id).netBits), "the log carries the new net bits");
  }
  // Somewhere the correction is non-zero (three objects, three gods: static rarity alone would be a coincidence).
  assert.ok(state.objects.some((o: any) => o.scores.some((s: any) => s.rewardBits > staticScores.get(o._id)!.find((x: any) => x.god === s.god).rewardBits + 1e-9)));

  // The scoreboard and the stored totals follow the re-scored objects (the start published the static ones).
  const rescoreBatch = state.batches.find((b: any) => b.events.some((e: any) => e.t === "rescore"));
  assert.ok(rescoreBatch.totals && rescoreBatch.scoreboard, "the rescore batch carries the new totals");
  assert.notDeepEqual(rescoreBatch.totals, state.batches[0].totals);

  // The per-object history (board) agrees with the objects.
  const board = await ada.c.query(api.player.board, { roomId, world: 0 });
  const adaIndex = roster.indexOf(ada.subject);
  for (const row of board.objects) {
    const o = state.objects.find((x: any) => x._id === row.objectId);
    assert.ok(Math.abs(row.own - o.scores.find((s: any) => s.god === roster[adaIndex]).netBits) < 1e-9);
  }
  const obs = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
  assert.deepEqual(obs.holdRarity, { state: "ready" });
});

