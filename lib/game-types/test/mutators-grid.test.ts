import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { GRID, availableOf, seededRng, type GridValue, type Instantiation, type TypeArgs } from "../src/index.ts";
import { applyCalls, changeCost, decisionBits } from "../src/mutators.ts";
import { gridElementaryCosts } from "../src/grid/index.ts";
import { GRID_MUTATORS, type GridMutator } from "../src/grid/mutators.ts";

const ALL_TYPES: Instantiation[] = GRID.representatives().map((a: TypeArgs) => GRID.instantiate(a));
/** The coloured GridTypes (gridlab/mutators.py's); mono boards (one colour, numbers only) are tested in test/mono.test.ts. */
const TYPES = ALL_TYPES.filter(t => t.args.colours !== "mono");
const MONO_TYPES = ALL_TYPES.filter(t => t.args.colours === "mono");
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

/**
 * Mutators that cannot apply to every grid (apply returns null and the act fails): `add` never wraps, so 9 + 1 does not
 * fit. Where one applies it is still a bijection: its inverse call undoes it.
 */
const PARTIAL: Record<string, (p: any) => unknown> = { add: p => ({ ...p, k: -p.k }) };

test("26 mutators (mutators.py order, no flatten, plus add); 23 to 25 available per GridType", () => {
  assert.equal(GRID_MUTATORS.length, 26);
  assert.equal(new Set(GRID_MUTATORS.map(m => m.id)).size, 26);
  // add comes straight after step_rank, the wrapping move it mirrors
  assert.equal(GRID_MUTATORS[GRID_MUTATORS.findIndex(m => m.id === "step_rank") + 1].id, "add");
  assert.ok(!GRID_MUTATORS.some(m => m.id === "flatten"));
  for (const inst of TYPES) {
    const n = avail(inst).length;
    assert.ok(n >= 23 && n <= 25, `${inst.key}: ${n}`);
    assert.ok(avail(inst).some(m => m.id === "add"), `${inst.key}: every grid is Ranked, so add is there`);
  }
  assert.equal(avail(inst5).length, 24);
  // A mono board drops every mutator that needs a choice of colours (paint stays: painting the one colour is a no-change).
  for (const inst of MONO_TYPES) {
    const ids = avail(inst).map(m => m.id);
    assert.ok(ids.includes("paint") && ids.includes("write") && ids.includes("swap_cells"), inst.key);
    for (const id of ["recolour", "swap_colours", "majority_line", "paint_by_key", "stamp", "tally", "hue_turn", "pattern_line", "motif", "blend"])
      assert.ok(!ids.includes(id), `${inst.key} offers ${id}`);
  }
});

test("every available mutator on every mono GridType: valid, never changes a colour, costs ≥ 0", () => {
  const rng = seededRng("grid-laws-mono");
  for (const inst of MONO_TYPES) {
    const grids = Array.from({ length: 3 }, () => GRID.spawn(inst, rng));
    for (const m of avail(inst)) {
      for (let k = 0; k < 8; k++) {
        const p = m.sample(rng, inst);
        for (const g of grids) {
          const y = m.apply(g, p, inst);
          if (y === null) continue;
          assert.ok(y.col.every(c => c === 0), `${inst.key} ${m.id}: a mono cell changed colour`);
          assert.ok(GRID.codec(inst).isValid(GRID.codec(inst).encode(y)), `${inst.key} ${m.id}`);
          assert.ok(GRID.callWork(g, y, undefined, inst) >= 0);
        }
      }
    }
  }
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
          if (PARTIAL[m.id] && y === null) { assert.equal(y2, null, `nondeterministic ${m.id}`); continue; }
          assert.ok(y !== null && y2 !== null, `${m.id} returned null`);
          assert.equal(key(y), key(y2), `nondeterministic ${m.id}`);
          assert.equal(y.sym.length, N * N);
          assert.ok(y.sym.every(v => v < S) && y.col.every(v => v < C), `${m.id} invalid output on ${inst.key}`);
          const e = m.erasureBits(g, p, inst);
          assert.ok(Number.isFinite(e) && e >= 0, `${m.id} erasure ${e}`);
          if (PARTIAL[m.id]) {
            assert.equal(e, 0);
            assert.equal(key(m.apply(y, PARTIAL[m.id](p), inst)!), k0, `${m.id} ${JSON.stringify(p)}: the inverse call does not undo it on ${inst.key}`);
          } else if (m.kind === "bijective") {
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
      // a partial mutator (add) is injective on the grids it applies to
      const on = PARTIAL[m.id] ? gs.filter(g => m.apply(g, p, inst) !== null) : gs;
      assert.equal(new Set(on.map(g => key(m.apply(g, p, inst)!))).size, new Set(on.map(key)).size, `${m.id} ${JSON.stringify(p)}`);
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

test("act costs are the elementary decomposition of what changed, W + βW² (docs/energy-model.md §4)", () => {
  const rng = seededRng("table"), v = GRID.spawn(inst5, rng), g = GRID.codec(inst5).encode(v);
  const w = gridElementaryCosts(inst5);
  for (const m of avail(inst5)) for (let s = 0; s < 4; s++) {
    const p = m.sample(rng, inst5), out = applyCalls(GRID, inst5, g, JSON.stringify([[m.id, p]]));
    if (!out.ok) continue;
    const y = GRID.codec(inst5).decode(out.value);
    let dc = 0, ds = 0;
    for (let i = 0; i < 25; i++) { if (v.col[i] !== y.col[i]) dc++; if (v.sym[i] !== y.sym[i]) ds++; }
    const W = dc * w.colour + ds * w.symbol;
    assert.ok(Math.abs(out.cost.work - W) < 1e-9 && Math.abs(out.cost.total - changeCost(W)) < 1e-9, `${m.id} ${JSON.stringify(p)}`);
  }
  // the naming part of a literal move (summon price) is deterministic: log2 #available + D (+ M)
  const p = { kind: "line", region: [0, 2], colour: 0 };
  assert.ok(Math.abs(decisionBits(byId("paint"), p, inst5, 24) - (Math.log2(24) + Math.log2(8) + Math.log2(10) + 2)) < 1e-12);
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
  countOn(everything(), 3), add(grid.cell(1, 1)), add(row(0), -2), countAlong(row(0), grid.cell(2, 2).value), swapNumbers(row(1), 1, "2"),
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
        count_on(everything(), 3), add(grid.cell(1, 1)), add(row(0), -2), count_along(row(0), grid.cell(2, 2).value), swap_numbers(row(1), 1, "2"),
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
    assert.ok(calls.length >= 40);
    assert.ok(JSON.stringify(calls).includes(`["add",{"k":1,"kind":"cell","region":[1,1]}],["add",{"k":-2,"kind":"line","region":[0,0]}]`), inst.key);
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
