/** The dynamic line families (src/dynamic-families.ts): worked utilities, and each family's heuristics help its energy. */
import { lineQ } from "./config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Q } from "@workspace/v2-core";
import { dynamicFamilies, estimateLine, fromMC, lineRule, primeBalance, recurrencePair, steppingCoefficients, unitFraction } from "../src/index.ts";

const u = (F: { dynamic?: unknown }, p: unknown, m: Q, c: Q) => (F as typeof unitFraction).dynamic!.u({ lines: [fromMC(m, c)] }, p as never);
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

test("worked utilities of the four added rules", () => {
  // Unit Fraction "25": c = 1/1525 ends …525 (three digits match …2525), the top is 1.
  near(u(unitFraction, { suffix: "25" }, q(1), q(1, 1525)), 3, "1/1525");
  near(u(unitFraction, { suffix: "25" }, q(1), q(2, 1525)), 3 - 1, "2/1525: the top 1 off");
  // Prime Balance 2 3: c = 8/27 is 2³/3³: 6; c = 16/27 has four 2's against three 3's: 6 − 1; c = 40/27 leaves a 5.
  near(u(primeBalance, { p: 2, q: 3 }, q(1), q(8, 27)), 6, "8/27");
  near(u(primeBalance, { p: 2, q: 3 }, q(1), q(16, 27)), 5, "16/27");
  near(u(primeBalance, { p: 2, q: 3 }, q(1), q(40, 27)), 6 - Math.log2(5), "40/27");
  // Recurrence Pair 1 (1, 1, 2, 3, 5, 8, 13): m = 13/8 has x5 = 8 below and x6 = 13 on top: 5; m = 13/9, the bottom one off: 5 − 2.
  near(u(recurrencePair, { k: 1 }, q(13, 8), q(0)), 5, "13/8");
  near(u(recurrencePair, { k: 1 }, q(13, 9), q(0)), 5 - 2 * Math.log2(2), "13/9");
  // Stepping Coefficients d = 3: 7x + 10y + 13 = 0 (y = −7/10 x − 13/10) steps 7, 10, 13: log2 13.
  near(u(steppingCoefficients, { k: 3 }, q(-7, 10), q(-13, 10)), Math.log2(13), "7, 10, 13");
  near(u(steppingCoefficients, { k: 3 }, q(-7, 11), q(-13, 11)), Math.log2(13) - 2 * 2, "7, 11, 13: each step 1 off");
});

test("every dealt family's candidates only lower its energy on the same starts, and keep it finite", () => {
  const lines = [fromMC(q(3), q(5)), fromMC(q(-2, 7), q(729)), fromMC(q(3, 4), q(25, 4))];
  for (const F of dynamicFamilies) for (const p of F.dealable(lineQ)) for (const l of lines) {
    const r = lineRule(F.dynamic!, p), opts = { K: 6, seed: `${F.id}` };
    const bare = estimateLine(l, r, lineQ, { ...opts, candidates: false }), own = estimateLine(l, r, lineQ, opts);
    assert.ok(own.energy <= bare.energy + 1e-9 && Number.isFinite(own.energy), `${F.id}: ${own.energy} against ${bare.energy}`);
  }
});

test("the pool reads the gradient, the y-intercept and a, b, c", () => {
  const reads = new Set(dynamicFamilies.flatMap(f => f.dynamic!.reads));
  for (const r of ["m", "c", "gen"]) assert.ok(reads.has(r), r);
});

test("the fine-structure rules: a better state costs more, and a same-size start rarely qualifies", () => {
  const rows: [typeof unitFraction, unknown, ReturnType<typeof fromMC>[]][] = [
    [unitFraction, { suffix: "3" }, [fromMC(q(2), q(1, 13)), fromMC(q(2), q(1, 1333)), fromMC(q(2), q(1, 1333333))]],
    [primeBalance, { p: 2, q: 3 }, [fromMC(q(5, 7), q(2, 3)), fromMC(q(5, 7), q(16, 81)), fromMC(q(5, 7), q(2 ** 9, 3 ** 9))]],
    [recurrencePair, { k: 1 }, [fromMC(q(3, 2), q(7)), fromMC(q(21, 13), q(7)), fromMC(q(1597, 987), q(7))]],
  ];
  for (const [F, p, lines] of rows) {
    const es = lines.map(l => estimateLine(l, lineRule(F.dynamic!, p), lineQ, { K: 12, seed: F.id }));
    for (let i = 1; i < es.length; i++) assert.ok(es[i]!.energy > es[i - 1]!.energy + 3, `${F.id}: ${es.map(e => e.energy.toFixed(1)).join(" < ")}`);
    const deep = es[es.length - 1]!;
    assert.ok(deep.samples.filter(x => x.cost === 0).length <= 1, `${F.id}: ${deep.samples.filter(x => x.cost === 0).length} starts already qualify`);
  }
});
