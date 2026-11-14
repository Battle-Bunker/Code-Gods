/** The grid's exact values (docs/engine-v2/grids.md §5) against brute force over every board of the 2×2 test variant. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, levelOf, objectLadder, tieBreakersOn } from "@workspace/v2-core";
import { gridType, gridType2, grid2, grid4 } from "@workspace/v2-grid";
import { exactGridLadder } from "../src/exact-grid.ts";
import { calibrate } from "../src/artefact.ts";

test("on the 2×2 board every family × tie-breaker matches the sum over all 81 boards", () => {
  for (const f of gridType2.families) for (const params of f.dealable(grid2)) for (const tb of tieBreakersOn(f, grid2)) {
    const ladder = objectLadder(gridType2, f, params, grid2, tb.id);
    const mass = new Array<number>(ladder.length).fill(0);
    for (let i = 0; i < 81; i++) {
      const cells = [0, 1, 2, 3].map(k => Math.floor(i / 3 ** k) % 3);
      const s = { cells };
      mass[levelOf(evaluateObject(gridType2, f, params, s, grid2, tb.id).score, ladder)]! += 2 ** -gridType2.readLength(s, grid2);
    }
    const ex = exactGridLadder(gridType2, f, params, grid2, tb.id);
    let acc = 0;
    for (let k = ladder.length - 1; k >= 1; k--) {
      acc += mass[k]!;
      const want = -Math.log2(acc);
      const got = ex.lo[k]!;
      assert.ok(want === got || Math.abs(want - got) < 1e-9, `${f.id}+${tb.id} rung ${k}: ${got} against ${want}`);
      assert.equal(ex.lo[k], ex.hi[k]);
    }
  }
});

test("a family whose layers do not add up over its declared units is refused", () => {
  const f = gridType.families.find(x => x.id === "row-totals")!;
  const broken = { ...f, id: "box-totals" };   // row totals do not add up over the corner boxes
  assert.throws(() => exactGridLadder(gridType, broken as never, { T: 12 }, grid4, "primes"), /not additive/);
});

test("every beginner grid rule is exact to the top, with no simulation", () => {
  for (const f of gridType.families) for (const params of f.dealable(grid4)) for (const tb of tieBreakersOn(f, grid4)) {
    const { artefact: a, estimate } = calibrate(gridType, grid4, f, params, { tieBreaker: tb.id });
    assert.equal(estimate, null, `${f.id}+${tb.id} simulated`);
    assert.equal(a.status, "exact", `${f.id}+${tb.id}: ${a.reasons.join("; ")}`);
    assert.ok(a.rungs.every(r => r.source === "exact" || r.layer === -1));
  }
});
