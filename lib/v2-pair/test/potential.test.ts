/**
 * Owner decision 19: every price list is an exact potential (a move and its reverse proposed with equal weight), so the
 * walk's law is π ∝ 2^−φ on distinct pairs. A hard gate, as on the line and the grid.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleDiagnostic } from "@workspace/v2-core";
import { pairQ, pairType, type PairState } from "../src/index.ts";
import { L, Y, sys } from "./helpers.ts";

test("pair-q: every proposal has a reverse of the same weight (no one-way move, no asymmetric pair, no loop)", () => {
  const states: PairState[] = [
    sys(L(0, 1, 0), L(1, 0, 0)),        // the axes
    sys(L(2, 3, -12), L(1, -1, -1)),    // crossing at (3, 2)
    sys(Y(1, 0), Y(-1, 2)),             // a right angle at (1, 1)
    sys(Y(2, 1), Y(2, -3)),             // parallel
    sys(L(1, 0, -3), Y(3, 1)),          // a vertical line
    sys(Y(1, 0), L(0, 1, -4)),          // 45°
  ];
  const r = cycleDiagnostic(pairType, pairQ, states, 12, 4);
  assert.deepEqual(r.oneWay, {}, "one-way moves");
  for (const [id, s] of Object.entries(r.perMutator)) assert.equal(s.asymmetric, 0, `${id}: ${s.asymmetric} asymmetric pairs, worst ${s.worst} bits`);
  assert.ok(r.worstEdge < 1e-9 && r.worstCycle < 1e-9, `edge ${r.worstEdge}, loop ${r.worstCycle}`);
  assert.ok(r.edges > 100, "the diagnostic saw moves");
  // Every reversible mutator proposed something (a one-way move, the rounding, is never proposed by the walk).
  assert.equal(Object.keys(r.perMutator).length, pairType.mutators.filter(m => pairQ.mutators.includes(m.id) && m.inverse.kind !== "none").length, "every mutator proposed something");
});
