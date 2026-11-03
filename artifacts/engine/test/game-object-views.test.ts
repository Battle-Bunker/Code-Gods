/**
 * The per-god object read model (docs/convex-read-architecture.md §4.1, §4.3, §6 PR 4): the start fills, and every
 * commit keeps, one objectViews row per roster god per object, each god's totals and its scatter digest; the panel reads
 * one index page (player.objectIds) and one row per visible object (player.object), never the world.
 *
 * What would break: a row that lags or drifts from the object it shows (the panel would show stale numbers), a
 * skeleton not in its sort order or a filter that lets the wrong objects through, totals that disagree with the
 * observation, rows that stay noisy after the end, a viewer reading another god's row, objectsPage (the stored panels'
 * compatibility shape) paging differently from its chained cursors.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, raw, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 40, spawnRateHz: 1,
  interactionRateHz: 40, planningSeconds: 3600, halfLifeSeconds: 1e9, agentEnergyPerSecond: 100, startingEnergy: 1000,
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
type Obj = { id: string; value: unknown; version: number; own: { netBits: number }; peerNetBits: number; peerCare: number; payoff: number };

/** Every page of the viewer's skeleton in one order, chained by cursor. */
async function allIds(client: any, gameId: string, sort: string, filter = "all") {
  const out: { id: string; key: number }[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: any = await client.query(api.player.objectIds, { gameId, sort, filter, paginationOpts: { numItems: 15, cursor } });
    out.push(...page.page);
    if (page.isDone) return out;
    cursor = page.continueCursor;
  }
}

test("objectViews: the start fills each god's rows; commits keep them, the totals and the digest equal to the observation", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Views Host", "Views Ada", "Views Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], settings);
  const game = await startGame(host, roomId);
  const observed = async () => (await ada.c.query(api.player.observation, { roomId })) as { gameId: string; objects: Obj[]; self: { score: number } };

  // The start's fill: every object has Ada's row, equal to what the observation shows her.
  const check = async () => {
    const obs = await observed();
    const ids = await allIds(ada.c, game.gameId, "payoff");
    if (ids.length !== obs.objects.length) return false;
    const rows: Obj[] = await Promise.all(obs.objects.map(o => ada.c.query(api.player.object, { objectId: o.id })));
    // A commit between the two reads: try again.
    if (rows.some((r, i) => !r || r.value !== obs.objects[i].value)) return false;
    // (The observation's objects carry no version.)
    rows.forEach((r, i) => { const { version, ...shown } = r; assert.equal(typeof version, "number"); assert.deepEqual(shown, obs.objects[i], `row ${r.id} = the observation's object`); });
    return { obs, ids };
  };
  const filled = await waitFor(check, "Ada's rows for every object", 60_000, 250);
  // Hand: the skeleton is the observation's objects sorted by payoff, highest first.
  assert.deepEqual(filled.ids.map(r => r.key), filled.obs.objects.map(o => o.payoff).sort((a, b) => b - a));
  const totals = await ada.c.query(api.player.totals, { gameId: game.gameId });
  assert.equal(totals.objectCount, filled.obs.objects.length);
  assert.ok(near(totals.score, filled.obs.self.score), "score = the observation's self.score");
  assert.ok(near(totals.sumOwnNetBits, filled.obs.objects.reduce((n, o) => n + o.own.netBits, 0)));
  assert.equal(totals.contested, filled.obs.objects.filter(o => o.own.netBits > 0 && o.peerCare > 0).length);
  assert.equal(totals.chips, filled.obs.objects.filter(o => o.own.netBits <= 0 && o.peerCare > 0).length);
  const digest = await ada.c.query(api.player.objectDigest, { gameId: game.gameId });
  assert.deepEqual([...digest.own].sort(), filled.obs.objects.map(o => o.own.netBits).sort());

  // Run the world: agents change objects; the rows, the totals and the digest follow every commit.
  for (const god of [ada, bo]) {
    const r = await god.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: "Views agent", language: "typescript", source: "function agent(x) { return [add(7)]; }" }, game.gameId) });
    assert.equal(r.accepted, true, r.message);
  }
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).objects.some((o: any) => o.version > 0) || undefined, "a transformation", 60_000);
  const moved = await waitFor(check, "Ada's rows after transformations and spawns", 30_000, 100);
  assert.ok(moved.obs.objects.length > 40 || (await raw(game.gameId)).objects.some((o: any) => o.version > 0));

  // Each order and filter is its index range (hand: the observation sorted and filtered the same way).
  for (const [sort, key] of [["mine", (o: Obj) => o.own.netBits], ["othersCare", (o: Obj) => o.peerCare]] as const) {
    const s = await waitFor(async () => {
      const obs = await observed(), ids = await allIds(ada.c, game.gameId, sort);
      const want = obs.objects.map(key).sort((a, b) => b - a);
      return JSON.stringify(ids.map(r => r.key)) === JSON.stringify(want) && ids;
    }, `the ${sort} order`, 20_000, 100);
    assert.equal(new Set(s.map(r => r.id)).size, s.length, "no object twice");
  }
  const filtered = await waitFor(async () => {
    const obs = await observed();
    const chips = await allIds(ada.c, game.gameId, "payoff", "chips"), positive = await allIds(ada.c, game.gameId, "payoff", "positive");
    const want = (f: (o: Obj) => boolean) => obs.objects.filter(f).map(o => o.id).sort();
    return JSON.stringify(chips.map(r => r.id).sort()) === JSON.stringify(want(o => o.peerCare > 0 && o.own.netBits <= 0))
      && JSON.stringify(positive.map(r => r.id).sort()) === JSON.stringify(want(o => o.payoff > 0)) && { chips, positive };
  }, "the chips and positive filters", 20_000, 100);
  assert.ok(filtered.chips.length + filtered.positive.length > 0);
  const top = await ada.c.query(api.player.objectsTop, { gameId: game.gameId, by: "payoff", n: 5 });
  assert.equal(top.length, 5);
  assert.deepEqual(top.map((r: any) => r.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(top.map((r: any) => r.payoff), [...top.map((r: any) => r.payoff)].sort((a, b) => b - a));
  const bottom = await ada.c.query(api.player.objectsTop, { gameId: game.gameId, by: "mine", n: 3, dir: "asc" });
  assert.deepEqual(bottom.map((r: any) => r.own.netBits), [...bottom.map((r: any) => r.own.netBits)].sort((a, b) => a - b));
  assert.equal((await ada.c.query(api.player.objectsTop, { gameId: game.gameId, n: 500 })).length, 20, "n is capped at 20");

  // The end: every row exact (the others' sum without the noise).
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await waitFor(async () => {
    const r = await raw(game.gameId);
    const rows: Obj[] = await Promise.all(r.objects.map((o: any) => ada.c.query(api.player.object, { objectId: o._id })));
    return r.objects.every((o: any, i: number) => {
      const exact = o.scores.filter((s: any) => s.god !== ada.subject).reduce((n: number, s: any) => n + s.netBits, 0);
      return rows[i] && near(rows[i].peerNetBits, exact);
    }) || undefined;
  }, "ended: exact rows", 30_000, 250);
  const ended = await ada.c.query(api.player.totals, { gameId: game.gameId });
  const final = await observed();
  assert.ok(near(ended.score, final.self.score), "ended totals = the observation's exact score");

  // objectsPage, the stored panels' compatibility shape (the ended game holds still): chained windows list every object once, in order.
  let after = null as { key: number; id: string } | null;
  const chained: string[] = [];
  for (let i = 0; i < 20; i++) {
    const w: any = await ada.c.query(api.player.objectsPage, { roomId, sort: "payoff", limit: 7, ...(after ? { after } : {}) });
    chained.push(...w.rows.map((r: any) => r.id));
    if (!w.next) { assert.equal(w.total, (await raw(game.gameId)).objects.length); break; }
    after = w.next;
  }
  const whole = await allIds(ada.c, game.gameId, "payoff");
  assert.deepEqual(chained, whole.map(r => r.id), "the windows chain through every object once, in payoff order");
  const big: any = await ada.c.query(api.player.objectsPage, { roomId, limit: 2100 });
  assert.equal(big.rows.length, Math.min(100, whole.length), "a window is at most 100 rows");

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
  assert.deepEqual((await stranger.c.query(api.player.objectIds, { gameId: game.gameId, paginationOpts: { numItems: 10, cursor: null } })).page, []);
  assert.equal(await stranger.c.query(api.player.object, { objectId: ids[0].id }), null);
  assert.equal(await stranger.c.query(api.player.totals, { gameId: game.gameId }), null);
  assert.equal(await stranger.c.query(api.player.objectDigest, { gameId: game.gameId }), null);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
