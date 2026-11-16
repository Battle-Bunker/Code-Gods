import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "column-addition")!;
const terms = (s: GridState, top: number) =>
  Object.fromEntries(evaluateSite(gridType, fam, { top }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Column Addition (v1 column_addition): the sum starts on row 1 or row 2, three tie-breakers", () => {
  assert.deepEqual(fam.dealable(grid4), [{ top: 0 }, { top: 1 }]);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["right-columns", "near-digits", "big-answer"]);
});

test("Column Addition: the run of right columns from the right-hand end, with carries", () => {
  // 1234 + 5678 = 6912: every column right (8 + 4 = 12 carries 1, 7 + 3 + 1 = 11 carries 1, 6 + 2 + 1 = 9).
  assert.deepEqual(terms(board("1234", "5678", "6912", "0000"), 0), { "column-addition": 4, "right-columns": 4, "near-digits": 0, "big-answer": 18 });
  // Answer 6013: the units (2 → 3) are wrong, so the run is 0; the tens 1 and thousands 6 are right; 9 → 0 is 9 off.
  assert.deepEqual(terms(board("1234", "5678", "6013", "0000"), 0), { "column-addition": 0, "right-columns": 2, "near-digits": 1 + 9, "big-answer": 10 });
  // 0999 + 0001 = 1000: the carry ripples to the left.
  assert.deepEqual(terms(board("0999", "0001", "1000", "5555"), 0), { "column-addition": 4, "right-columns": 4, "near-digits": 0, "big-answer": 1 });
  // The sum one row down: rows 2, 3 and 4.
  assert.deepEqual(terms(board("9999", "0012", "0034", "0046"), 1), { "column-addition": 4, "right-columns": 4, "near-digits": 0, "big-answer": 10 });
});

test("Column Addition: a top row of 0s scores nothing", () => {
  assert.deepEqual(terms(board("0000", "1234", "1234", "0000"), 0), { "column-addition": 0, "right-columns": 0, "near-digits": 36, "big-answer": 0 });
});

test("Column Addition: the card names the rows of the dealt sum", () => {
  assert.match(fam.card({ top: 0 }, null), /^Rows 1 and 2 \(counting from the top\) are added like a written sum, and row 3 should be the answer\./);
  assert.match(fam.card({ top: 1 }, "near-digits"), /^Rows 2 and 3 .*Secondary: Each digit in row 4 should be as close as possible to the right digit/);
});
