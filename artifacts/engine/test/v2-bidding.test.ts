/**
 * The bid phase on v2 (integration plan §5.9) on the live local backend: the owner's start opens the phase on a preset
 * with bidding; humans bid sealed; when every human is done the game is dealt with the wins; the winner holds the won
 * family exclusively with the handicap on their rule and in the standings; the auction is disclosed by the preset
 * (none: only one's own win) during the game; a won bid stops the rotation, an all-pass phase keeps it.
 *
 * What would break: a bid seen by another player; a won family dealt to two players; a handicap missing from the net
 * total; a rotation that continues after a won bid.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, cy: Human, roomId: string;
const waitFor = async <T>(f: () => Promise<T | null | undefined | false>, label: string, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await f(); if (v) return v; if (Date.now() > end) throw new Error(`timed out: ${label}`); await new Promise(r => setTimeout(r, 300)); }
};

before(async () => {
  [ada, bo, cy] = await humans("Bid Ada", "Bid Bo", "Bid Cy");
  const created = await perform(ada!, "room.create", { name: "Bid room", preset: "test-every-family-bidding" });
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
