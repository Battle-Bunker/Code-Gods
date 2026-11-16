/**
 * Owner decision 19: every price list is an exact potential. The walk is Metropolis on the read length φ, so its law is
 * π ∝ 2^−φ exactly when every proposal s → t has a reverse t → s of the same weight (a handling fee or argument price
 * shared by a move and its inverse). This is a hard gate: a mutator added with a one-way or asymmetric move fails here
 * (analytic-calibration.md §2; the valuation's exact sums depend on it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleDiagnostic, q, type Q } from "@workspace/v2-core";
import { fromMC, lineType, type LineState } from "../src/index.ts";

const line = (m: Q, c: Q) => fromMC(m, c);
const qs = (xs: (number | [number, number])[]) => xs.map(x => (typeof x === "number" ? q(x) : q(x[0], x[1])));

for (const v of lineType.variants) {
  test(`${v.id}: every proposal has a reverse of the same weight (no one-way move, no asymmetric pair, no loop)`, () => {
    const whole = (v.params as { domain?: string }).domain !== "Q";
    const ms = whole ? qs([-2, -1, 0, 1, 2, 3]) : qs([-2, -1, 0, 1, 2, [1, 2], [-3, 2]]);
    const cs = whole ? qs([-2, -1, 0, 1, 2, 6]) : qs([-2, -1, 0, 1, [1, 3], 6]);
    const lines = ms.flatMap(m => cs.map(c => line(m, c)));
    const per = (lineType.origin(v) as LineState).lines.length;
    // Several lines per object: a few objects whose lines are drawn from the same small set.
    const states: LineState[] = per === 1 ? lines.map(l => ({ lines: [l] }))
      : Array.from({ length: 6 }, (_, i) => ({ lines: Array.from({ length: per }, (_, j) => lines[(i * 7 + j * 5) % lines.length]!) }));
    const r = cycleDiagnostic(lineType, v, states, per === 1 ? 14 : 13, per === 1 ? 6 : 4);
    assert.deepEqual(r.oneWay, {}, "one-way moves");
    for (const [id, s] of Object.entries(r.perMutator)) assert.equal(s.asymmetric, 0, `${id}: ${s.asymmetric} asymmetric pairs, worst ${s.worst} bits`);
    assert.ok(r.worstEdge < 1e-9 && r.worstCycle < 1e-9, `edge ${r.worstEdge}, loop ${r.worstCycle}`);
    assert.ok(r.edges > 100, "the diagnostic saw moves");
  });
}
