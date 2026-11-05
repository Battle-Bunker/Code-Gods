import { test } from "node:test";
import assert from "node:assert/strict";
import { OBJECT_SORTS, OBJECT_SORT_LABELS, mutationLine, pageObjects, type ObjectSort, type PageRow } from "../src/objects-page.ts";

const row = (id: string, own: number, care: number): PageRow => ({ id, own: { netBits: own }, peerNetBits: care, peerCare: Math.max(0, care), payoff: care <= 0 ? 0 : own * care });
const world = [row("a", 2, 3), row("b", 3, 2), row("c", -1, 5), row("d", 6, 0), row("e", 0, 6), row("f", 1, 1)];
const ids = (rows: { id: string }[]) => rows.map(r => r.id);

test("each sort orders by its key descending, ties by id ascending", () => {
  assert.deepEqual(ids(pageObjects(world, { sort: "payoff", limit: 10 }).rows), ["a", "b", "f", "d", "e", "c"]);
  assert.deepEqual(ids(pageObjects(world, { sort: "mine", limit: 10 }).rows), ["d", "b", "a", "f", "e", "c"]);
  assert.deepEqual(ids(pageObjects(world, { sort: "othersCare", limit: 10 }).rows), ["e", "c", "a", "b", "f", "d"]);
});

for (const sort of ["payoff", "mine", "othersCare"] as ObjectSort[]) {
  test(`${sort}: following the cursor visits every object once, in order`, () => {
    const seen: string[] = [];
    let after = null as ReturnType<typeof pageObjects>["next"];
    for (let guard = 0; guard < 10; guard++) {
      const page = pageObjects(world, { sort, limit: 4, after });
      seen.push(...ids(page.rows));
      if (!page.next) break;
      after = page.next;
    }
    assert.deepEqual(seen, ids(pageObjects(world, { sort, limit: 10 }).rows));
  });
}

test("a cursor stays valid when values move: the next page starts after its position, nothing repeats", () => {
  const first = pageObjects(world, { sort: "payoff", limit: 2 });
  assert.deepEqual(ids(first.rows), ["a", "b"]);
  const moved = world.map(o => (o.id === "e" ? row("e", 4, 4) : o));   // e jumps from the tail to payoff 16
  const second = pageObjects(moved, { sort: "payoff", limit: 2, after: first.next });
  assert.deepEqual(ids(second.rows), ["f", "d"], "e now outranks the cursor, so it is above this page, not repeated in it");
});

test("the filter and totals: matching counts the filter, the footer sums cover every object", () => {
  const page = pageObjects(world, { filter: "chips", limit: 10 });
  assert.deepEqual(ids(page.rows), ["e", "c"]);
  assert.equal(page.matching, 2);
  assert.equal(page.total, 6);
  assert.equal(page.sumOwnNetBits, 11);
  assert.equal(page.sumPeerNetBits, 17);
});

test("rank is the payoff rank among all objects whatever the sort or filter", () => {
  const page = pageObjects(world, { sort: "mine", limit: 3 });
  assert.deepEqual(page.rows.map(r => [r.id, r.rank]), [["d", 4], ["b", 2], ["a", 1]]);
});

test("the limit is clamped and an empty world pages to nothing", () => {
  assert.equal(pageObjects(world, { limit: 0 }).rows.length, 1);
  assert.deepEqual(pageObjects([], {}), { rows: [], next: null, matching: 0, total: 0, sumOwnNetBits: 0, sumPeerNetBits: 0 });
});

const times = (id: string, mutations: number, createdAt: number, lastMutatedAt: number | null): PageRow => ({ ...row(id, 1, 1), id, mutations, createdAt, lastMutatedAt });
const aged = [times("a", 3, 10, 50), times("b", 0, 20, null), times("c", 7, 5, 30), times("d", 3, 40, 90), times("e", 0, 20, null)];

test("the public sorts: most mutated, newest, oldest, recently mutated (never mutated last), ties by id", () => {
  assert.deepEqual(ids(pageObjects(aged, { sort: "mutations", limit: 10 }).rows), ["c", "a", "d", "b", "e"]);
  assert.deepEqual(ids(pageObjects(aged, { sort: "newest", limit: 10 }).rows), ["d", "b", "e", "a", "c"]);
  assert.deepEqual(ids(pageObjects(aged, { sort: "oldest", limit: 10 }).rows), ["c", "a", "b", "e", "d"]);
  assert.deepEqual(ids(pageObjects(aged, { sort: "recentlyMutated", limit: 10 }).rows), ["d", "a", "c", "b", "e"]);
});

test("the public sorts page by cursor without skipping or repeating, even across ties", () => {
  for (const sort of ["mutations", "newest", "oldest", "recentlyMutated"] as const) {
    const seen: string[] = [];
    let after = null as ReturnType<typeof pageObjects>["next"];
    do { const page = pageObjects(aged, { sort, limit: 2, after }); seen.push(...ids(page.rows)); after = page.next; } while (after);
    assert.deepEqual(seen, ids(pageObjects(aged, { sort, limit: 10 }).rows), sort);
  }
});

test("every sort has a label, and the line states the public figures", () => {
  assert.deepEqual(Object.keys(OBJECT_SORT_LABELS), [...OBJECT_SORTS]);
  assert.equal(mutationLine(times("a", 12, 100, 218), 260), "12 mutations · last 0:42 ago · spawned 2:40 ago");
  assert.equal(mutationLine(times("a", 1, 0, 5), 65), "1 mutation · last 1:00 ago · spawned 1:05 ago");
  assert.equal(mutationLine(times("a", 0, 30, null), 65), "0 mutations · spawned 0:35 ago");
});
