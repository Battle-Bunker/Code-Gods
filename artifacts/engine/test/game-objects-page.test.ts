/**
 * player.objectsPage: the panel's infinite scroll over the whole collection. Pages chained by their cursor are the
 * single big window in the same order under every sort (key descending, object id ascending), carry the viewer's
 * disclosed numbers and the same payoff rank as everywhere, and report footer totals over every object.
 * (Ordering by the disclosed, noisy others-sum, never an exact one, is asserted in game-disclosure.test.ts.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { observationSchema } from "@workspace/player-client";
import { admin, api, gods, internal, rejects, roomWith, startGame, touch, waitFor } from "./game-helpers.ts";

type Row = { id: string; rank: number; payoff: number; peerCare: number; own: { netBits: number } };

test("pages chained by cursor equal one window, under each sort, with stable order and honest totals", { timeout: 180000 }, async () => {
  const [host, ada, bo, outsider] = await gods("Pages Host", "Pages Ada", "Pages Bo", "Pages Outsider");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], {
    languages: ["typescript"], objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" },
    startingObjectCount: 14, spawnRateHz: 0, planningSeconds: 3600, agentEnergyPerSecond: 100, startingEnergy: 1000,
  });
  const game = await startGame(host, roomId);
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
  const observed = await waitFor(async () => {
    const o = observationSchema.parse(await ada.c.query(api.player.observation, { roomId }));
    return o.objects.length >= 14 ? o : null;
  }, "the world's objects", 90000);

  for (const sort of ["payoff", "mine", "othersCare"] as const) {
    const big: { total: number; rows: Row[]; next: unknown } = await ada.c.query(api.player.objectsPage, { roomId, sort, limit: 300 });
    assert.equal(big.total, observed.objects.length);
    assert.equal(big.rows.length, big.total);
    assert.equal(big.next, null, "the whole window leaves no next page");
    const key = (r: Row) => (sort === "payoff" ? r.payoff : sort === "mine" ? r.own.netBits : r.peerCare);
    big.rows.slice(1).forEach((r, i) => {
      const p = big.rows[i];
      assert.ok(key(p) > key(r) || (key(p) === key(r) && p.id < r.id), `${sort}: ${p.id} then ${r.id} is in order`);
    });

    const chained: string[] = [];
    let after: { key: number; id: string } | undefined, pages = 0;
    do {
      const page: { rows: Row[]; next: { key: number; id: string } | null } = await ada.c.query(api.player.objectsPage, { roomId, sort, limit: 4, after });
      assert.ok(page.rows.length <= 4);
      chained.push(...page.rows.map(r => r.id));
      after = page.next ?? undefined; pages++;
    } while (after && pages < 10);
    assert.deepEqual(chained, big.rows.map(r => r.id), `${sort}: four at a time visits the same objects in the same order`);
    assert.equal(pages, Math.ceil(big.total / 4));
  }

  const byPayoff: { rows: Row[]; sumOwnNetBits: number } = await ada.c.query(api.player.objectsPage, { roomId, sort: "payoff", limit: 300 });
  assert.deepEqual(byPayoff.rows.map(r => r.rank), byPayoff.rows.map((_, i) => i + 1), "payoff order is payoff rank");
  const own = new Map(observed.objects.map(o => [o.id, o.own.netBits]));
  assert.ok(Math.abs(byPayoff.sumOwnNetBits - [...own.values()].reduce((s, n) => s + n, 0)) < 1e-6, "the footer's Σ your net bits");

  const positive: { rows: Row[] } = await ada.c.query(api.player.objectsPage, { roomId, filter: "positive", limit: 300 });
  assert.equal(positive.rows.every(r => r.payoff > 0), true);
  await rejects(outsider.c.query(api.player.objectsPage, { roomId }));
});
