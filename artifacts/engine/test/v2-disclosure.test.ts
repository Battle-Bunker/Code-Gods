/**
 * Disclosure (integration plan §5.2, spec §8): during a live game no v2 query or read affordance tells a player another
 * player's rule, score or value. A seeded game (v2/testing:seedGame); Bo asks everything a seated player can ask, and
 * nothing Bo is told names Ada's rule; every value Bo is given is Bo's own.
 *
 * What would break: a query or operation that returns another player's rule key, card, score or value while the game runs.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, errorCode, humans, perform, type Human } from "./v2-helpers.ts";

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
  for (const name of ["v2/games:header", "v2/games:standings", "v2/play:myRule", "v2/playState:me", "v2/playState:digest"]) await q(name, { gameId });
  await q("v2/playState:agents", { gameId, paginationOpts: page });
  await q("v2/games:standingsHistory", { gameId, after: -1 });
  await q("v2/rooms:get", { roomId });
  await q("v2/playState:moves", { gameId, paginationOpts: page });
  for (const sort of ["points", "rarity", "want", "born", "recent"]) await q("v2/playState:objectIds", { gameId, sort, paginationOpts: page });
  for (const id of ["game.get", "game.standings", "rule.explain", "rule.values", "agents.list"]) await op(id, {});
  await op("objects.list", { sort: "points", limit: 50 });
  await op("moves.list", { limit: 50 });
  // The public log, as the directory serves it (assistants, MCP, CLI) and as the app reads it: the same rows.
  const logged = await op("log.list", { limit: 20 }) as { ok: boolean; result: { page: unknown[] } };
  assert.equal(logged.ok, true, JSON.stringify(logged));
  const read = await q("v2/playState:log", { gameId, paginationOpts: { cursor: null, numItems: 20 } }) as { page: unknown[] };
  assert.deepEqual(logged.result.page, read.page, "log.list answers play:log's page");
  for (const objectId of objects) {
    const mine = await q("v2/play:object", { objectId });
    const value = await admin.query("v2/testing:valueOf", { objectId, userId: bo!.userId });
    // `parts`: Bo's own points tree (play.ts ownParts, his own rule only), beside the row it is drawn from.
    const { parts: _parts, ...row } = mine.value;
    assert.deepEqual(row, value, "Bo's value of each object is Bo's own row");
    await q("v2/spectate:object", { objectId });
    await op("object.score", { objectId });
    await op("object.read", { objectId, rep: "si" });
    await op("object.quote", { objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] });
  }
  const text = JSON.stringify(told);
  for (const secret of [adaRule.ruleKey, adaRule.card, adaRule.family]) assert.ok(!text.includes(secret), `Bo was told ${secret}`);
});

test("What if, the others' total after a candidate move: only the sum, from the live state, at most 4, seated players only; paid while live (call 33)", async () => {
  const objectId = objects[0]!;
  const now = await bo!.query("v2/play:object", { objectId });
  const shift = { mutator: "si.shift", site: 0, args: { k: "1" } }, none = { mutator: "si.shift", site: 0, args: { k: "0" } };
  const whatIf = async (calls: unknown[]) => { const r = await perform(bo!, "object.whatIf", { objectId, calls }, { gameId }); assert.equal(r.ok, true, JSON.stringify(r)); return r.result; };
  const r = await whatIf([shift, { mutator: "no.such", site: 0, args: {} }]);
  assert.deepEqual(Object.keys(r).sort(), ["after", "price", "state"]);
  assert.ok(r.price >= 0, "a look's price per candidate (free where the game reads free)");
  assert.equal(r.state, now.state, "applied to the object's live state");
  assert.deepEqual(Object.keys(r.after[0]).sort(), ["state", "taken", "want"], "a total, nothing per player");
  assert.equal(r.after[0].taken, null, "no other object is there");
  assert.notEqual(r.after[0].state, now.state);
  assert.equal(r.after[1], null, "an invalid call answers nothing");
  // A move that changes nothing: the others' total is the stored want.
  const same = (await whatIf([none])).after[0];
  if (same && same.state === now.state) assert.ok(Math.abs(same.want - now.value.want) < 1e-9, "at the current state it is the stored want");
  const adaRule = await ada!.query("v2/play:myRule", { gameId });
  for (const secret of [adaRule.ruleKey, adaRule.card, adaRule.family]) assert.ok(!JSON.stringify(r).includes(secret));
  assert.equal((await perform(bo!, "object.whatIf", { objectId, calls: Array(5).fill(shift) }, { gameId })).ok, false, "at most 4");
  // Objects are unique: once another object holds the candidate's state, the candidate says which.
  const other = await bo!.query("v2/play:object", { objectId: objects[1]! });
  await admin.mutation("v2/testing:setObjectState", { gameId, number: other.number, state: r.after[0].state });
  const again = await whatIf([shift]);
  assert.equal(again.after[0].taken, other.number);
  await admin.mutation("v2/testing:setObjectState", { gameId, number: other.number, state: other.state });
});


test("one object's moves are the caller's own act-log rows for it, newest first, with bits and the others' total", async () => {
  const all = await bo!.query("v2/playState:moves", { gameId, paginationOpts: page });
  const first = all.page[0];
  if (!first) return;
  const rows = await bo!.query("v2/playState:objectMoves", { gameId, number: first.number });
  assert.deepEqual(rows.map((r: { seq: number }) => r.seq), all.page.filter((m: { number: number }) => m.number === first.number).map((m: { seq: number }) => m.seq));
  assert.deepEqual(Object.keys(rows[0].after).sort(), ["points", "rarityBits", "want"], "the caller's bits and the others' total, nothing per player");
  assert.deepEqual(await bo!.query("v2/playState:objectMoves", { gameId, number: 9999 }), []);
});

test("live, another player's move on an object is unattributed; only the player's own moves carry a name", async () => {
  const live = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId], objects: 4, contested: 1 });
  const rows = await ada!.query("v2/playState:objectMoves", { gameId: live.gameId, number: 1 });
  assert.ok(rows.some((r: { mine: boolean }) => !r.mine), "the seed's other player moved it");
  for (const r of rows) if (!r.mine) assert.equal(r.by, null, `seq ${r.seq}: ${JSON.stringify(r.by)}`);
  assert.ok(!JSON.stringify(rows).includes("Disc Bo"), "Bo is not named");
});

test("live, a What if quote of the others' total is the player's own blurred reading (decision 32, call 33): a fresh draw per quote, independent of another player's, exact and free after the end", async () => {
  const g = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId], objects: 4, noise: true });
  const objectId = g.objects[0]!;
  const shift = { mutator: "si.shift", site: 0, args: { k: "1" } }, none = { mutator: "si.shift", site: 0, args: { k: "0" } };
  const read = async (who: typeof ada) => {
    const now = await who!.query("v2/play:object", { objectId });
    const quote = async (calls: unknown[]) => (await perform(who!, "object.whatIf", { objectId, calls }, { gameId: g.gameId })).result;
    const live = await quote([shift, none]);
    void now;
    const again = await quote([shift]);
    assert.notEqual(again.after[0].want, live.after[0].want, "a fresh draw per quote: asking again is a new (paid) reading");
    return live.after[0].want as number;
  };
  const [liveA, liveB] = [await read(ada), await read(bo)];
  assert.equal(await errorCode(ada!.query("v2/play:othersAt", { objectId, calls: [shift] })), "BAD_REQUEST", "no exact others' totals while live");
  await admin.mutation("v2/testing:markEnded", { gameId: g.gameId });
  const exactA = (await ada!.query("v2/play:othersAt", { objectId, calls: [shift] })).after[0].want;
  const exactB = (await bo!.query("v2/play:othersAt", { objectId, calls: [shift] })).after[0].want;
  const [noiseA, noiseB] = [liveA - exactA, liveB - exactB];
  assert.ok(Math.abs(noiseA) > 1e-6 && Math.abs(noiseB) > 1e-6, `both readings carry noise: ${noiseA}, ${noiseB}`);
  assert.ok(Math.abs(noiseA - noiseB) > 1e-6, `independent across players, never shared: ${noiseA} vs ${noiseB}`);
});
