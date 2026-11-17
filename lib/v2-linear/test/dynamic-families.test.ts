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

test("the dealt rules are exact far past 2^53 and have no silent size cutoff (17 Nov)", async () => {
  const { cornerU, wholeStairU, goldenPathU } = await import("../src/candidate-families.ts");
  const { dynamicFamilies: dealt } = await import("../src/dealt.ts");
  const { fromMC } = await import("../src/line.ts");
  const { q: Q } = await import("@workspace/v2-core");
  const log2Big = (n: bigint) => { const L = n.toString(2).length; return L <= 52 ? Math.log2(Number(n)) : Math.log2(Number(n >> BigInt(L - 52))) + (L - 52); };
  // Corner: 2·5·top·bottom a square at 10^30 (top = k², bottom = 90 = 2·5·9: A = (30k)²); one more on top is off it.
  const k = 10n ** 15n + 1n, top = k * k;
  assert.ok(Math.abs(cornerU(Q(top, 90n), 5) - 0.5 * log2Big(10n * top * 90n)) < 1e-9);
  assert.ok(cornerU(Q(top + 1n, 90n), 5) < cornerU(Q(top, 90n), 5) - 1);
  // Whole Stair: a primitive Pythagorean step (u² − v², 2uv) at 10^24 has a whole slanted edge.
  const u = 10n ** 12n + 1n, v = 2n, rise = u * u - v * v, run = 2n * u * v;
  assert.ok(Math.abs(wholeStairU(Q(rise, run), 1) - 0.5 * log2Big(rise * rise + run * run)) < 1e-9);
  assert.ok(wholeStairU(Q(rise + 2n, run), 1) < wholeStairU(Q(rise, run), 1) - 1);
  // Golden Path: 300 steps of 1s (consecutive Fibonacci numbers) all count.
  let [a, b] = [1n, 1n];
  for (let i = 0; i < 300; i++) [a, b] = [b, a + b];
  assert.ok(goldenPathU(Q(b, a), "1") >= 299);
  // Stepping Coefficients at 10^20: a, a + 3, a + 6 score their size, not NaN.
  const step = dealt.find(f => f.id === "stepping-coefficients")!;
  const A = 10n ** 20n, line = fromMC(Q(-A, A + 3n), Q(-(A + 6n), A + 3n));
  const us = step.dynamic!.u({ lines: [line] }, { k: 3 });
  assert.ok(Math.abs(us - log2Big(A + 6n)) < 1e-9, String(us));
});

test("Bearing and Ring have no ceiling and stay exact deep down; large same-size starts keep random low digits", async () => {
  const { bearingU, ringU, tanFixed } = await import("../src/candidate-families.ts");
  const { continuedFraction } = await import("../src/dynamic-families.ts");
  const { q: Q } = await import("@workspace/v2-core");
  // A convergent of tan 37° with a bottom of about 2^100 matches about 200 binary digits (the old float version stopped at 50).
  const cf = continuedFraction(Q(tanFixed(37, 400), 1n << 400n));
  let [p0, q0, p1, q1] = [1n, 0n, cf[0]!, 1n];
  for (let i = 1; q1 < 1n << 100n; i++) [p0, q0, p1, q1] = [p1, q1, cf[i]! * p1 + p0, cf[i]! * q1 + q0];
  const u = bearingU(Q(p1, q1), 37);
  assert.ok(u > 190 && u < 260, String(u));
  assert.ok(bearingU(Q(p1 + 1n, q1), 37) < 110, "one more on top loses about half");
  // Ring (2, 1, ρ = 7): the line 3x − 2y + c = 0 with c the nearest whole number to the tangent's, scaled up 2^60.
  const big = 1n << 60n, a = 3n * big, b = -2n * big, M = a * a + b * b;
  let lo = 0n, hi = 1n << 70n;   // c ≈ √(7M) − (2a + b), by bisection on c² vs 7M
  const target = (cc: bigint) => (2n * a + b + cc) ** 2n - 7n * M;
  while (hi - lo > 1n) { const mid = (lo + hi) / 2n; if (target(mid) < 0n) lo = mid; else hi = mid; }
  const m = Q(-a, b), c = Q(-lo, b);
  assert.ok(ringU(m, c, { u: 2, v: 1, rho: 7 }) > 55, String(ringU(m, c, { u: 2, v: 1, rho: 7 })));
  // Starts for a line with an 80-bit intercept top: not all multiples of a large power of two.
  const { lineStarts } = await import("../src/energy.ts");
  const starts = lineStarts(fromMC(Q(3n, 2n), Q((1n << 80n) + 12345n, 7n)), "mc", 12, "lowbits", 0.5);
  const oddish = starts.filter(l => { const t = l.c < 0n ? -l.c : l.c; return t % (1n << 20n) !== 0n; }).length;
  assert.ok(oddish >= 10, `${oddish} of ${starts.length}`);
});
