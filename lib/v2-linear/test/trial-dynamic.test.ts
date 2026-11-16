/** The scoring trial's dynamic mode (src/trial-dynamic.ts): what holds by construction. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "@workspace/v2-core";
import { biggerFamily, dynamicEnergy, dynamicExamples, fromMC, primeGradientFamily, readings, type DynamicFamily } from "../src/index.ts";

const s = fromMC(q(1031), q(5, 3));
const pg = primeGradientFamily("1");

test("each start costs at most the direct route onto the state (the ceiling)", () => {
  for (const F of dynamicExamples) for (const x of dynamicEnergy(s, F, { K: 6, seed: "t" }).samples) assert.ok(x.cost <= x.direct + 1e-9, `${F.id}`);
});

test("adding a heuristic can only lower the energy, on the same starts", () => {
  const bare = dynamicEnergy(s, pg, { K: 10, seed: "h", heuristics: false });
  const withOwn = dynamicEnergy(s, pg, { K: 10, seed: "h" });
  // A useless extra heuristic and a good one: never above.
  const junk: DynamicFamily["searches"][number] = { id: "junk", propose: () => [{ m: 7 }, { c: 2 }] };
  const more = dynamicEnergy(s, pg, { K: 10, seed: "h", extra: [junk] });
  assert.ok(withOwn.energy <= bare.energy + 1e-9, `${withOwn.energy} against ${bare.energy}`);
  assert.ok(more.energy <= withOwn.energy + 1e-9);
  bare.samples.forEach((x, i) => assert.equal(x.from.c, withOwn.samples[i]!.from.c));   // the same starts
});

test("fresh randomness by default; fixed when a seed is given", () => {
  assert.equal(dynamicEnergy(s, pg, { K: 4, seed: "x" }).energy, dynamicEnergy(s, pg, { K: 4, seed: "x" }).energy);
  const a = dynamicEnergy(s, pg, { K: 4 }).samples.map(x => x.from.a), b = dynamicEnergy(s, pg, { K: 4 }).samples.map(x => x.from.a);
  assert.notDeepEqual(a, b);
});

test("bigger is better scores 0: starts are never smaller than the state", () => {
  assert.equal(dynamicEnergy(fromMC(q(3, 2), q(1000)), biggerFamily, { K: 10 }).energy, 0);
  assert.equal(biggerFamily.u(readings(fromMC(q(3, 2), q(-40)))!), 40);
});
