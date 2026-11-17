/** The dynamic line families (src/dynamic-families.ts): worked utilities, and each family's heuristics help its energy. */
import { lineQ } from "./config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Q } from "@workspace/v2-core";
import { circleKiss, crossingSliver, dynamicFamilies, estimateLine, fromMC, lineRule, primeSliver, squareTriangle, steppingCoefficients, unitFraction } from "../src/index.ts";

const u = (F: { dynamic?: unknown }, p: unknown, m: Q, c: Q) => (F as typeof circleKiss).dynamic!.u({ lines: [fromMC(m, c)] }, p as never);
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

test("worked utilities of the four added rules", () => {
  // Crossing Pattern "12": y = −x + 13/8 crosses at 13/8 = [1; 1, 1, 1, 2]: the first 1 matches, the next 1 misses the 2, and the 4 after cost ¼ each.
  near(u(crossingSliver, { pattern: "12" }, q(-1), q(13, 8)), 1 - 4 / 4, "13/8 against 1, 2, 1, 2");
  // 1 + 1/(2 + 1/(1 + 1/2)) = 1 + 1/(2 + 2/3) = 1 + 3/8 = 11/8 = [1; 2, 1, 2]: four matches.
  near(u(crossingSliver, { pattern: "12" }, q(-1), q(11, 8)), 4, "11/8 follows 1, 2, 1, 2");
  assert.ok(Number.isNaN(u(crossingSliver, { pattern: "1" }, q(0), q(3))), "a flat line never crosses");
  // Unit Fraction "25": c = 1/1525 ends …525 (three digits match …2525), the top is 1.
  near(u(unitFraction, { suffix: "25" }, q(1), q(1, 1525)), 3, "1/1525");
  near(u(unitFraction, { suffix: "25" }, q(1), q(2, 1525)), 3 - 1, "2/1525: the top 1 off");
  // Prime Sliver p = 3: m = 1/81 is 3⁴: 4 log2 3; m = 2/81 also pays the top's binary digit; m = 1/162 pays 2's.
  near(u(primeSliver, { p: 3 }, q(1, 81), q(0)), 4 * Math.log2(3), "1/81");
  near(u(primeSliver, { p: 3 }, q(2, 81), q(0)), 4 * Math.log2(3) - 1, "2/81");
  near(u(primeSliver, { p: 3 }, q(1, 162), q(0)), 4 * Math.log2(3) - 1, "1/162");
  // Stepping Coefficients d = 3: 7x + 10y + 13 = 0 (y = −7/10 x − 13/10) steps 7, 10, 13: log2 13.
  near(u(steppingCoefficients, { k: 3 }, q(-7, 10), q(-13, 10)), Math.log2(13), "7, 10, 13");
  near(u(steppingCoefficients, { k: 3 }, q(-7, 11), q(-13, 11)), Math.log2(13) - 2 * 2, "7, 11, 13: each step 1 off");
  // Circle Kiss R = 5: y = 3/4 x + 25/4 touches (distance² 25); 3² + 4² = 25 → half of log2 25.
  near(u(circleKiss, { k: 5 }, q(3, 4), q(25, 4)), 0.5 * Math.log2(25), "tangent");
  // Square Triangle k = 3: y = −x/8 + 21 has area 21² / (2/8) = 1764 = 42², 42 a multiple of 3.
  near(u(squareTriangle, { k: 3 }, q(-1, 8), q(21)), Math.log2(42), "area 42²");
});

test("every dealt family's candidates only lower its energy on the same starts, and keep it finite", () => {
  const lines = [fromMC(q(3), q(5)), fromMC(q(-2, 7), q(729)), fromMC(q(3, 4), q(25, 4))];
  for (const F of dynamicFamilies) for (const p of F.dealable(lineQ)) for (const l of lines) {
    const r = lineRule(F.dynamic!, p), opts = { K: 6, seed: `${F.id}` };
    const bare = estimateLine(l, r, lineQ, { ...opts, candidates: false }), own = estimateLine(l, r, lineQ, opts);
    assert.ok(own.energy <= bare.energy + 1e-9 && Number.isFinite(own.energy), `${F.id}: ${own.energy} against ${bare.energy}`);
  }
});

test("the pool reads every lens: the gradient and y-intercept, the x-crossing, a, b, c and the area", () => {
  const reads = new Set(dynamicFamilies.flatMap(f => f.dynamic!.reads));
  for (const r of ["m", "c", "X", "gen", "area"]) assert.ok(reads.has(r), r);
});

test("the fine-structure rules: a better state costs more, and a same-size start rarely qualifies", () => {
  const rows: [typeof unitFraction, unknown, ReturnType<typeof fromMC>[]][] = [
    [unitFraction, { suffix: "3" }, [fromMC(q(2), q(1, 13)), fromMC(q(2), q(1, 1333)), fromMC(q(2), q(1, 1333333))]],
    [primeSliver, { p: 3 }, [fromMC(q(1, 3), q(5)), fromMC(q(1, 81), q(5)), fromMC(q(1, 3 ** 9), q(5))]],
    [crossingSliver, { pattern: "1" }, [fromMC(q(-2), q(10, 3)), fromMC(q(-2), q(26, 8)), fromMC(q(-2), q(466, 144))]],
  ];
  for (const [F, p, lines] of rows) {
    const es = lines.map(l => estimateLine(l, lineRule(F.dynamic!, p), lineQ, { K: 12, seed: F.id }));
    for (let i = 1; i < es.length; i++) assert.ok(es[i]!.energy > es[i - 1]!.energy + 3, `${F.id}: ${es.map(e => e.energy.toFixed(1)).join(" < ")}`);
    const deep = es[es.length - 1]!;
    assert.ok(deep.samples.filter(x => x.cost === 0).length <= 1, `${F.id}: ${deep.samples.filter(x => x.cost === 0).length} starts already qualify`);
  }
});
