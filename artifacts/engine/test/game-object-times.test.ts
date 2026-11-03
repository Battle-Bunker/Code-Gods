/**
 * The Objects panel's public sorts (player.objectsPage sort mutations | newest | oldest | recentlyMutated): the engine keeps
 * each object's transformation count (its `version`), creation time and last transformation time, and orders and pages by
 * them; objects stored without the times are backfilled from objectEvents (migrations:backfillObjectTimes).
 *
 * What would break: a counter the tick forgets to move (or moves for a failed act), a time kept in the wrong unit
 * (wall clock instead of world seconds), a sort that ignores its key or places never-mutated objects first, pages
 * that skip or repeat an object, a backfill that leaves a row in the old shape or changes on a second run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, TS, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 6, spawnRateHz: 0.5, planningSeconds: 3600, halfLifeSeconds: 1e9,
};
type Row = { id: string; mutations: number; createdAt: number; lastMutatedAt: number | null };

/** What objectEvents says each object's public figures are. */
function expectedFigures(objectEvents: any[]) {
  const out = new Map<string, { mutations: number; createdAt: number; lastMutatedAt: number | null }>();
  for (const e of [...objectEvents].sort((a, b) => a.world - b.world || a.seq - b.seq || (a.index ?? 0) - (b.index ?? 0))) {
    const f = out.get(e.objectId) ?? { mutations: 0, createdAt: e.world, lastMutatedAt: null };
    if (e.kind === "transform") { f.mutations++; f.lastMutatedAt = e.world; }
    out.set(e.objectId, f);
  }
  return out;
}

async function runAll(reset: boolean) {
  const since = Date.now();
  await admin.mutation(internal.migrations.runAll, reset ? { reset: true } : {});
  return waitFor(async () => {
    const statuses = await admin.query(internal.migrations.status, {}) as { name: string; state: string; latestStart?: number }[];
    assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
    return statuses.every(s => s.state === "success" && (!reset || (s.latestStart ?? 0) >= since)) && statuses;
  }, "every migration reports success", 120_000, 250);
}

test("the tick keeps count, creation and last mutation time; the four sorts order and page by them; the backfill restores them", { timeout: 300_000 }, async () => {
  const [host, ann, bob] = await gods("Times Host", "Ann Times", "Bob Times");
  const { roomId } = await roomWith([host, ann, bob], settings);
  const game = await startGame(host, roomId);
  for (const god of [ann, bob]) {
    const result = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Test agent", language: "typescript", source: TS.Int }, game.gameId) });
    assert.equal(result.accepted, true, JSON.stringify(result));
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3600 }, kick: true });
  await waitFor(async () => {
    const { objects, objectEvents } = await raw(game.gameId);
    const f = expectedFigures(objectEvents);
    return objects.length > 6 && [...f.values()].filter(x => x.mutations > 0).length >= 3 && [...f.values()].some(x => x.mutations > 1) ? true : null;
  }, "several objects mutated, one more than once, and some spawned after the start", 150_000, 500);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });   // frozen: the raw log and the pages are the same world

  const { objects, objectEvents } = await raw(game.gameId);
  const expected = expectedFigures(objectEvents);
  assert.equal(expected.size, objects.length);
  for (const o of objects) {
    const e = expected.get(o._id)!;
    assert.equal(o.version, e.mutations, "the stored version is the number of transformations");
    assert.equal(o.createdAt, e.createdAt, "createdAt is the spawn event's world time");
    assert.equal(o.lastMutatedAt ?? null, e.lastMutatedAt, "lastMutatedAt is the last transformation's world time");
  }
  assert.ok(objects.some((o: any) => o.createdAt > 0), "an object spawned after the start");
  assert.ok(objects.some((o: any) => o.lastMutatedAt === undefined), "an object never mutated carries no last mutation time");

  const keyOf: Record<string, (r: Row) => number> = {
    mutations: r => r.mutations, newest: r => r.createdAt, oldest: r => -r.createdAt, recentlyMutated: r => r.lastMutatedAt ?? -1,
  };
  for (const sort of ["mutations", "newest", "oldest", "recentlyMutated"] as const) {
    const big: { rows: Row[]; total: number } = await ann.c.query(api.player.objectsPage, { roomId, sort, limit: 2100 });
    assert.equal(big.rows.length, objects.length);
    big.rows.slice(1).forEach((r, i) => {
      const p = big.rows[i];
      assert.ok(keyOf[sort](p) > keyOf[sort](r) || (keyOf[sort](p) === keyOf[sort](r) && p.id < r.id), `${sort}: ${p.id} then ${r.id}`);
    });
    for (const r of big.rows) assert.deepEqual({ m: r.mutations, c: r.createdAt, l: r.lastMutatedAt }, { m: expected.get(r.id)!.mutations, c: expected.get(r.id)!.createdAt, l: expected.get(r.id)!.lastMutatedAt });
    if (sort === "recentlyMutated") {
      const firstNever = big.rows.findIndex(r => r.lastMutatedAt === null);
      assert.ok(firstNever > 0 && big.rows.slice(firstNever).every(r => r.lastMutatedAt === null), "never-mutated objects come last");
    }
    // Pages chained by cursor visit the same objects in the same order.
    const chained: string[] = [];
    let after: { key: number; id: string } | undefined, pages = 0;
    do {
      const page: { rows: Row[]; next: { key: number; id: string } | null } = await ann.c.query(api.player.objectsPage, { roomId, sort, limit: 5, after });
      chained.push(...page.rows.map(r => r.id));
      after = page.next ?? undefined; pages++;
    } while (after && pages < 30);
    assert.deepEqual(chained, big.rows.map(r => r.id), `${sort}: five at a time`);
  }

  // The same figures for a spectator-grade reader of another seat: public, equal for every god.
  const other: { rows: Row[] } = await bob.c.query(api.player.objectsPage, { roomId, sort: "mutations", limit: 2100 });
  assert.deepEqual(other.rows.map(r => [r.id, r.mutations]), (await ann.c.query(api.player.objectsPage, { roomId, sort: "mutations", limit: 2100 })).rows.map((r: Row) => [r.id, r.mutations]));

  // Objects stored without the times: the migration restores them, and a second run changes nothing.
  assert.equal(await admin.mutation(internal.testing.legacyObjectTimes, { gameId: game.gameId }), objects.length);
  for (const run of [1, 2]) {
    await runAll(true);
    const after = (await raw(game.gameId)).objects;
    for (const o of after) {
      const e = expected.get(o._id)!;
      assert.equal(o.createdAt, e.createdAt, `run ${run}: createdAt`);
      assert.equal(o.lastMutatedAt ?? null, e.lastMutatedAt, `run ${run}: lastMutatedAt`);
    }
  }
});
