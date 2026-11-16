/**
 * The objects pane's sorts and filters (v1's, v1-audit A3; convex/v2/objectOrder.ts): payoff, your bits, others' care,
 * most mutated, newest, oldest, recently mutated; all, positive, contested, chips. Each is one index page, and while live
 * each follows the values as disclosed to the reader (the others' sum with their own reading's noise), never the exact
 * ones.
 *
 * What would break: a sort or filter missing or in the wrong direction; a filter that keeps an object the reader is shown
 * as outside it, or drops one shown inside it (in particular one built on the exact others' sum while live); the
 * affordance (assistant, CLI, palette) disagreeing with the app's skeleton.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, cy: Human;
let gameId: string, objects: string[] = [];
const all = { numItems: 100, cursor: null };

before(async () => {
  [ada, bo, cy] = await humans("Order Ada", "Order Bo", "Order Cy");
  ({ gameId, objects } = await admin.mutation("v2/testing:seedGame", {
    owner: ada.userId, humans: [bo.userId, cy.userId], objects: 21, noise: true, versions: true,
  }));
});

const ids = async (sort: string, filter?: string): Promise<string[]> =>
  (await ada.query("v2/play:objectIds", { gameId, sort, ...(filter ? { filter } : {}), paginationOpts: all })).page.map((r: any) => r.objectId as string);
const shown = async () => new Map(await Promise.all(objects.map(async (id: string) => [id, await ada.query("v2/play:object", { objectId: id })] as const)));
const descending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! >= x);

test("every sort is a full, correctly directed order over the reader's shown values", async () => {
  const o = await shown();
  const by = async (sort: string, key: (x: any) => number) => {
    const list = await ids(sort);
    assert.equal(list.length, objects.length, `${sort}: every object`);
    return list.map(id => key(o.get(id)));
  };
  assert.ok(descending(await by("points", x => x.value.points)), "payoff, highest first (as shown)");
  assert.ok(descending(await by("rarity", x => x.value.rarityBits)), "your bits, highest first");
  assert.ok(descending(await by("want", x => x.value.want)), "others' care, highest first (as shown)");
  const mutations = await by("mutations", x => x.version);
  assert.ok(descending(mutations) && mutations[0]! > mutations.at(-1)!, `most mutated first: ${mutations.join(" ")}`);
  assert.deepEqual(await by("born", x => x.number), [...Array(21).keys()].map(i => 21 - i), "newest first");
  assert.deepEqual(await by("oldest", x => x.number), [...Array(21).keys()].map(i => i + 1), "oldest first");
  assert.ok(descending(await by("recent", x => x.changedAt)), "recently mutated first");
});

test("filters keep exactly the objects the reader is shown inside them, in the sort's order", async () => {
  const o = await shown();
  const positive = objects.filter(id => o.get(id)!.value.points > 0);
  const chips = objects.filter(id => o.get(id)!.value.want > 0 && o.get(id)!.value.rarityBits <= 0);
  assert.ok(positive.length > 0 && positive.length < objects.length, `the fixture has both kinds: ${positive.length} of ${objects.length}`);
  for (const filter of ["positive", "contested"]) {
    const list = await ids("points", filter);
    assert.deepEqual(new Set(list), new Set(positive), `${filter}: own bits and others' care both positive as shown`);
    assert.ok(descending(list.map(id => o.get(id)!.value.points)));
    assert.deepEqual(new Set(await ids("oldest", filter)), new Set(positive), `${filter} with another sort: the same set`);
  }
  assert.deepEqual(new Set(await ids("rarity", "chips")), new Set(chips), "chips: they care, your bits are 0");
  assert.deepEqual(await ids("born", "all"), await ids("born"), "all is no filter");
});

test("objects.list (assistant, CLI, palette) gives the app's order for every sort and filter", async () => {
  for (const [sort, filter] of [["points", "all"], ["mutations", "all"], ["oldest", "contested"], ["want", "chips"]] as const) {
    const r = await perform(ada, "objects.list", { sort, filter, limit: 100 }, { gameId }, "query");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.result.page.map((x: any) => x.objectId), await ids(sort, filter), `${sort}/${filter}`);
  }
});
