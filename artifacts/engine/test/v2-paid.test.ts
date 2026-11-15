/**
 * Paying to read (owner decision 35; v1's paid observation, docs/energy-model.md §11 on archive/engine-v1;
 * convex/v2/knowledge.ts): every game pays to look, at the read price times the game's weight (the beginner game's 3).
 * A seated player sees each object as last told: at its birth, by their own
 * agents' changes and complete reads, or by a look they pay for from their own store. Activity is public (how many
 * changes since), content is paid: another player's move in the public log shows no state, the act log shows only the
 * player's own agents' moves, and every read (object, sorts, quotes, the spectator's object, othersAt) shows the told
 * state. A look costs the object's full read and tells the player the object as it is. After the end everything is
 * open. A weight of 0 reads the live world free.
 *
 * What would break: a seated player reading the live world for free at a weight above 0; a look priced off the weight.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

const page = { numItems: 50, cursor: null };

test("a paid game shows each object as last told; a look pays to see it now; the end opens everything", { timeout: 180_000 }, async () => {
  const [ada, bo] = await humans("Paid Ada", "Paid Bo");
  const { roomId } = (await perform(ada!, "room.create", { name: "Paid room" })).result;
  await perform(bo!, "room.join", { code: (await ada!.query("v2/rooms:get", { roomId })).code }, {});
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  await perform(ada!, "room.settings", { overrides: { startingEnergy: 1200 } }, { roomId });   // the preset's weight, 3
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const scope = { gameId };
  const early = await perform(ada!, "object.look", {}, scope).catch((e: any) => e.data);
  assert.equal(early.ok, false, "a look before the world runs is refused");
  await perform(ada!, "game.startWorldNow", {}, scope);
  await new Promise(r => setTimeout(r, 8000));   // the practice partner's agent moves lines Ada does not watch
  await perform(ada!, "game.pause", {}, scope);

  const ids = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: page })).page.map((r: any) => r.objectId);
  let stale: string | null = null;
  for (const objectId of ids) {
    const [mine, live] = [await ada!.query("v2/play:object", { objectId }), await admin.query("v2/testing:stateOf", { objectId })];
    assert.equal(mine.version + mine.changesSince, live.version, "the changes since are public");
    assert.ok(typeof mine.knownAt === "number");
    if (mine.changesSince > 0) {
      stale = objectId;
      assert.notEqual(mine.state, live.state, "a changed object shows as last told, not as it is");
      assert.equal((await ada!.query("v2/spectate:object", { objectId })).state, mine.state, "the spectator's read gives a seated player no more");
      assert.equal((await ada!.query("v2/play:othersAt", { objectId, calls: [] })).state, mine.state, "candidates from the told state");
    }
  }
  assert.ok(stale, "the partner's agent changed a line Ada was not told");
  const log = (await ada!.query("v2/play:log", { gameId, paginationOpts: page })).page;
  for (const r of log.filter((x: any) => x.kind === "move" && !x.mine)) assert.deepEqual([r.state, r.stateBefore, r.own, r.others], [null, null, null, null], "another player's move: activity, not content");
  assert.ok(log.some((r: any) => r.kind === "born" && r.state), "a birth is public");
  for (const m of (await ada!.query("v2/play:moves", { gameId, paginationOpts: page })).page) assert.equal(m.mine, true, "only Ada's own agents' moves");

  // A look: the object's full read at the read price, from Ada's own store; then she sees it as it is.
  const before = (await ada!.query("v2/play:me", { gameId })).energy;
  const quoted = (await ada!.query("v2/play:object", { objectId: stale })).lookPrice;
  const looked = await perform(ada!, "object.look", { objectId: stale }, scope);
  assert.ok(Math.abs(quoted - looked.result.price) < 1e-9, `the object shows what a look costs: ${quoted}`);
  assert.equal(looked.ok, true, JSON.stringify(looked));
  assert.ok(looked.result.price > 0 && looked.result.looked === 1);
  const after = (await ada!.query("v2/play:me", { gameId })).energy;
  assert.ok(Math.abs(before - after - looked.result.price) < 0.5, `the look is paid from the store: ${before} → ${after} for ${looked.result.price}`);
  const bits = await admin.query("v2/testing:fullReadBits", { objectId: stale! });
  assert.ok(Math.abs(looked.result.price - 3 * bits / 32) < 1e-9, `the read price (bits ÷ 32) times the weight 3: ${looked.result.price} for ${bits} bits`);
  const now = await ada!.query("v2/play:object", { objectId: stale });
  assert.deepEqual([now.state, now.changesSince], [(await admin.query("v2/testing:stateOf", { objectId: stale! })).state, 0], "seen as it is");
  const all = await perform(ada!, "object.look", {}, scope);
  assert.equal(all.result.looked, ids.length, "a look at every object");

  const firstPage = await ada!.query("v2/play:objectIds", { gameId, sort: "points", paginationOpts: { numItems: 1, cursor: null } });
  await perform(ada!, "game.end", {}, scope);
  // A page loaded while live keeps its cursor through the end (the app's paginated list re-runs it then).
  await ada!.query("v2/play:objectIds", { gameId, sort: "points", paginationOpts: { numItems: 1, cursor: firstPage.continueCursor } });
  const listed = await perform(ada!, "objects.list", { sort: "points", limit: 50 }, scope, "query");
  for (let i = 0; ; i++) {   // the end tells everyone everything, exact (scheduled at the end)
    const rows = (await ada!.query("v2/play:objectIds", { gameId, sort: "points", paginationOpts: page })).page;
    const exact: number[] = [];
    for (const r of rows) exact.push((await admin.query("v2/testing:valueOf", { objectId: r.objectId, userId: ada!.userId })).points);
    if (rows.length === ids.length && exact.every((p, j) => j === 0 || p <= exact[j - 1]! + 1e-9)) break;
    assert.ok(i < 40, `after the end the list is every object in the exact order: ${exact.join(" ")}`);
    await new Promise(r => setTimeout(r, 250));
  }
  assert.equal(listed.ok, true);
  for (const objectId of ids.slice(0, 5)) {
    const o = await ada!.query("v2/play:object", { objectId });
    assert.equal(o.state, (await admin.query("v2/testing:stateOf", { objectId })).state, "after the end everything is open");
  }
  const ended = (await ada!.query("v2/play:log", { gameId, paginationOpts: page })).page;
  assert.ok(ended.filter((r: any) => r.kind === "move").every((r: any) => r.state !== null));
});

test("a weight of 0 reads the live world free: nothing to look at; a look before the world runs is refused", { timeout: 60_000 }, async () => {
  const [cy] = await humans("Free Cy");
  const { roomId } = (await perform(cy!, "room.create", { name: "Free room" })).result;
  await perform(cy!, "seats.fillPracticePartners", {}, { roomId });
  await perform(cy!, "room.settings", { overrides: { readPriceWeight: 0 } }, { roomId });
  const { gameId } = (await perform(cy!, "game.start", {}, { roomId })).result;
  await perform(cy!, "game.startWorldNow", {}, { gameId });
  const refused = await perform(cy!, "object.look", {}, { gameId }).catch((e: any) => e.data);
  assert.equal(refused.ok, false);
  await perform(cy!, "game.end", {}, { gameId });
});
