/**
 * The bid phase on v2 (integration plan §5.9) on the live local backend: the owner's start opens the phase on a preset
 * with bidding; humans bid sealed; when every human is done the game is dealt with the wins; the winner holds the won
 * family exclusively with the handicap on their rule and in the standings; the auction is disclosed by the preset
 * (none: only one's own win) during the game; a won bid stops the rotation, an all-pass phase keeps it.
 *
 * What would break: a bid seen by another player; a won family dealt to two players; a handicap missing from the net
 * total; a rotation that continues after a won bid. Both bidding presets run it: lines and grids (the families offered
 * are the board's, and the won family is dealt on the board).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";
import { presetOf } from "../convex/v2/presets.ts";

const waitFor = async <T>(f: () => Promise<T | null | undefined | false>, label: string, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await f(); if (v) return v; if (Date.now() > end) throw new Error(`timed out: ${label}`); await new Promise(r => setTimeout(r, 300)); }
};

function bidSuite(preset: string, variant: string, families: readonly string[]) {
describe(preset, () => {
  let ada: Human, bo: Human, cy: Human, roomId: string;
  before(async () => {
    [ada, bo, cy] = await humans(`Bid Ada ${preset}`, `Bid Bo ${preset}`, `Bid Cy ${preset}`);
    const created = await perform(ada!, "room.create", { name: "Bid room", preset });
    roomId = created.result.roomId;
    await perform(bo!, "room.join", { code: created.result.code });
    await perform(cy!, "room.join", { code: created.result.code });
    await perform(ada!, "room.settings", { overrides: { planningSeconds: 30 } }, { roomId });
  });

  test("a won bid: sealed, exclusive, handicapped, disclosed by the preset, and no rotation", async () => {
    const opened = await perform(ada!, "game.start", {}, { roomId });
    assert.deepEqual(opened.result, { gameId: null, bidPhase: true });
    const state = await perform(bo!, "bid.state", {}, { roomId }, "query");
    assert.equal(state.ok, true, JSON.stringify(state));
    const family = state.result.families[0].family;
    assert.ok(families.includes(family), `${family} is one of ${preset}'s families`);
    assert.equal((await perform(bo!, "bid.place", { family, percent: 30 }, { roomId })).ok, true);
    assert.equal((await perform(cy!, "bid.place", { family, percent: 20 }, { roomId })).ok, true);
    assert.deepEqual((await perform(ada!, "bid.state", {}, { roomId }, "query")).result.mine, [], "sealed: Ada sees none of the others' bids");
    assert.deepEqual((await ada!.query("v2/bids:state", { roomId })).mine, []);
    await perform(ada!, "bid.done", {}, { roomId });
    await perform(bo!, "bid.done", {}, { roomId });
    assert.equal((await ada!.query("v2/rooms:get", { roomId })).game, null, "not dealt until every human is done");
    await perform(cy!, "bid.done", {}, { roomId });
    const gameId = (await waitFor(async () => (await ada!.query("v2/rooms:get", { roomId })).game, "the deal")).gameId;
    assert.equal((await ada!.query("v2/rooms:get", { roomId })).bidding, null, "the phase is closed");

    const rules = { ada: await ada!.query("v2/play:myRule", { gameId }), bo: await bo!.query("v2/play:myRule", { gameId }), cy: await cy!.query("v2/play:myRule", { gameId }) };
    assert.equal(rules.bo.family, family);
      assert.equal((await admin.query("v2/testing:header", { gameId })).variant, variant, "dealt on the preset's board");
    assert.deepEqual([rules.bo.bid, rules.bo.handicap], [30, 30], "first price");
    assert.ok(rules.ada.family !== family && rules.cy.family !== family, "the won family is Bo's alone");
    assert.equal(rules.cy.handicap, null);

    const seen = await perform(cy!, "game.auction", {}, { gameId }, "query");
    assert.deepEqual([seen.result.disclosure, seen.result.wins.length, seen.result.bids], ["none", 0, null], "Cy is told nothing of Bo's win");
    const own = await perform(bo!, "game.auction", {}, { gameId }, "query");
    assert.deepEqual(own.result.wins.map((w: any) => [w.family, w.handicap]), [[family, 30]]);

    await perform(ada!, "game.startWorldNow", {}, { gameId });
    await perform(ada!, "game.end", {}, { gameId });
    const standings = await ada!.query("v2/games:standings", { gameId });
    const boRow = standings.rows.find((r: any) => r.handicap === 30);
    assert.ok(boRow, "Bo's handicap is in the standings");
    assert.ok(Math.abs(boRow.net - (boRow.total - 0.3 * Math.abs(boRow.total))) < 1e-9);
    const after = await perform(cy!, "game.auction", {}, { gameId }, "query");
    assert.equal(after.result.disclosure, "all", "everything after the end");
    assert.equal(after.result.bids.length, 2);
    const header = await admin.query("v2/testing:header", { gameId });
    assert.equal(header.rotates, false, "a deal with a won bid neither rotates nor continues a rotation");
  });

  test("an all-pass phase deals as usual and may rotate", async () => {
    assert.deepEqual((await perform(ada!, "game.start", {}, { roomId })).result, { gameId: null, bidPhase: true });
    await perform(bo!, "bid.done", {}, { roomId });
    await perform(cy!, "room.setSpectator", { spectator: true }, { roomId });
    await perform(ada!, "bid.done", {}, { roomId });
    // Cy watches now, so Ada and Bo being done closes the phase; too few seats remain, so no game is dealt.
    assert.equal((await ada!.query("v2/rooms:get", { roomId })).bidding, null);
    assert.equal((await ada!.query("v2/rooms:get", { roomId })).game, null);
    await perform(cy!, "room.setSpectator", { spectator: false }, { roomId });
    assert.deepEqual((await perform(ada!, "game.start", {}, { roomId })).result, { gameId: null, bidPhase: true });
    for (const h of [ada!, bo!, cy!]) await perform(h, "bid.done", {}, { roomId });
    const gameId = (await waitFor(async () => (await ada!.query("v2/rooms:get", { roomId })).game, "the deal")).gameId;
    const header = await admin.query("v2/testing:header", { gameId });
    assert.equal(header.rotates, true);
    for (const h of [ada!, bo!, cy!]) assert.equal((await h.query("v2/play:myRule", { gameId })).handicap, null);
    await perform(ada!, "game.end", {}, { gameId });
  });
});
}

bidSuite("lines-beginner-bidding", presetOf("lines-beginner-bidding").variant, presetOf("lines-beginner-bidding").families);
bidSuite("grids-beginner-bidding", "grid-4-d10", presetOf("grids-beginner-bidding").families);

test("the owner cancels an open bid phase (v1's cancelBidding): the bids are forgotten, nothing is dealt; nobody else can", { timeout: 60_000 }, async () => {
  const [ada, bo, cy] = await humans("Cancel Ada", "Cancel Bo", "Cancel Cy");
  const created = await perform(ada!, "room.create", { name: "Cancel room", preset: "lines-beginner-bidding" });
  const roomId = created.result.roomId;
  await perform(bo!, "room.join", { code: created.result.code });
  await perform(cy!, "room.join", { code: created.result.code });
  assert.deepEqual((await perform(ada!, "game.start", {}, { roomId })).result, { gameId: null, bidPhase: true });
  const family = (await perform(bo!, "bid.state", {}, { roomId }, "query")).result.families[0].family;
  assert.equal((await perform(bo!, "bid.place", { family, percent: 30 }, { roomId })).ok, true);
  assert.equal((await perform(bo!, "bid.cancel", {}, { roomId })).ok, false, "only the owner cancels");
  assert.equal((await perform(ada!, "bid.cancel", {}, { roomId })).ok, true);
  assert.equal((await perform(bo!, "bid.state", {}, { roomId }, "query")).ok, false, "the phase is closed");
  assert.equal((await perform(ada!, "bid.cancel", {}, { roomId })).ok, false, "nothing left to cancel");
  // Opening again starts with no bids: the old ones were forgotten.
  await perform(ada!, "game.start", {}, { roomId });
  assert.deepEqual((await perform(bo!, "bid.state", {}, { roomId }, "query")).result.mine, []);
  await perform(ada!, "bid.cancel", {}, { roomId });
});

test("v1's bid settings and excluded rules are room settings: second price, open bids, the whole auction shown, families never dealt", { timeout: 120_000 }, async () => {
  const preset = presetOf("lines-beginner-bidding");
  const [ada, bo, cy] = await humans("Open Ada", "Open Bo", "Open Cy");
  const created = await perform(ada!, "room.create", { name: "Open bid room", preset: preset.id });
  const roomId = created.result.roomId;
  for (const h of [bo!, cy!]) await perform(h, "room.join", { code: created.result.code });
  const all = (await perform(ada!, "game.start", {}, { roomId }).then(async () => (await perform(ada!, "bid.state", {}, { roomId }, "query")).result.families.map((f: any) => f.family)));
  await perform(ada!, "bid.cancel", {}, { roomId });
  const kept = all.slice(0, 3), excluded = all.slice(3);
  for (const bad of [{ excludedFamilies: ["no-such-family"] }, { excludedFamilies: all }, { bidVisibility: "loud" }, { bidDisclosure: "private" }]) {
    const out = await perform(ada!, "room.settings", { overrides: bad }, { roomId }).catch((e: any) => e.data);
    assert.equal(out.ok, false, `refused: ${JSON.stringify(bad)}`);
  }
  const set = await perform(ada!, "room.settings", { overrides: { planningSeconds: 30, excludedFamilies: excluded, bidPricing: "second", bidVisibility: "open", bidDisclosure: "all" } }, { roomId });
  assert.equal(set.ok, true, JSON.stringify(set));
  await perform(ada!, "game.start", {}, { roomId });
  const state = (await perform(bo!, "bid.state", {}, { roomId }, "query")).result;
  assert.deepEqual(state.families.map((f: any) => f.family), kept, "only the families the room deals are on offer");
  assert.equal(state.visibility, "open");
  const family = kept[0];
  await perform(bo!, "bid.place", { family, percent: 30 }, { roomId });
  await perform(cy!, "bid.place", { family, percent: 20 }, { roomId });
  const seen = (await perform(ada!, "bid.state", {}, { roomId }, "query")).result.others;
  assert.deepEqual(seen.map((o: any) => [o.name, o.bids]).sort(), [["Open Bo", [{ family, percent: 30 }]], ["Open Cy", [{ family, percent: 20 }]]], "open: Ada sees the others' bids");
  for (const h of [ada!, bo!, cy!]) await perform(h, "bid.done", {}, { roomId });
  const gameId = (await waitForGame(ada!, roomId)).gameId;
  const bo1 = await bo!.query("v2/play:myRule", { gameId });
  assert.deepEqual([bo1.family, bo1.bid, bo1.handicap], [family, 30, 20], "second price: Bo pays Cy's 20");
  const told = (await perform(cy!, "game.auction", {}, { gameId }, "query")).result;
  assert.deepEqual([told.disclosure, told.bids?.length], ["all", 2], "the whole auction is shown while live");
  for (const h of [ada!, cy!]) assert.ok(!excluded.includes((await h.query("v2/play:myRule", { gameId })).family), "an excluded family is never dealt");
  await perform(ada!, "game.end", {}, { gameId });
});

async function waitForGame(h: Human, roomId: string) {
  for (let i = 0; i < 100; i++) { const g = (await h.query("v2/rooms:get", { roomId })).game; if (g) return g; await new Promise(r => setTimeout(r, 300)); }
  throw new Error("timed out: the deal");
}
