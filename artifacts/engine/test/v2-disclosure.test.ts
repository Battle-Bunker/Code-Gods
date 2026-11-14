/**
 * Disclosure (integration plan §5.2, spec §8): during a live game no v2 query or read affordance tells a player another
 * player's rule, score or value. A seeded game (v2/testing:seedGame); Bo asks everything a seated player can ask, and
 * nothing Bo is told names Ada's rule; every value Bo is given is Bo's own.
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

test("nothing Bo is told names Ada's rule, and every value Bo gets is Bo's own", async () => {
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
  for (const id of ["game.get", "game.standings", "rule.explain", "rule.values", "agents.list"]) await op(id, {});
  await op("objects.list", { sort: "points", limit: 50 });
  await op("moves.list", { limit: 50 });
  for (const objectId of objects) {
    const mine = await q("v2/play:object", { objectId });
    const value = await admin.query("v2/testing:valueOf", { objectId, userId: bo!.userId });
    assert.deepEqual(mine.value, value, "Bo's value of each object is Bo's own row");
    await q("v2/spectate:object", { objectId });
    await op("object.score", { objectId });
    await op("object.read", { objectId, rep: "si" });
    await op("object.quote", { objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] });
  }
  const text = JSON.stringify(told);
  for (const secret of [adaRule.ruleKey, adaRule.card, adaRule.family]) assert.ok(!text.includes(secret), `Bo was told ${secret}`);
});

test("the others' total after a candidate move: only the sum, from the live state (never any state), at most 4, seated players only", async () => {
  const objectId = objects[0]!;
  const now = await bo!.query("v2/play:object", { objectId });
  const shift = { mutator: "si.shift", site: 0, args: { k: "1" } }, none = { mutator: "si.shift", site: 0, args: { k: "0" } };
  const r = await bo!.query("v2/play:othersAt", { objectId, calls: [shift, { mutator: "no.such", site: 0, args: {} }] });
  assert.deepEqual(Object.keys(r).sort(), ["after", "state"]);
  assert.equal(r.state, now.state, "applied to the object's live state");
  assert.deepEqual(Object.keys(r.after[0]).sort(), ["state", "want"], "a total, nothing per player");
  assert.notEqual(r.after[0].state, now.state);
  assert.equal(r.after[1], null, "an invalid call answers nothing");
  // A move that changes nothing: the others' total is the stored want.
  const same = (await bo!.query("v2/play:othersAt", { objectId, calls: [none] })).after[0];
  if (same && same.state === now.state) assert.ok(Math.abs(same.want - now.value.want) < 1e-9, "at the current state it is the stored want");
  const adaRule = await ada!.query("v2/play:myRule", { gameId });
  for (const secret of [adaRule.ruleKey, adaRule.card, adaRule.family]) assert.ok(!JSON.stringify(r).includes(secret));
  await assert.rejects(bo!.query("v2/play:othersAt", { objectId, calls: Array(5).fill(shift) }), /at most 4/);
});

test("one object's moves are the caller's own act-log rows for it, newest first", async () => {
  const all = await bo!.query("v2/play:moves", { gameId, paginationOpts: page });
  const first = all.page[0];
  if (!first) return;
  const rows = await bo!.query("v2/play:objectMoves", { gameId, number: first.number });
  assert.deepEqual(rows.map((r: { seq: number }) => r.seq), all.page.filter((m: { number: number }) => m.number === first.number).map((m: { seq: number }) => m.seq));
  assert.deepEqual(await bo!.query("v2/play:objectMoves", { gameId, number: 9999 }), []);
});
