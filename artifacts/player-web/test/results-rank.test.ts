/** The results panel's ranks: equal totals share a rank (game-core rankTotals), and the headline says "tied for". */
import assert from "node:assert/strict";
import { test } from "node:test";
import { finishPlace, liveResultRows } from "../src/core/panels/results-rank.ts";

const board = [
  { godId: "a", label: "Alice", isAI: false, totalPayoff: 9.3 },
  { godId: "c", label: "Carol", isAI: false, totalPayoff: 9.3 },
  { godId: "b", label: "Bob", isAI: true, totalPayoff: 0 },
];

test("equal totals share a rank; the next distinct total keeps its place", () => {
  assert.deepEqual(liveResultRows(board).map(r => [r.id, r.rank]), [["a", 1], ["c", 1], ["b", 3]]);
});

test("the headline says tied for a shared place, plain otherwise", () => {
  const rows = liveResultRows(board);
  assert.equal(finishPlace(rows, rows[1]), "tied for 1st");
  assert.equal(finishPlace(rows, rows[2]), "3rd");
});
