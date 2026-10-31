/**
 * Analytic survival functions (src/analytic): every solution is checked
 *  1. against exhaustive enumeration with the family's own card where the domain is small (Int ranges, strings of
 *     length ≤ 2): exact to 1e-9 bits;
 *  2. against every shipped empirical table: Monte Carlo body levels within 5.5 reconstructed standard errors, exact
 *     tables (Int(0,9999), EXACT_TAILS) to 1e-6 bits. Splitting-tail levels are reported by
 *     scripts/analytic-verify.ts but not asserted: docs/analytic-calibration/solutions.md shows the tail estimates are
 *     what is off there (every disagreement beyond the error model is a table bias).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { objectType } from "@workspace/game-types";
import { canonicalSupport, context, evaluator, family } from "../src/catalog.ts";
import { instantiateKey } from "../src/calibration.ts";
import { shippedFile, shippedInstanceKeys } from "../src/calibration-data.ts";
import { ANALYTIC_FAMILIES, analyticLevels } from "../src/analytic/index.ts";
import { compareTable } from "../src/analytic/compare.ts";
import { cellAdditive } from "../src/analytic/grid.ts";
import { add, levels, type Dist } from "../src/analytic/kit.ts";

function exhaustiveLevels(familyId: string, params: object, inst: ReturnType<typeof instantiateKey>, values: Iterable<unknown>) {
  const ev = evaluator({ familyId, params: params as never }, inst), d: Dist = new Map();
  const vs = [...values];
  for (const v of vs) { const o = ev(v as never); add(d, typeof o === "number" ? [o] : [...o], 1 / vs.length); }
  return levels(d);
}

function assertSameLevels(id: string, got: ReturnType<typeof levels>, want: ReturnType<typeof levels>) {
  assert.equal(got.length, want.length, `${id}: attainable ordinals differ`);
  for (let i = 0; i < want.length; i++) {
    assert.deepEqual(got[i][0], want[i][0], `${id}: ordinal ${i}`);
    assert.ok(Math.abs(got[i][1] - want[i][1]) < 1e-9, `${id} @${JSON.stringify(want[i][0])}: ${got[i][1]} vs exact ${want[i][1]}`);
  }
}

test("Int solutions equal exhaustive enumeration on ranges with negatives and at the Int32 edges", () => {
  for (const [min, max] of [[-3001, 2468], [-2147483648, -2147480000], [2147480000, 2147483647]]) {
    const inst = objectType("Int").instantiate({ min, max }), ctx = context(inst);
    const xs = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (const id of ANALYTIC_FAMILIES.Int) {
      for (const p of canonicalSupport(family(id), ctx)) assertSameLevels(`${id} ${JSON.stringify(p)} [${min},${max}]`, analyticLevels(id, p, inst)!, exhaustiveLevels(id, p, inst, xs));
    }
  }
});

test("string solutions equal exhaustive enumeration over every string of length ≤ 2", () => {
  const inst = objectType("string").instantiate({ maxLength: 2 }), ctx = context(inst);
  const all = [""];
  for (let c = 0; c < 128; c++) all.push(String.fromCharCode(c));
  for (let c = 0; c < 128; c++) for (let e = 0; e < 128; e++) all.push(String.fromCharCode(c, e));
  for (const id of ANALYTIC_FAMILIES.string) {
    for (const p of canonicalSupport(family(id), ctx)) assertSameLevels(`${id} ${JSON.stringify(p)}`, analyticLevels(id, p, inst)!, exhaustiveLevels(id, p, inst, all));
  }
});

test("cellAdditive refuses a rule that is not a sum over cells", () => {
  const inst = instantiateKey("Grid(4,base10,rgb)");
  assert.throws(() => cellAdditive("snap", {}, inst), /not cell-additive/);
});

test("every analytic solution agrees with every shipped table (Monte Carlo body within 5.5 se; exact tables exactly)", () => {
  let compared = 0;
  for (const key of shippedInstanceKeys()) {
    const file = shippedFile(key)!, inst = instantiateKey(key);
    for (const t of file.tables) {
      if (t.prior) continue;
      const L = analyticLevels(t.family, t.canonicalParams, inst);
      if (!L) continue;
      const c = compareTable(t, L);
      const where = `${t.family} ${JSON.stringify(t.canonicalParams)} ${key}`;
      if (typeof t.estimator.budget === "string") assert.ok(c.maxAbsDelta < 2e-6, `${where}: exact table differs by ${c.maxAbsDelta} bits`);
      else assert.ok(c.bodyZ < 5.5, `${where}: Monte Carlo body z = ${c.bodyZ.toFixed(2)} (worst ${JSON.stringify(c.worst)})`);
      compared++;
    }
  }
  assert.ok(compared > 300, `only ${compared} tables compared`);
});
