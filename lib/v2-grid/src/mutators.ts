/**
 * The grid's twelve mutators (docs/engine-v2/grids.md §4), each tied to a representation: the nine of the first
 * build and three of v1's moves restored (swap two lines, turn a 2×2 square, add to a ring or the whole board). A
 * fourth, trading two numbers in an area (v1 swap_symbols), is restored but held back (gridMutators, below). Positions are choices (their
 * log2 is the move's handling fee, the same both ways); amounts are priced in proportion to their size (the call's
 * whole fee is rate·|k|: v2-core codes.ts, "far moves are dear"); v2-core adds "which" (log2 12) and the confining
 * surcharge (half the growth of the board's total). Every move's inverse is proposed with the same weight, so the
 * price list is an exact potential (owner decision 19; test/potential.test.ts).
 */
import { amountCode, choiceBits, sampleAmount, whichBits, type ArgCode, type Invalid, type ArgHelp, type Mutator, type Rng, type Variant } from "@workspace/v2-core";
import { at, cellLabel, cellName, gridParams, inDomain, type GridState } from "./grid.ts";
import { BOX_NAMES, RING_NAMES, RING_WORDS, bigSquares, boxes, lines, pairs, rings, windows } from "./units.ts";

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

/**
 * The amount part of a call: a nonzero whole number, priced against the rest of the call (v2-core codes.ts, "far moves
 * are dear"): with o the bits of which + the call's choices, k costs rate(o)·|k| − o, so the call's whole fee is
 * rate(o)·|k| and a move of k costs exactly |k| moves of 1.
 */
const amountBits = (k: number, o: number): number => amountCode(o, 1, false).bits(Math.abs(k));
function decodeAmount(w: unknown): number {
  const s = typeof w === "number" ? String(w) : w;
  if (typeof s !== "string" || !/^-?\d+$/.test(s)) throw new RangeError("must be a whole number");
  const k = Number(s);
  if (k === 0) throw new RangeError("must not be 0");
  return k;
}

/** The argument code of choices `spec` and, when `amount`, an amount k, for a call whose "which" costs `base` bits. */
function fields(base: number, spec: Readonly<Record<string, Field>>, amount = false): ArgCode<GridArgs> {
  const choiceNames = Object.keys(spec);
  const names = amount ? [...choiceNames, "k"] : choiceNames;
  const choiceBitsOf = (a: GridArgs) => choiceNames.reduce((t, k) => t + spec[k]!.bits(a[k]!), 0);
  return {
    enumerate: maxBits => {
      let partial: { a: Record<string, string | number>; bits: number }[] = [{ a: {}, bits: 0 }];
      for (const k of choiceNames) {
        const f = spec[k]!;
        const vals = f.values(maxBits).map(v => ({ v, bits: f.bits(v) }));
        const next: typeof partial = [];
        for (const p of partial) for (const { v, bits } of vals) if (p.bits + bits <= maxBits + 1e-9) next.push({ a: { ...p.a, [k]: v }, bits: p.bits + bits });
        partial = next;
      }
      if (amount) {
        partial = partial.flatMap(p => {
          const o = base + p.bits, out: typeof partial = [];
          for (let k = 1; p.bits + amountBits(k, o) <= maxBits + 1e-9; k++) for (const x of [k, -k]) out.push({ a: { ...p.a, k: x }, bits: p.bits + amountBits(x, o) });
          return out;
        });
      }
      return partial.sort((x, y) => x.bits - y.bits).map(x => x.a);
    },
    bits: a => { const c = choiceBitsOf(a); return amount ? c + amountBits(a.k as number, base + c) : c; },
    sample: rng => {
      const out: Record<string, string | number> = {};
      for (const k of choiceNames) { const v = spec[k]!.sample(rng); if (v === null) return null; out[k] = v; }
      if (amount) out.k = Number(sampleAmount(rng, base + choiceBitsOf(out), false)!.n);
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
        try { out[k] = amount && k === "k" ? decodeAmount(rec[k]) : spec[k]!.decode(rec[k]); } catch (e) { throw new RangeError(`${k} ${(e as Error).message}`); }
      }
      return out;
    },
  };
}

/** "which": log2 of the variant's mutators. */
const base = (v: Variant, id: string): number => whichBits(v, id);

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


// ---------------------------------------------------------------- each argument said for a person (round 23)

const help = (label: string, hint: string, example: string, choices?: Record<string, string>): ArgHelp =>
  (choices ? { label, hint, example, choices } : { label, hint, example });
const cellChoices = (n: number) => Object.fromEntries(Array.from({ length: n * n }, (_, i) => [cellName(n, i), cellLabel(n, i)]));
const lineChoices = (n: number) => Object.fromEntries(lines(n).map(l => [l.name, lineWords(l.name)]));
const amountHelp = (what: string) => help("How much", `a whole number such as 1 or −2: ${what}`, "1");
const lineHelp = (n: number) => help("Which row or column", "rows count from the top, columns from the left", lines(n)[0]!.name, lineChoices(n));

// ---------------------------------------------------------------- the first nine

export const add: M = {
  id: "cells.add", reps: ["cells"], title: "add to one cell", perSite: false,
  argHelp: v => ({ cell: help("Which cell", "rows count from the top, columns from the left", cellName(N(v), 0), cellChoices(N(v))), k: amountHelp("below 0 takes away") }),
  describe: a => `${signed(k(a))} in ${cellWords(a.cell)}`,
  args: v => fields(base(v, "cells.add"), { cell: oneOf(cellNames(N(v))) }, true),
  apply: (s, _site, a, v) => { const i = cellIndex(N(v), a.cell as string); return addTo(s, v, [i], () => k(a)); },
  inverse: { kind: "mutator", id: "cells.add", args: a => ({ ...a, k: -k(a) }) },
};

export const swap: M = {
  id: "cells.swap", reps: ["cells"], title: "swap two cells", perSite: false,
  argHelp: v => ({ a: help("First cell", "the two cells trade numbers", cellName(N(v), 0), cellChoices(N(v))), b: help("Second cell", "a different cell from the first", cellName(N(v), 1), cellChoices(N(v))) }),
  describe: a => `swap ${cellWords(a.a)} and ${cellWords(a.b)}`,
  args: v => fields(base(v, "cells.swap"), { a: oneOf(cellNames(N(v))), b: oneOf(cellNames(N(v))) }),
  apply: (s, _site, a, v) => {
    const i = cellIndex(N(v), a.a as string), j = cellIndex(N(v), a.b as string);
    if (i === j) return { invalid: "swap needs two different cells" };
    return write(s, v, [[i, s.cells[j]!], [j, s.cells[i]!]]);
  },
  inverse: { kind: "self" },
};

export const lineAdd: M = {
  id: "tally.add", reps: ["tally"], title: "add to every cell of a row or column", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)), k: amountHelp("added to every cell of it; below 0 takes away") }),
  describe: a => `${signed(k(a))} in every cell of ${lineWords(a.line)}`,
  args: v => fields(base(v, "tally.add"), { line: oneOf(lines(N(v)).map(l => l.name)) }, true),
  apply: (s, _site, a, v) => addTo(s, v, lineCells(N(v), a.line as string), () => k(a)),
  inverse: { kind: "mutator", id: "tally.add", args: a => ({ ...a, k: -k(a) }) },
};

/** Built per board size: moving j places along is undone by moving N − j (the same line, a choice of the same price). */
export const rotateFor = (n: number): M => ({
  id: "tally.rotate", reps: ["tally"], title: "move a row's or column's numbers along, the last coming round to the front", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)), j: help("How many places along", "each number moves this many places; the last ones come round to the front", "1", Object.fromEntries(Array.from({ length: N(v) - 1 }, (_, i) => [String(i + 1), `${i + 1} place${i ? "s" : ""}`]))) }),
  describe: a => `move ${lineWords(a.line)}'s numbers ${a.j} place${a.j === "1" ? "" : "s"} along`,
  args: v => fields(base(v, "tally.rotate"), { line: oneOf(lines(N(v)).map(l => l.name)), j: oneOf(Array.from({ length: N(v) - 1 }, (_, i) => String(i + 1))) }),
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
  argHelp: () => ({ how: help("Turn or flip", "the whole board moves; no number changes", "half", SPIN_WORDS) }),
  describe: a => SPIN_WORDS[a.how as string]!,
  args: v => fields(base(v, "turn.spin"), { how: oneOf(Object.keys(SPINS)) }),
  apply: (s, _site, a, v) => {
    const n = N(v), f = SPINS[a.how as string]!;
    return permute(s, i => { const [r, c] = f(n, Math.floor(i / n), i % n); return at(n, r, c); });
  },
  inverse: { kind: "mutator", id: "turn.spin", args: a => ({ how: a.how === "quarter" ? "three-quarters" : a.how === "three-quarters" ? "quarter" : a.how! }) },
};

/** Built per board size: its words name the pair's two cells. */
export const balanceFor = (n: number): M => ({
  id: "turn.balance", reps: ["turn"], title: "move an amount from a cell to its opposite (their total is kept)", perSite: false,
  argHelp: v => ({ pair: help("Which pair of opposite cells", "a cell and the cell half a turn away from it", "pair0", Object.fromEntries(pairs(N(v)).map(([i, j], x) => [`pair${x}`, `${cellLabel(N(v), i)} and ${cellLabel(N(v), j)}`]))), k: amountHelp("added to the first cell and taken from the second (below 0: the other way)") }),
  describe: a => {
    const [i, j] = pairs(n)[Number(String(a.pair).slice(4))]!;
    return `${signed(k(a))} in ${cellLabel(n, i)} and ${signed(-k(a))} in its opposite, ${cellLabel(n, j)}`;
  },
  args: v => fields(base(v, "turn.balance"), { pair: oneOf(pairs(N(v)).map((_, i) => `pair${i}`)) }, true),
  apply: (s, _site, a, v) => {
    const [i, j] = pairs(N(v))[Number((a.pair as string).slice(4))]!;
    return write(s, v, [[i, s.cells[i]! + k(a)], [j, s.cells[j]! - k(a)]]);
  },
  inverse: { kind: "mutator", id: "turn.balance", args: a => ({ ...a, k: -k(a) }) },
});

export const reverse: M = {
  id: "mirror.reverse", reps: ["mirror"], title: "write a row or column backwards", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)) }),
  describe: a => `write ${lineWords(a.line)} backwards`,
  args: v => fields(base(v, "mirror.reverse"), { line: oneOf(lines(N(v)).map(l => l.name)) }),
  apply: (s, _site, a, v) => {
    const cs = lineCells(N(v), a.line as string);
    return write(s, v, cs.map((c, pos) => [c, s.cells[cs[cs.length - 1 - pos]!]!] as [number, number]));
  },
  inverse: { kind: "self" },
};

export const tilt: M = {
  id: "steps.tilt", reps: ["steps"], title: "make every step along a row or column bigger by k (the first number stays)", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)), k: amountHelp("every step along it grows by this; the first number stays") }),
  describe: a => `${signed(k(a))} on every step along ${lineWords(a.line)}`,
  args: v => fields(base(v, "steps.tilt"), { line: oneOf(lines(N(v)).map(l => l.name)) }, true),
  apply: (s, _site, a, v) => addTo(s, v, lineCells(N(v), a.line as string), pos => pos * k(a)),
  inverse: { kind: "mutator", id: "steps.tilt", args: a => ({ ...a, k: -k(a) }) },
};

export const boxAdd: M = {
  id: "boxes.add", reps: ["boxes"], title: "add to every cell of a corner box", perSite: false,
  argHelp: v => ({ box: help("Which corner box", "a quarter of the board", "box0", Object.fromEntries(BOX_NAMES.map((b, i) => [`box${i}`, `the ${b} box`]))), k: amountHelp("added to every cell of it; below 0 takes away") }),
  describe: a => `${signed(k(a))} in every cell of the ${BOX_NAMES[Number(String(a.box).slice(3))]} box`,
  args: v => fields(base(v, "boxes.add"), { box: oneOf(boxes(N(v)).map((_, i) => `box${i}`)) }, true),
  apply: (s, _site, a, v) => addTo(s, v, boxes(N(v))[Number((a.box as string).slice(3))]!, () => k(a)),
  inverse: { kind: "mutator", id: "boxes.add", args: a => ({ ...a, k: -k(a) }) },
};

// ---------------------------------------------------------------- v1's moves restored (swap_lines, turn_block, swap_symbols, add's ring and whole-board areas)

/** v1 swap_lines: two rows, or two columns, trade places. A shortcut: two line choices, whatever the lines hold (decision 25). */
export const lineSwap: M = {
  id: "tally.swap", reps: ["tally"], title: "swap two rows, or two columns", perSite: false,
  argHelp: v => ({
    a: help("First row or column", "the two trade places; both rows or both columns", lines(N(v))[0]!.name, lineChoices(N(v))),
    b: help("Second row or column", "a different row (or column) from the first", lines(N(v))[1]!.name, lineChoices(N(v))),
  }),
  describe: a => `swap ${lineWords(a.a)} and ${lineWords(a.b)}`,
  args: v => fields(base(v, "tally.swap"), { a: oneOf(lines(N(v)).map(l => l.name)), b: oneOf(lines(N(v)).map(l => l.name)) }),
  apply: (s, _site, a, v) => {
    const x = a.a as string, y = a.b as string;
    if (x === y) return { invalid: "swap needs two different rows or columns" };
    if (x.slice(0, 3) !== y.slice(0, 3)) return { invalid: "swap two rows or two columns, not a row with a column" };
    const p = lineCells(N(v), x), q = lineCells(N(v), y);
    return write(s, v, [...p.map((c, t) => [c, s.cells[q[t]!]!] as [number, number]), ...q.map((c, t) => [c, s.cells[p[t]!]!] as [number, number])]);
  },
  inverse: { kind: "self" },
};

/** The 2×2 squares (the windows representation's w0 … w8), named for people by their top-left cell. */
const squareWords = (n: number, k: number, size = 2): string =>
  `the ${size}×${size} square whose top-left cell is ${cellLabel(n, (size === 2 ? windows(n) : bigSquares(n, size))[k]![0]!)}`;
const SQUARE_TURNS: Readonly<Record<string, string>> = {
  "quarter": "a quarter turn clockwise", "half": "half way round", "three-quarters": "a quarter turn anticlockwise",
  "flip-rows": "upside down", "flip-columns": "left to right", "flip-diagonal": "over its main diagonal", "flip-antidiagonal": "over its other diagonal",
};
const turnVerb = (how: string) => (how.startsWith("flip") ? "flip" : "turn");

/** v1 turn_block: a 2×2 square anywhere on the board turned or flipped, like a tile. A shortcut: square and turn are choices. Built per board size (its words name the square). */
export const squareTurnFor = (n: number): M => ({
  id: "windows.turn", reps: ["windows"], title: "turn or flip a 2×2 square", perSite: false,
  argHelp: v => ({
    square: help("Which 2×2 square", "named by its top-left cell; the squares overlap", "w0", Object.fromEntries(windows(N(v)).map((_, k) => [`w${k}`, squareWords(N(v), k)]))),
    how: help("Turn or flip", "the square's four numbers move; none changes", "quarter", SQUARE_TURNS),
  }),
  describe: a => `${turnVerb(a.how as string)} ${squareWords(n, Number(String(a.square).slice(1)))} ${SQUARE_TURNS[a.how as string]}`,
  args: v => fields(base(v, "windows.turn"), { square: oneOf(windows(N(v)).map((_, k) => `w${k}`)), how: oneOf(Object.keys(SPINS)) }),
  apply: (s, _site, a, v) => {
    const sq = windows(N(v))[Number((a.square as string).slice(1))]!, f = SPINS[a.how as string]!;
    return write(s, v, sq.map((c, i) => { const [r, cc] = f(2, Math.floor(i / 2), i % 2); return [c, s.cells[sq[at(2, r, cc)]!]!] as [number, number]; }));
  },
  inverse: { kind: "mutator", id: "windows.turn", args: a => ({ ...a, how: a.how === "quarter" ? "three-quarters" : a.how === "three-quarters" ? "quarter" : a.how! }) },
});

/** v1's ring areas: the outer ring, the centre, the whole board (rings.add; also three of cells.trade's areas). */
const ringAreas = (n: number): { name: string; words: string; cells: readonly number[] }[] => [
  ...rings(n).map((cells, d) => ({ name: RING_NAMES[d]!, words: RING_WORDS[RING_NAMES[d]!]!, cells })),
  { name: "all", words: "the whole board", cells: Array.from({ length: n * n }, (_, i) => i) },
];

/** The areas v1's swap_symbols trades in: every row and column, every 2×2 and 3×3 square, the rings, the whole board. */
const tradeAreas = (n: number): { name: string; words: string; cells: readonly number[] }[] => [
  ...lines(n).map(l => ({ name: l.name, words: lineWords(l.name), cells: l.cells })),
  ...windows(n).map((cells, k) => ({ name: `w${k}`, words: squareWords(n, k), cells })),
  ...bigSquares(n).map((cells, k) => ({ name: `big${k}`, words: squareWords(n, k, 3), cells })),
  ...ringAreas(n),
];
const digits = (v: Variant) => Array.from({ length: gridParams(v).cap + 1 }, (_, i) => String(i));
const digitChoices = (v: Variant) => Object.fromEntries(digits(v).map(d => [d, `every ${d}`]));

/** v1 swap_symbols: inside an area, every a becomes b and every b becomes a. A shortcut: area and both numbers are choices. Built per board size (its words name the area). */
export const tradeFor = (n: number): M => ({
  id: "cells.trade", reps: ["cells"], title: "trade two numbers inside an area: every a becomes b and every b becomes a", perSite: false,
  argHelp: v => ({
    area: help("Where", "a row or column, a square, a ring or the whole board", "all", Object.fromEntries(tradeAreas(N(v)).map(x => [x.name, x.words]))),
    a: help("One number", "every one of these in the area becomes the other number", "0", digitChoices(v)),
    b: help("The other number", "a different number from the first", "1", digitChoices(v)),
  }),
  describe: a => `every ${a.a} becomes ${a.b} and every ${a.b} becomes ${a.a} in ${tradeAreas(n).find(x => x.name === a.area)!.words}`,
  args: v => fields(base(v, "cells.trade"), { area: oneOf(tradeAreas(N(v)).map(x => x.name)), a: oneOf(digits(v)), b: oneOf(digits(v)) }),
  apply: (s, _site, a, v) => {
    const x = Number(a.a), y = Number(a.b);
    if (x === y) return { invalid: "trade needs two different numbers" };
    const cells = tradeAreas(N(v)).find(t => t.name === a.area)!.cells;
    return write(s, v, cells.filter(i => s.cells[i] === x || s.cells[i] === y).map(i => [i, s.cells[i] === x ? y : x] as [number, number]));
  },
  inverse: { kind: "self" },
});

const RING_SAY: Readonly<Record<string, string>> = { outer: "the outer ring", centre: "the centre", all: "the board" };
export const ringAdd: M = {
  id: "rings.add", reps: ["rings"], title: "add to every cell of the outer ring, the centre, or the whole board", perSite: false,
  argHelp: v => ({ ring: help("Where", "the outer ring of cells, the four middle cells, or every cell", "outer", Object.fromEntries(ringAreas(N(v)).map(x => [x.name, x.words]))), k: amountHelp("added to every cell of it; below 0 takes away") }),
  describe: a => `${signed(k(a))} in every cell of ${RING_SAY[a.ring as string]}`,
  args: v => fields(base(v, "rings.add"), { ring: oneOf(ringAreas(N(v)).map(x => x.name)) }, true),
  apply: (s, _site, a, v) => addTo(s, v, ringAreas(N(v)).find(x => x.name === a.ring)!.cells, () => k(a)),
  inverse: { kind: "mutator", id: "rings.add", args: a => ({ ...a, k: -k(a) }) },
};

/**
 * The twelve, for an N×N board, in the order every grid variant offers them (so "which" is log2 12, and the birth
 * walk draws from these). `cells.trade` (tradeFor) is restored but HELD BACK from the menu (the coordinator, 16 Nov):
 * with it the energy gate's climber takes Two Pair / apart to its top, 53.3 bits, for about 125⚡ (trading small
 * numbers for 9s keeps each box's two pairs). It waits for the Two Pair redesign; heldGridMutators lists it.
 */
export const gridMutators = (n: number): readonly M[] => [add, swap, lineAdd, rotateFor(n), spin, balanceFor(n), reverse, tilt, boxAdd, lineSwap, squareTurnFor(n), ringAdd];
/** Restored moves held back from every grid variant's menu (above), with their code and tests kept. */
export const heldGridMutators = (n: number): readonly M[] => [tradeFor(n)];
