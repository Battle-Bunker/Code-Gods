/**
 * Far moves are dear (owner design, 2026-11-14): for sampled boards and multi-unit calls (|k| ≥ 2) of every grid
 * mutator that moves an amount, the single act costs at least the path of unit acts (k = ±1, each its own act) of the
 * same mutator to the same board: equal fees, and a charge W + β·W² at least the path's Σ (W_i + β·W_i²). The board's
 * energy is linear in its cells, so a unit path climbs no barrier and the charge comparison holds on every sample.
 * The other mutators (swap, rotate, spin, reverse) move no amount: their arguments are choices. A sample whose unit
 * path leaves the board (a cell past the cap or below 0 on the way) is skipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, rng, type Rng } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { gridType, grid4, gridParams, type GridState } from "../src/index.ts";
import { lines, pairs, boxes } from "../src/units.ts";

const choice = (mutator: string, r: Rng): Record<string, string> => {
  const n = 4;
  switch (mutator) {
    case "cells.add": return { cell: `r${r.below(n)}c${r.below(n)}` };
    case "tally.add": case "steps.tilt": return { line: lines(n)[r.below(2 * n)]!.name };
    case "turn.balance": return { pair: `pair${r.below(pairs(n).length)}` };
    case "boxes.add": return { box: `box${r.below(boxes(n).length)}` };
    default: throw new Error(mutator);
  }
};

const SIZED = ["cells.add", "tally.add", "turn.balance", "steps.tilt", "boxes.add"];

test("grid-4-d10: a far move costs at least the path of unit moves to the same board", () => {
  const r = rng("far-moves", grid4.id);
  const { cap } = gridParams(grid4);
  let samples = 0, skipped = 0;
  for (const mutator of SIZED) {
    let mine = 0, tries = 0;
    while (mine < 200 && tries++ < 20_000) {
      const s0: GridState = { cells: Array.from({ length: 16 }, () => r.below(cap + 1)) };
      const k = (2 + r.below(4)) * (r.bit() ? -1 : 1);
      const args = choice(mutator, r);
      const one = applyCall(gridType, grid4, s0, { mutator, site: 0, args: { ...args, k: String(k) } });
      if (isInvalid(one)) continue;
      mine++; samples++;
      let s = s0, fees = 0, charge = 0, ok = true;
      for (let i = 0; i < Math.abs(k); i++) {
        const a = applyCall(gridType, grid4, s, { mutator, site: 0, args: { ...args, k: String(Math.sign(k)) } });
        if (isInvalid(a)) { ok = false; break; }
        fees += a.price.total - a.price.surcharge;
        charge += changeCharge([a.price.total]);
        s = a.result;
      }
      if (!ok) { skipped++; continue; }
      assert.equal(gridType.encode(s), gridType.encode(one.result));
      const fee = one.price.total - one.price.surcharge;
      assert.ok(Math.abs(fee - fees) < 1e-9, `${mutator} k=${k}: fee ${fee} against the path's ${fees}`);
      assert.ok(changeCharge([one.price.total]) >= charge - 1e-9, `${mutator} k=${k} on ${gridType.encode(s0)}: ${changeCharge([one.price.total])} < ${charge}`);
    }
    assert.ok(mine >= 100, `${mutator}: only ${mine} samples`);
  }
  console.log(`grid-4-d10: ${samples} samples, ${(100 * skipped / samples).toFixed(1)}% skipped (a unit step left the board); the rest all hold`);
});
