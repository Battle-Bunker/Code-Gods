/**
 * Builds the prelude parity fixture: for a covering set of Grid instantiations, sample grids, the
 * generated Python prelude, and the JS prelude's answers to every kid-API read helper. test/parity.py
 * runs the Python prelude and lib/grid-lab/gridlab/kid.py on the same grids and compares.
 *
 *   node --experimental-strip-types test/parity-fixture.ts [out.json]
 */
import { writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  COLOUR_COMPONENTS, GRID, GRID_COLOUR_SETS, GRID_SIZES, GRID_SYMBOL_SETS, SYMBOL_COMPONENTS, seededRng, type GridValue,
} from "../src/index.ts";

/** Same digest as parity.py's `digest`, over the camelCase JS API. */
export const JS_DIGEST = `
function __digest(g, mixable) {
  const pos = (c) => (c === null ? null : [c.row, c.col]);
  const many = (cs) => cs.map(pos);
  const dirs = ["left", "right", "up", "down", "upLeft", "upRight", "downLeft", "downRight"];
  const out = {
    size: g.size, palette: g.palette,
    cells: g.cells.map((c) => [c.row, c.col, c.symbol, c.value, c.colour, c.onEdge,
      c.suit === undefined ? null : c.suit, c.isPicture === undefined ? null : c.isPicture]),
    links: g.cells.map((c) => [...dirs.map((d) => pos(c[d])), many(c.neighbours), many(c.surrounding)]),
    rows: g.rows.map(many), columns: g.columns.map(many), diagonals: g.diagonals.map(many), edge: many(g.edgeCells),
    lookup: g.cells.map((c) => g.cell(c.row, c.col) === c),
    quarter: g.cells.map((c) => pos(g.quarterTurn(c))),
    reachEdge: many(g.reachable(g.edgeCells, (c) => c.colour !== g.palette[0])),
    reachOne: many(g.reachable(g.cell(0, 0), (c) => c.value % 2 === 0)),
    regionsColour: g.regions((a, b) => a.colour === b.colour).map(many),
    regionsValue: g.regions((a, b) => a.value === b.value).map(many),
    next: g.palette.map((p) => nextColour(p)),
    mix: mixable ? g.palette.flatMap((a) => g.palette.map((b) => [a, b, mix(a, b)])) : null,
  };
  return JSON.stringify(out);
}
`;

/** Calls whose encoding both languages must agree on byte for byte. */
export const CALL_SAMPLES: readonly unknown[] = [
  null, [], { __m: "noop" },
  [{ __m: "swap", a: [0, 1], b: [2, 3] }, { __m: "paint", colour: "red", cells: [[0, 0]], z: null, flag: true, off: false }],
  [{ __m: "write", text: "quote\" back\\slash\ttabé\u0000\u007f😀", n: -9007199254740991, k: 0 }],
  [{ __m: "nest", deep: { b: [1, [2, [3]]], a: { y: 1, x: 2 } } }],
];

export function instantiations() {
  const out = [];
  let i = 0;
  for (const symbols of GRID_SYMBOL_SETS) for (const colours of GRID_COLOUR_SETS) out.push({ size: GRID_SIZES[i++ % 5], symbols, colours });
  for (const size of GRID_SIZES) out.push({ size, symbols: "base10", colours: "rgby" });
  return out.map(a => GRID.instantiate(a));
}

export function buildFixture() {
  const cases = instantiations().map((inst, k) => {
    const rng = seededRng(`parity:${inst.key}`), codec = GRID.codec(inst), t = inst.args as { size: number };
    const values: GridValue[] = [0, 1, 2].map(() => GRID.spawn(inst, rng));
    const n = t.size * t.size;
    values.push({ size: t.size, sym: new Uint8Array(n), col: new Uint8Array(n) });                // one big region
    values.push({ size: t.size, sym: Uint8Array.from({ length: n }, (_, i) => i % 3), col: Uint8Array.from({ length: n }, (_, i) => (i >> 1) % 2) });
    const prelude = GRID.prelude(inst), mixable = inst.classes.includes("Mixable");
    const grids = values.map(g => {
      const wire = codec.encode(g) as string;
      const js = runInNewContext(`${prelude.js}\n${JS_DIGEST}\n__digest(__decode(${JSON.stringify(wire)}), ${mixable});`, {}) as string;
      return { wire, sym: [...g.sym], col: [...g.col], js: JSON.parse(js) };
    });
    const calls = k === 0 ? CALL_SAMPLES.map(c => runInNewContext(`${prelude.js}\n__encode_calls(${JSON.stringify(c)});`, {}) as string) : [];
    return { key: inst.key, args: inst.args, classes: inst.classes, python: prelude.python, grids, calls };
  });
  const components = {
    symbols: Object.fromEntries(GRID_SYMBOL_SETS.map(id => [id, SYMBOL_COMPONENTS[id]])),
    colours: Object.fromEntries(GRID_COLOUR_SETS.map(id => [id, COLOUR_COMPONENTS[id]])),
  };
  return { cases, callSamples: CALL_SAMPLES, components };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? new URL("./fixtures/prelude-parity.json", import.meta.url).pathname;
  writeFileSync(out, JSON.stringify(buildFixture()));
}
