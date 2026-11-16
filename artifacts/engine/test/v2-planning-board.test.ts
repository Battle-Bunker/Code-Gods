/**
 * The board during planning (v1; baseline-1 item 3): the starting objects are born, valued and scored when the game
 * starts, so planning shows the objects and each player's points before world time starts. The world's start only
 * starts the clock: no second set of births, no second standings row at world 0.
 *
 * What would break: planning with no objects and "0.00 points"; the world's start birthing the starting objects again;
 * a duplicate standings row at world 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

for (const preset of ["lines-beginner", "grids-beginner"]) test(`${preset}: planning shows the starting objects and the points; the world's start adds none`, { timeout: 120_000 }, async () => {
  const [ada] = await humans("Planning Board Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Planning board", preset })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const objectIds = async () => (await ada!.query("v2/playState:objectIds", { gameId, sort: "points", paginationOpts: { numItems: 50, cursor: null } })).page;

  assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "planning");
  const planned = await objectIds();
  assert.equal(planned.length, 3, "the 3 starting objects exist in planning (decision 31)");
  const standings = await ada!.query("v2/games:standings", { gameId });
  assert.equal(standings.rows.length, 3, "standings published in planning");
  assert.equal(standings.worldSeconds, 0);
  // Every seat's total is the sum of its values on the 3 objects (not the 0 a board-less planning showed).
  const totals = await admin.query("v2/testing:totalsOf", { gameId });
  assert.ok(Object.values(totals.exact).some((t: any) => t !== 0), `some player scores on the starting board: ${JSON.stringify(totals)}`);
  const one = await ada!.query("v2/play:object", { objectId: planned[0]!.objectId });
  assert.ok(one && one.state, "an object reads in planning");

  await perform(ada!, "game.startWorldNow", {}, { gameId });
  assert.equal((await ada!.query("v2/games:header", { gameId })).phase, "live");
  const live = await objectIds();
  assert.deepEqual(new Set(live.map((r: any) => r.objectId)), new Set(planned.map((r: any) => r.objectId)), "the same 3 objects, none born again");
  const history = await ada!.query("v2/games:standingsHistory", { gameId, after: -1 });
  assert.equal(history.filter((r: any) => r.worldSeconds === 0).length, 1, "one standings row at world 0");
  await perform(ada!, "game.end", {}, { gameId });
});
