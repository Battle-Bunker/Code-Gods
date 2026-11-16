import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "snap")!;
const terms = (s: GridState) => Object.fromEntries(evaluateSite(gridType, fam, {}, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Snap!: v1's touching pairs of equal numbers, across and down", () => {
  assert.deepEqual(fam.dealable(grid4), [{}]);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["snap-values", "snap-kinds", "snap-reach"]);
  assert.equal(terms(board("5555", "5555", "5555", "5555")).snaps, 24, "every touching pair");
  assert.equal(terms(board("0101", "1010", "0101", "1010")).snaps, 0, "a chequerboard has none");
  // 66 across row 0, 6 above 6 in column 0, 9 above 9 and 2 above 2 in column 3, 22 across row 3.
  const t = terms(board("6619", "6309", "1472", "0822"));
  assert.deepEqual(t, { snaps: 5, "snap-values": 6 + 6 + 9 + 2 + 2, "snap-kinds": 3, "snap-reach": 4 + 4 });
  // Without the 22 across row 3: the snapped cells are in all four rows but only columns 0, 1 and 3.
  assert.deepEqual(terms(board("6619", "6309", "1472", "0832"))["snap-reach"], 4 + 3);
});

test("Snap!: the card says v1's words and each tie-breaker", () => {
  assert.equal(fam.card({}, null),
    "Put cells holding the same number side by side and shout Snap! for each pair: every two touching cells (across or down) holding the same number count 1. More is better.");
  assert.match(fam.card({}, "snap-kinds"), /Secondary: As many different numbers as possible should make a snap\.$/);
});
