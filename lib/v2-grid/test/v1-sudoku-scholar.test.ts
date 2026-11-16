import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, gridPresets, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "sudoku-scholar")!;
const terms = (s: GridState) =>
  Object.fromEntries(evaluateSite(gridType, fam, {}, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Sudoku Scholar: rows, columns and long diagonals with no number twice; then the different numbers in rows and columns", () => {
  // v1's exemplar: every row, column and long diagonal holds 0–3 once.
  assert.deepEqual(terms(board("0123", "2301", "3210", "1032")), { sudoku: 10, variety: 32 });
  assert.deepEqual(terms(board("0000", "0000", "0000", "0000")), { sudoku: 0, variety: 8 });
  // The four rows and both diagonals (0 1 2 3 and 3 2 1 0) are clean; each column holds one number four times.
  assert.deepEqual(terms(board("0123", "0123", "0123", "0123")), { sudoku: 6, variety: 20 });
  // A repeat in row 0 spoils row 0 only: 3 rows, 4 columns and both diagonals; row 0 holds three different numbers.
  assert.deepEqual(terms(board("5523", "2301", "3210", "1032")), { sudoku: 9, variety: 31 });
});

test("Sudoku Scholar: one instance, its card; undealt (its top is v1's own example)", () => {
  assert.ok(gridPresets.every(p => p.rules.every(r => r.family !== "sudoku-scholar")));
  assert.deepEqual(fam.dealable(grid4), [{}]);
  assert.equal(fam.card({}, "variety"),
    "No number should appear twice in a row, a column or a long diagonal. Count the rows, columns and long diagonals where no number appears twice. Secondary: In every row and column, count the different numbers (a repeat counts once), and add them up: as many as possible.");
});
