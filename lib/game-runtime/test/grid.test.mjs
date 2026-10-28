// Grid object type: agents are functions from a read-only grid to a list of mutator calls.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { getQuickJS } from "quickjs-emscripten";
import { GameRuntime } from "../index.mjs";
import { PRELUDE_JS, gridDeclarations, gridMutators } from "../grid/declarations.mjs";

const SHIPPED = [[5, "base10", "rgby"], [3, "base10", "rgb"], [4, "base12", "rgb"], [6, "cards", "rainbow6"]]
  .map(([gridSize, gridSymbols, gridColours]) => ({ objectType: "Grid", gridSize, gridSymbols, gridColours }));
const [G5, G3, G4, G6] = SHIPPED;
const key = s => `Grid(${s.gridSize},${s.gridSymbols},${s.gridColours})`;
const PALETTES = { rgb: "RGB", rgby: "RYGB", rainbow6: "ROYGBV" };
const CARD = i => "A23456789TJQK"[i % 13] + "SHDC"[Math.floor(i / 13)];

/** Deterministic canonical grids for a GridType. */
function grids(s, count, seed = 1) {
  let state = seed;
  const next = n => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; };
  const S = s.gridSymbols === "cards" ? 52 : Number(s.gridSymbols.slice(4)), letters = PALETTES[s.gridColours];
  return Array.from({ length: count }, () => Array.from({ length: s.gridSize }, () =>
    Array.from({ length: s.gridSize }, () => {
      const sym = next(S);
      return (s.gridSymbols === "cards" ? CARD(sym) : "0123456789ABCDEF"[sym]) + letters[next(letters.length)];
    }).join(",")).join("/"));
}

let py, ts;
before(() => {
  py = new GameRuntime({ language: "python" });
  ts = new GameRuntime({ language: "typescript" });
});
after(() => { py.close(); ts.close(); });
const runtimes = () => ({ python: py, typescript: ts });

// --- equivalent agents ------------------------------------------------------------------------------
// Each entry is the same agent in both languages; `only` limits it to some GridTypes.
const CORPUS = [
  { py: "lambda grid: []", ts: "(grid) => []" },
  { py: 'lambda grid: [paint(row(0), "red")]', ts: '(grid) => [paint(row(0), "red")]' },
  // positional moves, chosen from what the grid shows
  { py: "lambda g: [swap_cells(g.cell(0, 0), (0, 1), 'colour'), shift_line(row(g.size - 1), -1), "
      + "reverse_line(column(0), 'symbol'), swap_lines(row(0), row(1)), turn_block(square(0, 0), 'rot90'), "
      + "turn_grid('transpose'), sort_line(row(max(range(g.size), key=lambda i: sum(c.value for c in g.rows[i]))), True), "
      + "mirror_fold(column(1), 'top->bottom')]",
    ts: "(g) => [swapCells(g.cell(0, 0), [0, 1], 'colour'), shiftLine(row(g.size - 1), -1), "
      + "reverseLine(column(0), 'symbol'), swapLines(row(0), row(1)), turnBlock(square(0, 0), 'rot90'), "
      + "turnGrid('transpose'), sortLine(row(g.rows.map(r => r.reduce((s, c) => s + c.value, 0))"
      + ".reduce((best, v, i, a) => v > a[best] ? i : best, 0)), true), mirrorFold(column(1), 'top->bottom')]" },
  // colour moves
  { py: "lambda g: [paint(busiest_line(), g.cell(0, 0).colour), paint(diagonal(0), g.palette[-1]), "
      + "recolour(ring(0), g.palette[0], g.palette[-1]), swap_colours(everywhere(), 0, 1), hue_turn(at(g.cell(1, 1)), 2), "
      + "pattern_line(row(0), 'ramp', next_colour(g.cell(1, 1).colour), True), motif('checker', g.palette[1], g.palette[2]), "
      + "majority_line(column(g.size - 1))]",
    ts: "(g) => [paint(busiestLine(), g.cell(0, 0).colour), paint(diagonal(0), g.palette[g.palette.length - 1]), "
      + "recolour(ring(0), g.palette[0], g.palette[g.palette.length - 1]), swapColours(everywhere(), 0, 1), hueTurn(at(g.cell(1, 1)), 2), "
      + "patternLine(row(0), 'ramp', nextColour(g.cell(1, 1).colour), true), motif('checker', g.palette[1], g.palette[2]), "
      + "majorityLine(column(g.size - 1))]" },
  { py: "lambda g: [motif('stripes down', g.cell(0, 0).colour), pattern_line(column(0), 'alternate', 2, 0), "
      + "mirror_fold(everywhere(), 'below->above other diagonal', 'colour'), recolour(busiest_line(), 'red', 'blue')]",
    ts: "(g) => [motif('stripes down', g.cell(0, 0).colour), patternLine(column(0), 'alternate', 2, 0), "
      + "mirrorFold(everywhere(), 'below->above other diagonal', 'colour'), recolour(busiestLine(), 'red', 'blue')]" },
  // symbol moves and couplers
  { py: "lambda g: [write(at(0, 0), g.cell(1, 1).symbol), step_rank(row(1), -1), write_ramp(column(0), g.cell(0, 0).value), "
      + "swap_symbols(square(0, 0), 1, 2), flatten(ring(0)), paint_by_key(row(0), 'parity', g.palette[0], g.palette[1]), "
      + "paint_by_key(everywhere(), 'mod', g.size), stamp(row(g.size - 1), g.palette[0], g.cell(2, 2).symbol)]",
    ts: "(g) => [write(at(0, 0), g.cell(1, 1).symbol), stepRank(row(1), -1), writeRamp(column(0), g.cell(0, 0).value), "
      + "swapSymbols(square(0, 0), 1, 2), flatten(ring(0)), paintByKey(row(0), 'parity', g.palette[0], g.palette[1]), "
      + "paintByKey(everywhere(), 'mod', g.size), stamp(row(g.size - 1), g.palette[0], g.cell(2, 2).symbol)]" },
  // capability-specific moves
  { only: [key(G3), key(G4)], py: "lambda g: [tally(square(0, 0), g.cell(0, 0).colour), tally(row(0), 2)]",
    ts: "(g) => [tally(square(0, 0), g.cell(0, 0).colour), tally(row(0), 2)]" },
  { only: [key(G5)],
    py: "lambda g: [tally(everywhere(), 'red'), blend(row(0), 'blue', 'yellow'), paint(middle(), mix('yellow', 'blue'))] "
      + "if mix('red', 'blue') is None else []",
    ts: "(g) => mix('red', 'blue') === null ? [tally(everywhere(), 'red'), blend(row(0), 'blue', 'yellow'), "
      + "paint(middle(), mix('yellow', 'blue')!)] : []" },
  { only: [key(G6)],
    py: "lambda g: [blend(everywhere(), 'red', 'yellow'), suit_swap(at(1, 1), 'hearts', '♠'), suit_set(column(2), g.cell(0, 0).suit), "
      + "paint_by_key(everywhere(), 'redblack', 'red', 'violet'), write(row(3), 'QH'), swap_symbols(row(0), 'A', 'K'), "
      + "write_ramp(row(5), 'Q', True), paint(middle(), mix('red', 'blue'))]",
    ts: "(g) => [blend(everywhere(), 'red', 'yellow'), suitSwap(at(1, 1), 'hearts', '♠'), suitSet(column(2), g.cell(0, 0).suit), "
      + "paintByKey(everywhere(), 'redblack', 'red', 'violet'), write(row(3), 'QH'), swapSymbols(row(0), 'A', 'K'), "
      + "writeRamp(row(5), 'Q', true), paint(middle(), mix('red', 'blue')!)]" },
  { only: [key(G6)], py: "lambda g: [suit_swap(c, 'hearts', 'clubs') for c in g.cells if c.is_picture][:8]",
    ts: "(g) => g.cells.filter(c => c.isPicture).slice(0, 8).map(c => suitSwap(c, 'hearts', 'clubs'))" },
  // agents that read the grid with the kid API helpers
  { py: "lambda g: [paint(c, g.palette[0]) for c in max(g.regions(lambda a, b: a.colour == b.colour), key=len)][:8]",
    ts: "(g) => g.regions((a, b) => a.colour === b.colour).reduce((best, r) => r.length > best.length ? r : best)"
      + ".slice(0, 8).map(c => paint(c, g.palette[0]))" },
  { py: "lambda g: [write(c, 0) for c in g.reachable(g.edge_cells, lambda c: c.value > 5)][:8]",
    ts: "(g) => g.reachable(g.edgeCells, c => c.value > 5).slice(0, 8).map(c => write(c, 0))" },
  { py: "lambda g: [swap_cells(g.cell(0, 0), g.quarter_turn(g.cell(0, 0)))] + [hue_turn(c) for c in g.cell(1, 1).surrounding if c.on_edge][:7]",
    ts: "(g) => [swapCells(g.cell(0, 0), g.quarterTurn(g.cell(0, 0))), ...g.cell(1, 1).surrounding.filter(c => c.onEdge).slice(0, 7).map(c => hueTurn(c))]" },
  { py: "lambda g: [reverse_line(column(i)) for i, col in enumerate(g.columns) if col[0].value > col[-1].value]",
    ts: "(g) => g.columns.flatMap((col, i) => col[0].value > col[col.length - 1].value ? [reverseLine(column(i))] : [])" },
  { py: "lambda g: [write(c, g.diagonals[1][0].symbol) for c in g.diagonals[0] if c.colour != g.diagonals[1][0].colour][:8]",
    ts: "(g) => g.diagonals[0].filter(c => c.colour !== g.diagonals[1][0].colour).slice(0, 8).map(c => write(c, g.diagonals[1][0].symbol))" },
  { py: "lambda g: [swap_cells(c, n, 'symbol') for c in g.cells for n in c.neighbours if n.right is c and n.value > c.value][:8]",
    ts: "(g) => g.cells.flatMap(c => c.neighbours.filter(n => n.right === c && n.value > c.value).map(n => swapCells(c, n, 'symbol'))).slice(0, 8)" },
  { py: "(lambda colours: lambda g: [paint(row(r), colours[r % len(colours)]) for r in range(min(g.size, 8)) if g.rows[r][0].up is None or g.rows[r][0].up.colour != colours[r % len(colours)]])(['red', 'blue'])",
    ts: "((colours: ColourName[]) => (g: Grid) => g.rows.slice(0, 8).flatMap((cells, r) => cells[0].up === null || cells[0].up.colour !== colours[r % colours.length] ? [paint(row(r), colours[r % colours.length])] : []))(['red', 'blue'])" },
];

for (const shipped of SHIPPED) {
  // Kid-API flood fills cost CPython-in-Wasm far more fuel than QuickJS; Grid rooms should grant
  // Python agents a larger interaction budget than the 5 ms default (see README).
  const settings = { ...shipped, interactionComputeMs: 25 };
  test(`${key(settings)}: Python and TypeScript agents agree byte for byte`, { timeout: 300000 }, async () => {
    const inputs = grids(settings, 4, settings.gridSize);
    const used = new Set();
    for (const agent of CORPUS.filter(a => !a.only || a.only.includes(key(settings)))) {
      const outputs = {};
      for (const [language, runtime] of Object.entries(runtimes())) {
        const source = language === "python" ? agent.py : agent.ts;
        const { cost } = await runtime.inspect(source, settings);
        assert.ok(cost > 0, source);
        outputs[language] = [];
        for (const input of inputs) {
          try { outputs[language].push((await runtime.execute(source, input, settings)).value); }
          catch (error) { assert.fail(`${language} ${key(settings)} ${source}\non ${input}\n${error.code}: ${error.message}`); }
        }
      }
      assert.deepEqual(outputs.typescript, outputs.python, agent.py);
      for (const output of outputs.python) {
        const calls = JSON.parse(output);
        assert.ok(Array.isArray(calls) && calls.length <= 8);
        for (const call of calls) used.add(call.m);
      }
    }
    // Every constructor available in this GridType was exercised.
    assert.deepEqual([...used].sort(), [...gridMutators(settings)].sort());
  });
}

test("identity agents, pricing of only the submission, and batches", { timeout: 120000 }, async () => {
  const [input] = grids(G5, 1);
  for (const [language, runtime] of Object.entries(runtimes())) {
    const source = language === "python" ? "lambda grid: []" : "(grid) => []";
    assert.deepEqual(await runtime.execute(source, input, G5), { value: "[]" });
    assert.deepEqual(await runtime.validate(source, grids(G5, 3), G5), { cost: language === "python" ? 6 : 5, outputs: ["[]", "[]", "[]"] });
    assert.deepEqual(await runtime.executeBatch(source, grids(G5, 3), G5), { values: ["[]", "[]", "[]"] });
  }
  // The prelude and wrapper are never priced: the same Python source costs the same as for Int.
  const ints = { objectType: "Int", intMin: -10, intMax: 10, stringMaxLength: 8 };
  for (const source of ["lambda grid: []", 'lambda g: [paint(row(0), "red"), write(at(1, 2), 7)]']) {
    assert.deepEqual(await py.inspect(source, G5), await py.inspect(source, ints));
  }
  assert.deepEqual(await ts.inspect('(grid) => [paint(row(0), "red")]', G5), { cost: 13 });
  // Grid settings are part of the compile cache key: a type error on one GridType only.
  await ts.inspect("(g) => [tally(row(0), 0)]", G5);
  await assert.rejects(ts.inspect("(g) => [tally(row(0), 0)]", G6), { code: "COMPILE" });
  await assert.rejects(ts.inspect('(g) => [paint(row(0), "yellow")]', G3), { code: "COMPILE" });
  await ts.inspect('(g) => [paint(row(0), "yellow")]', G5);
});

test("TypeScript agents are strictly typed against the GridType's declarations", { timeout: 120000 }, async () => {
  for (const [source, settings] of [
    ['(g) => [paint(row(0), "orange")]', G5], ["(g) => [{ m: 'paint', p: {} }]", G5], ["(g) => 5", G5],
    ["(g) => paint(row(0), 0)", G5], ["(g) => [tally(row(0), 0)]", G6], ["(g) => [blend(row(0), 0, 1)]", G3],
    ["(g) => [suitSet(row(0), 'spades')]", G5], ["(g) => g.cells[0].suit ? [] : []", G5],
    ["(g) => [paint(row(0))]", G5], ["(g) => [mix('red', 'blue') ? [] : []]", G3], ["(g) => [paint(row(0), 0)].concat(sum)", G5],
    ["(g: number) => []", G5], ["(g) => [patternLine(row(0), 'alternate', 'red')]", G5],
  ]) await assert.rejects(ts.inspect(source, settings), { code: "COMPILE" }, source);
  for (const [source, settings] of [
    ["(g) => g.cells.filter(c => c.isPicture && c.suit === 'hearts').map(c => suitSet(row(c.row), 'spades')).slice(0, 8)", G6],
    ["(g: Grid): MutatorCall[] => [mirrorFold(everywhere(), 'left->right'), mirrorFold(row(0), 0)]", G5],
    ["(g) => [square(g.cell(0, 0)), at([1, 1]), diagonal(), ring()].map(r => paint(r, 'red'))", G5],
  ]) assert.ok((await ts.inspect(source, settings)).cost > 0, source);
  // Diagnostics point into the player's own source, not the prelude declarations.
  await assert.rejects(ts.inspect('(g) => [paint(row(0), "pink")]', G5),
    e => /line 1, column 23/.test(e.message) && /"pink"/.test(e.message));
  // Every GridType's declarations typecheck, and declare exactly what the JS prelude installs.
  const QuickJS = await getQuickJS();
  for (const gridSize of [3, 4, 5, 6, 7]) for (const gridSymbols of ["base10", "base12", "base16", "cards"])
    for (const gridColours of ["rgb", "rgby", "rainbow6"]) {
      const settings = { objectType: "Grid", gridSize, gridSymbols, gridColours };
      const declared = [...gridDeclarations(settings).matchAll(/^declare function (\w+)/gm)].map(m => m[1]);
      const context = QuickJS.newContext();
      const globals = () => {
        const handle = context.unwrapResult(context.evalCode("Object.getOwnPropertyNames(globalThis)"));
        try { return context.dump(handle); } finally { handle.dispose(); }
      };
      try {
        const before = globals();
        const factory = context.unwrapResult(context.evalCode(PRELUDE_JS));
        const args = [context.newNumber(gridSize), context.newString(gridSymbols), context.newString(gridColours)];
        context.unwrapResult(context.callFunction(factory, context.undefined, ...args)).dispose();
        args.forEach(arg => arg.dispose());
        factory.dispose();
        const names = globals();
        const added = names.filter(n => !before.includes(n));
        assert.deepEqual([...new Set(declared)].sort(), [...added].sort(), key(settings));
        // Name hygiene: nothing replaces a QuickJS global, and no private name leaks.
        assert.equal(added.length, names.length - before.length);
        assert.ok(added.every(n => !n.startsWith("_")));
      } finally { context.dispose(); }
    }
  for (const settings of SHIPPED) {
    assert.deepEqual(await ts.inspect("(grid) => []", settings), { cost: 5 }, key(settings));
  }
});

test("constructor errors are EXECUTION with the kid-readable message; malformed results are DOMAIN", { timeout: 120000 }, async () => {
  const [input] = grids(G5, 1);
  for (const [language, runtime] of Object.entries(runtimes())) {
    const python = language === "python";
    for (const [source, pattern] of python ? [
      ["lambda g: [paint(row(7), 'red')]", /^row 7 doesn't exist on a 5×5 grid \(rows go from 0 to 4\)$/],
      ["lambda g: [paint(row(0), 'SyntaxError')]", /^"SyntaxError" isn't a colour on this grid; use one of red, yellow, green, blue/],
      ["lambda g: [recolour(at(0, 0), 'red', 'blue')]", /^recolour can't use one cell \(at\); it works on a row or column/],
      ["lambda g: [g.cell(9, 0)]", /^row 9 doesn't exist/],
      ["(lambda c: lambda g: [c])(paint(square(4, 4), 0))", /^a 2×2 square at row 4, column 4 doesn't fit on a 5×5 grid/],
      ["lambda g: [blend(row(0), 'red', 'green')]", /^red and green don't mix on this grid \(yellow \+ blue = green\)$/],
    ] : [
      ["(g) => [paint(row(7), 'red')]", /^row 7 doesn't exist on a 5×5 grid \(rows go from 0 to 4\)$/],
      ["(g) => [paint(row(0), 'SyntaxError' as any)]", /^"SyntaxError" isn't a colour on this grid; use one of red, yellow, green, blue/],
      ["(g) => [recolour(at(0, 0), 'red', 'blue')]", /^recolour can't use one cell \(at\); it works on a row or column/],
      ["(g) => [g.cell(9, 0) as any]", /^row 9 doesn't exist/],
      ["((c) => (g: Grid) => [c])(paint(square(4, 4), 0))", /^a 2×2 square at row 4, column 4 doesn't fit on a 5×5 grid/],
      ["(g) => [blend(row(0), 'red', 'green')]", /^red and green don't mix on this grid \(yellow \+ blue = green\)$/],
    ]) await assert.rejects(runtime.execute(source, input, G5), e => e.code === "EXECUTION" && pattern.test(e.message),
      `${language}: ${source}`);
    // A plain guest error keeps the runtime's generic message.
    await assert.rejects(runtime.execute(python ? "lambda g: [1 // 0]" : "(g) => { throw new Error('boom'); }", input, G5),
      e => e.code === "EXECUTION" && !/boom|division/.test(e.message));
    for (const [source, pattern] of python ? [
      ["lambda g: [paint(row(0), 0)] * 9", /at most 8 moves.*made 9/],
      ["lambda g: paint(row(0), 0)", /put the move in square brackets/],
      ["lambda g: [{'m': 'paint', 'p': {'kind': 'all', 'region': [], 'colour': 0}}]", /item 0 of the agent's list isn't a move/],
      ["lambda g: None", /must return a list of moves/],
      ["lambda g: (paint(row(0), 0), paint(row(1), 0))", /must return a list of moves/],
      ["lambda g: type('L', (list,), {})([paint(row(0), 0)])", /must return a list of moves/],
      ["lambda g: ['x' * 100000]", /item 0/],
    ] : [
      ["(g) => Array(9).fill(paint(row(0), 0))", /at most 8 moves.*made 9/],
      ["(g) => paint(row(0), 0) as any", /put the move in square brackets/],
      ["(g) => [{ m: 'paint', p: { kind: 'all', region: [], colour: 0 } }] as any", /item 0 of the agent's list isn't a move/],
      ["(g) => null as any", /must return a list of moves/],
      ["(g) => ['x'.repeat(100000)] as any", /item 0/],
      ["(g) => new Proxy([], { get: (t, k) => k === 'length' ? 1e9 : (t as any)[k] }) as any", /at most 8 moves/],
    ]) await assert.rejects(runtime.execute(source, input, G5), e => e.code === "DOMAIN" && pattern.test(e.message),
      `${language}: ${source}`);
  }
});

test("invalid Grid inputs and settings are DOMAIN errors before any guest code runs", { timeout: 120000 }, async () => {
  const [good5] = grids(G5, 1), [good6] = grids(G6, 1);
  const bad5 = [
    "", 5, null, good5 + "/", good5.replace("/", ","), good5.toLowerCase(), good5.replace(/[RYGB]/, "V"),
    good5.replace(/^[0-9]/, "A"), good5.slice(0, -1), good5.replace(",", ", "), good5.replace(/^./, "é"),
    good5 + "\0", good5.split("/").slice(0, 4).join("/"), " ".repeat(100), "7R/".repeat(5),
  ];
  const bad6 = [good6.replace(/^../, "1H"), good6.replace(/^../, "10H"), good6.replace(/^../, "th"), grids(G5, 1)[0]];
  for (const [language, runtime] of Object.entries(runtimes())) {
    const source = language === "python" ? "lambda g: []" : "(g) => []";
    for (const input of bad5) await assert.rejects(runtime.execute(source, input, G5), { code: "DOMAIN" }, JSON.stringify(input));
    for (const input of bad6) await assert.rejects(runtime.execute(source, input, G6), { code: "DOMAIN" }, input);
    await assert.rejects(runtime.executeBatch(source, [good5, "nope"], G5), { code: "DOMAIN" });
    for (const settings of [{ ...G5, gridSize: 8 }, { ...G5, gridSize: "5" }, { ...G5, gridSymbols: "base8" },
      { ...G5, gridColours: undefined }, { ...G5, interactionComputeMs: 0 }, { objectType: "grid", gridSize: 5 }]) {
      await assert.rejects(runtime.execute(source, good5, settings), { code: "DOMAIN" }, JSON.stringify(settings));
      await assert.rejects(runtime.inspect(source, settings), { code: "DOMAIN" });
    }
    assert.deepEqual(await runtime.execute(source, good5, G5), { value: "[]" });
  }
});

test("monkeypatched prelude objects and redefinitions do not persist across executions", { timeout: 120000 }, async () => {
  const [input] = grids(G5, 1);
  const check = '[{"m":"paint","p":{"kind":"line","region":[0,4],"colour":0}}]';
  for (const [language, runtime] of Object.entries(runtimes())) {
    const python = language === "python";
    const normal = python ? "lambda g: [paint(row(g.size - 1), 'red')]" : "(g) => [paint(row(g.size - 1), 'red')]";
    for (const poison of python ? [
      "lambda g: (setattr(type(g), 'size', property(lambda s: 1)), setattr(type(paint.__self__), 'paint', None), "
        + "setattr(type(paint.__self__), 'row', lambda self, i: everywhere()), [])[-1]",
      "lambda g: (globals().update(paint=None, row=None), __import__('__main__').__dict__.update(_gridrt=None), [])[-1]",
      "lambda g: (setattr(type(paint.__self__).encode, '__code__', (lambda self, calls: '[]').__code__), "
        + "setattr(__import__('builtins'), 'type', lambda x: list), [])[-1]",
      "lambda g: (setattr(type(row(0)), 'kind', property(lambda s: 'all')), setattr(type(row(0)), '__repr__', None), "
        + "setattr(type(paint(row(0), 0)), 'm', 'evil'), __import__('json').encoder.__dict__.clear(), [])[-1]",
    ] : [
      "(g) => { (globalThis as any).paint = null; (globalThis as any).row = () => everywhere(); return []; }",
      "(g) => { (Array.prototype as any).push = null; (Object.prototype as any).kind = 'all'; (WeakMap.prototype as any).get = () => undefined; return []; }",
      "(g) => { try { Object.defineProperty(Object.getPrototypeOf(g), 'size', { get: () => 1 }); } catch {} (String.prototype as any).slice = () => ''; return []; }",
    ]) {
      assert.deepEqual(await runtime.execute(poison, input, G5), { value: "[]" }, poison);
      assert.deepEqual(await runtime.execute(normal, input, G5), { value: check }, `${language} after ${poison}`);
    }
    // Within one execution a poisoned encoder only hurts the player: output is re-checked.
    if (python) {
      for (const [forged, code] of [
        ["'x' * 9000", "DOMAIN"], ["'[1]'", "DOMAIN"], ["'[{\"m\":\"paint\"}]'", "DOMAIN"], ["'[\\u00e9]'", "DOMAIN"], ["1", "DOMAIN"],
      ]) {
        await assert.rejects(runtime.execute(
          `lambda g: (setattr(type(paint.__self__).encode, '__code__', (lambda self, calls: ${forged}).__code__), [])[1]`, input, G5),
        { code }, forged);
      }
      // A well-shaped forgery passes the runtime; the host validates `p` against Grid Lab's space.
      assert.deepEqual(await runtime.execute(
        `lambda g: (setattr(type(paint.__self__).encode, '__code__', (lambda self, calls: '[{"m":"paint","p":{"evil":1}}]').__code__), [])[1]`,
        input, G5), { value: '[{"m":"paint","p":{"evil":1}}]' });
    }
    assert.deepEqual(await runtime.execute(normal, input, G5), { value: check });
  }
});

test("prelude objects grant no host capabilities", { timeout: 120000 }, async () => {
  const [input] = grids(G5, 1);
  for (const source of [
    "lambda g: (paint.__func__.__globals__['__builtins__']['open']('/etc/passwd').read(), [])[1]",
    "lambda g: (type(g).cells.fget.__globals__['__builtins__']['__import__']('os').listdir('/lib'), [])[1]",
    "lambda g: (__import__('__main__')._gridrt.__dict__['__builtins__']['__import__']('socket').socket(), [])[1]",
    "lambda g: (paint.__self__.fail.__globals__['__builtins__']['__import__']('os').system('true'), [])[1]",
    "lambda g: (print('[]'), [])[1]",
  ]) await assert.rejects(py.execute(source, input, G5), { code: "EXECUTION" }, source);
  assert.deepEqual(await py.execute("lambda g: [] if len(__import__('os').environ) == 1 else [paint(row(0), 0)]", input, G5), { value: "[]" });
  for (const source of [
    "(g) => (paint as any).constructor('return typeof process + typeof require + typeof fetch + typeof __clock + typeof __entropy')() === 'undefined'.repeat(5) ? [] : [paint(row(0), 0)]",
    "(g) => Object.getOwnPropertyDescriptor(Math, 'random')!.writable === false && typeof Date.now() === 'number' ? [] : [paint(row(0), 0)]",
    "(g) => Object.getOwnPropertyNames(globalThis).some(n => n.startsWith('__') && n !== '__proto__') ? [paint(row(0), 0)] : []",
    "(g) => (g as any).__rows.length === 5 && Object.isFrozen(g.cells[0]) ? [] : [paint(row(0), 0)]",
  ]) assert.deepEqual(await ts.execute(source, input, G5), { value: "[]" }, source);
  // The prelude leaves the real clock capability in place.
  const before = Math.floor(Date.now() / 1000) % 4;
  const time = await ts.execute("(g) => [paint(row(0), Math.floor(Date.now() / 1000) % 4)]", input, G5);
  assert.ok([before, Math.floor(Date.now() / 1000) % 4].includes(JSON.parse(time.value)[0].p.colour));
});

test("the guest compute budget still bounds Grid agents, the prelude and the encoder", { timeout: 120000 }, async () => {
  const [input] = grids(G5, 1);
  for (const source of [
    "lambda g: sum(iter(lambda: 1, 0))",
    "lambda g: [None for _ in iter(lambda: g.regions(lambda a, b: True), 0)]",
    "(sum(iter(lambda: 1, 0)), lambda g: [])[1]",
    "lambda g: (setattr(__import__('builtins'), 'len', lambda x: sum(iter(lambda: 1, 0))), [])[1]",
  ]) await assert.rejects(py.execute(source, input, G5), { code: "LIMIT" }, source);
  for (const source of [
    "(g) => { for (;;) g.regions(() => true); }",
    "(() => { for (;;) {} return (g: Grid) => []; })()",
    "(g) => new Proxy([paint(row(0), 0)], { get: (t, k) => { if (k === '0') for (;;) {} return (t as any)[k]; } }) as any",
  ]) await assert.rejects(ts.execute(source, input, G5), { code: "LIMIT" }, source);
  const busy = { ...G5, interactionComputeMs: 50 };
  assert.ok(JSON.parse((await py.execute("lambda g: [paint(c, 0) for c in g.cells][:8]", input, busy)).value).length === 8);
  assert.deepEqual(await ts.execute("(g) => []", input, G5), { value: "[]" });
  assert.deepEqual(await py.execute("lambda g: []", input, G5), { value: "[]" });
});
