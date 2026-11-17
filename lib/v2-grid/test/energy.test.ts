/** A board's energy (src/energy.ts on v2-core free-energy.ts): what holds by construction, the spread and the time gate. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { argBits, rng, softMinBits, startCost } from "@workspace/v2-core";
import { dynamicGridFamilies, estimateGrid, grid4, gridNaming, gridStarts, type GridDynamicRule, type GridState } from "../src/index.ts";

type F = (typeof dynamicGridFamilies)[number];
const ruleOf = (f: F) => f.dynamic as GridDynamicRule<unknown>;
/** A greedy climb by single-cell rewrites (the best utility each step): a good board for the rule. */
function climb(f: F, p: unknown, from: GridState, steps = 40): GridState {
  let b = from;
  for (let i = 0; i < steps; i++) {
    let best = b, bu = ruleOf(f).u(b, p);
    for (let c = 0; c < 16; c++) for (let x = 0; x < 10; x++) {
      const t = { cells: b.cells.map((y, j) => (j === c ? x : y)) }, tu = ruleOf(f).u(t, p);
      if (tu > bu + 1e-12) { best = t; bu = tu; }
    }
    if (best === b) break;
    b = best;
  }
  return b;
}
const r = rng("grid-energy-test");
const boards = new Map(dynamicGridFamilies.map(f => {
  const p = f.dealable(grid4)[0], start = gridStarts(grid4, 1, String(r.unit()))[0]!;
  return [f.id, { p, start, top: climb(f, p, start) }] as const;
}));

test("the soft minimum: never above the cheapest route, at most 1 bit below two equal routes, and more routes only lower it", () => {
  assert.equal(softMinBits([5]), 5);
  assert.equal(softMinBits([5, 5]), 4);
  assert.equal(softMinBits([]), Infinity);
  assert.ok(softMinBits([5, 9, 30]) <= 5 && softMinBits([5, 9, 30]) < softMinBits([5, 9]));
});

test("naming: a turn costs naming bits only; every move names at least which move and the continue bit", () => {
  const { moves, cellBits } = gridNaming(grid4);
  assert.ok(moves.length > 500, `${moves.length} moves`);
  for (const m of moves) assert.ok(m.bits >= Math.log2(grid4.mutators.length) + 1 - 1e-9, m.m.id);
  // add to one cell: which (log2 12) + which cell (4) + the amount (argBits of 1, signed) + continue
  assert.ok(Math.abs(cellBits - (Math.log2(12) + 4 + argBits(1, true) + 1)) < 1e-9);
});

test("energy: 0 when a start already qualifies; a climbed board costs more than a random one; seeded estimates repeat", () => {
  for (const f of dynamicGridFamilies) {
    const { p, start, top } = boards.get(f.id)!, rule = ruleOf(f);
    const e = estimateGrid(top, rule, p, grid4, { K: 6, seed: "a" });
    assert.deepEqual(e, estimateGrid(top, rule, p, grid4, { K: 6, seed: "a" }));
    assert.ok(e.energy > estimateGrid(start, rule, p, grid4, { K: 6, seed: "a" }).energy, `${f.id}: climbed ${e.energy}`);
    const worst = { cells: Array(16).fill(0) }, bottom = estimateGrid(worst, rule, p, grid4, { K: 6, seed: "a" });
    if (rule.u(worst, p) <= Math.min(...gridStarts(grid4, 6, "a").map(x => rule.u(x, p)))) assert.equal(bottom.energy, 0, f.id);
    for (const s of e.samples) assert.ok(s.cost <= s.best + 1e-9 && s.best <= s.universal + 1e-9, `${f.id}: the soft minimum is at most the best route, the best at most the universal`);
  }
});

test("a candidate can only lower a start's cost", () => {
  for (const f of dynamicGridFamilies) {
    const { p, top } = boards.get(f.id)!, rule = ruleOf(f), uStar = rule.u(top, p);
    const sp = { key: (s: GridState) => s.cells.join(""), u: (s: GridState) => rule.u(s, p), moves: function* () {}, surprise: () => 0,
      name: (x: GridState, t: GridState) => x.cells.reduce((n, c, i) => n + (c === t.cells[i] ? 0 : 13), 0) };
    for (const x of gridStarts(grid4, 4, "cand")) {
      const without = startCost(x, top, uStar, sp, []), cands = rule.candidates?.(x, uStar, p) ?? [];
      const withC = startCost(x, top, uStar, sp, [...cands, top, { cells: top.cells.map(c => (c + 1) % 10) }]);
      assert.ok(withC.cost <= without.cost + 1e-9, `${f.id}: ${withC.cost} > ${without.cost}`);
    }
  }
});

test("spread: repeat estimates of a climbed board vary by about 5% (sd over 8 seeds), and each takes well under 100 ms (about 30 ms alone; CI runs suites side by side)", () => {
  const sds: number[] = [], times: number[] = [];
  for (const f of dynamicGridFamilies) {
    const { p, top } = boards.get(f.id)!, rule = ruleOf(f);
    estimateGrid(top, rule, p, grid4, { seed: "warm" });
    const t0 = performance.now(), es = Array.from({ length: 8 }, (_, i) => estimateGrid(top, rule, p, grid4, { seed: `s${i}` }).energy);
    times.push((performance.now() - t0) / 8);
    const m = es.reduce((t, x) => t + x, 0) / es.length, sd = Math.sqrt(es.reduce((t, x) => t + (x - m) ** 2, 0) / (es.length - 1));
    sds.push(sd / m);
    assert.ok(sd / m < 0.1, `${f.id}: sd ${(100 * sd / m).toFixed(1)}% of ${m.toFixed(1)}`);
  }
  const meanSd = sds.reduce((t, x) => t + x, 0) / sds.length;
  assert.ok(meanSd < 0.06, `mean sd ${(100 * meanSd).toFixed(1)}%`);
  assert.ok(Math.max(...times) < 90, `ms per estimate: ${times.map(t => t.toFixed(0)).join(" ")}`);
  console.log(`grid energy: mean sd ${(100 * meanSd).toFixed(1)}%, ms per estimate ${times.map(t => t.toFixed(0)).join(" ")}`);
});
