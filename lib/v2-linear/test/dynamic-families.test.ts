/** The dynamic line families (src/dynamic-families.ts): worked utilities, and each family's heuristics help its energy. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Q } from "@workspace/v2-core";
import { circleKiss, crossingSliver, dynamicFamilies, estimateLine, fromMC, lineQ, lineRule, squareTriangle, steppingCoefficients } from "../src/index.ts";

const u = (F: { dynamic?: unknown }, p: unknown, m: Q, c: Q) => (F as typeof circleKiss).dynamic!.u({ lines: [fromMC(m, c)] }, p as never);
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

test("worked utilities of the four added rules", () => {
  // Crossing Sliver: y = 7x − 1 crosses at 1/7: log2 7, nothing off.
  near(u(crossingSliver, { suffix: "7" }, q(7), q(-1)), Math.log2(7), "crossing at 1/7");
  assert.ok(Number.isNaN(u(crossingSliver, { suffix: "7" }, q(0), q(3))), "a flat line never crosses");
  // Stepping Coefficients d = 3: 7x + 10y + 13 = 0 (y = −7/10 x − 13/10) steps 7, 10, 13: log2 13.
  near(u(steppingCoefficients, { k: 3 }, q(-7, 10), q(-13, 10)), Math.log2(13), "7, 10, 13");
  near(u(steppingCoefficients, { k: 3 }, q(-7, 11), q(-13, 11)), Math.log2(13) - 2 * 2, "7, 11, 13: each step 1 off");
  // Circle Kiss R = 5: y = 3/4 x + 25/4 touches (distance² 25); 3² + 4² = 25 → half of log2 25.
  near(u(circleKiss, { k: 5 }, q(3, 4), q(25, 4)), 0.5 * Math.log2(25), "tangent");
  // Square Triangle k = 3: y = −x/8 + 21 has area 21² / (2/8) = 1764 = 42², 42 a multiple of 3.
  near(u(squareTriangle, { k: 3 }, q(-1, 8), q(21)), Math.log2(42), "area 42²");
});

test("every dealt family's heuristics only lower its energy on the same starts, and keep it finite", () => {
  const lines = [fromMC(q(3), q(5)), fromMC(q(-2, 7), q(729)), fromMC(q(3, 4), q(25, 4))];
  for (const F of dynamicFamilies) for (const p of F.dealable(lineQ)) for (const l of lines) {
    const r = lineRule(F.dynamic!, p), opts = { K: 6, seed: `${F.id}` };
    const bare = estimateLine(l, r, lineQ, { ...opts, heuristics: false }), own = estimateLine(l, r, lineQ, opts);
    assert.ok(own.energy <= bare.energy + 1e-9 && Number.isFinite(own.energy), `${F.id}: ${own.energy} against ${bare.energy}`);
  }
});

test("the pool reads every part of the line: the gradient, the y-intercept, the x-crossing and a, b, c", () => {
  const reads = new Set(dynamicFamilies.flatMap(f => f.dynamic!.reads));
  for (const r of ["m", "c", "X", "gen"]) assert.ok(reads.has(r), r);
});
