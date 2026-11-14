/**
 * Disclosure (integration plan §5.2, spec §8): during a live game no v2 query or read affordance tells a player another
 * player's rule, score or value. A seeded game (v2/testing:seedGame); Bo asks everything a seated player can ask, and
 * nothing he is told names Ada's rule; every value he is given is his own.
 *
 * What would break: a query or operation that returns another player's rule key, card, score or value while the game runs.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, cy: Human, roomId: string, gameId: string, objects: string[];
const page = { numItems: 100, cursor: null };

before(async () => {
  [ada, bo, cy] = await humans("Disc Ada", "Disc Bo", "Disc Cy");
  ({ roomId, gameId, objects } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId, cy!.userId], objects: 8 }));
});

test("nothing Bo is told names Ada's rule, and every value he gets is his own", async () => {
  const adaRule = await ada!.query("v2/play:myRule", { gameId });
  const boRule = await bo!.query("v2/play:myRule", { gameId });
  assert.notEqual(adaRule.family, boRule.family);
  const told: unknown[] = [];
  const q = async (name: string, args: Record<string, unknown>) => { const r = await bo!.query(name, args); told.push(r); return r; };
  const op = async (id: string, args: Record<string, unknown>) => { const r = await perform(bo!, id, args, { gameId }, "query"); told.push(r); return r; };
  for (const name of ["v2/games:header", "v2/games:standings", "v2/play:myRule", "v2/play:me", "v2/play:agents", "v2/play:digest"]) await q(name, { gameId });
  await q("v2/games:standingsHistory", { gameId, after: -1 });
  await q("v2/rooms:get", { roomId });
  await q("v2/play:moves", { gameId, paginationOpts: page });
  for (const sort of ["points", "rarity", "want", "born", "recent"]) await q("v2/play:objectIds", { gameId, sort, paginationOpts: page });
  for (const id of ["game.get", "game.standings", "rule.explain", "rule.ladder", "agents.list"]) await op(id, {});
  await op("objects.list", { sort: "points", limit: 50 });
  await op("moves.list", { limit: 50 });
  for (const objectId of objects) {
    const mine = await q("v2/play:object", { objectId });
    const value = await admin.query("v2/testing:valueOf", { objectId, userId: bo!.userId });
    assert.deepEqual(mine.value, value, "Bo's value of each object is his own row");
    await q("v2/spectate:object", { objectId });
    await op("object.score", { objectId });
    await op("object.read", { objectId, rep: "si" });
    await op("object.quote", { objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] });
  }
  const text = JSON.stringify(told);
  for (const secret of [adaRule.ruleKey, adaRule.card, adaRule.family]) assert.ok(!text.includes(secret), `Bo was told ${secret}`);
});
