/**
 * The per-god object read model (docs/convex-read-architecture.md §4.1, §4.3, §6 PR 4; game/objectViews.ts): the start
 * fills, the sync after each commit keeps, and the end makes exact, one objectViews row per roster god per object and
 * each god's totals; the panel reads one index page (player.objectIds) and one row per visible object (player.object).
 *
 * What would break: a row that lags or drifts from the object it shows (stale numbers in the panel), a row left stale
 * for good by a lost sync, a skeleton out of its sort order or a filter letting the wrong objects through, a cursor that
 * skips or repeats an object, totals that disagree with the observation, rows still noisy after the end, objectsPage
 * (stored panels' compatibility shape) paging differently from the skeleton.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const settings = {
  language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Grid",
  typeArgs: { size: 4, symbols: "base10", colours: "mono" }, startingObjectCount: 40, spawnRateHz: 1, interactionRateHz: 40, planningSeconds: 3600,
  halfLifeSeconds: 1e9, powerPerSecond: 200, startingEnergy: 1000, scoreIntervalSeconds: 2,
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
type Obj = { id: string; value: unknown; version: number; own: { netBits: number }; peerNetBits: number; peerCare: number; payoff: number; mutations: number; createdAt: number; lastMutatedAt: number | null };

/** Every page of the viewer's skeleton in one order, chained by cursor (pages of `limit`). */
async function allIds(client: any, gameId: string, sort: string, filter = "all", limit = 7) {
  const out: { id: string; key: number | null }[] = [];
  let after: unknown;
  for (let i = 0; i < 1000; i++) {
    const page: any = await client.query(api.player.objectIds, { gameId, sort, filter, limit, ...(after ? { after } : {}) });
    assert.ok(page.rows.length <= limit);
    out.push(...page.rows);
    if (!page.next) return out;
    after = page.next;
  }
  throw new Error("the skeleton never ends");
}
/** The fields the observation shows of an object (its objects carry no version or public figures). */
const shown = (o: any) => ({ id: o.id, value: o.value, own: o.own, peerNetBits: o.peerNetBits, peerCare: o.peerCare, payoff: o.payoff });

test("objectViews: the start fills each god's rows; the sync keeps them, the orders, filters and totals equal to the observation; the end is exact", { timeout: 300_000 }, async () => {
  const [host, ada, bo] = await gods("Views Host", "Views Ada", "Views Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const observed = async () => (await ada.c.query(api.player.observation, { roomId })) as { objects: Obj[]; self: { score: number } };

  // Ada's rows equal the objects the observation shows her (read in one moment: retried when a commit falls between).
  const check = async () => {
    const obs = await observed();
    const ids = await allIds(ada.c, game.gameId, "payoff");
    if (ids.length !== obs.objects.length) return false;
    const rows: Obj[] = await Promise.all(obs.objects.map(o => ada.c.query(api.player.object, { objectId: o.id })));
    if (rows.some((r, i) => !r || JSON.stringify(shown(r)) !== JSON.stringify(shown(obs.objects[i])))) return false;
    // Hand: the skeleton is the observation's objects by payoff, highest first.
    if (JSON.stringify(ids.map(r => r.key)) !== JSON.stringify(obs.objects.map(o => o.payoff).sort((x, y) => y - x))) return false;
    return { obs, ids };
  };
  // The start's fill (and the hold rescoring's, which the start waits for).
  const filled = await waitFor(check, "Ada's rows for every object", 60_000, 250);
  // Every object once.
  assert.equal(new Set(filled.ids.map(r => r.id)).size, filled.ids.length);
  const totals = await waitFor(async () => (await ada.c.query(api.player.totals, { gameId: game.gameId })) ?? undefined, "Ada's totals");
  assert.equal(totals.objectCount, filled.obs.objects.length);
  assert.ok(near(totals.score, filled.obs.self.score), "score = the observation's self.score");
  assert.ok(near(totals.sumOwnNetBits, filled.obs.objects.reduce((n, o) => n + o.own.netBits, 0)));
  assert.equal(totals.contested, filled.obs.objects.filter(o => o.own.netBits > 0 && o.peerCare > 0).length);
  assert.equal(totals.chips, filled.obs.objects.filter(o => o.own.netBits <= 0 && o.peerCare > 0).length);

  // Run the world: agents change objects and objects spawn; the rows follow each commit's sync.
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Views agent", language: "typescript", source: "function agent(grid) { return [slide(row(0), 7)]; }" }, game.gameId) });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).objects.filter((o: any) => o.version > 0).length >= 5 || undefined, "transformations", 60_000);
  const moved = await waitFor(check, "Ada's rows after transformations and spawns", 30_000, 100);
  const mutated: Obj[] = await Promise.all(moved.obs.objects.map(o => ada.c.query(api.player.object, { objectId: o.id })));
  assert.ok(mutated.some(o => o.mutations > 0));

  // A lost sync: a stale row is swept back by the next scoreboard publication (every 2 world seconds here).
  const victim = moved.obs.objects[0];
  await admin.mutation(internal.testing.staleObjectView, { objectId: victim.id, godId: ada.subject, payoff: 123456 });
  await waitFor(async () => {
    const [row, o] = await Promise.all([ada.c.query(api.player.object, { objectId: victim.id }), raw(game.gameId).then(r => r.objects.find((x: any) => x._id === victim.id))]);
    return row && row.payoff !== 123456 && row.version === o.version || undefined;
  }, "the stale row is swept", 30_000, 250);

  // Each order and filter (hand: the observation's objects sorted and filtered the same way).
  // The public figures from the objects themselves (version = mutations, createdAt, lastMutatedAt).
  const publicOf = async () => (await raw(game.gameId)).objects.map((o: any) => ({ mutations: o.version, createdAt: o.createdAt ?? 0, lastMutatedAt: o.lastMutatedAt ?? null }));
  const orders: [string, (o: Obj) => number | null, () => Promise<Obj[]>][] = [
    ["mine", o => o.own.netBits, async () => (await observed()).objects], ["othersCare", o => o.peerCare, async () => (await observed()).objects],
    ["mutations", o => o.mutations, publicOf], ["newest", o => o.createdAt, publicOf], ["recentlyMutated", o => o.lastMutatedAt, publicOf],
  ];
  for (const [sort, key, source] of orders) {
    const ids = await waitFor(async () => {
      const objects = await source(), got = await allIds(ada.c, game.gameId, sort);
      const want = objects.map(key).sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity));
      // The game runs while the pages are read: an object moving between two page reads is retried, as a list re-reads it.
      return JSON.stringify(got.map(r => r.key)) === JSON.stringify(want) && new Set(got.map(r => r.id)).size === got.length && got;
    }, `the ${sort} order`, 20_000, 100);
    assert.equal(new Set(ids.map(r => r.id)).size, ids.length, `${sort}: no object twice`);
  }
  const oldest = await waitFor(async () => {
    const objects = await publicOf(), got = await allIds(ada.c, game.gameId, "oldest");
    return JSON.stringify(got.map(r => r.key)) === JSON.stringify(objects.map((o: Obj) => o.createdAt).sort((a: number, b: number) => a - b)) && got;
  }, "the oldest order", 20_000, 100);
  // Ties (every starting object was created at 0) still list each object once.
  assert.equal(new Set(oldest.map(r => r.id)).size, oldest.length);
  await waitFor(async () => {
    const obs = await observed();
    const chips = await allIds(ada.c, game.gameId, "payoff", "chips"), positive = await allIds(ada.c, game.gameId, "mine", "positive");
    const want = (f: (o: Obj) => boolean) => JSON.stringify(obs.objects.filter(f).map(o => o.id).sort());
    return JSON.stringify(chips.map(r => r.id).sort()) === want(o => o.peerCare > 0 && o.own.netBits <= 0)
      && JSON.stringify(positive.map(r => r.id).sort()) === want(o => o.payoff > 0) || undefined;
  }, "the chips and positive filters", 20_000, 100);

  const top = await ada.c.query(api.player.objectsTop, { gameId: game.gameId, by: "payoff", n: 5 });
  assert.deepEqual(top.map((r: any) => r.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(top.map((r: any) => r.payoff), [...top.map((r: any) => r.payoff)].sort((a, b) => b - a));
  const bottom = await ada.c.query(api.player.objectsTop, { gameId: game.gameId, by: "mine", n: 3, dir: "asc" });
  assert.deepEqual(bottom.map((r: any) => r.own.netBits), [...bottom.map((r: any) => r.own.netBits)].sort((a, b) => a - b));
  assert.equal((await ada.c.query(api.player.objectsTop, { gameId: game.gameId, n: 500 })).length, 20, "n is capped at 20");

  // The end: every row exact (the others' sum without the noise), the totals the observation's exact score.
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await waitFor(async () => {
    const r = await raw(game.gameId);
    const rows: Obj[] = await Promise.all(r.objects.map((o: any) => ada.c.query(api.player.object, { objectId: o._id })));
    return r.objects.every((o: any, i: number) => {
      const exact = o.scores.filter((s: any) => s.god !== ada.subject).reduce((n: number, s: any) => n + s.netBits, 0);
      return rows[i] && near(rows[i].peerNetBits, exact) && rows[i].version === o.version;
    }) || undefined;
  }, "ended: exact rows", 30_000, 250);
  const final = await observed();
  await waitFor(async () => near((await ada.c.query(api.player.totals, { gameId: game.gameId })).score, final.self.score) || undefined, "ended totals = the exact score");

  // Ranks (hand: the position by payoff); the ended game holds still.
  const byPayoff = await allIds(ada.c, game.gameId, "payoff");
  const third = byPayoff[2];
  if (byPayoff[1].key !== third.key && byPayoff[3].key !== third.key) assert.deepEqual(await ada.c.query(api.player.objectRank, { objectId: third.id }), { rank: 3 });

  // objectsPage, the stored panels' compatibility shape: chained windows list every object once, in the skeleton's order.
  let after = null as { key: number; id: string } | null;
  const chained: string[] = [];
  for (let i = 0; i < 50; i++) {
    const w: any = await ada.c.query(api.player.objectsPage, { roomId, sort: "payoff", limit: 7, ...(after ? { after } : {}) });
    chained.push(...w.rows.map((r: any) => r.id));
    if (!w.next) { assert.equal(w.total, (await raw(game.gameId)).objects.length); break; }
    after = w.next;
  }
  assert.deepEqual(chained, byPayoff.map(r => r.id), "the windows chain through every object once, in payoff order");
  const big: any = await ada.c.query(api.player.objectsPage, { roomId, limit: 2100 });
  assert.equal(big.rows.length, Math.min(90, byPayoff.length), "a window is at most 90 rows");
});

test("objectViews are private: a viewer reads only its own rows, a non-player none", { timeout: 120_000 }, async () => {
  const [host, ada, bo] = await gods("Views Priv Host", "Views Priv Ada", "Views Priv Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], { ...settings, startingObjectCount: 6 });
  const game = await startGame(host, roomId);
  const [stranger] = await gods("Views Priv Stranger");
  const ids = await waitFor(async () => { const r = await allIds(ada.c, game.gameId, "payoff"); return r.length === 6 && r; }, "filled", 30_000, 200);
  const secret = await raw(game.gameId);
  for (const { id } of ids) {
    const mine = await ada.c.query(api.player.object, { objectId: id }), theirs = await bo.c.query(api.player.object, { objectId: id });
    const o = secret.objects.find((x: any) => x._id === id);
    // Catches: a row read by object id alone (another god's numbers).
    assert.equal(mine.own.netBits, o.scores.find((s: any) => s.god === ada.subject).netBits);
    assert.equal(theirs.own.netBits, o.scores.find((s: any) => s.god === bo.subject).netBits);
  }
  assert.deepEqual((await stranger.c.query(api.player.objectIds, { gameId: game.gameId })).rows, []);
  assert.equal(await stranger.c.query(api.player.object, { objectId: ids[0].id }), null);
  assert.equal(await stranger.c.query(api.player.objectRank, { objectId: ids[0].id }), null);
  assert.equal(await stranger.c.query(api.player.totals, { gameId: game.gameId }), null);
  assert.deepEqual(await stranger.c.query(api.player.objectsTop, { gameId: game.gameId }), []);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
