/**
 * The grid's nine mutators (docs/engine-v2/grids.md §4), each tied to a representation. Positions are choices (their
 * log2 is the move's handling fee, the same both ways); amounts are priced by steps (owner decision 17); v2-core adds
 * "which" (log2 9) and the confining surcharge (half the growth of the board's total). Every move's inverse is proposed
 * with the same weight, so the price list is an exact potential (owner decision 19; test/potential.test.ts).
 */
import { choiceBits, sampleStepsNonzero, stepsNonzeroBits, type ArgCode, type Invalid, type Mutator, type Rng, type Variant } from "@workspace/v2-core";
import { at, cellLabel, cellName, gridParams, inDomain, type GridState } from "./grid.ts";
import { BOX_NAMES, boxes, lines, pairs } from "./units.ts";

export type GridArgs = Readonly<Record<string, string | number>>;

// ---------------------------------------------------------------- argument codes

interface Field {
  /** Every value priced at most maxBits. */
  values(maxBits: number): (string | number)[];
  bits(v: string | number): number;
  sample(rng: Rng): string | number | null;
  decode(w: unknown): string | number;
}

/** One of a few named choices, equally likely. */
const oneOf = (names: readonly string[]): Field => ({
  values: max => (choiceBits(names.length) <= max + 1e-9 ? [...names] : []),
  bits: () => choiceBits(names.length),
  sample: rng => names[rng.below(names.length)]!,
  decode: w => { if (typeof w !== "string" || !names.includes(w)) throw new RangeError(`must be one of ${names.join(", ")}`); return w; },
});

/** A nonzero whole amount, priced by steps: 1 + ½(|k| − 1) + 1.77 bits. */
const amount: Field = {
  values: max => { const out: number[] = []; for (let k = 1; stepsNonzeroBits(BigInt(k)) <= max + 1e-9; k++) out.push(k, -k); return out; },
  bits: v => stepsNonzeroBits(BigInt(v)),
  sample: rng => Number(sampleStepsNonzero(rng)),
  decode: w => {
    const s = typeof w === "number" ? String(w) : w;
    if (typeof s !== "string" || !/^-?\d+$/.test(s)) throw new RangeError("must be a whole number");
    const k = Number(s);
    if (k === 0) throw new RangeError("must not be 0");
    return k;
  },
};

function fields(spec: Readonly<Record<string, Field>>): ArgCode<GridArgs> {
  const names = Object.keys(spec);
  return {
    enumerate: maxBits => {
      let partial: { a: Record<string, string | number>; bits: number }[] = [{ a: {}, bits: 0 }];
      for (const k of names) {
        const f = spec[k]!;
        const vals = f.values(maxBits).map(v => ({ v, bits: f.bits(v) }));
        const next: typeof partial = [];
        for (const p of partial) for (const { v, bits } of vals) if (p.bits + bits <= maxBits + 1e-9) next.push({ a: { ...p.a, [k]: v }, bits: p.bits + bits });
        partial = next;
      }
      return partial.sort((x, y) => x.bits - y.bits).map(x => x.a);
    },
    bits: a => names.reduce((t, k) => t + spec[k]!.bits(a[k]!), 0),
    sample: rng => {
      const out: Record<string, string | number> = {};
      for (const k of names) { const v = spec[k]!.sample(rng); if (v === null) return null; out[k] = v; }
      return out;
    },
    encode: a => Object.fromEntries(names.map(k => [k, String(a[k])])),
    decode: w => {
      if (typeof w !== "object" || w === null) throw new TypeError("arguments must be an object");
      const rec = w as Record<string, unknown>;
      const extra = Object.keys(rec).filter(k => !names.includes(k));
      if (extra.length) throw new RangeError(`unknown argument ${extra[0]}`);
      const out: Record<string, string | number> = {};
      for (const k of names) {
        if (!(k in rec)) throw new RangeError(`missing argument ${k}`);
        try { out[k] = spec[k]!.decode(rec[k]); } catch (e) { throw new RangeError(`${k} ${(e as Error).message}`); }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- helpers

const N = (v: Variant) => gridParams(v).size;
const cellNames = (n: number) => Array.from({ length: n * n }, (_, i) => cellName(n, i));
const cellIndex = (n: number, name: string): number => cellNames(n).indexOf(name);
const lineCells = (n: number, name: string): number[] => lines(n).find(l => l.name === name)!.cells;

/** A board with some cells changed, or why not (a number past the cap or below 0). */
function write(s: GridState, v: Variant, changes: readonly [number, number][]): GridState | Invalid {
  const cells = s.cells.slice();
  for (const [i, x] of changes) cells[i] = x;
  return inDomain({ cells }, v);
}
const addTo = (s: GridState, v: Variant, cells: readonly number[], f: (pos: number) => number): GridState | Invalid =>
  write(s, v, cells.map((i, pos) => [i, s.cells[i]! + f(pos)] as [number, number]));
const permute = (s: GridState, src: (i: number) => number): GridState => ({ cells: s.cells.map((_, i) => s.cells[src(i)]!) });

type M = Mutator<GridState, GridArgs>;
const k = (a: GridArgs) => a.k as number;
const signed = (x: number) => (x > 0 ? `+${x}` : `−${-x}`);
/** People's words for an argument (element names are for agents): r1c2 → "row 2, column 3", col0 → "column 1". */
const cellWords = (name: unknown): string => {
  const [, r, c] = /^r(\d+)c(\d+)$/.exec(String(name))!;
  return `row ${Number(r!) + 1}, column ${Number(c!) + 1}`;
};
const lineWords = (name: unknown): string => {
  const [, kind, i] = /^(row|col)(\d+)$/.exec(String(name))!;
  return `${kind === "row" ? "row" : "column"} ${Number(i!) + 1}`;
};

// ---------------------------------------------------------------- the nine

export const add: M = {
  id: "cells.add", reps: ["cells"], title: "add to one cell", perSite: false,
  describe: a => `${signed(k(a))} in ${cellWords(a.cell)}`,
  args: v => fields({ cell: oneOf(cellNames(N(v))), k: amount }),
  apply: (s, _site, a, v) => { const i = cellIndex(N(v), a.cell as string); return addTo(s, v, [i], () => k(a)); },
  inverse: { kind: "mutator", id: "cells.add", args: a => ({ ...a, k: -k(a) }) },
};

export const swap: M = {
  id: "cells.swap", reps: ["cells"], title: "swap two cells", perSite: false,
  describe: a => `swap ${cellWords(a.a)} and ${cellWords(a.b)}`,
  args: v => fields({ a: oneOf(cellNames(N(v))), b: oneOf(cellNames(N(v))) }),
  apply: (s, _site, a, v) => {
    const i = cellIndex(N(v), a.a as string), j = cellIndex(N(v), a.b as string);
    if (i === j) return { invalid: "swap needs two different cells" };
    return write(s, v, [[i, s.cells[j]!], [j, s.cells[i]!]]);
  },
  inverse: { kind: "self" },
};

export const lineAdd: M = {
  id: "tally.add", reps: ["tally"], title: "add to every cell of a row or column", perSite: false,
  describe: a => `${signed(k(a))} in every cell of ${lineWords(a.line)}`,
  args: v => fields({ line: oneOf(lines(N(v)).map(l => l.name)), k: amount }),
  apply: (s, _site, a, v) => addTo(s, v, lineCells(N(v), a.line as string), () => k(a)),
  inverse: { kind: "mutator", id: "tally.add", args: a => ({ ...a, k: -k(a) }) },
};

/** Built per board size: moving j places along is undone by moving N − j (the same line, a choice of the same price). */
export const rotateFor = (n: number): M => ({
  id: "tally.rotate", reps: ["tally"], title: "move a row's or column's numbers along, the last coming round to the front", perSite: false,
  describe: a => `move ${lineWords(a.line)}'s numbers ${a.j} place${a.j === "1" ? "" : "s"} along`,
  args: v => fields({ line: oneOf(lines(N(v)).map(l => l.name)), j: oneOf(Array.from({ length: N(v) - 1 }, (_, i) => String(i + 1))) }),
  apply: (s, _site, a, v) => {
    const cs = lineCells(N(v), a.line as string), j = Number(a.j), L = cs.length;
    return write(s, v, cs.map((c, pos) => [c, s.cells[cs[(pos - j + L) % L]!]!] as [number, number]));
  },
  inverse: { kind: "mutator", id: "tally.rotate", args: a => ({ ...a, j: String(n - Number(a.j)) }) },
});

/** The board's turns and flips: where cell (r, c) takes its number from. */
const SPINS: Readonly<Record<string, (n: number, r: number, c: number) => [number, number]>> = {
  "quarter": (n, r, c) => [n - 1 - c, r],
  "half": (n, r, c) => [n - 1 - r, n - 1 - c],
  "three-quarters": (n, r, c) => [c, n - 1 - r],
  "flip-rows": (n, r, c) => [n - 1 - r, c],
  "flip-columns": (n, r, c) => [r, n - 1 - c],
  "flip-diagonal": (_n, r, c) => [c, r],
  "flip-antidiagonal": (n, r, c) => [n - 1 - c, n - 1 - r],
};
const SPIN_WORDS: Readonly<Record<string, string>> = {
  "quarter": "turn the board a quarter turn clockwise", "half": "turn the board half way round",
  "three-quarters": "turn the board a quarter turn anticlockwise", "flip-rows": "flip the board upside down",
  "flip-columns": "flip the board left to right", "flip-diagonal": "flip the board over its main diagonal",
  "flip-antidiagonal": "flip the board over its other diagonal",
};
export const spin: M = {
  id: "turn.spin", reps: ["turn"], title: "turn or flip the whole board", perSite: false,
  describe: a => SPIN_WORDS[a.how as string]!,
  args: () => fields({ how: oneOf(Object.keys(SPINS)) }),
  apply: (s, _site, a, v) => {
    const n = N(v), f = SPINS[a.how as string]!;
    return permute(s, i => { const [r, c] = f(n, Math.floor(i / n), i % n); return at(n, r, c); });
  },
  inverse: { kind: "mutator", id: "turn.spin", args: a => ({ how: a.how === "quarter" ? "three-quarters" : a.how === "three-quarters" ? "quarter" : a.how! }) },
};

/** Built per board size: its words name the pair's two cells. */
export const balanceFor = (n: number): M => ({
  id: "turn.balance", reps: ["turn"], title: "move an amount from a cell to its opposite (their total is kept)", perSite: false,
  describe: a => {
    const [i, j] = pairs(n)[Number(String(a.pair).slice(4))]!;
    return `${signed(k(a))} in ${cellLabel(n, i)} and ${signed(-k(a))} in its opposite, ${cellLabel(n, j)}`;
  },
  args: v => fields({ pair: oneOf(pairs(N(v)).map((_, i) => `pair${i}`)), k: amount }),
  apply: (s, _site, a, v) => {
    const [i, j] = pairs(N(v))[Number((a.pair as string).slice(4))]!;
    return write(s, v, [[i, s.cells[i]! + k(a)], [j, s.cells[j]! - k(a)]]);
  },
  inverse: { kind: "mutator", id: "turn.balance", args: a => ({ ...a, k: -k(a) }) },
});

export const reverse: M = {
  id: "mirror.reverse", reps: ["mirror"], title: "write a row or column backwards", perSite: false,
  describe: a => `write ${lineWords(a.line)} backwards`,
  args: v => fields({ line: oneOf(lines(N(v)).map(l => l.name)) }),
  apply: (s, _site, a, v) => {
    const cs = lineCells(N(v), a.line as string);
    return write(s, v, cs.map((c, pos) => [c, s.cells[cs[cs.length - 1 - pos]!]!] as [number, number]));
  },
  inverse: { kind: "self" },
};

export const tilt: M = {
  id: "steps.tilt", reps: ["steps"], title: "make every step along a row or column bigger by k (the first number stays)", perSite: false,
  describe: a => `${signed(k(a))} on every step along ${lineWords(a.line)}`,
  args: v => fields({ line: oneOf(lines(N(v)).map(l => l.name)), k: amount }),
  apply: (s, _site, a, v) => addTo(s, v, lineCells(N(v), a.line as string), pos => pos * k(a)),
  inverse: { kind: "mutator", id: "steps.tilt", args: a => ({ ...a, k: -k(a) }) },
};

export const boxAdd: M = {
  id: "boxes.add", reps: ["boxes"], title: "add to every cell of a corner box", perSite: false,
  describe: a => `${signed(k(a))} in every cell of the ${BOX_NAMES[Number(String(a.box).slice(3))]} box`,
  args: v => fields({ box: oneOf(boxes(N(v)).map((_, i) => `box${i}`)), k: amount }),
  apply: (s, _site, a, v) => addTo(s, v, boxes(N(v))[Number((a.box as string).slice(3))]!, () => k(a)),
  inverse: { kind: "mutator", id: "boxes.add", args: a => ({ ...a, k: -k(a) }) },
};

/** The nine, for an N×N board, in the order every grid variant offers them. */
export const gridMutators = (n: number): readonly M[] => [add, swap, lineAdd, rotateFor(n), spin, balanceFor(n), reverse, tilt, boxAdd];
