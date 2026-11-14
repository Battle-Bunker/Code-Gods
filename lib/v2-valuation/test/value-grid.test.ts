/**
 * Grid value functions (owner decision 23): a board's bits are −log2 π{boards whose utilities are at least its own}.
 * Checked against brute force over every board of the 2×2 test variant, for every family: exact (convolution) to the
 * last digit; sampled (Spread of Three: plain draws, binomial ±2σ intervals) inside its interval for at least 90% of the
 * boards, and never off by more than 1.5 of its half-widths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareScores, evaluateObject, tieBreakersOn, type Score } from "@workspace/v2-core";
import { gridSums, gridType2, grid2 } from "@workspace/v2-grid";
import { gridValueFunction } from "../src/value-grid.ts";
import { valueLookup } from "../src/value.ts";

const boards = Array.from({ length: 81 }, (_, i) => ({ cells: [0, 1, 2, 3].map(k => Math.floor(i / 3 ** k) % 3) }));

for (const f of gridType2.families) {
  const tb = tieBreakersOn(f, grid2)[0]!.id;
  test(`${f.id} + ${tb} on the 2×2 board: every board's value is its exact survival (knots kept to 4 decimals)`, () => {
    const params = f.dealable(grid2)[0];
    const u = (s: { cells: number[] }): Score => evaluateObject(gridType2, f, params, s, grid2, tb).score;
    const mass = boards.map(s => ({ u: u(s), w: 2 ** -gridType2.readLength(s, grid2) }));
    const vf = gridValueFunction(gridType2, f, params, grid2, { tieBreaker: tb, draws: 40_000 });
    const look = valueLookup(vf);
    let misses = 0;
    for (const s of boards) {
      const want = -Math.log2(mass.filter(m => compareScores(m.u, u(s)) >= 0).reduce((a, m) => a + m.w, 0));
      const got = look(u(s));
      if (gridSums[f.id]) assert.ok(Math.abs(got.bits - want) <= 1e-4, `${gridType2.encode(s)}: ${got.bits} against ${want}`);
      else {
        const half = (got.hi - got.lo) / 2, mid = (got.hi + got.lo) / 2;
        if (!(got.lo - 1e-4 <= want && want <= got.hi + 1e-4)) misses++;
        assert.ok(Math.abs(want - mid) <= 1.5 * half + 1e-4, `${gridType2.encode(s)}: [${got.lo}, ${got.hi}] against ${want}`);
      }
    }
    assert.ok(misses <= 0.1 * boards.length, `${misses} of ${boards.length} boards outside their ±2σ interval`);
  });
}
