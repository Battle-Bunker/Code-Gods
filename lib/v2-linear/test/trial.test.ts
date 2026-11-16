import { test } from "node:test";
import assert from "node:assert/strict";
import { q, Qn, rng, type Q } from "@workspace/v2-core";
import {
  allMutators, areaSquare, axisArea, callPrice, fromMC, gradientPrime, height, interceptSmooth, isVertical, lineQ, pt,
  smoothUpTo, trialScore, trophyPrice, trophyWorth, TRIAL, TRIAL_LOG, type Line, type TrialDials, type TrialRule,
} from "../src/index.ts";

const line = (m: Q | number, c: Q | number): Line => fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c);
const g = TRIAL.g, k = TRIAL.k;

test("height: g × (|m| + |c| + bottom − 1); fractions pay for their bottom number", () => {
  assert.equal(height(line(2, 9)), g * 11);
  assert.equal(height(line(-2, -9)), g * 11);
  assert.ok(Math.abs(height(line(q(1, 2), 3)) - g * (0.5 + 3 + 1)) < 1e-12);
  // y = x/8 + 61/2: bottom 8
  assert.ok(Math.abs(height(line(q(1, 8), q(61, 2))) - g * (0.125 + 30.5 + 7)) < 1e-12);
});

test("prices: a shift pays α per unit plus the lift; a fall pays friction only; a mirror pays its sign changes", () => {
  const p = callPrice("si.shift", { k: q(10) }, line(1, 5), line(1, 15))!;
  assert.ok(Math.abs(p.friction - (TRIAL.nu + 10 * TRIAL.alpha)) < 1e-12 && Math.abs(p.lift - 10 * g) < 1e-12);
  const down = callPrice("si.shift", { k: q(-10) }, line(1, 15), line(1, 5))!;
  assert.equal(down.lift, 0);
  const mir = callPrice("cart.mirror", { axis: "x" }, line(2, 9), line(-2, -9))!;
  assert.ok(Math.abs(mir.total - (TRIAL.nu + 2 * TRIAL.sigma)) < 1e-12);
  // A stretch is floored at the friction distance it covers.
  const st = callPrice("mach.stretch", { f: q(1, 2) }, line(100, 800), line(50, 400))!;
  assert.ok(Math.abs(st.friction - (TRIAL.nu + TRIAL.alpha * 450)) < 1e-9);
});

test("worth of a trophy is the height of its cheapest (relaxed) holder", () => {
  assert.ok(Math.abs(trophyWorth({ label: "", m: { lo: 100.5, hi: 101.5 } }) - g * 100.5) < 1e-12);
  assert.ok(Math.abs(trophyWorth({ label: "", c: { lo: 866.5, hi: 867.5 }, m: { lo: 17, hi: 18 } }) - g * (866.5 + 17)) < 1e-12);
  // Area 3721: the relaxed cheapest holder is a small line with a modest bottom (about b = 12): well under a bit.
  const w = trophyWorth({ label: "", area: 3721 });
  assert.ok(w > 0.8 && w < 0.95, `area worth ${w}`);
  // An actual holder is never cheaper than the relaxed worth: y = x/8 + 61/2 has area 3721.
  assert.equal(axisArea(line(q(1, 8), q(61, 2))), 3721);
  assert.ok(height(line(q(1, 8), q(61, 2))) >= w);
});

test("smooth numbers and suffix primes", () => {
  assert.deepEqual(smoothUpTo([3, 17], 900).slice(0, 4), [867, 729, 459, 289]);
  const ts = [...gradientPrime("13").trophies(g * 400, TRIAL)].map(t => t.label);
  assert.deepEqual(ts, ["|m| rounds to 313", "|m| rounds to 113", "|m| rounds to 13"]);  // 213 = 3 × 71
});

// ------------------------------------------------------------------ the by-construction bounds, by enumeration

const STEPS: readonly [string, Record<string, unknown>][] = [
  ...[1, -1, 3, -3, 10, -10].flatMap(n => [["si.shift", { k: q(n) }], ["si.tilt", { k: q(n) }], ["seq.step", { k: q(n) }]] as [string, Record<string, unknown>][]),
  ["si.shift", { k: q(1, 2) }], ["si.tilt", { k: q(-1, 3) }], ["si.shift", { k: q(7, 4) }],
  ["cart.pivot", { x0: q(2), k: q(1) }], ["cart.pivot", { x0: q(-1), k: q(-2) }],
  ["cart.slide", { u: q(1), v: q(-2) }], ["cart.slide", { u: q(1, 2), v: q(0) }],
  ["cart.mirror", { axis: "x" }], ["cart.mirror", { axis: "y" }], ["cart.mirror", { axis: "origin" }], ["cart.mirror", { axis: "diagonal" }],
  ["gen.nudge", { which: "c", k: q(1) }], ["gen.nudge", { which: "a", k: q(-1) }], ["gen.nudge", { which: "b", k: q(1) }],
  ["int.move", { axis: "x", k: q(2) }], ["int.move", { axis: "y", k: q(-3) }],
  ["mach.stretch", { f: q(2) }], ["mach.stretch", { f: q(1, 2) }], ["mach.stretch", { f: q(3) }], ["mach.stretch", { f: q(-1) }], ["mach.stretch", { f: q(2, 3) }],
  ["coef.swap", { pair: "m-c" }], ["coef.swap", { pair: "b-c" }], ["basis.zoom", { f: q(2) }], ["basis.lean", { k: q(1) }],
];
const BY_ID = new Map(allMutators.map(m => [m.id, m]));

function* states(n: number, seed: number, sizes: readonly number[] = [5, 30, 200, 1200]): Generator<Line> {
  const r = rng(seed);
  const pick = (): Q => {
    const den = [1, 1, 1, 2, 3, 4, 7][r.below(7)]!;
    const size = sizes[r.below(sizes.length)]!;
    return q(BigInt(r.below(2 * size * den + 1) - size * den), BigInt(den));
  };
  for (let i = 0; i < n; i++) yield line(pick(), pick());
}

function checkBounds(rules: readonly TrialRule[], count: number, seed: number, tol: number, sizes?: readonly number[], d: TrialDials = TRIAL) {
  let calls = 0, worst = -Infinity;
  for (const s of states(count, seed, sizes)) {
    const before = rules.map(r => trialScore(r, s, d).score);
    const H = height(s, d);
    before.forEach(v => assert.ok(v <= H + tol, `score ${v} above height ${H}`));
    for (const [id, args] of STEPS) {
      const m = BY_ID.get(id);
      if (!m) continue;
      const r = m.apply({ lines: [s] }, 0, args as never, lineQ);
      if ("invalid" in r) continue;
      const t = r.lines[0]!;
      if (isVertical(t)) continue;
      const p = callPrice(id, args, s, t, d)!, undo = callPrice(id, args, t, s, d)!;
      calls++;
      rules.forEach((rule, i) => {
        const after = trialScore(rule, t, d).score, dd = after - before[i]!;
        worst = Math.max(worst, dd - d.k * p.total, -dd - d.k * undo.total);
        assert.ok(dd <= d.k * p.total + tol, `${rule.family} rose ${dd} for ${id} costing ${p.total}`);
        assert.ok(-dd <= d.k * undo.total + tol, `${rule.family} fell ${-dd} for ${id}, undo costs ${undo.total}`);
      });
    }
  }
  return { calls, worst };
}

test("no call moves a score by more than k × its price (rise) or k × its undo's price (fall); no score above height", () => {
  const rules = [gradientPrime("1"), gradientPrime("13"), interceptSmooth([3, 17]), interceptSmooth([2, 5], true)];
  const { calls } = checkBounds(rules, 2500, 7, 1e-9);
  assert.ok(calls > 50_000, `only ${calls} calls`);
});

test("the area rule keeps the bounds too, to the numerical minimiser's tolerance", () => {
  const { calls } = checkBounds([areaSquare(12)], 40, 11, 1e-4, [3, 12, 40]);
  assert.ok(calls > 1_000, `only ${calls} calls`);
});

test("price to a trophy is never above the price of a direct route onto it", () => {
  const s = pt(line(2, 9))!;
  const t = { label: "", c: { lo: 866.5, hi: 867.5 } };
  const direct = callPrice("si.shift", { k: q(858) }, line(2, 9), line(2, 867))!.total - TRIAL.nu;
  assert.ok(trophyPrice(s, t) <= direct + 1e-9);
  assert.ok(Qn.eq(q(1), q(1)));
});

// ------------------------------------------------------------------ the log height (scale-invariant gravity)

test("log height: every doubling of a number costs g, wherever it is; a fraction's bottom pays its doublings", () => {
  const G = TRIAL_LOG.g, h = (m: Q | number, c: Q | number) => height(line(m, c), TRIAL_LOG);
  assert.ok(Math.abs(h(0, 3) - G * 2) < 1e-9);                    // log2(1 + 3)
  assert.ok(Math.abs(h(0, 1023) - h(0, 511) - G) < 1e-9);
  assert.ok(Math.abs(h(q(1, 4), 0) - G * (Math.log2(1.25) + 2)) < 1e-9);
  // A stretch by 2 pays its game fee plus about 2g of lift, the same at any size.
  const small = callPrice("mach.stretch", { f: q(2) }, line(10, 86), line(20, 172), TRIAL_LOG)!;
  const big = callPrice("mach.stretch", { f: q(2) }, line(10000, 86000), line(20000, 172000), TRIAL_LOG)!;
  assert.ok(small.friction < 10 && big.friction < 10, `${small.friction} ${big.friction}`);
  assert.ok(Math.abs(big.lift - 2 * G) < 0.01 && Math.abs(small.lift - 2 * G) < 20);
  // A swap of m and c is priced across the size direction: dear when the two differ in size (no cuckoo).
  const sw = callPrice("coef.swap", { pair: "m-c" }, line(2, 867), line(q(-1, 867), q(-2, 867)), TRIAL_LOG);
  assert.ok(sw === null || sw.total > 100);
});

test("log mode keeps the bounds: no call moves a score by more than k × its price or its undo's; none above height", () => {
  const rules = [gradientPrime("1"), gradientPrime("13"), interceptSmooth([3, 17]), interceptSmooth([2, 5], true)];
  const { calls } = checkBounds(rules, 250, 13, 1e-6, [5, 30, 200, 3000], TRIAL_LOG);
  assert.ok(calls > 5_000, `only ${calls} calls`);
});

test("log mode: the area rule keeps the bounds to the minimiser's tolerance", () => {
  const { calls } = checkBounds([areaSquare(12)], 15, 17, 1e-2, [3, 12, 40], TRIAL_LOG);
  assert.ok(calls > 300, `only ${calls} calls`);
});
