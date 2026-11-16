import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, gridPresets, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "ladder-of-numbers")!;
const terms = (s: GridState, direction: "down" | "up" = "down") =>
  Object.fromEntries(evaluateSite(gridType, fam, { direction }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Ladder of Numbers: the longest climb of rows that beat the row before, then the rises (v1's pair)", () => {
  assert.deepEqual(terms(board("0001", "0002", "0003", "0004")), { ladder: 3, rises: 3 });
  assert.deepEqual(terms(board("0001", "0002", "0003", "0004"), "up"), { ladder: 0, rises: 0 });
  // 1200 < 1300 > 0999 < 1000: climbs of 1 and 1; two rises.
  assert.deepEqual(terms(board("1200", "1300", "0999", "1000")), { ladder: 1, rises: 2 });
  // Equal rows do not beat each other.
  assert.deepEqual(terms(board("5000", "5000", "5001", "6000")), { ladder: 2, rises: 2 });
  assert.deepEqual(terms(board("9000", "8000", "8000", "1000"), "up"), { ladder: 1, rises: 2 });
  assert.deepEqual(terms(board("9000", "8000", "2000", "1000"), "up"), { ladder: 3, rises: 3 });
});

test("Ladder of Numbers: v1's two directions, its card, and undealt (weak: four levels, solved by one sort)", () => {
  assert.deepEqual(fam.dealable(grid4), [{ direction: "down" }, { direction: "up" }]);
  assert.equal(fam.card({ direction: "up" }, "rises"),
    "Read each row as one 4-digit number. Going up the page, make the longest unbroken climb of rows that each beat the row before: count the rows on it (the row it starts from doesn't count). Secondary: As many rows as possible should beat the row before them, going up the page.");
  assert.ok(gridPresets.every(p => p.rules.every(r => r.family !== "ladder-of-numbers")));
});
