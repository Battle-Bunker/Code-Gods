/**
 * Owner decision 19: every price list is an exact potential (a move and its inverse proposed with equal weight), so the
 * walk's law is π ∝ 2^−φ, a product over cells. A hard gate, as on the line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleDiagnostic } from "@workspace/v2-core";
import { gridType, gridType2, type GridState } from "../src/index.ts";

for (const [type, v] of [[gridType, gridType.variants[0]!], [gridType2, gridType2.variants[0]!]] as const) {
  test(`${v.id}: every proposal has a reverse of the same weight (no one-way move, no asymmetric pair, no loop)`, () => {
    const n = (v.params as { size: number }).size, cap = (v.params as { cap: number }).cap;
    const states: GridState[] = Array.from({ length: 10 }, (_, i) => ({ cells: Array.from({ length: n * n }, (_, k) => (i * 7 + k * k * 3 + k) % (cap + 1) * (k % (i + 2) === 0 ? 0 : 1)) }));
    const r = cycleDiagnostic(type, v, states, 16, 3);
    assert.deepEqual(r.oneWay, {}, "one-way moves");
    for (const [id, s] of Object.entries(r.perMutator)) assert.equal(s.asymmetric, 0, `${id}: ${s.asymmetric} asymmetric pairs, worst ${s.worst} bits`);
    assert.ok(r.worstEdge < 1e-9 && r.worstCycle < 1e-9, `edge ${r.worstEdge}, loop ${r.worstCycle}`);
    assert.ok(r.edges > 100, "the diagnostic saw moves");
    assert.equal(Object.keys(r.perMutator).length, v.mutators.length, "every mutator proposed something");
  });
}
