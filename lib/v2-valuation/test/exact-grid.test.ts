/** The grid's exact joint law (docs/engine-v2/grids.md §5) against brute force over every board of the 2×2 test variant. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Qn, evaluateSite, tieBreakersOn } from "@workspace/v2-core";
import { exactlySummed, gridSums, gridType, gridType2, grid2, grid4 } from "@workspace/v2-grid";
import { gridJointLaw } from "../src/exact-grid.ts";

test("on the 2×2 board every family × tie-breaker's joint law matches the sum over all 81 boards", () => {
  for (const f of gridType2.families.filter(x => gridSums[x.id])) for (const params of f.dealable(grid2)) for (const tb of tieBreakersOn(f, grid2).filter(t => exactlySummed(f.id, t.id))) {
    const { layers, entries } = gridJointLaw(gridType2, f, params, grid2, tb.id);
    const want = new Map<string, number>();
    for (let i = 0; i < 81; i++) {
      const cells = [0, 1, 2, 3].map(k => Math.floor(i / 3 ** k) % 3);
      const e = evaluateSite(gridType2, f, params, { cells }, grid2, 0, tb.id);
      const key = layers.map(id => Qn.toWire(e.terms.find(t => t.id === id)!.value as Qn.Q)).join("|");
      want.set(key, (want.get(key) ?? 0) + 2 ** -gridType2.readLength({ cells }, grid2));
    }
    const got = new Map(entries.map(e => [e.terms.map(Qn.toWire).join("|"), e.w]));
    assert.deepEqual([...got.keys()].sort(), [...want.keys()].sort(), `${f.id}+${tb.id}`);
    for (const [k, w] of want) assert.ok(Math.abs(got.get(k)! - w) < 1e-12, `${f.id}+${tb.id} ${k}: ${got.get(k)} against ${w}`);
  }
});

test("a tie-breaker the units do not cover is refused by the exact law, and sampled by the value function", () => {
  const f = gridType.families.find(x => x.id === "magic-eighteen")!;
  assert.equal(exactlySummed("magic-eighteen", "other-way"), false);
  assert.equal(exactlySummed("magic-eighteen", "different-numbers"), true);
  assert.equal(exactlySummed("magic-eighteen", null), true);
  assert.equal(exactlySummed("spread-of-three", null), false);
  assert.throws(() => gridJointLaw(gridType, f, { axis: "rows", T: 18 }, grid4, "other-way"), /do not cover/);
});

test("a family whose layers do not add up over its declared units is refused", () => {
  const f = gridType.families.find(x => x.id === "magic-eighteen")!;
  const broken = { ...f, id: "box-totals" };   // row totals do not add up over the corner boxes
  assert.throws(() => gridJointLaw(gridType, broken as never, { axis: "rows", T: 18 }, grid4, "primes"), /not additive/);
});
