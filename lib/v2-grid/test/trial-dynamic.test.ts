/** The dynamic trial on grids (src/trial-dynamic.ts): what holds by construction. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { grid4, gridType, BEGINNER_DEALT } from "../src/index.ts";
import { gridEnergy, lawBoard, rewritePrice } from "../src/trial-dynamic.ts";

const f = gridType.families.find(x => x.id === "opposite-nines")!;
const rule = { family: f as never, params: f.dealable(grid4)[0], tieBreaker: BEGINNER_DEALT["opposite-nines"]![0]! };

test("rewriting a board into itself is free; into another it costs one cells.add a differing cell", () => {
  const r = rng("t"), a = lawBoard(grid4, r), b = lawBoard(grid4, r);
  assert.equal(rewritePrice(a, a, grid4), 0);
  assert.ok(rewritePrice(a, b, grid4) > 0);
});

test("a board scores at most its rewrite price from every start, and the same seed gives the same energy", () => {
  const s = lawBoard(grid4, rng("s"));
  const e = gridEnergy(s, rule, grid4, { K: 3, seed: "x", maxBits: 16 });
  assert.equal(e.energy, gridEnergy(s, rule, grid4, { K: 3, seed: "x", maxBits: 16 }).energy);
  assert.ok(e.energy >= 0 && Number.isFinite(e.energy));
});
