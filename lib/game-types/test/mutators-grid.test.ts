import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { GRID, availableOf, seededRng, type GridValue, type Instantiation, type TypeArgs } from "../src/index.ts";
import { applyCalls, DEFAULT_COST_KNOBS, decisionBits } from "../src/mutators.ts";
import { GRID_MUTATORS, type GridMutator } from "../src/grid/mutators.ts";

const TYPES: Instantiation[] = GRID.representatives().map((a: TypeArgs) => GRID.instantiate(a));
const key = (g: GridValue) => `${g.sym.join(",")}|${g.col.join(",")}`;
const avail = (inst: Instantiation) => availableOf(GRID_MUTATORS, inst) as GridMutator[];
const byId = (id: string) => GRID_MUTATORS.find(m => m.id === id)!;
const inst5 = GRID.instantiate({ size: 5, symbols: "base10", colours: "rgby" });

/** mutators.md: a bijection's orbit returns to the start. */
function orbitReturns(m: GridMutator, p: unknown, g: GridValue, inst: Instantiation, cap = 200): boolean {
  let x = g;
  for (let i = 0; i < cap; i++) {
    x = m.apply(x, p, inst) ?? x;
    if (key(x) === key(g)) return true;
  }
  return false;
}

test("25 mutators (mutators.py order, no flatten); 22 to 24 available per GridType", () => {
  assert.equal(GRID_MUTATORS.length, 25);
  assert.equal(new Set(GRID_MUTATORS.map(m => m.id)).size, 25);
  assert.ok(!GRID_MUTATORS.some(m => m.id === "flatten"));
  for (const inst of TYPES) {
    const n = avail(inst).length;
    assert.ok(n >= 22 && n <= 24, `${inst.key}: ${n}`);
  }
  assert.equal(avail(inst5).length, 23);
});

test("every mutator × every GridType: deterministic, valid, idempotent or bijective, costs ≥ 0", () => {
  const rng = seededRng("grid-laws");
  for (const inst of TYPES) {
    const N = inst.args.size as number, S = inst.terms["symbols.count"], C = inst.terms["colours.count"];
    const grids = Array.from({ length: 3 }, () => GRID.spawn(inst, rng));
    const ms = avail(inst);
    for (const m of ms) {
      for (let s = 0; s < 6; s++) {
        const p = m.sample(rng, inst);
        // sampled params are valid wire params, and parse is the identity on them
        assert.deepEqual(m.parse(JSON.parse(JSON.stringify(p)), inst), p, `${m.id} parse ${inst.key}`);
        const d = decisionBits(m, p, inst, ms.length);
        const t = m.terms(p, inst);
        assert.ok(Number.isFinite(d) && d >= 0 && m.describeBits(p, inst) >= 0 && m.measureBits!(p, inst) >= 0, m.id);
        assert.ok(t.erase >= 0 && t.dcol >= 0 && t.dsym >= 0, `${m.id} terms`);
        if (m.kind === "bijective") assert.equal(t.erase, 0);
        assert.ok(m.describe(p, inst).length > 0);
        for (const g of grids) {
          const k0 = key(g), y = m.apply(g, p, inst), y2 = m.apply(g, p, inst);
          assert.equal(key(g), k0, `${m.id} mutated its input`);
          assert.ok(y !== null && y2 !== null, `${m.id} returned null`);
          assert.equal(key(y), key(y2), `nondeterministic ${m.id}`);
          assert.equal(y.sym.length, N * N);
          assert.ok(y.sym.every(v => v < S) && y.col.every(v => v < C), `${m.id} invalid output on ${inst.key}`);
          const e = m.erasureBits(g, p, inst);
          assert.ok(Number.isFinite(e) && e >= 0, `${m.id} erasure ${e}`);
          if (m.kind === "bijective") {
            assert.equal(e, 0);
            assert.ok(orbitReturns(m, p, g, inst), `${m.id} ${JSON.stringify(p)} is not a bijection on ${inst.key}`);
          } else {
            assert.equal(key(m.apply(y, p, inst)!), key(y), `${m.id} ${JSON.stringify(p)} is not idempotent on ${inst.key}`);
          }
        }
      }
    }
  }
});

test("bijections are injective on many grids (Grid(4,base10,rgb))", () => {
  const inst = GRID.instantiate({ size: 4, symbols: "base10", colours: "rgb" }), rng = seededRng("inj");
  const gs = Array.from({ length: 300 }, () => GRID.spawn(inst, rng));
  for (const m of avail(inst).filter(x => x.kind === "bijective")) {
    for (let s = 0; s < 10; s++) {
      const p = m.sample(rng, inst);
      assert.equal(new Set(gs.map(g => key(m.apply(g, p, inst)!))).size, new Set(gs.map(key)).size, `${m.id} ${JSON.stringify(p)}`);
    }
  }
});

test("parse rejects junk", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["paint", { kind: "line", region: [0, 2], colour: 0, extra: 1 }],          // unknown field
    ["paint", { kind: "line", region: [0, 2] }],                               // missing field
    ["paint", { kind: "line", region: [0, 2], colour: "0" }],                  // wrong type
    ["paint", { kind: "line", region: [0, 5], colour: 0 }],                    // out of range
    ["paint", { kind: "cell", region: [0, -1], colour: 0 }],
    ["paint", { kind: "line", region: [0, 2], colour: 4 }],
    ["paint", { kind: "all", region: [], colour: 0 }],                         // region is omitted for "all"
    ["paint", { kind: "everywhere", colour: 0 }],
    ["recolour", { kind: "cell", region: [0, 0], pair: [0, 1] }],              // kind not allowed here
    ["recolour", { kind: "line", region: [0, 0], pair: [1, 1] }],
    ["swap_cells", { layer: "both", near: "next door", pair: [[0, 0], [2, 2]] }], // not adjacent
    ["swap_cells", { layer: "both", near: "anywhere", pair: [[0, 1], [0, 0]] }],  // not canonical order
    ["swap_cells", { layer: "all", near: "anywhere", pair: [[0, 0], [2, 2]] }],
    ["shift_line", { layer: "both", line: [0, 0], k: 0 }],
    ["shift_line", { layer: "both", line: [0, 0], k: 1.5 }],
    ["turn_grid", { move: "rot45" }],
    ["turn_block", { kind: "block", region: [4, 4, 2], move: "rot90" }],
    ["mirror_fold", { layer: "both", kind: "all", line: [0, 0], side: "left->right" }],
    ["mirror_fold", { layer: "both", kind: "line", line: [0, 0], side: "left->right" }],
    ["motif", { style: "checker", pair: [0, 1], axis: 0 }],
    ["write", { kind: "cell", region: [0, 0], symbol: 10 }],
    ["paint_by_key", { kind: "all", key: "redblack", pair: [0, 1] }],          // needs Suited
    ["swap_lines", { axis: 0, pair: [3, 1] }],
    ["blend", { kind: "all", recipe: [3, 1, 2] }],
  ];
  for (const [id, raw] of bad) {
    assert.throws(() => byId(id).parse(raw, inst5), /./, `${id} ${JSON.stringify(raw)}`);
  }
  const small = GRID.instantiate({ size: 3, symbols: "base10", colours: "rgb" });
  assert.throws(() => byId("paint").parse({ kind: "core", colour: 0 }, small));
  assert.throws(() => byId("turn_block").parse({ kind: "block", region: [0, 0, 3], move: "rot90" }, small));
  assert.doesNotThrow(() => byId("paint").parse({ kind: "core", colour: 0 }, inst5));
});

/** Mean pointwise erasure over spawns ≈ mutators.py's analytic (Shannon) erasure. */
test("expected pointwise erasure over spawns matches the analytic erasure", () => {
  const rng = seededRng("erasure"), K = 300;
  for (const inst of TYPES.filter((_, i) => i % 3 === 0)) {
    const spawns = Array.from({ length: K }, () => GRID.spawn(inst, rng));
    for (const m of avail(inst).filter(x => x.kind === "overwrite")) {
      for (let s = 0; s < 3; s++) {
        let p = m.sample(rng, inst);
        if (p.kind === "line*") p = { ...p, kind: "line", region: [0, 0] };   // relative targets select biased lines
        const es = spawns.map(g => m.erasureBits(g, p, inst)), mean = es.reduce((a, b) => a + b, 0) / K;
        const sd = Math.sqrt(es.reduce((a, b) => a + (b - mean) ** 2, 0) / (K - 1));
        const want = m.terms(p, inst).erase;
        const tol = 4.5 * sd / Math.sqrt(K) + (m.id === "sort_line" ? 0.15 : 1e-9);
        assert.ok(Math.abs(mean - want) <= tol, `${m.id} ${JSON.stringify(p)} on ${inst.key}: mean ${mean} vs analytic ${want} (tol ${tol})`);
      }
    }
  }
});

test("act costs reproduce the mutators.md cost table at Grid(5,base10,rgby)", () => {
  const rng = seededRng("table"), g = GRID.codec(inst5).encode(GRID.spawn(inst5, rng));
  const cost = (calls: unknown) => {
    const out = applyCalls(GRID, inst5, g, JSON.stringify(calls));
    assert.ok(out.ok, JSON.stringify(out));
    return out.cost.total;
  };
  const near = (a: number, b: number, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  const cell = cost([["paint", { kind: "cell", region: [2, 2], colour: 0 }]]);
  const row = cost([["paint", { kind: "line", region: [0, 2], colour: 0 }]]);
  const fill = cost([["paint", { kind: "all", colour: 0 }]]);
  near(cell, 16.2); near(row, 23.2); near(fill, 69.4, 2);
  near(cost([["turn_grid", { move: "rot90" }]]), 38.1, 4);   // motion is pointwise
  near(cost([["swap_colours", { kind: "all", pair: [0, 1] }]]), 13.5, 1.5);
  assert.ok(fill > 4 * cell && row < (5 * cell) / 2);
  // a sum over calls
  const two = applyCalls(GRID, inst5, g, JSON.stringify([["paint", { kind: "cell", region: [2, 2], colour: 0 }], ["turn_grid", { move: "rot90" }]]));
  assert.ok(two.ok && two.cost.total > cell);
  // the decision part is deterministic: base + D (+ M)
  const base = Math.log2(23);
  const p = { kind: "line", region: [0, 2], colour: 0 };
  assert.ok(Math.abs(decisionBits(byId("paint"), p, inst5, 23, DEFAULT_COST_KNOBS) - (base + Math.log2(8) + Math.log2(10) + 2)) < 1e-12);
});

// ------------------------------------------------------------------------------------------------
// guest constructors (generated prelude, both languages)
// ------------------------------------------------------------------------------------------------

const JS_AGENT = `
const calls = [
  paint(row(2), "red"), paint(grid.rows[1], "R"), paint(grid.cell(0, 0), grid.palette[1]), paint(everything(), "red"),
  paint(busiestLine(), "red"), paint(edge(), "red"), paint(grid.diagonals[1], "red"), paint(square(0, 0), "red"),
  swapCells(grid.cell(0, 1), grid.cell(0, 0)), swapCells([0, 0], [2, 2], "colour"), slide(column(1), -1), slide(grid.rows[0], 2, "symbol"),
  reverse(row(0)), swapRows(2, 0), swapColumns(1, 0), turnSquare(square(1, 1, 2), "clockwise"), turnGrid("half"),
  sortLine(row(1), true), mirrorLine(row(2), "second", "colour"), mirrorGrid("left"), mirrorGrid("below_other_diagonal", "symbol"),
  recolour(column(0), "red", grid.palette[2]), swapColours(ring(0), grid.palette[2], "red"), rainbowStep(grid.cell(1, 1), -1),
  rainbowLine(row(0), "red", true), alternateLine(column(2), "red", grid.palette[1]), stripes("red", true), diagonalRainbow("red"),
  chessboard("red", grid.palette[1]), majority(busiestLine()), majority(grid.columns[0]), write(grid.cell(1, 1), grid.cell(0, 0).symbol),
  countOn(everything(), 3), countAlong(row(0), grid.cell(2, 2).value), swapNumbers(row(1), 1, "2"),
  paintEvenOdd(everything(), "red", grid.palette[1]), paintByNumber(row(0), 1),
  stamp(everything(), "red", grid.cell(0, 0).symbol),
];
if (typeof countMines === "function") calls.push(countMines(everything(), "red"));
if (typeof mixPaint === "function") calls.push(mixPaint(everything(), "blue", "yellow"));
if (typeof swapSuits === "function") calls.push(swapSuits(everything(), "hearts", "\\u2660"), setSuit(row(0), "clubs"), paintRedBlack(row(0), "red", grid.palette[1]));
if (typeof middle === "function" && grid.size >= 4) calls.push(paint(middle(), "red"));
return calls;
`;

const PY_AGENT = `
def agent(grid):
    calls = [
        paint(row(2), "red"), paint(grid.rows[1], "R"), paint(grid.cell(0, 0), grid.palette[1]), paint(everything(), "red"),
        paint(busiest_line(), "red"), paint(edge(), "red"), paint(grid.diagonals[1], "red"), paint(square(0, 0), "red"),
        swap_cells(grid.cell(0, 1), grid.cell(0, 0)), swap_cells((0, 0), (2, 2), "colour"), slide(column(1), -1), slide(grid.rows[0], 2, "symbol"),
        reverse(row(0)), swap_rows(2, 0), swap_columns(1, 0), turn_square(square(1, 1, 2), "clockwise"), turn_grid("half"),
        sort_line(row(1), True), mirror_line(row(2), "second", "colour"), mirror_grid("left"), mirror_grid("below_other_diagonal", "symbol"),
        recolour(column(0), "red", grid.palette[2]), swap_colours(ring(0), grid.palette[2], "red"), rainbow_step(grid.cell(1, 1), -1),
        rainbow_line(row(0), "red", True), alternate_line(column(2), "red", grid.palette[1]), stripes("red", True), diagonal_rainbow("red"),
        chessboard("red", grid.palette[1]), majority(busiest_line()), majority(grid.columns[0]), write(grid.cell(1, 1), grid.cell(0, 0).symbol),
        count_on(everything(), 3), count_along(row(0), grid.cell(2, 2).value), swap_numbers(row(1), 1, "2"),
        paint_even_odd(everything(), "red", grid.palette[1]), paint_by_number(row(0), 1),
        stamp(everything(), "red", grid.cell(0, 0).symbol),
    ]
    if "count_mines" in globals():
        calls.append(count_mines(everything(), "red"))
    if "mix_paint" in globals():
        calls.append(mix_paint(everything(), "blue", "yellow"))
    if "swap_suits" in globals():
        calls += [swap_suits(everything(), "hearts", "\\u2660"), set_suit(row(0), "clubs"), paint_red_black(row(0), "red", grid.palette[1])]
    if grid.size >= 4:
        calls.append(paint(middle(), "red"))
    return calls
`;

function jsCalls(inst: Instantiation, wire: string): string {
  const prelude = GRID.prelude(inst).js;
  return new Function("__WIRE", `${prelude}\nconst grid = __decode(__WIRE);\nconst calls = (() => {${JS_AGENT}})();\nreturn "[" + calls.map(c => __encode_calls([c]).slice(1, -1)).join(",") + "]";`)(wire) as string;
}

test("JS guest constructors produce calls the engine accepts, one by one, in every GridType", () => {
  const rng = seededRng("guest-js");
  for (const inst of TYPES) {
    const g = GRID.codec(inst).encode(GRID.spawn(inst, rng));
    const calls = JSON.parse(jsCalls(inst, g as string)) as [string, Record<string, unknown>][];
    assert.ok(calls.length >= 38);
    for (const c of calls) {
      const m = byId(c[0]);
      assert.doesNotThrow(() => m.parse(c[1], inst), `${inst.key} ${JSON.stringify(c)}`);
    }
    const first = JSON.stringify(calls.slice(0, 3));
    assert.equal(first, `[["paint",{"colour":0,"kind":"line","region":[0,2]}],["paint",{"colour":0,"kind":"line","region":[0,1]}],["paint",{"colour":1,"kind":"cell","region":[0,0]}]]`);
  }
});

test("Python guest constructors match the JS ones byte for byte", () => {
  const rng = seededRng("guest-py");
  for (const inst of [TYPES[0], ...TYPES.filter(t => t.args.symbols === "cards" && t.args.colours === "rainbow6"),
    GRID.instantiate({ size: 6, symbols: "base16", colours: "rgby" })]) {
    const g = GRID.codec(inst).encode(GRID.spawn(inst, rng)) as string;
    const src = `${GRID.prelude(inst).python}\n${PY_AGENT}\nimport sys\nsys.stdout.write("[" + ",".join(__encode_calls([c])[1:-1] for c in agent(__decode(${JSON.stringify(g)}))) + "]")\n`;
    const out = execFileSync("python3", ["-I", "-c", src], { encoding: "utf8" });
    assert.equal(out, jsCalls(inst, g), inst.key);
  }
});

test("kid errors are friendly", () => {
  const prelude = GRID.prelude(inst5).js;
  const run = (body: string) => () => new Function(`${prelude}\nreturn __encode_calls(${body});`)();
  assert.throws(run(`paint(row(0), "pink")`), /unknown colour "pink": use one of red, yellow, green, blue/);
  assert.throws(run(`paint([[0, 0], [1, 2], [3, 3]], "red")`), /not a row, a column/);
  assert.throws(run(`slide(row(0), 5)`), /whole lap/);
  assert.throws(run(`slide(everything())`), /whole row or column/);
});
