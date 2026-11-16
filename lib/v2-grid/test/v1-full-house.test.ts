import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "full-house")!;
const terms = (s: GridState, axis = "rows") =>
  Object.fromEntries(evaluateSite(gridType, fam, { axis }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Full House: v1's pairs per row (three of a kind 3, four of a kind 6), rows or columns", () => {
  assert.deepEqual(fam.dealable(grid4), [{ axis: "rows" }, { axis: "columns" }]);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["pair-values", "pair-kinds", "pairs-apart"]);
  // Rows: 7777 four of a kind (6); 3313 three of a kind (3); 2525 two pair (2); 0123 nothing.
  const s = board("7777", "3313", "2525", "0123");
  assert.deepEqual(terms(s), { pairs: 11, "pair-values": 6 * 7 + 3 * 3 + 2 + 5, "pair-kinds": 4, "pairs-apart": (1 + 2 + 3 + 1 + 2 + 1) + (1 + 3 + 2) + (2 + 2) });
  // Columns of the same board: 7320 / 7351 / 7122 / 7353: 7s in every column (no pair), column 2 has 3s twice … pairs:
  // col0 7,3,2,0: none; col1 7,3,5,1: none; col2 7,1,2,2: one (2s, 1 apart); col3 7,3,5,3: one (3s, 2 apart).
  assert.deepEqual(terms(s, "columns"), { pairs: 2, "pair-values": 2 + 3, "pair-kinds": 2, "pairs-apart": 1 + 2 });
  assert.equal(terms(board("0000", "0000", "0000", "0000")).pairs, 24, "the most a 4×4 board can hold");
});

test("Full House: the card says v1's words and each tie-breaker", () => {
  assert.equal(fam.card({ axis: "rows" }, null),
    "Make poker hands: look along each row. Every pair of cells in it holding the same number counts 1. Three of a kind makes 3 pairs, and four of a kind makes 6. More is better.");
  assert.match(fam.card({ axis: "columns" }, "pairs-apart"), /look along each column\..*Secondary: The two cells of each pair should sit as far apart in their column as possible/);
  assert.match(fam.card({ axis: "rows" }, "pair-values"), /Secondary: The pairs should be made of numbers as big as possible/);
});
