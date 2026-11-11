/**
 * Cost models (src/structure/index.ts; docs/mutation-cost-design.md §0, §2, §5.5): "set-v1" (today's overwrite prices,
 * which must not move by one bit) and "distance-v1" (a digit pays for how far it moved; a colour or suit for having
 * changed; nothing is erased), and the slider mutator `add`.
 *
 * Every expectation is derived by hand in the comment beside it, from
 *   w(a → b) = log2(cells) + log2(families) + argBits + erasedBits,      energy = W + 0.05·W².
 * λ is the Kraft root of the slider's argument space {±1 … ±(n − 1)}: 2·Σ_{k=1..n−1} x^k = 1 with x = 2^(−λ). The
 * infinite sum gives x = 1/3, λ = log2 3 = 1.58496; cutting it at n − 1 = 9 lowers λ by about 5e-5 (to 1.58491).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLOUR_COMPONENTS, COST_MODELS, GRID, NOISE_VERSION, SYMBOL_COMPONENTS, changeCost, effectWork, generatorOf,
  gridCostTable, gridElementaryCosts, gridFamilies, kraftRate, layerSize, noise, noiseStep, noiseVersion, seededRng,
  sha256, siteWork,
  type CostModel, type Generator, type GridValue, type Instantiation, type TypeArgs,
} from "../src/index.ts";
import { applyCalls } from "../src/mutators.ts";
import { chiCritical, chiSquare } from "./helpers.ts";

const L3 = Math.log2(3);                       // 1.58496
const D: CostModel = "distance-v1", S1: CostModel = "set-v1", P: CostModel = "proportional-v1";
/** The models whose price is a metric on values (symmetric, subadditive, a complete code). multiply-v1 is not: it erases. */
const METRIC_MODELS = COST_MODELS.filter(m => m !== "multiply-v1");
const ALL: Instantiation[] = GRID.representatives().map((a: TypeArgs) => GRID.instantiate(a));
const grid = (size: number, symbols: string, colours: string) => GRID.instantiate({ size, symbols, colours });
const mono4 = grid(4, "base10", "mono"), rgb4 = grid(4, "base10", "rgb"), cards7 = grid(7, "cards", "rgb"), cards3 = grid(3, "cards", "rgb");
const near = (a: number, b: number, tol: number, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

/** A board from its symbols (row-major) and, optionally, colours. */
function board(inst: Instantiation, sym: number[], col?: number[]): GridValue {
  const size = inst.args.size as number;
  assert.equal(sym.length, size * size);
  return { size, sym: Uint8Array.from(sym), col: Uint8Array.from(col ?? sym.map(() => 0)) };
}
const flat = (inst: Instantiation, s: number, c = 0) => board(inst, Array((inst.args.size as number) ** 2).fill(s), Array((inst.args.size as number) ** 2).fill(c));
/** One act through the real applyCalls. */
function act(inst: Instantiation, g: GridValue, calls: unknown[], model?: CostModel) {
  const codec = GRID.codec(inst);
  const out = model === undefined ? applyCalls(GRID, inst, codec.encode(g), JSON.stringify(calls)) : applyCalls(GRID, inst, codec.encode(g), JSON.stringify(calls), model);
  return { out, after: out.ok ? codec.decode(out.value) : null };
}
const work = (inst: Instantiation, g: GridValue, calls: unknown[], model?: CostModel): number => {
  const { out } = act(inst, g, calls, model);
  assert.ok(out.ok, `${JSON.stringify(calls)}: ${out.ok ? "" : out.reason}`);
  return out.cost.work;
};
const cell = (r: number, c: number) => ({ kind: "cell", region: [r, c] });
const row = (r: number) => ({ kind: "line", region: [0, r] });
const add = (where: object, k: number) => ["add", { ...where, k }];
const families = (inst: Instantiation, model: CostModel) => gridFamilies(inst, model);
const family = (inst: Instantiation, model: CostModel, id: string) => {
  const fams = families(inst, model), f = fams.find(x => x.id === id);
  assert.ok(f, `${inst.key} ${model} has no ${id} family`);
  return { f: f!, n: fams.length };
};

// ------------------------------------------------------------------------------------------------
// the structure
// ------------------------------------------------------------------------------------------------

test("λ: the slider's Kraft root is log2 3 less the truncation; a categorical layer's is log2(n − 1)", () => {
  // 2·Σ_{k≥1} (1/3)^k = 1, so the untruncated root is log2 3. Truncating at 9 steps: 1 − 3^−9 at x = 1/3, and the slope
  // of the sum there is 2/(1 − x)² = 4.5, so x rises by 5.08e-5/4.5 = 1.13e-5 and λ falls by 1.13e-5/(x·ln 2) = 4.9e-5.
  const lam = kraftRate([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k]));
  assert.ok(lam < L3 && L3 - lam < 1e-4, `${lam}`);
  near(L3 - lam, 4.9e-5, 2e-6, "the truncation");
  near(generatorOf({ kind: "ordinal", n: 10 }, D)!.rate, lam, 1e-12);
  // n − 1 arguments, each one step: (n − 1)·2^(−λ) = 1.
  near(kraftRate([1, 1]), 1, 1e-12, "rgb");                       // log2 2
  near(kraftRate([1, 1, 1]), L3, 1e-12, "suits, rgby");           // log2 3
  near(kraftRate([1, 1, 1, 1, 1]), Math.log2(5), 1e-12, "rainbow6");
  assert.equal(kraftRate([1]), 0);                                 // one argument needs no bits
  // A dial of 10: distances 1,1,2,2,3,3,4,4,5 (one way to the far side). docs §2 table: 1.577.
  near(generatorOf({ kind: "cyclic", n: 10 }, D)!.rate, 1.577, 5e-4, "dial");
  assert.equal(generatorOf({ kind: "unit" }, D), null);
  assert.equal(generatorOf({ kind: "categorical", n: 1 }, S1), null);
});

test("the families: set-v1 has symbol and colour; distance-v1 has rank, suit (cards) and colour; one value is no family", () => {
  const ids = (inst: Instantiation, m: CostModel) => families(inst, m).map(f => `${f.id}:${f.generator.id}:${f.generator.layer.kind}:${layerSize(f.generator.layer)}`);
  assert.deepEqual(ids(mono4, S1), ["symbol:set:categorical:10"]);
  assert.deepEqual(ids(mono4, D), ["rank:add:ordinal:10"]);
  assert.deepEqual(ids(rgb4, S1), ["symbol:set:categorical:10", "colour:set:categorical:3"]);
  assert.deepEqual(ids(rgb4, D), ["rank:add:ordinal:10", "colour:set:categorical:3"]);
  assert.deepEqual(ids(cards7, S1), ["symbol:set:categorical:52", "colour:set:categorical:3"]);
  assert.deepEqual(ids(cards7, D), ["rank:add:ordinal:13", "suit:set:categorical:4", "colour:set:categorical:3"]);
  assert.deepEqual(ids(grid(3, "cards", "mono"), D), ["rank:add:ordinal:13", "suit:set:categorical:4"]);
  for (const inst of ALL) for (const m of COST_MODELS) for (const f of families(inst, m)) assert.equal(f.sites, (inst.args.size as number) ** 2);
  assert.ok(GRID.supportsCostModel!(mono4, D) && GRID.supportsCostModel!(mono4, S1));
});

// ------------------------------------------------------------------------------------------------
// §5.5 (1) the identity costs 0
// ------------------------------------------------------------------------------------------------

test("the identity costs 0: a site that stays, a board that stays, an act that changes nothing", () => {
  for (const inst of ALL) for (const m of COST_MODELS) {
    const fams = families(inst, m);
    for (const f of fams) for (let a = 0; a < layerSize(f.generator.layer); a++) {
      assert.equal(siteWork(f, fams.length, a, a), 0);
      assert.equal(f.generator.argBits(a, a), 0);
      assert.equal(f.generator.erasedBits(a, a), 0);
      assert.equal(f.generator.distance(a, a), 0);
    }
    const g = GRID.spawn(inst, seededRng(`id|${inst.key}`));
    assert.equal(effectWork(fams, g, g), 0);
    assert.equal(GRID.callWork(g, g, undefined, inst, m), 0);
  }
  // Writing the digit that is already there: the act fails with "no change" and is charged nothing, under both models.
  for (const m of [undefined, S1, D]) {
    const { out } = act(mono4, flat(mono4, 7), [["write", { ...cell(0, 0), symbol: 7 }]], m);
    assert.deepEqual([out.ok, out.ok ? "" : out.reason, out.cost.work, out.cost.total], [false, "no change", 0, 0]);
  }
  // +2 then −2 in one act nets nothing: no change (each call was a real move, but the act has no effect).
  const { out } = act(mono4, flat(mono4, 4), [add(cell(1, 1), 2), add(cell(1, 1), -2)], D);
  assert.deepEqual([out.ok, out.ok ? "" : out.reason, out.cost.total], [false, "no change", 0]);
});

// ------------------------------------------------------------------------------------------------
// the owner's table (docs §0): Grid(4, base10, mono), add on one cell
// ------------------------------------------------------------------------------------------------

test("Grid(4,base10,mono) distance-v1: add(cell, ±k) costs W = 4 + 1.585·|k|; set-v1 costs 16.3 whatever k", () => {
  // W = log2 16 (the cell) + log2 1 (one family) + λ·|k| = 4 + 1.585·|k|; energy = W + 0.05·W²:
  //   k   W       0.05·W²   energy
  //   1   5.585   1.560      7.1
  //   2   7.170   2.570      9.7
  //   3   8.755   3.832     12.6
  //   4  10.340   5.346     15.7
  //   5  11.925   7.110     19.0
  //   6  13.510   9.126     22.6
  //   7  15.095  11.393     26.5
  //   8  16.680  13.911     30.6
  //   9  18.265  16.681     34.9
  const energy = [7.1, 9.7, 12.6, 15.7, 19.0, 22.6, 26.5, 30.6, 34.9];
  // set-v1: W = 4 + 2·log2 10 = 10.644 (the cell, the new digit, the digit erased); energy = 10.644 + 5.665 = 16.3.
  const today = 16.3;
  for (let k = 1; k <= 9; k++) {
    for (const sign of [1, -1]) {
      const start = flat(mono4, sign > 0 ? 0 : 9), call = [add(cell(2, 1), sign * k)];
      const d = act(mono4, start, call, D);
      assert.ok(d.out.ok, `add ${sign * k}`);
      assert.equal(d.after!.sym[9], sign > 0 ? k : 9 - k);
      assert.equal(d.after!.sym.filter((s, i) => s !== start.sym[i]).length, 1);
      near(d.out.cost.work, 4 + 1.585 * k, 1e-3 * k, `W of add ${sign * k}`);
      near(d.out.cost.total, energy[k - 1], 0.06, `energy of add ${sign * k}`);
      near(d.out.cost.total, changeCost(d.out.cost.work), 1e-12);
      for (const m of [S1, undefined]) {
        const s = act(mono4, start, call, m);
        assert.ok(s.out.ok);
        assert.deepEqual(GRID.codec(mono4).encode(s.after!), GRID.codec(mono4).encode(d.after!), "the model changes the price, never the move");
        near(s.out.cost.work, 4 + 2 * Math.log2(10), 1e-9, `set-v1 W of add ${sign * k}`);
        near(s.out.cost.total, today, 0.05, `set-v1 energy of add ${sign * k}`);
      }
    }
  }
  // The cost table the texts show is the same nine rows.
  const rows = gridCostTable(mono4, D);
  assert.deepEqual(rows.map(r => r.move), [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `move a cell's number by ${k}`));
  rows.forEach((r, i) => near(r.work, 4 + 1.585 * (i + 1), 1e-3 * (i + 1), r.move));
  assert.deepEqual(gridCostTable(mono4, S1).map(r => r.move), ["change a cell's symbol"]);
  near(gridCostTable(mono4, S1)[0].work, 4 + 2 * Math.log2(10), 1e-9);
  near(GRID.costTable!(mono4)[0].work, 4 + 2 * Math.log2(10), 1e-9, "the model defaults to set-v1");
});

// ------------------------------------------------------------------------------------------------
// §5.5 (2) Kraft
// ------------------------------------------------------------------------------------------------

/** Every generator any Grid representative uses, per model. */
function generatorsOf(model: CostModel): Generator[] {
  const seen = new Set<Generator>();
  for (const inst of ALL) for (const f of families(inst, model)) seen.add(f.generator);
  return [...seen];
}
/** A pair of values at distance d (0 → d works for every layer: a slider's far end is n − 1 away). */
const argBitsAt = (g: Generator, d: number) => { assert.equal(g.distance(0, d), d); return g.argBits(0, d); };

test("Kraft per generator: the argument code claims at most 1, and exactly 1 under every distance model", () => {
  // set-v1 names the new value in log2 n bits: (n − 1)·(1/n) < 1 (the identity's slot is unused).
  // distance-v1: λ is the root, so the sum is 1. proportional-v1: the root for the generator's share of the board's
  // budget, 1/(cells × families) (its own test below sums the whole board to 1).
  assert.deepEqual(generatorsOf(S1).map(g => layerSize(g.layer)).sort((a, b) => a - b), [3, 4, 6, 10, 12, 16, 52]);
  assert.deepEqual(generatorsOf(D).map(g => `${g.layer.kind}${layerSize(g.layer)}`).sort(),
    ["categorical3", "categorical4", "categorical6", "ordinal10", "ordinal12", "ordinal13", "ordinal16"]);
  for (const m of METRIC_MODELS) for (const g of generatorsOf(m)) {
    const n = layerSize(g.layer), sum = g.argDistances.reduce((s, d) => s + 2 ** -argBitsAt(g, d), 0);
    const what = `${m} ${g.id} ${g.layer.kind} ${n}`;
    assert.ok(sum <= 1 + 1e-9, `${what}: ${sum}`);
    if (m !== S1) near(sum / g.mass, 1, 1e-6, what); else near(sum, (n - 1) / n, 1e-12, what);
    assert.equal(g.mass < 1, m === P, what);
    // the argument space is every non-identity argument: n − 1 values to set, or ±1 … ±(n − 1) on a slider
    assert.equal(g.argDistances.length, g.id === "add" ? 2 * (n - 1) : n - 1, what);
    if (m !== S1) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) assert.equal(g.erasedBits(a, b), 0, "a bijection erases nothing");
  }
});

test("Kraft for a whole one-cell board: every family and every argument, with ℓ_which, claims at most 1", () => {
  // With F families each tight, Σ_f 2^(−log2 F)·1 = 1 under distance-v1. Under set-v1 each argument also pays the
  // erasure: Σ_f (n_f − 1)/(F·n_f²) < 1. (proportional-v1 has no ℓ_which to add: its whole-board sum is tested below.)
  for (const inst of ALL) for (const m of METRIC_MODELS.filter(x => x !== P)) {
    const fams = families(inst, m);
    let sum = 0, closed = 0;
    for (const f of fams) {
      const n = layerSize(f.generator.layer);
      for (const d of f.generator.argDistances) sum += 2 ** -siteWork({ generator: f.generator, sites: 1 }, fams.length, 0, d);
      closed += (n - 1) / (fams.length * n * n);
    }
    assert.ok(sum <= 1 + 1e-9, `${inst.key} ${m}: ${sum}`);
    if (m !== S1) near(sum, 1, 1e-6, `${inst.key} ${m}`); else near(sum, closed, 1e-12, `${inst.key} ${m}`);
  }
  // On the real board the cell's log2 N² spreads the same budget over the cells: Σ over cells and arguments is still 1.
  const fams = families(mono4, D);
  let sum = 0;
  for (let i = 0; i < 16; i++) for (const d of fams[0].generator.argDistances) sum += 2 ** -siteWork(fams[0], 1, 0, d);
  near(sum, 1, 1e-6, "4×4 mono");
});

// ------------------------------------------------------------------------------------------------
// §5.5 (4) monotone, (5) symmetric and invariant, (6) subadditive
// ------------------------------------------------------------------------------------------------

test("monotone in the declared distance: a farther move on the slider always costs more, by λ a step", () => {
  for (const inst of [mono4, rgb4, cards7, grid(5, "base16", "rainbow6")]) {
    const { f, n } = family(inst, D, "rank"), R = layerSize(f.generator.layer);
    for (let k = 1; k < R - 1; k++) {
      near(siteWork(f, n, 0, k + 1) - siteWork(f, n, 0, k), f.generator.rate, 1e-9, `${inst.key} step ${k}`);
      assert.ok(siteWork(f, n, 0, k + 1) > siteWork(f, n, 0, k));
    }
    // and, in general, cost is a non-decreasing function of the distance for every family
    for (const fam of families(inst, D)) {
      const N = layerSize(fam.generator.layer), pairs: [number, number][] = [];
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) pairs.push([fam.generator.distance(a, b), siteWork(fam, n, a, b)]);
      pairs.sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i][1] >= pairs[i - 1][1] - 1e-12, `${inst.key} ${fam.id}`);
    }
  }
  // set-v1 is flat in the distance: 0 → 1 costs what 0 → 9 costs.
  const s = family(mono4, S1, "symbol");
  assert.equal(siteWork(s.f, s.n, 0, 1), siteWork(s.f, s.n, 0, 9));
});

test("symmetric: +k costs what −k costs, and a → b what b → a", () => {
  for (const inst of ALL) for (const m of METRIC_MODELS) {
    const fams = families(inst, m);
    for (const f of fams) {
      const n = layerSize(f.generator.layer);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) assert.equal(siteWork(f, fams.length, a, b), siteWork(f, fams.length, b, a), `${inst.key} ${m} ${f.id} ${a}↔${b}`);
    }
  }
  // Through real acts, from a 5: +3 (to 8) and −3 (to 2) cost the same, 4 + 3λ = 8.755; and 8 → 5 costs what 5 → 8 did.
  const up = work(mono4, flat(mono4, 5), [add(cell(0, 0), 3)], D), down = work(mono4, flat(mono4, 5), [add(cell(0, 0), -3)], D);
  const back = work(mono4, flat(mono4, 8), [add(cell(0, 0), -3)], D);
  assert.equal(up, down);
  assert.equal(up, back);
  near(up, 8.755, 1e-3);
});

test("translation invariant on the slider: a move of k costs the same wherever it starts", () => {
  for (const inst of [mono4, cards7, grid(6, "base12", "rgby")]) {
    const { f, n } = family(inst, D, "rank"), R = layerSize(f.generator.layer);
    for (let k = 1; k < R; k++) for (let a = 0; a + k < R; a++) assert.equal(siteWork(f, n, a, a + k), siteWork(f, n, 0, k), `${inst.key} ${a}+${k}`);
  }
  // Through real acts: 0 → 2, 3 → 5 and 7 → 9 all cost 4 + 2λ = 7.170.
  const ws = [0, 3, 7].map(x => work(mono4, flat(mono4, x), [add(cell(3, 3), 2)], D));
  assert.equal(ws[0], ws[1]);
  assert.equal(ws[1], ws[2]);
  near(ws[0], 7.170, 1e-3);
});

test("relabelling invariant for categorical layers (colours, suits), and not for the slider", () => {
  // Any two different values are one step apart, so every permutation of the labels leaves every price as it was.
  for (const inst of ALL) for (const f of families(inst, D).filter(x => x.generator.layer.kind === "categorical")) {
    const n = layerSize(f.generator.layer), F = families(inst, D).length, w = siteWork(f, F, 0, 1);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) assert.equal(siteWork(f, F, a, b), w, `${inst.key} ${f.id} ${a}→${b}`);
  }
  // The negative test: the slider's order matters. Swapping the labels 1 and 9 turns 0 → 1 (one step) into 0 → 9 (nine).
  const { f, n } = family(mono4, D, "rank");
  assert.ok(siteWork(f, n, 0, 9) > siteWork(f, n, 0, 1) + 12);        // 8λ = 12.68 bits dearer
  // Real acts on Grid(4,base10,rgb): painting a red cell yellow or green, or a green cell red, costs the same 6 bits.
  const paint = (from: number, to: number) => work(rgb4, flat(rgb4, 4, from), [["paint", { ...cell(1, 2), colour: to }]], D);
  assert.deepEqual([paint(0, 1), paint(0, 2), paint(2, 0), paint(1, 2)], [6, 6, 6, 6]);
});

test("permuting cells: the same move costs the same in every cell", () => {
  const ws = new Set<number>();
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ws.add(work(mono4, flat(mono4, 3), [add(cell(r, c), 1)], D));
  assert.equal(ws.size, 1);
});

test("subadditive: one move a → c never costs more than a → b then b → c", () => {
  for (const inst of [mono4, rgb4, cards7]) for (const m of METRIC_MODELS) {
    const fams = families(inst, m);
    for (const f of fams) {
      const n = layerSize(f.generator.layer);
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++)
        assert.ok(siteWork(f, fams.length, a, c) <= siteWork(f, fams.length, a, b) + siteWork(f, fams.length, b, c) + 1e-12, `${inst.key} ${m} ${f.id} ${a}→${b}→${c}`);
    }
  }
  // Real acts on a 2: one add(+4) is 4 + 4λ = 10.34 bits; add(+2) twice in one act is 2·(4 + 2λ) = 14.34 (the cell is
  // named twice); going past and back, add(+6) then add(−2), is (4 + 6λ) + (4 + 2λ) = 20.68.
  const start = flat(mono4, 2), c = cell(0, 3);
  const one = work(mono4, start, [add(c, 4)], D), two = work(mono4, start, [add(c, 2), add(c, 2)], D), around = work(mono4, start, [add(c, 6), add(c, -2)], D);
  near(one, 10.34, 1e-2);
  near(two, 14.34, 1e-2);
  near(around, 20.68, 2e-2);
  assert.ok(one < two && two < around);
});

// ------------------------------------------------------------------------------------------------
// composites are priced by their net effect
// ------------------------------------------------------------------------------------------------

test("write(cell, v) on a digit x costs exactly add(cell, v − x) under distance-v1", () => {
  for (let x = 0; x < 10; x++) for (let v = 0; v < 10; v++) {
    if (v === x) continue;
    const start = flat(mono4, x), c = cell(1, 0);
    const w = act(mono4, start, [["write", { ...c, symbol: v }]], D), a = act(mono4, start, [add(c, v - x)], D);
    assert.ok(w.out.ok && a.out.ok, `${x} → ${v}`);
    assert.equal(GRID.codec(mono4).encode(w.after!), GRID.codec(mono4).encode(a.after!));
    assert.equal(w.out.cost.work, a.out.cost.work, `${x} → ${v}`);
    near(w.out.cost.work, 4 + 1.585 * Math.abs(v - x), 1e-3 * Math.abs(v - x));
  }
  // set-v1 does not care how far: every write that changes the digit is 4 + 2·log2 10.
  near(work(mono4, flat(mono4, 0), [["write", { ...cell(1, 0), symbol: 1 }]], S1), work(mono4, flat(mono4, 0), [["write", { ...cell(1, 0), symbol: 9 }]], S1), 0);
});

test("count_on wrapping 9 → 0 is nine steps on the slider, not one", () => {
  // step_rank wraps (9 + 1 = 0); the slider does not, so its net effect 9 → 0 is priced 4 + 9λ = 18.265, like add(−9).
  const wrap = act(mono4, flat(mono4, 9), [["step_rank", { ...cell(0, 0), k: 1 }]], D);
  assert.ok(wrap.out.ok);
  assert.equal(wrap.after!.sym[0], 0);
  near(wrap.out.cost.work, 18.265, 1e-2);
  assert.equal(wrap.out.cost.work, work(mono4, flat(mono4, 9), [add(cell(0, 0), -9)], D));
  // Without the wrap it is one step: 3 → 4 costs 4 + λ = 5.585, like add(+1).
  const plain = work(mono4, flat(mono4, 3), [["step_rank", { ...cell(0, 0), k: 1 }]], D);
  near(plain, 5.585, 1e-3);
  assert.equal(plain, work(mono4, flat(mono4, 3), [add(cell(0, 0), 1)], D));
  // A row 7, 8, 9, 0 counted on by 1 becomes 8, 9, 0, 1: three single steps and one wrap, 4·4 + (1 + 1 + 9 + 1)·λ = 35.02.
  const g = board(mono4, [7, 8, 9, 0, ...Array(12).fill(5)]);
  near(work(mono4, g, [["step_rank", { ...row(0), k: 1 }]], D), 16 + 12 * 1.585, 2e-2);
});

test("add on an area is the sum of its cells: add(row, +2) costs 4 × one cell's +2", () => {
  const start = board(mono4, [0, 1, 2, 3, 4, 5, 6, 7, 0, 3, 5, 7, 1, 1, 1, 1]);
  const one = work(mono4, start, [add(cell(2, 0), 2)], D);
  const line = act(mono4, start, [add(row(2), 2)], D);
  assert.ok(line.out.ok);
  assert.deepEqual([...line.after!.sym], [0, 1, 2, 3, 4, 5, 6, 7, 2, 5, 7, 9, 1, 1, 1, 1]);
  near(line.out.cost.work, 4 * one, 1e-9);
  near(line.out.cost.work, 4 * (4 + 2 * 1.585), 1e-2);                 // 28.68
  // the whole board by −1: 16 cells × (4 + λ) = 89.36
  const all = act(mono4, flat(mono4, 5), [["add", { kind: "all", k: -1 }]], D);
  assert.ok(all.out.ok);
  assert.ok(all.after!.sym.every(s => s === 4));
  near(all.out.cost.work, 16 * (4 + 1.585), 1e-2);
});

// ------------------------------------------------------------------------------------------------
// the add mutator
// ------------------------------------------------------------------------------------------------

test("add never wraps: out of range the act fails and nothing is charged, on a cell and on an area", () => {
  const fails = (inst: Instantiation, g: GridValue, call: unknown, model: CostModel) => {
    const { out } = act(inst, g, [call], model);
    assert.equal(out.ok, false, JSON.stringify(call));
    assert.match(out.ok ? "" : out.reason, /^call 1 \(add\) cannot apply to this object$/);
    assert.deepEqual(out.cost, { work: 0, total: 0 });
  };
  for (const m of COST_MODELS) {
    fails(mono4, flat(mono4, 9), add(cell(0, 0), 1), m);               // 9 + 1 does not fit
    fails(mono4, flat(mono4, 0), add(cell(0, 0), -1), m);              // 0 − 1 does not fit
    fails(mono4, flat(mono4, 5), add(cell(0, 0), 5), m);               // 5 + 5 = 10
    fails(mono4, flat(mono4, 5), add(cell(0, 0), -6), m);
    // one cell of the row would leave the range: the whole call fails, the other three are not moved
    const g = board(mono4, [1, 2, 9, 3, ...Array(12).fill(4)]);
    fails(mono4, g, add(row(0), 1), m);
    fails(mono4, g, add(row(0), -2), m);                               // the 1 would go to −1
    fails(mono4, g, ["add", { kind: "all", k: 1 }], m);
    // a failed call fails the whole act, even after a call that worked
    const { out } = act(mono4, g, [add(row(1), 1), add(row(0), 1)], m);
    assert.deepEqual([out.ok, out.ok ? "" : out.reason, out.cost.total], [false, "call 2 (add) cannot apply to this object", 0]);
  }
  // exactly at the edge it fits: 9 − 9 = 0 and 0 + 9 = 9
  assert.equal(act(mono4, flat(mono4, 9), [add(cell(0, 0), -9)], D).after!.sym[0], 0);
  assert.equal(act(mono4, flat(mono4, 0), [add(cell(0, 0), 9)], D).after!.sym[0], 9);
  // the wire accepts k in ±1 … ±(R − 1) only
  for (const k of [0, 10, -10, 1.5, "1", null]) {
    const { out } = act(mono4, flat(mono4, 5), [add(cell(0, 0), k as number)], D);
    assert.equal(out.ok, false, `k = ${k}`);
    assert.match(out.ok ? "" : out.reason, /^call 1 \(add\): /);
  }
  assert.equal(act(grid(4, "base16", "mono"), flat(mono4, 0), [add(cell(0, 0), 15)], D).after!.sym[0], 15);
});

test("add works on cards and keeps the suit; the king does not roll over into the next suit", () => {
  // cards are suit·13 + rank: 0 = A♠ … 12 = K♠, 13 = A♥ … 25 = K♥.
  const g = board(cards3, [0, 12, 13, 24, 25, 30, 40, 51, 5]);
  const up = act(cards3, g, [add(cell(1, 0), 1)], D);                   // Q♥ → K♥
  assert.equal(up.after!.sym[3], 25);
  const down = act(cards3, g, [add(cell(2, 0), -1)], D);                // 2♣ (39 + 1) → A♣
  assert.equal(down.after!.sym[6], 39);
  for (const [c, k] of [[cell(0, 1), 1], [cell(1, 1), 1], [cell(0, 0), -1], [cell(0, 2), -1], [cell(2, 1), 1]] as const) {
    const { out } = act(cards3, g, [add(c, k)], D);                     // K♠ + 1, K♥ + 1, A♠ − 1, A♥ − 1, K♣ + 1
    assert.equal(out.ok, false, JSON.stringify([c, k]));
  }
  // a column of 5♥, 6♥, 4♦ (17, 18, 29) by +7: Q♥, K♥, J♦; by +8 the 6♥ would pass the king
  const col = board(cards3, [17, 0, 0, 18, 0, 0, 29, 0, 0]), where = { kind: "line", region: [1, 0] };
  const ok = act(cards3, col, [add(where, 7)], D);
  assert.deepEqual([ok.after!.sym[0], ok.after!.sym[3], ok.after!.sym[6]], [24, 25, 36]);
  const S = SYMBOL_COMPONENTS.cards;
  for (const i of [0, 3, 6]) assert.equal(S.suits![ok.after!.sym[i]], S.suits![col.sym[i]]);
  assert.equal(act(cards3, col, [add(where, 8)], D).out.ok, false);
  // k reaches ±12 on cards (A → K)
  assert.equal(act(cards3, flat(cards3, 13), [add(cell(0, 0), 12)], D).after!.sym[0], 25);
  assert.equal(act(cards3, flat(cards3, 13), [add(cell(0, 0), 13)], D).out.ok, false);
});

test("add under set-v1 is a composite priced as symbol sets, like any other symbol change", () => {
  // Each changed cell is one "set a symbol": 4 + 2·log2 10 = 10.644 on the mono board, whatever the amount.
  const start = board(mono4, [0, 1, 2, 3, ...Array(12).fill(5)]);
  for (const k of [1, 2, 6]) for (const m of [S1, undefined]) near(work(mono4, start, [add(row(0), k)], m), 4 * (4 + 2 * Math.log2(10)), 1e-9, `row +${k}`);
  near(work(mono4, start, [add(cell(0, 0), 9)], S1), 10.643856189774725, 1e-9);
  // coloured 5×5: 1 (symbol or colour) + log2 25 + 2·log2 10 = 12.288 per cell
  const inst5 = grid(5, "base10", "rgby");
  near(work(inst5, flat(inst5, 3, 2), [add({ kind: "line", region: [1, 4] }, -3)], S1), 5 * (1 + Math.log2(25) + 2 * Math.log2(10)), 1e-9);
  // and it costs exactly what a write with the same effect costs
  assert.equal(work(mono4, flat(mono4, 3), [add(cell(2, 2), 4)], S1), work(mono4, flat(mono4, 3), [["write", { ...cell(2, 2), symbol: 7 }]], S1));
});

// ------------------------------------------------------------------------------------------------
// coloured boards and cards under distance-v1
// ------------------------------------------------------------------------------------------------

test("Grid(4,base10,rgb) distance-v1: a digit ±1 is 1 + 4 + λ = 6.585, a colour change 1 + 4 + log2 2 = 6.00, no erasure", () => {
  // two families (rank, colour): ℓ_which = 1 bit; 16 cells: 4 bits.
  const start = flat(rgb4, 4, 1);
  near(work(rgb4, start, [add(cell(0, 0), 1)], D), 1 + 4 + 1.585, 1e-3);
  near(work(rgb4, start, [add(cell(0, 0), -1)], D), 1 + 4 + 1.585, 1e-3);
  assert.equal(work(rgb4, start, [["paint", { ...cell(0, 0), colour: 0 }]], D), 6);
  assert.equal(work(rgb4, start, [["paint", { ...cell(0, 0), colour: 2 }]], D), 6);
  // set-v1 for the same paint: 1 + 4 + 2·log2 3 = 8.17 (new colour named, old colour erased)
  near(work(rgb4, start, [["paint", { ...cell(0, 0), colour: 2 }]], S1), 5 + 2 * L3, 1e-9);
  // a row painted: 4 × 6; a cell whose digit and colour both change pays both: 6 + (5 + 3λ) = 15.755
  assert.equal(work(rgb4, start, [["paint", { ...row(3), colour: 2 }]], D), 24);
  near(work(rgb4, start, [["paint", { ...cell(0, 0), colour: 2 }], add(cell(0, 0), 3)], D), 6 + 5 + 3 * 1.585, 1e-2);
  // rgby: log2(4 − 1) = 1.585; rainbow6: log2 5 = 2.32
  const y = grid(4, "base10", "rgby"), r6 = grid(4, "base10", "rainbow6");
  near(work(y, flat(y, 0, 0), [["paint", { ...cell(0, 0), colour: 3 }]], D), 5 + L3, 1e-9);
  near(work(r6, flat(r6, 0, 0), [["paint", { ...cell(0, 0), colour: 5 }]], D), 5 + Math.log2(5), 1e-9);
  for (const f of families(rgb4, D)) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) assert.equal(f.generator.erasedBits(a, b), 0);
  // the cost table: nine number rows and one colour row
  const rows = gridCostTable(rgb4, D);
  assert.equal(rows.length, 10);
  assert.deepEqual([rows[9].move, rows[9].work], ["change a cell's colour", 6]);
});

test("Grid(7,cards,rgb) distance-v1: a rank ±1 is log2 49 + log2 3 + λ = 8.78; a suit change is 8.78 too", () => {
  // three families (rank, suit, colour): ℓ_which = log2 3 = 1.585; 49 cells: 5.615; rank ±1: λ = 1.585;
  // a suit change: log2(4 − 1) = 1.585; a colour change: log2(3 − 1) = 1. So 8.785, 8.785 and 8.200.
  const start = flat(cards7, 13 + 4, 0);                                  // 5♥ everywhere, red
  const c = cell(3, 3);
  near(work(cards7, start, [add(c, 1)], D), 8.78, 6e-3);
  near(work(cards7, start, [add(c, -1)], D), 8.78, 6e-3);
  near(work(cards7, start, [add(c, 1)], D), Math.log2(49) + L3 + L3, 1e-4);
  // 5♥ → 5♣ (39 + 4): the suit alone
  const suit = work(cards7, start, [["write", { ...c, symbol: 39 + 4 }]], D);
  near(suit, Math.log2(49) + L3 + L3, 1e-12);
  near(suit, 8.78, 6e-3);
  // every other suit costs the same (categorical), also through suit_set on a row: 7 × 8.785
  near(work(cards7, start, [["write", { ...c, symbol: 4 }]], D), suit, 0);
  near(work(cards7, start, [["suit_set", { ...row(2), suit: 3 }]], D), 7 * suit, 1e-9);
  // 5♥ → 8♣: rank by 3 and the suit, two sites of one cell: (7.2 + 3λ) + (7.2 + 1.585) = 20.74
  near(work(cards7, start, [["write", { ...c, symbol: 39 + 7 }]], D), 2 * (Math.log2(49) + L3) + 3 * 1.585 + L3, 1e-2);
  // a colour: 5.615 + 1.585 + 1 = 8.20
  near(work(cards7, start, [["paint", { ...c, colour: 1 }]], D), Math.log2(49) + L3 + 1, 1e-12);
  // set-v1: one symbol family of 52: 1 + log2 49 + 2·log2 52 = 18.02, for a rank step and for a suit change alike
  near(work(cards7, start, [add(c, 1)], S1), 1 + Math.log2(49) + 2 * Math.log2(52), 1e-9);
  near(work(cards7, start, [["write", { ...c, symbol: 39 + 4 }]], S1), 1 + Math.log2(49) + 2 * Math.log2(52), 1e-9);
});

// ------------------------------------------------------------------------------------------------
// set-v1 is today's prices, bit for bit
// ------------------------------------------------------------------------------------------------

/** The elementary costs as they were before cost models (grid/index.ts at 9e44c70), copied literally. */
function oldElementaryCosts(inst: Instantiation): { colour: number; symbol: number } {
  const size = inst.args.size as number, cellBits = Math.log2(size * size);
  const C = COLOUR_COMPONENTS[inst.args.colours as "rgb"].count, S = SYMBOL_COMPONENTS[inst.args.symbols as "base10"].count;
  const op = Math.log2((C > 1 ? 1 : 0) + (S > 1 ? 1 : 0));
  return { colour: C > 1 ? op + cellBits + 2 * Math.log2(C) : Infinity, symbol: op + cellBits + 2 * Math.log2(S) };
}
/** callWork as it was before cost models, copied literally. */
function oldCallWork(a: GridValue, b: GridValue, inst: Instantiation): number {
  const w = oldElementaryCosts(inst);
  let ds = 0, dc = 0;
  for (let i = 0; i < a.sym.length; i++) { if (a.sym[i] !== b.sym[i]) ds++; if (a.col[i] !== b.col[i]) dc++; }
  return (dc ? dc * w.colour : 0) + ds * w.symbol;
}

test("set-v1 regression: gridElementaryCosts is the old closed form in every Grid representative", () => {
  assert.equal(ALL.length, 80);
  for (const inst of ALL) {
    const w = gridElementaryCosts(inst), old = oldElementaryCosts(inst);
    assert.equal(w.colour, old.colour, `${inst.key} colour`);
    assert.equal(w.symbol, old.symbol, `${inst.key} symbol`);
    if (inst.args.colours === "mono") assert.equal(w.colour, Infinity);
  }
});

test("set-v1 regression: callWork (model omitted, and \"set-v1\") is the old formula on random before/after pairs", () => {
  let pairs = 0;
  for (const inst of ALL) {
    const rng = seededRng(`set-v1|${inst.key}`);
    for (let k = 0; k < 12; k++) {
      const x = GRID.spawn(inst, rng), far = GRID.spawn(inst, rng);
      // a pair that differs almost everywhere, and one that differs in a few cells (a symbol, or a symbol and a colour)
      const nearby = { size: x.size, sym: x.sym.slice(), col: x.col.slice() };
      for (let j = 1 + rng.int(4); j > 0; j--) { const i = rng.int(x.sym.length); nearby.sym[i] = far.sym[i]; if (rng.int(2)) nearby.col[i] = far.col[i]; }
      for (const y of [far, nearby]) {
        const old = oldCallWork(x, y, inst);
        assert.equal(GRID.callWork(x, y, undefined, inst), old, `${inst.key} (model omitted)`);
        assert.equal(GRID.callWork(x, y, undefined, inst, S1), old, `${inst.key} set-v1`);
        pairs++;
      }
    }
  }
  assert.equal(pairs, 80 * 24);
});

test("set-v1 regression: a real act is charged the old price, with the model omitted or named", () => {
  const inst5 = grid(5, "base10", "rgby"), rng = seededRng("set-v1 acts"), codec = GRID.codec(inst5);
  let acts = 0;
  for (const m of GRID.mutators) for (let s = 0; s < 6; s++) {
    const v = GRID.spawn(inst5, rng);
    let p: unknown;
    try { p = m.sample(rng, inst5); } catch { continue; }
    const a = applyCalls(GRID, inst5, codec.encode(v), [[m.id, p]]), b = applyCalls(GRID, inst5, codec.encode(v), [[m.id, p]], S1);
    assert.deepEqual(a, b, m.id);
    if (!a.ok) continue;
    const W = oldCallWork(v, codec.decode(a.value), inst5);
    assert.equal(a.cost.work, W, `${m.id} ${JSON.stringify(p)}`);
    assert.equal(a.cost.total, W + 0.05 * W * W, m.id);
    acts++;
  }
  assert.ok(acts > 80, `${acts}`);
});

// ------------------------------------------------------------------------------------------------
// §5.5 (9) noise
// ------------------------------------------------------------------------------------------------

test("noise versions: set-v1 keeps the old version string; distance-v1 has its own", () => {
  assert.equal(NOISE_VERSION, "noise-v1|beta=0.05");
  assert.equal(noiseVersion(), NOISE_VERSION);
  assert.equal(noiseVersion(S1), NOISE_VERSION);
  assert.notEqual(noiseVersion(D), NOISE_VERSION);
  assert.equal(noiseVersion(D), "noise-v1|beta=0.05|cost=distance-v1");
});

test("set-v1 noise is what it was: the same boards as before cost models, with the model omitted or named", () => {
  // sha256 of the board after 200 noise steps, recorded from the code before cost models (commit 9e44c70):
  //   x = spawn(seededRng(`cost-models|${key}`)); noise(inst, x, 200, seededRng(`cost-models-noise|${key}`))
  const before: Record<string, string> = {
    "Grid(4,base10,mono)": "83a541b3a9ac813416eed03e8f376f350a9fb9f123f31f848e2d80beb5a07ffd",
    "Grid(5,base10,rgby)": "7dcd6a5bb923782893966bbdba4db422df72b379067e22b883a9db7292b03636",
    "Grid(7,cards,rainbow6)": "e4a6dab4e046eb826e513fa7729bc85b92b8cd37b2cd9c2ca1fb0a3b113d7017",
  };
  for (const inst of [mono4, grid(5, "base10", "rgby"), grid(7, "cards", "rainbow6")]) {
    const codec = GRID.codec(inst), x = GRID.spawn(inst, seededRng(`cost-models|${inst.key}`));
    const run = (...model: CostModel[]) => codec.encode(noise(inst, x, 200, seededRng(`cost-models-noise|${inst.key}`), ...model));
    assert.equal(sha256(run() as string), before[inst.key], inst.key);
    assert.equal(run(S1), run(), inst.key);
    assert.notEqual(run(D), run(), `${inst.key}: distance-v1 draws from another distribution`);
  }
  // every representative: naming set-v1 changes nothing
  for (const inst of ALL) {
    const x = GRID.spawn(inst, seededRng(`n|${inst.key}`)), codec = GRID.codec(inst);
    assert.equal(codec.encode(noise(inst, x, 40, seededRng("same"))), codec.encode(noise(inst, x, 40, seededRng("same"), S1)), inst.key);
  }
  assert.equal(noiseStep(mono4), noiseStep(mono4, S1));
  assert.notEqual(noiseStep(mono4), noiseStep(mono4, D));
});

/** P(argument) = 2^(−C(W))/Z over the slider's arguments ±1 … ±(R − 1) (plus `others`, weights of other families). */
function sliderDistribution(location: number, R: number, others: number[] = []): { p: (k: number) => number; other: number[] } {
  const wt = (k: number) => 2 ** -changeCost(location + L3 * Math.abs(k));
  let Z = others.reduce((s, x) => s + x, 0);
  for (let k = 1; k < R; k++) Z += 2 * wt(k);
  return { p: k => wt(k) / Z, other: others.map(x => x / Z) };
}

test("distance-v1 noise on a middle digit: one cell, uniform, moved by k with probability 2^(−C(W_k))/Z", () => {
  // Grid(3,base10,mono), every cell a 5. W_k = log2 9 + λ·|k| (9 cells, one family), C = W + 0.05·W²:
  //   k = ±1: W = 4.755, C = 5.885;  ±2: 6.340, 8.350;  ±3: 7.925, 11.065;  ±4: 9.510, 14.032;  ±5: 11.095, 17.250; …
  // Z = 2·Σ_{k=1..9} 2^(−C_k) = 2·(0.016919 + 0.003065 + 0.000467 + 0.0000597 + …) = 0.04103, so
  //   P(±1) = 0.4124 each, P(±2) = 0.0747, P(±3) = 0.0114, P(±4) = 0.00146.
  // From a 5: −5 … +4 fit; +5 … +9 and −6 … −9 leave the range and leave the board as it is (about 7e-5 in all).
  const inst = grid(3, "base10", "mono"), start = flat(inst, 5), step = noiseStep(inst, D), rng = seededRng("distance noise");
  const dist = sliderDistribution(Math.log2(9), 10);
  near(dist.p(1), 0.4124, 5e-4);
  near(dist.p(2), 0.0747, 5e-4);
  near(dist.p(3), 0.0114, 2e-4);
  const n = 60000, byDelta = new Map<number, number>(), byCell = Array(9).fill(0);
  let unchanged = 0;
  for (let t = 0; t < n; t++) {
    const y = step(start, rng) as GridValue;
    assert.ok(y.col.every(c => c === 0), "a mono board never changes colour");
    const changed = [...y.sym.keys()].filter(i => y.sym[i] !== 5);
    assert.ok(changed.length <= 1, "one cell at most");
    if (!changed.length) { unchanged++; continue; }
    byCell[changed[0]]++;
    byDelta.set(y.sym[changed[0]] - 5, (byDelta.get(y.sym[changed[0]] - 5) ?? 0) + 1);
  }
  assert.ok(start.sym.every(s => s === 5), "the input is never mutated");
  for (let k = -5; k <= 4; k++) {
    if (k === 0) continue;
    const p = dist.p(k), f = (byDelta.get(k) ?? 0) / n;
    near(f, p, 5 * Math.sqrt(p * (1 - p) / n) + 1e-4, `P(${k})`);
  }
  assert.deepEqual([...byDelta.keys()].filter(k => k < -5 || k > 4 || k === 0), []);
  const out = dist.p(5) + 2 * [6, 7, 8, 9].reduce((s, k) => s + dist.p(k), 0);
  near(unchanged / n, out, 5 * Math.sqrt(out / n) + 1e-4, "out of range");
  assert.ok(chiSquare(byCell) < chiCritical(8), `cells: ${byCell}`);
});

test("distance-v1 noise at the ends of the slider: the half of the moves that leaves the range changes nothing", () => {
  // Every cell a 9: every +k (half of Z, by symmetry) cannot apply; every −k can. So exactly half the steps do nothing.
  const inst = grid(3, "base10", "mono"), step = noiseStep(inst, D);
  for (const [digit, sign] of [[9, -1], [0, 1]] as const) {
    const start = flat(inst, digit), rng = seededRng(`edge ${digit}`), n = 20000;
    let unchanged = 0, ones = 0;
    for (let t = 0; t < n; t++) {
      const y = step(start, rng) as GridValue, changed = [...y.sym.keys()].filter(i => y.sym[i] !== digit);
      if (!changed.length) { unchanged++; continue; }
      assert.equal(changed.length, 1);
      const d = y.sym[changed[0]] - digit;
      assert.ok(Math.sign(d) === sign && y.sym[changed[0]] >= 0 && y.sym[changed[0]] <= 9, `${digit} moved by ${d}`);
      if (Math.abs(d) === 1) ones++;
    }
    near(unchanged / n, 0.5, 5 * Math.sqrt(0.25 / n), `stuck at ${digit}`);
    near(ones / n, 0.4124, 5 * Math.sqrt(0.25 / n), `${digit} by one`);
  }
});

test("distance-v1 noise on coloured boards and cards: one site of one cell, families weighted by their prices", () => {
  // Grid(4,base10,rgb), every cell a 5 in red. Location = 1 + 4 = 5 bits. Colour: 2 arguments at W = 6, C = 7.8.
  // Rank ±1: W = 6.585, C = 8.753. So colour : (rank ±1) = 2·2^(−7.8) : 2·2^(−8.753) = 1.936 : 1.
  const start = flat(rgb4, 5, 0), step = noiseStep(rgb4, D), rng = seededRng("rgb noise"), n = 40000;
  const dist = sliderDistribution(5, 10, [2 ** -changeCost(6), 2 ** -changeCost(6)]);
  near((dist.other[0] + dist.other[1]) / (2 * dist.p(1)), 1.936, 5e-3);
  let colour = 0, one = 0;
  const colours = [0, 0, 0];
  for (let t = 0; t < n; t++) {
    const y = step(start, rng) as GridValue;
    const ds = [...y.sym.keys()].filter(i => y.sym[i] !== 5), dc = [...y.col.keys()].filter(i => y.col[i] !== 0);
    assert.ok(ds.length + dc.length <= 1, "one site at most");
    if (dc.length) { colour++; colours[y.col[dc[0]]]++; assert.ok(y.col[dc[0]] < 3); }
    if (ds.length && Math.abs(y.sym[ds[0]] - 5) === 1) one++;
  }
  const pc = dist.other[0] + dist.other[1];
  near(colour / n, pc, 5 * Math.sqrt(pc * (1 - pc) / n), "a colour change");
  near(one / n, 2 * dist.p(1), 5 * Math.sqrt(0.25 / n), "a digit by one");
  near(colours[1] / colour, 0.5, 5 * Math.sqrt(0.25 / colour), "the two other colours are equally likely");
  // Cards: a step changes the rank within the suit, or the suit keeping the rank, or the colour; always a valid board.
  const S = SYMBOL_COMPONENTS.cards, crng = seededRng("card noise"), cstep = noiseStep(cards3, D), codec = GRID.codec(cards3);
  let x = GRID.spawn(cards3, crng);
  const seen = { rank: 0, suit: 0, colour: 0, none: 0 };
  for (let t = 0; t < 6000; t++) {
    const y = cstep(x, crng) as GridValue;
    assert.ok(codec.isValid(codec.encode(y)));
    const ds = [...y.sym.keys()].filter(i => y.sym[i] !== x.sym[i]), dc = [...y.col.keys()].filter(i => y.col[i] !== x.col[i]);
    assert.ok(ds.length + dc.length <= 1);
    if (dc.length) seen.colour++;
    else if (!ds.length) seen.none++;
    else {
      const a = x.sym[ds[0]], b = y.sym[ds[0]];
      const rankMoved = S.ranks[a] !== S.ranks[b], suitMoved = S.suits![a] !== S.suits![b];
      assert.ok(rankMoved !== suitMoved, `${a} → ${b} moved the rank and the suit at once`);
      seen[rankMoved ? "rank" : "suit"]++;
    }
    x = y;
  }
  assert.ok(seen.rank > 500 && seen.suit > 500 && seen.colour > 500, JSON.stringify(seen));
});

test("dial-v1 and log-v1 on the beginner board: hand-derived tables", () => {
  const table = (m: CostModel) => GRID.costTable!(mono4, m).map(r => +changeCost(r.work).toFixed(1));
  // dial: 4 + λ·Lee(k), λ = 1.577 the Kraft root of the nine turns (distances 1,2,3,4,5,4,3,2,1); 9 and 0 are one step apart.
  assert.deepEqual(table("dial-v1"), [7.1, 9.7, 12.5, 15.6, 18.9]);
  const dial = families(mono4, "dial-v1")[0];
  assert.equal(dial.generator.distance(9, 0), 1);
  near(siteWork(dial, 1, 9, 0), siteWork(dial, 1, 3, 4), 1e-12, "9 to 0 is one step on a dial");
  // log: 4 + log2 Z + 2·log2 |k|, Z = 2·Σ_{d=1..9} d^−2 = 3.0795: +1 is 5.62 bits, +9 is 11.96 (19.1 energy, about a +5 under distance-v1).
  assert.deepEqual(table("log-v1"), [7.2, 10.5, 12.7, 14.3, 15.5, 16.6, 17.6, 18.4, 19.1]);
  near(siteWork(families(mono4, "log-v1")[0], 1, 2, 3), 4 + Math.log2(2 * [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((t, d) => t + d ** -2, 0)), 1e-12, "log +1");
});

test("every generator's closed form is the cheapest argument of its declared argument space", () => {
  for (const m of COST_MODELS) for (const g of generatorsOf(m)) {
    const n = layerSize(g.layer);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const best = Math.min(...g.args.filter(x => x.apply(a) === b).map(x => x.bits + x.erased));
      // A layer with two generators is priced by its cheapest route (closedUnderComposition): never above its cheapest step.
      if (g.id === "any") assert.ok(g.argBits(a, b) + g.erasedBits(a, b) <= best + 1e-12, `${m} any ${n}: ${a}→${b}`);
      else near(g.argBits(a, b) + g.erasedBits(a, b), best, 1e-12, `${m} ${g.id} ${n}: ${a}→${b}`);
    }
    // Kraft over the declared arguments (the identity's slot, where a model has one, is spare).
    assert.ok(g.args.reduce((t, x) => t + 2 ** -x.bits, 0) <= 1 + 1 / n + 1e-9, `${m} ${g.id} ${n}`);
  }
});

test("multiply-v1: digits only; a number's move costs the cheaper of an add and a multiply, plus 1 bit", () => {
  const M: CostModel = "multiply-v1";
  assert.ok(GRID.supportsCostModel!(mono4, M) && !GRID.supportsCostModel!(cards7, M) && GRID.supportsCostModel!(cards7, D));
  // multiply and divide are offered only under multiply-v1
  const ids = (m?: CostModel) => GRID.describe(mono4, m).mutators.map(x => x.id);
  assert.ok(ids(M).includes("multiply") && ids(M).includes("divide") && !ids(D).includes("multiply") && !ids().includes("divide"));
  assert.ok(GRID.prelude(mono4, M).python.includes("def multiply(") && !GRID.prelude(mono4, D).python.includes("def multiply("));
  assert.equal(GRID.prelude(mono4, D), GRID.prelude(mono4), "one prelude for every model that offers the same mutators");
  const codec = GRID.codec(mono4), board = (d: number) => codec.encode({ size: 4, sym: new Uint8Array(16).fill(d), col: new Uint8Array(16) });
  const act = (d: number, call: unknown, m: CostModel = M) => applyCalls(GRID, mono4, board(d), JSON.stringify([call]), m);
  const cell = { kind: "cell", region: [0, 0] };
  assert.equal(act(4, ["multiply", { ...cell, m: 3 }], D).ok, false, "not offered under distance-v1");
  // λ× = the Kraft root over the magnitudes log2 m of m = 2 … 9 and 0 (read as 10): Σ m^(−λ) = 1 → 1.4963.
  const lamM = kraftRate([10, 2, 3, 4, 5, 6, 7, 8, 9].map(Math.log2)), lamA = kraftRate([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k]));
  near(lamM, 1.4963, 5e-4, "multiply rate");
  // 4 ×3 = 12 → 2. As a multiply: 4 (cell) + 1 (which) + λ×·log2 3 = 7.37; as an add of −2: 4 + 1 + 2·1.585 = 8.17. The multiply wins.
  const x3 = act(4, ["multiply", { ...cell, m: 3 }]);
  assert.ok(x3.ok && codec.decode(x3.value).sym[0] === 2);
  near(x3.ok ? x3.cost.work : NaN, 5 + lamM * Math.log2(3), 1e-9, "×3");
  // 3 ×3 = 9: a +6 by add would be 5 + 6·1.585 = 14.51; the multiply costs 7.37. Writing a 9 costs the same 7.37 (net effect).
  const w9 = act(3, ["write", { ...cell, symbol: 9 }]);
  near(w9.ok ? w9.cost.work : NaN, 5 + lamM * Math.log2(3), 1e-9, "write 9 over 3 is priced as ×3");
  // ×5 on a 3 → 5 erases log2 gcd(5, 10) = log2 5 bits: 5 + λ×·log2 5 + log2 5 = 10.80; an add of +2 costs 8.17 and wins.
  const x5 = act(3, ["multiply", { ...cell, m: 5 }]);
  near(x5.ok ? x5.cost.work : NaN, 5 + 2 * lamA, 1e-9, "×5 on a 3 is priced as +2");
  // ×0 on a 9 → 0: 5 + λ×·log2 10 + log2 10 = 13.29, against an add of −9 at 5 + 9·1.585 = 19.26.
  const x0 = act(9, ["multiply", { ...cell, m: 0 }]);
  near(x0.ok ? x0.cost.work : NaN, 5 + lamM * Math.log2(10) + Math.log2(10), 1e-9, "×0");
  // divide by 3 is ×7 (3·7 = 21): 2 ÷3 → 4 (4·3 = 12). Priced by its net effect, the cheapest way to turn a 2 into a 4: not ×7
  // (5 + λ×·log2 7 = 9.20) nor +2 (8.17) but ×2, which erases 1 bit: 5 + λ× + 1 = 7.50.
  const d3 = act(2, ["divide", { ...cell, u: 3 }]);
  assert.ok(d3.ok && codec.decode(d3.value).sym[0] === 4);
  near(d3.ok ? d3.cost.work : NaN, 5 + lamM + 1, 1e-9, "÷3 on a 2");
  assert.equal(act(2, ["divide", { ...cell, u: 2 }]).ok, false, "÷2 does not exist modulo 10");
  // An add under multiply-v1 pays the 1 bit that says "add, not multiply": +1 is 4 + 1 + 1.585 = 6.58 (8.8 energy; 7.1 under distance-v1).
  const p1 = act(4, ["add", { ...cell, k: 1 }]);
  near(p1.ok ? p1.cost.total : NaN, changeCost(5 + lamA), 1e-9);
  // A call never costs more than calls that do the same: 0 → 9 by one write is priced as its cheapest route, +1 then ×9
  // (two located steps), not as a +9. W = (5 + 1.585) + (5 + λ×·log2 9) = 16.33; the +9 alone would be 19.26.
  const w09 = act(0, ["write", { ...cell, symbol: 9 }]), two = applyCalls(GRID, mono4, board(0), JSON.stringify([["add", { ...cell, k: 1 }], ["multiply", { ...cell, m: 9 }]]), M);
  near(w09.ok ? w09.cost.work : NaN, 10 + lamA + lamM * Math.log2(9), 1e-9, "0 → 9");
  near(two.ok ? two.cost.work : NaN, w09.ok ? w09.cost.work : NaN, 1e-9, "one call = the two calls");
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) {
    if (a === b || b === c || a === c) continue;
    assert.ok(siteWork(families(mono4, M)[0], 1, a, c) <= siteWork(families(mono4, M)[0], 1, a, b) + siteWork(families(mono4, M)[0], 1, b, c) + 1e-9, `${a}→${b}→${c}`);
  }
  assert.ok(!GRID.supportsCostModel!(grid(4, "base12", "mono"), M), "multiply is modulo 10 only");
  // The whole one-cell code still claims at most 1.
  const f = families(mono4, M)[0];
  assert.ok(f.generator.args.reduce((t, x) => t + 2 ** -(x.bits + x.erased), 0) <= 1 + 1e-9);
  // How many of the 90 digit pairs are cheaper than their add under distance-v1's rate (the design's "13 to 58").
  let cheaper = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (a !== b && f.generator.argBits(a, b) + f.generator.erasedBits(a, b) < 1 + lamA * Math.abs(b - a) - 1e-9) cheaper++;
  assert.equal(cheaper, CHEAPER_BY_MULTIPLY);
});
const CHEAPER_BY_MULTIPLY = 43;

// ------------------------------------------------------------------------------------------------
// proportional-v1: no ℓ_where, no ℓ_which; w = λ·d with λ the Kraft root of the whole board
// ------------------------------------------------------------------------------------------------

test("proportional-v1 λ: the Kraft root with mass 1/(cells × families); 5.044 on the 16-cell numbers board", () => {
  // Grid(4,base10,mono): 16 cells, 1 family, a slider of ten digits. Σ over every cell and every ±k of 2^(−λ·k) = 1:
  //   16 · 2·Σ_{k=1..9} x^k = 1 with x = 2^(−λ). The infinite sum is 2x/(1 − x) = 1/16, so x = 1/33 and
  //   λ = log2 33 = 5.04439. Cutting the sum at k = 9 drops 2·x^10/(1 − x) = 1.4e-15: nothing a double can see.
  near(kraftRate([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k]), 1 / 16), Math.log2(33), 1e-9, "slider, mass 1/16");
  const { f } = family(mono4, P, "rank");
  assert.deepEqual([f.generator.id, f.generator.layer.kind, f.generator.mass], ["add", "ordinal", 1 / 16]);
  near(f.generator.rate, Math.log2(33), 1e-9, "mono4 rank");
  // The design's X1 row (docs/mutation-cost-design.md §3) says 5.04 for a DIAL (distances 1,1,2,2,3,3,4,4,5). The dial
  // has no ±6 … ±9 and one ±5 instead of two, so its sum is x^5 + … = 2.6e-8 short of the slider's: its root is lower
  // by 2.6e-8 / (ln 2 · 1/16) = 6e-7 bits. Both are 5.04.
  const dial = kraftRate([1, 1, 2, 2, 3, 3, 4, 4, 5], 1 / 16);
  assert.ok(dial < f.generator.rate && f.generator.rate - dial < 1e-6, `${dial}`);
  near(dial, 5.04, 5e-3, "the design's 5.04");
  // mass 1 is the located rate, unchanged: 1.58491.
  assert.equal(kraftRate([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k]), 1), generatorOf({ kind: "ordinal", n: 10 }, D)!.rate);
  // Grid(4,base10,rgb): 16 cells × 2 families. Numbers: 2x/(1 − x) = 1/32, x = 1/65, λ = log2 65 = 6.0224.
  near(family(rgb4, P, "rank").f.generator.rate, Math.log2(65), 1e-9, "rgb4 rank");
  // The same layer on two boards has two rates: the generator is cached by its mass too.
  assert.notEqual(family(rgb4, P, "rank").f.generator, f.generator);
  assert.equal(family(mono4, P, "rank").f.generator, f.generator);
});

test("proportional-v1 Kraft: every cell, family and argument of the whole board claims exactly 1", () => {
  for (const inst of ALL) {
    const fams = families(inst, P);
    let sum = 0;
    for (const f of fams) {
      assert.equal(f.generator.mass, 1 / (f.sites * fams.length), `${inst.key} ${f.id}`);
      // siteWork is the whole price of the move (no location bits), the same in every cell: count it once per cell.
      for (const x of f.generator.args) {
        const from = [...Array(layerSize(f.generator.layer)).keys()].find(a => x.apply(a) !== null && x.apply(a) !== a)!;
        near(siteWork(f, fams.length, from, x.apply(from)!), x.bits, 1e-12, `${inst.key} ${f.id} ${x.label}`);
        sum += f.sites * 2 ** -x.bits;
      }
    }
    near(sum, 1, 1e-6, inst.key);
  }
});

test("Grid(4,base10,mono) proportional-v1: add(cell, ±k) costs W = 5.044·|k|, exactly k × the ±1 price", () => {
  // W = λ·|k| with λ = log2 33 = 5.04439 (no cell, no family); energy = W + 0.05·W²:
  //   k   W        0.05·W²   energy    distance-v1   set-v1
  //   1    5.044    1.272      6.3        7.1         16.3
  //   2   10.089    5.089     15.2        9.7         16.3
  //   3   15.133   11.451     26.6       12.6         16.3
  //   4   20.178   20.357     40.5       15.7         16.3
  //   5   25.222   31.808     57.0       19.0         16.3
  //   6   30.266   45.803     76.1       22.6         16.3
  //   7   35.311   62.343     97.7       26.5         16.3
  //   8   40.355   81.427    121.8       30.6         16.3
  //   9   45.400  103.056    148.5       34.9         16.3
  const energy = [6.3, 15.2, 26.6, 40.5, 57.0, 76.1, 97.7, 121.8, 148.5], lam = Math.log2(33);
  const one = work(mono4, flat(mono4, 0), [add(cell(2, 1), 1)], P);
  near(one, lam, 1e-9, "W of ±1");
  for (let k = 1; k <= 9; k++) for (const sign of [1, -1]) {
    const start = flat(mono4, sign > 0 ? 0 : 9), call = [add(cell(2, 1), sign * k)];
    const p = act(mono4, start, call, P), d = act(mono4, start, call, D);
    assert.ok(p.out.ok && d.out.ok, `add ${sign * k}`);
    assert.deepEqual(GRID.codec(mono4).encode(p.after!), GRID.codec(mono4).encode(d.after!), "the model changes the price, never the move");
    near(p.out.cost.work, k * one, 1e-9, `W of add ${sign * k} is ${k} × W of ±1`);
    near(p.out.cost.total, changeCost(k * lam), 1e-9);
    assert.equal(+p.out.cost.total.toFixed(1), energy[k - 1], `energy of add ${sign * k}`);
  }
  // The table the texts show is the same nine rows.
  const rows = gridCostTable(mono4, P);
  assert.deepEqual(rows.map(r => r.move), [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `move a cell's number by ${k}`));
  assert.deepEqual(rows.map(r => +changeCost(r.work).toFixed(1)), energy);
  // Against the others: a nudge is a little cheaper than distance-v1's (6.3 < 7.1), everything further dearer, and
  // +5 costs 57.0/16.3 = 3.5 × the flat price.
  const dist = gridCostTable(mono4, D).map(r => r.work), flatW = gridCostTable(mono4, S1)[0].work;
  assert.ok(rows[0].work < dist[0]);
  for (let k = 2; k <= 9; k++) assert.ok(rows[k - 1].work > dist[k - 1], `±${k}`);
  near(changeCost(rows[4].work) / changeCost(flatW), 3.5, 0.05, "+5 against the flat price");
  // Every mutator is priced by its net effect: write(cell, 7) on a 5 is a +2; add(row, +2) is four cells' +2 (the cell
  // is not named, so there is no saving and no surcharge in doing them together, before the square).
  near(work(mono4, flat(mono4, 5), [["write", { ...cell(0, 0), symbol: 7 }]], P), 2 * lam, 1e-9, "write 7 on 5");
  near(work(mono4, flat(mono4, 3), [add(row(1), 2)], P), 8 * lam, 1e-9, "add(row, 2)");
  // The identity still costs nothing, and a move in another cell costs the same.
  assert.equal(act(mono4, flat(mono4, 4), [add(cell(1, 1), 2), add(cell(1, 1), -2)], P).out.ok, false);
  assert.equal(work(mono4, flat(mono4, 3), [add(cell(3, 3), 1)], P), one);
});

test("proportional-v1 on colours and cards: one distance, so a colour or a suit costs its located price", () => {
  // A categorical layer of n values: (n − 1)·2^(−λ) = 1/(cells × families), λ = log2(cells × families × (n − 1)):
  // what distance-v1 charges as log2 cells + log2 families + log2(n − 1).
  for (const inst of ALL) for (const f of families(inst, P).filter(x => x.generator.layer.kind === "categorical")) {
    const F = families(inst, P).length, n = layerSize(f.generator.layer), located = family(inst, D, f.id);
    near(siteWork(f, F, 0, 1), Math.log2(f.sites * F * (n - 1)), 1e-9, `${inst.key} ${f.id}`);
    near(siteWork(f, F, 0, 1), siteWork(located.f, located.n, 0, 1), 1e-9, `${inst.key} ${f.id} against distance-v1`);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) assert.equal(siteWork(f, F, a, b), siteWork(f, F, 0, 1));
  }
  // Grid(4,base10,rgb): a colour is log2(16·2·2) = 6 bits (7.8 energy), as under distance-v1; a number by ±1 is
  // log2 65 = 6.02 bits (7.8), by ±2 12.04 (19.3).
  assert.equal(work(rgb4, flat(rgb4, 4, 0), [["paint", { ...cell(1, 2), colour: 2 }]], P), 6);
  near(work(rgb4, flat(rgb4, 4, 0), [add(cell(1, 2), 2)], P), 2 * Math.log2(65), 1e-9);
  // Grid(7,cards,rgb), 49 cells × 3 families: a suit is log2(49·3·3) = 8.785, a colour log2(49·3·2) = 8.200.
  const table = Object.fromEntries(gridCostTable(cards7, P).map(r => [r.move, r.work]));
  near(table["change a cell's suit"], Math.log2(441), 1e-9);
  near(table["change a cell's colour"], Math.log2(294), 1e-9);
  near(table["move a cell's number by 3"], 3 * table["move a cell's number by 1"], 1e-9);
  assert.ok(GRID.supportsCostModel!(cards7, P) && GRID.supportsCostModel!(mono4, P));
});

test("proportional-v1 noise: its own version; one cell, uniform, and almost always a ±1", () => {
  assert.equal(noiseVersion(P), "noise-v1|beta=0.05|cost=proportional-v1");
  // From a 5 on Grid(4,base10,mono): the weight of ±k is 2^(−C(5.044·k)), with no location bits. C(±1) = 6.317,
  // C(±2) = 15.178, so P(±2)/P(±1) = 2^(−8.861) = 0.00215 and ±1 is 99.8% of the draws (distance-v1: about 84%).
  const start = flat(mono4, 5), step = noiseStep(mono4, P), rng = seededRng("proportional noise"), n = 8000, byCell = Array(16).fill(0);
  let ones = 0;
  for (let t = 0; t < n; t++) {
    const y = step(start, rng) as GridValue, changed = [...y.sym.keys()].filter(i => y.sym[i] !== 5);
    assert.equal(changed.length, 1, "one cell (every ±k up to ±4 fits from a 5; further has mass below 1e-15)");
    byCell[changed[0]]++;
    if (Math.abs(y.sym[changed[0]] - 5) === 1) ones++;
  }
  near(ones / n, 1 / (1 + 2 ** -(changeCost(2 * Math.log2(33)) - changeCost(Math.log2(33)))), 5 * Math.sqrt(0.00215 / n) + 1e-4, "share of ±1");
  assert.ok(chiSquare(byCell) < chiCritical(15), `cells: ${byCell}`);
});
