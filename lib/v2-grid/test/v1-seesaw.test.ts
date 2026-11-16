import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, grid4, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "seesaw")!;
const terms = (s: GridState, axis = "rows") =>
  Object.fromEntries(evaluateSite(gridType, fam, { axis }, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Seesaw: each row's left half against its right half; v1's wobble is the main part", () => {
  assert.deepEqual(fam.dealable(grid4), [{ axis: "rows" }, { axis: "columns" }]);
  assert.equal(fam.main.sense, "min");
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["other-way", "heavy-seesaws", "ends-and-middle"]);
  // Rows: 18|36 balances (9 = 9); 90|45 balances; 20|01 off by 1; 99|00 off by 18.
  const s = board("1836", "9045", "2001", "9900");
  const t = terms(s);
  assert.equal(t.seesaw, 0 + 0 + 1 + 18);
  // Columns 1922 / 8090 / 3400 / 6510: top 1+9 vs 2+9 (1), 8+0 vs 0+9 (1), 3+4 vs 0+0 (7), 6+5 vs 1+0 (10).
  assert.equal(t["other-way"], 1 + 1 + 7 + 10);
  assert.equal(t["heavy-seesaws"], 18 + 18, "the two balanced rows weigh 18 each");
  // Ends against middle: 1+6 vs 8+3 (4), 9+5 vs 0+4 (10), 2+1 vs 0+0 (3), 9+0 vs 9+0 (0).
  assert.equal(t["ends-and-middle"], 4 + 10 + 3 + 0);
  // Read by columns, the same board: the main part is the rows' other way and back.
  const c = terms(s, "columns");
  assert.deepEqual([c.seesaw, c["other-way"]], [t["other-way"], t.seesaw]);
});

test("Seesaw: the card says which halves, and each tie-breaker", () => {
  assert.match(fam.card({ axis: "rows" }, null), /^Make every row balance like a seesaw: its two sides are its left half and right half\./);
  assert.match(fam.card({ axis: "columns" }, "other-way"), /top half and bottom half.*Secondary: The rows should balance too \(their left and right halves\)/);
});
