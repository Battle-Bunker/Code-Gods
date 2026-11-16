import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = () => gridType.families.find(f => f.id === "pinwheel")!;
const terms = (s: GridState) =>
  Object.fromEntries(evaluateSite(gridType, fam(), {}, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Pinwheel is registered with no parameters and v1's secondary as its tie-breaker", () => {
  assert.deepEqual(fam().dealable(grid4), [{}]);
  assert.deepEqual(fam().tieBreakers.map(t => t.id), ["commonest"]);
});

test("Pinwheel counts the sets of 4 a quarter turn moves round that all hold one number; the tie-breaker each set's commonest", () => {
  // The four sets: the corners (0, 3, 15, 12), (1, 7, 14, 8), (2, 11, 13, 4) and the middle (5, 6, 10, 9).
  assert.deepEqual(terms(board("1221", "2332", "2332", "1221")), { pinwheel: 4, commonest: 16 });
  // Corners 7 7 7 7 (full); (1, 7, 14, 8) = 1 2 2 1 (two 1s, two 2s: 2); (2, 11, 13, 4) = 3 4 3 4 (2); middle 5 6 5 6 (2).
  assert.deepEqual(terms(board("7137", "4562", "1654", "7327")), { pinwheel: 1, commonest: 4 + 2 + 2 + 2 });
  // Every set holds four different numbers: no full set, and 1 for each set's commonest.
  assert.deepEqual(terms(board("0123", "4567", "8901", "2345")).pinwheel, 0);
  // Three of a kind in a set is a near miss: 3 toward the tie-breaker.
  assert.deepEqual(terms(board("5000", "0000", "0000", "0000")), { pinwheel: 3, commonest: 3 + 4 + 4 + 4 });
});

test("Pinwheel card: v1's words", () => {
  assert.match(fam().card({}, null), /quarter turn/);
  assert.match(fam().card({}, null), /sets of 4/);
  assert.match(fam().card({}, "commonest"), /Secondary: .*commonest number/);
});
