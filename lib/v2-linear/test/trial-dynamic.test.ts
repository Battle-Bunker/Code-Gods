/** The scoring trial's dynamic mode (src/trial-dynamic.ts): what holds by construction. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "@workspace/v2-core";
import { biggerU, dynamicEnergy, dynamicExamples, fromMC, primeGradientU, readings } from "../src/index.ts";

const s = fromMC(q(1031), q(5, 3));

test("the same state and utility always score the same", () => {
  const a = dynamicEnergy(s, primeGradientU, { K: 8 }), b = dynamicEnergy(s, primeGradientU, { K: 8 });
  assert.equal(a.energy, b.energy);
  assert.equal(a.evals, b.evals);
});

test("each neighbour costs at most its cap (the walk back), so the energy is at most the mean cap", () => {
  for (const U of dynamicExamples) {
    const e = dynamicEnergy(s, U, { K: 8 });
    assert.ok(e.energy <= e.cap + 1e-9, `${U.id}: ${e.energy} against ${e.cap}`);
    for (const x of e.samples) assert.ok(x.found.cost === Infinity || x.found.cost >= 0);
  }
});

test("a route the search reports does reach the utility: the utilities read the line, and bigger |c| is a plain reading", () => {
  const r = readings(fromMC(q(3, 2), q(-40)))!;
  assert.equal(biggerU.u(r), 40);
  assert.ok(Math.abs(primeGradientU.u(readings(s)!) - Math.log2(1031)) < 1e-12);   // on the prime: log2 p − 0
});
