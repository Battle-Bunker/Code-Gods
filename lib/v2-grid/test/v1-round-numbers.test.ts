import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, nearestRound, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "round-numbers")!;
const terms = (s: GridState, params: unknown) =>
  Object.fromEntries(evaluateSite(gridType, fam, params, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Round Numbers (v1 round_numbers): rows or columns, three tie-breakers on the nearest round numbers", () => {
  assert.deepEqual(fam.dealable(grid4), [{ axis: "rows" }, { axis: "columns" }]);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["exact-rounds", "big-rounds", "round-steps"]);
  assert.deepEqual([0, 4, 5, 14, 15, 36].map(nearestRound), [0, 0, 10, 10, 20, 40]);
});

test("Round Numbers: each row's distance from the nearest multiple of 10, added up", () => {
  // Rows total 10, 17 (3 off 20), 25 (5 off 30), 0.
  const s = board("1234", "9800", "9970", "0000");
  assert.deepEqual(terms(s, { axis: "rows" }), { "round-numbers": 8, "exact-rounds": 2, "big-rounds": 60, "round-steps": 2 });
  // Columns total 19 (1 off 20), 19 (1 off 20), 10, 4 (4 off 0): 20 → 20 → 10 → 0 has two steps of 10.
  assert.deepEqual(terms(s, { axis: "columns" }), { "round-numbers": 6, "exact-rounds": 1, "big-rounds": 50, "round-steps": 2 });
});

test("Round Numbers: the card says the scoring, row or column", () => {
  assert.match(fam.card({ axis: "rows" }, null), /^Every row should add up to a round number: a multiple of 10.*17 is 3 off, 25 is 5 off/);
  assert.match(fam.card({ axis: "columns" }, "round-steps"), /Secondary: As many neighbouring columns as possible should be nearest to round numbers exactly 10 apart, like 10 and 20\.$/);
  assert.match(fam.card({ axis: "rows" }, "big-rounds"), /a total ending in 5 is nearest the round number above it/);
});
