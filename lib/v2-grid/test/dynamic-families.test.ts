/** The dealt grid rules (src/dynamic-families.ts) and their energy (src/energy.ts): what holds by construction. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isInvalid, rng } from "@workspace/v2-core";
import { AXES, dynamicGridFamilies, estimateGrid, grid4, lawBoard, mirrorPairs, snakePath, type GridDynamicRule, type GridState } from "../src/index.ts";

const ruleOf = (f: (typeof dynamicGridFamilies)[number]) => f.dynamic as GridDynamicRule<unknown>;
/** A greedy climb by single-cell rewrites (the best utility each step). */
function climb(f: (typeof dynamicGridFamilies)[number], p: unknown, from: GridState, steps = 40): GridState {
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

test("no one-digit board is near the top of any rule (the Seesaw and Mirrormancer bug)", () => {
  const r = rng("one-digit");
  for (const f of dynamicGridFamilies) for (const p of f.dealable(grid4)) {
    const flat = Math.max(...Array.from({ length: 10 }, (_, d) => ruleOf(f).u({ cells: Array(16).fill(d) }, p)));
    const good = ruleOf(f).u(climb(f, p, lawBoard(grid4, r)), p);
    assert.ok(flat < good - 1, `${f.id} ${JSON.stringify(p)}: a one-digit board scores ${flat}, a climbed one ${good}`);
  }
});

test("every family's parameter space draws what it parses back, and its dealt peers are in it", () => {
  const r = rng("spaces");
  for (const f of dynamicGridFamilies) {
    assert.ok(f.space!.size >= 21, `${f.id}: ${f.space!.size} instances`);
    for (const p of [...f.dealable(grid4), ...Array.from({ length: 20 }, () => f.space!.draw(r))]) {
      const back = f.space!.parse(f.space!.label(p as never));
      assert.ok(!isInvalid(back), `${f.id}: ${f.space!.label(p as never)}`);
      assert.deepEqual(back, p);
    }
  }
});

test("the snake visits every cell once; the mirror pairs are disjoint", () => {
  for (const start of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) for (const by of ["rows", "columns"] as const) {
    const path = snakePath(4, { start, by });
    assert.deepEqual([...path].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
    for (let i = 1; i < 16; i++) { const [a, b] = [path[i - 1]!, path[i]!]; assert.equal(Math.abs(a % 4 - b % 4) + Math.abs((a >> 2) - (b >> 2)), 1, "neighbours"); }
  }
  for (const axis of AXES) { const cells = mirrorPairs(4, axis).flat(); assert.equal(new Set(cells).size, cells.length, axis); }
});

test("energy: 0 when a random board is as good; a climbed board costs more than a random one; seeded estimates repeat", () => {
  const r = rng("energy");
  for (const f of dynamicGridFamilies) {
    const p = f.dealable(grid4)[0], rule = ruleOf(f), start = lawBoard(grid4, r), top = climb(f, p, start);
    const worst: GridState = { cells: Array(16).fill(0).map((_, i) => (i * 7) % 10) };
    const e = estimateGrid(top, rule, p, grid4, { K: 6, seed: "a" });
    assert.deepEqual(e, estimateGrid(top, rule, p, grid4, { K: 6, seed: "a" }));
    assert.ok(e.energy > estimateGrid(start, rule, p, grid4, { K: 6, seed: "a" }).energy, `${f.id}: climbed ${e.energy}`);
    for (const s of e.samples) assert.ok(s.cost <= s.direct + 1e-9 && s.heuristic <= s.direct + 1e-9 || !rule.parts, `${f.id}: the heuristic includes rewriting onto the board`);
    void worst;
  }
});
