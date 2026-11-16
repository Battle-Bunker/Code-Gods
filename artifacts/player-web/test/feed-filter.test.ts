import { test } from "node:test";
import assert from "node:assert/strict";
import { filterMoves, mutatorYield, impactOf, type FilterMove } from "../src/panes/feed-filter.ts";

const snap = (points: number) => ({ points });
const mv = (seq: number, o: Partial<FilterMove> = {}): FilterMove => ({
  seq, number: 1, mine: true, charge: 10, before: snap(0), after: snap(5), calls: [{ mutator: "cart.shift" }], ...o,
});

test("impact is the size of the points change, either way", () => {
  assert.equal(impactOf(mv(1, { before: snap(9), after: snap(2) })), 7);
});

test("filters by who moved, by object and by minimum impact", () => {
  const ms = [mv(1), mv(2, { mine: false, number: 2 }), mv(3, { number: 2, after: snap(0.5) })];
  assert.deepEqual(filterMoves(ms, { who: "mine" }).map(m => m.seq), [1, 3]);
  assert.deepEqual(filterMoves(ms, { who: "others" }).map(m => m.seq), [2]);
  assert.deepEqual(filterMoves(ms, { number: 2 }).map(m => m.seq), [2, 3]);
  assert.deepEqual(filterMoves(ms, { minImpact: 1 }).map(m => m.seq), [1, 2]);
  assert.equal(filterMoves(ms, {}).length, 3);
});

test("groups your own moves by mutator: energy spent against points gained, best yield first", () => {
  const ms = [
    mv(1, { calls: [{ mutator: "cart.shift" }], charge: 10, before: snap(0), after: snap(5) }),
    mv(2, { calls: [{ mutator: "cart.shift" }], charge: 10, before: snap(5), after: snap(3) }),
    mv(3, { calls: [{ mutator: "cart.pivot" }], charge: 4, before: snap(0), after: snap(8) }),
    mv(4, { mine: false, calls: [], charge: null }),
    mv(5, { calls: [{ mutator: "cart.pivot" }, { mutator: "cart.shift" }], charge: 6, before: snap(1), after: snap(1) }),
  ];
  assert.deepEqual(mutatorYield(ms), [
    { mutator: "cart.pivot", moves: 1, spent: 4, gained: 8 },
    { mutator: "cart.shift", moves: 2, spent: 20, gained: 3 },
    { mutator: "cart.pivot, then cart.shift", moves: 1, spent: 6, gained: 0 },
  ]);
});
