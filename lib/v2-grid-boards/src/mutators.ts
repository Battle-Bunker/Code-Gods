/**
 * The board's mutators: the old game's moves (archive lib/game-types/src/grid/mutators.ts) that are their own way back,
 * so every move's inverse is proposed with the same weight and the price list is an exact potential (owner decision
 * 19). The old moves that cannot be undone (sort, mirror-fold, paint an area, recolour an area) are not carried: they
 * erase what they overwrite, which a potential walk cannot price.
 *
 * Prices. Positions and choices cost their log2 (the same both ways); an amount added to a symbol costs in proportion to
 * its size (v2-core amountCode: a move of k costs exactly |k| moves of 1). A colour is flat under the law, so changing
 * one costs only its choice: the colour moves are representation shortcuts (owner decision 25).
 */
import { argBits, choiceBits, whichBits, type ArgCode, type ArgHelp, type Invalid, type Mutator, type Rng, type Variant } from "@workspace/v2-core";
import { boardParams, COLOURS, inDomain, isCard, paletteOf, SUIT_NAMES, type BoardState } from "./board.ts";
import { cellLabel, cellName, lineCells, lineNames, lineWords } from "./units.ts";

export type BoardArgs = Readonly<Record<string, string | number>>;
type M = Mutator<BoardState, BoardArgs>;

// ---------------------------------------------------------------- argument codes (as lib/v2-grid's)

interface Field {
  values(maxBits: number): (string | number)[];
  bits(v: string | number): number;
  sample(rng: Rng): string | number | null;
  decode(w: unknown): string | number;
}
const oneOf = (names: readonly string[]): Field => ({
  values: max => (choiceBits(names.length) <= max + 1e-9 ? [...names] : []),
  bits: () => choiceBits(names.length),
  sample: rng => names[rng.below(names.length)]!,
  decode: w => { if (typeof w !== "string" || !names.includes(w)) throw new RangeError(`must be one of ${names.join(", ")}`); return w; },
});
const amountBits = (k: number, _o: number): number => argBits(k, true);
/** Amounts beyond this are not listed (a board holds small digits; the code grows only like log k, so listing by price never ends). */
const MAX_LISTED_AMOUNT = 20;
/** A nonzero amount drawn with each extra binary digit half as likely, and a random sign (for births' walk). */
const sampleK = (rng: Rng): number => { let L = 1; while (L < 30 && rng.below(2) === 1) L++; const lo = 2 ** (L - 1); const m = lo + rng.below(lo); return rng.below(2) ? m : -m; };
function decodeAmount(w: unknown): number {
  const s = typeof w === "number" ? String(w) : w;
  if (typeof s !== "string" || !/^-?\d+$/.test(s)) throw new RangeError("must be a whole number");
  const k = Number(s);
  if (k === 0) throw new RangeError("must not be 0");
  return k;
}
function fields(base: number, spec: Readonly<Record<string, Field>>, amount = false): ArgCode<BoardArgs> {
  const choiceNames = Object.keys(spec);
  const names = amount ? [...choiceNames, "k"] : choiceNames;
  const choiceBitsOf = (a: BoardArgs) => choiceNames.reduce((t, k) => t + spec[k]!.bits(a[k]!), 0);
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
          for (let k = 1; k <= MAX_LISTED_AMOUNT && p.bits + amountBits(k, o) <= maxBits + 1e-9; k++) for (const x of [k, -k]) out.push({ a: { ...p.a, k: x }, bits: p.bits + amountBits(x, o) });
          return out;
        });
      }
      return partial.sort((x, y) => x.bits - y.bits).map(x => x.a);
    },
    bits: a => { const c = choiceBitsOf(a); return amount ? c + amountBits(a.k as number, base + c) : c; },
    sample: rng => {
      const out: Record<string, string | number> = {};
      for (const k of choiceNames) { const v = spec[k]!.sample(rng); if (v === null) return null; out[k] = v; }
      if (amount) out.k = sampleK(rng);
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
const base = (v: Variant, id: string): number => whichBits(v, id);

// ---------------------------------------------------------------- helpers

const N = (v: Variant) => boardParams(v).size;
const cellNames = (n: number) => Array.from({ length: n * n }, (_, i) => cellName(n, i));
const cellIndex = (n: number, name: string): number => cellNames(n).indexOf(name);
const cards = (v: Variant) => isCard(boardParams(v).symbols);
const k = (a: BoardArgs) => a.k as number;
const signed = (x: number) => (x > 0 ? `+${x}` : `−${-x}`);
const cellWords = (name: unknown): string => {
  const [, r, c] = /^r(\d+)c(\d+)$/.exec(String(name))!;
  return `row ${Number(r!) + 1}, column ${Number(c!) + 1}`;
};
const help = (label: string, hint: string, example: string, choices?: Record<string, string>): ArgHelp =>
  (choices ? { label, hint, example, choices } : { label, hint, example });
const cellChoices = (n: number) => Object.fromEntries(Array.from({ length: n * n }, (_, i) => [cellName(n, i), cellLabel(n, i)]));
const lineChoices = (n: number) => Object.fromEntries(lineNames(n).map(l => [l, lineWords(l)]));
const cellHelp = (n: number, label = "Which cell", hint = "rows count from the top, columns from the left", i = 0) => help(label, hint, cellName(n, i), cellChoices(n));
const lineHelp = (n: number) => help("Which row or column", "rows count from the top, columns from the left", lineNames(n)[0]!, lineChoices(n));

/** The board with cells moved: cell i takes its symbol from symFrom(i) and its colour from colFrom(i). */
function move(s: BoardState, v: Variant, symFrom: (i: number) => number, colFrom: (i: number) => number = symFrom): BoardState | Invalid {
  return inDomain({ ...s, sym: s.sym.map((_, i) => s.sym[symFrom(i)]!), col: s.col.map((_, i) => s.col[colFrom(i)]!) }, v);
}
const id = (i: number) => i;

// ---------------------------------------------------------------- the moves

/** Add k to a cell's number (a card's rank; its suit stays). */
const add: M = {
  id: "cells.add", reps: ["cells"], title: "add to one cell's number", perSite: false,
  argHelp: v => ({ cell: cellHelp(N(v)), k: help("How much", `a whole number such as 1 or −2: below 0 takes away${cards(v) ? " (a card keeps its suit; ace is 1, king 13)" : ""}`, "1") }),
  describe: a => `${signed(k(a))} in ${cellWords(a.cell)}`,
  args: v => fields(base(v, "cells.add"), { cell: oneOf(cellNames(N(v))) }, true),
  apply: (s, _site, a, v) => {
    const i = cellIndex(N(v), a.cell as string), x = s.sym[i]!;
    if (cards(v)) {
      const r = (x % 13) + k(a);
      if (r < 0 || r > 12) return { invalid: "a card runs from ace (1) to king (13)" };
      return inDomain({ ...s, sym: s.sym.map((y, j) => (j === i ? x - (x % 13) + r : y)) }, v);
    }
    return inDomain({ ...s, sym: s.sym.map((y, j) => (j === i ? x + k(a) : y)) }, v);
  },
  inverse: { kind: "mutator", id: "cells.add", args: a => ({ ...a, k: -k(a) }) },
};

const WHAT: Readonly<Record<string, string>> = { both: "number and colour", colours: "colours only", symbols: "numbers only" };
/** Swap two cells, or just their colours, or just their numbers (the old "Swap"). */
const swap: M = {
  id: "cells.swap", reps: ["cells"], title: "swap two cells (or just their colours, or just their numbers)", perSite: false,
  argHelp: v => ({ a: cellHelp(N(v), "First cell"), b: cellHelp(N(v), "Second cell", "a different cell from the first", 1), what: help("What moves", "the whole cell, its colour only, or its number only", "both", WHAT) }),
  describe: a => `swap ${cellWords(a.a)} and ${cellWords(a.b)}${a.what === "both" ? "" : ` (${WHAT[a.what as string]})`}`,
  args: v => fields(base(v, "cells.swap"), { a: oneOf(cellNames(N(v))), b: oneOf(cellNames(N(v))), what: oneOf(Object.keys(WHAT)) }),
  apply: (s, _site, a, v) => {
    const n = N(v), i = cellIndex(n, a.a as string), j = cellIndex(n, a.b as string);
    if (i === j) return { invalid: "swap needs two different cells" };
    const other = (x: number) => (x === i ? j : x === j ? i : x);
    return a.what === "colours" ? move(s, v, id, other) : a.what === "symbols" ? move(s, v, other, id) : move(s, v, other);
  },
  inverse: { kind: "self" },
};

/** Slide a row or column along j places, the last cells coming round to the front (the old "Slide"). */
const slideFor = (n: number): M => ({
  id: "lines.slide", reps: ["cells"], title: "slide a row or column along, wrapping round the end", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)), j: help("How many places along", "each cell moves this many places; the last ones come round to the front", "1", Object.fromEntries(Array.from({ length: N(v) - 1 }, (_, i) => [String(i + 1), `${i + 1} place${i ? "s" : ""}`]))) }),
  describe: a => `slide ${lineWords(a.line as string)} ${a.j} place${a.j === "1" ? "" : "s"} along`,
  args: v => fields(base(v, "lines.slide"), { line: oneOf(lineNames(N(v))), j: oneOf(Array.from({ length: N(v) - 1 }, (_, i) => String(i + 1))) }),
  apply: (s, _site, a, v) => {
    const cs = lineCells(N(v), a.line as string), j = Number(a.j), L = cs.length;
    const src = new Map(cs.map((c, pos) => [c, cs[(pos - j + L) % L]!]));
    return move(s, v, i => src.get(i) ?? i);
  },
  inverse: { kind: "mutator", id: "lines.slide", args: a => ({ ...a, j: String(n - Number(a.j)) }) },
});

/** Write a row or column backwards (the old "Reverse"). */
const reverse: M = {
  id: "lines.reverse", reps: ["cells"], title: "write a row or column backwards", perSite: false,
  argHelp: v => ({ line: lineHelp(N(v)) }),
  describe: a => `write ${lineWords(a.line as string)} backwards`,
  args: v => fields(base(v, "lines.reverse"), { line: oneOf(lineNames(N(v))) }),
  apply: (s, _site, a, v) => {
    const cs = lineCells(N(v), a.line as string);
    const src = new Map(cs.map((c, pos) => [c, cs[cs.length - 1 - pos]!]));
    return move(s, v, i => src.get(i) ?? i);
  },
  inverse: { kind: "self" },
};

/** Swap two whole rows, or two whole columns (the old "Swap rows"). */
const swapLines: M = {
  id: "lines.swap", reps: ["cells"], title: "swap two whole rows or two whole columns", perSite: false,
  argHelp: v => ({ a: help("First row or column", "both must be rows, or both columns", "row0", lineChoices(N(v))), b: help("Second row or column", "a different row (or column) from the first", "row1", lineChoices(N(v))) }),
  describe: a => `swap ${lineWords(a.a as string)} and ${lineWords(a.b as string)}`,
  args: v => fields(base(v, "lines.swap"), { a: oneOf(lineNames(N(v))), b: oneOf(lineNames(N(v))) }),
  apply: (s, _site, a, v) => {
    if (a.a === a.b) return { invalid: "swap needs two different lines" };
    if (String(a.a).slice(0, 3) !== String(a.b).slice(0, 3)) return { invalid: "swap two rows or two columns, not a row with a column" };
    const n = N(v), x = lineCells(n, a.a as string), y = lineCells(n, a.b as string);
    const src = new Map<number, number>([...x.map((c, p) => [c, y[p]!] as [number, number]), ...y.map((c, p) => [c, x[p]!] as [number, number])]);
    return move(s, v, i => src.get(i) ?? i);
  },
  inverse: { kind: "self" },
};

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
/** Turn or flip the whole board (the old "Spin the grid"). */
const spin: M = {
  id: "board.spin", reps: ["cells"], title: "turn or flip the whole board", perSite: false,
  argHelp: () => ({ how: help("Turn or flip", "the whole board moves; no cell changes", "half", SPIN_WORDS) }),
  describe: a => SPIN_WORDS[a.how as string]!,
  args: v => fields(base(v, "board.spin"), { how: oneOf(Object.keys(SPINS)) }),
  apply: (s, _site, a, v) => {
    const n = N(v), f = SPINS[a.how as string]!;
    return move(s, v, i => { const [r, c] = f(n, Math.floor(i / n), i % n); return r * n + c; });
  },
  inverse: { kind: "mutator", id: "board.spin", args: a => ({ how: a.how === "quarter" ? "three-quarters" : a.how === "three-quarters" ? "quarter" : a.how! }) },
};

const AREA_WORDS = (n: number): Record<string, string> => ({ ...cellChoices(n), ...lineChoices(n), all: "the whole board" });
const areaCells = (n: number, area: string): number[] =>
  area === "all" ? Array.from({ length: n * n }, (_, i) => i) : /^r\d+c\d+$/.test(area) ? [cellIndex(n, area)] : lineCells(n, area);
const areaNames = (n: number) => [...cellNames(n), ...lineNames(n), "all"];
const areaWords = (n: number, area: string) => (area === "all" ? "the whole board" : /^r\d+c\d+$/.test(area) ? cellWords(area) : lineWords(area));

/** Move colours j steps along the board's rainbow, wrapping round, in a cell, a line or the whole board (the old "Rainbow step"). */
const hueFor = (n: number, C: number): M => ({
  id: "colours.step", reps: ["cells"], title: "move colours along the rainbow (wrapping round), in a cell, a line or the whole board", perSite: false,
  argHelp: v => ({ area: help("Where", "one cell, a row, a column or the whole board", "all", AREA_WORDS(N(v))), j: help("How many steps", "each colour moves this many steps along the board's colours, the last coming round to the first", "1", Object.fromEntries(Array.from({ length: C - 1 }, (_, i) => [String(i + 1), `${i + 1} step${i ? "s" : ""}`]))) }),
  describe: a => `move the colours of ${areaWords(n, a.area as string)} ${a.j} step${a.j === "1" ? "" : "s"} along the rainbow`,
  args: v => fields(base(v, "colours.step"), { area: oneOf(areaNames(N(v))), j: oneOf(Array.from({ length: C - 1 }, (_, i) => String(i + 1))) }),
  apply: (s, _site, a, v) => {
    const pal = paletteOf(v), j = Number(a.j);
    if (pal.length !== C) return { invalid: `this move is for boards of ${C} colours` };
    const inArea = new Set(areaCells(n, a.area as string));
    return inDomain({ ...s, col: s.col.map((c, i) => (inArea.has(i) ? pal[(pal.indexOf(c) + j) % C]! : c)) }, v);
  },
  inverse: { kind: "mutator", id: "colours.step", args: a => ({ ...a, j: String(C - Number(a.j)) }) },
});

/** Two colours trade places everywhere on the board: every A becomes B and every B becomes A (the old "Trade colours"). */
const trade: M = {
  id: "colours.trade", reps: ["cells"], title: "two colours trade places all over the board", perSite: false,
  argHelp: v => {
    const ch = Object.fromEntries(paletteOf(v).map(c => [COLOURS[c]!.name, COLOURS[c]!.name]));
    return { a: help("First colour", "every cell of this colour takes the second", COLOURS[paletteOf(v)[0]!]!.name, ch), b: help("Second colour", "every cell of this colour takes the first", COLOURS[paletteOf(v).at(-1)!]!.name, ch) };
  },
  describe: a => `every ${a.a} cell becomes ${a.b} and every ${a.b} cell ${a.a}`,
  args: v => fields(base(v, "colours.trade"), { a: oneOf(paletteOf(v).map(c => COLOURS[c]!.name)), b: oneOf(paletteOf(v).map(c => COLOURS[c]!.name)) }),
  apply: (s, _site, a, v) => {
    if (a.a === a.b) return { invalid: "trade needs two different colours" };
    const x = COLOURS.findIndex(c => c.name === a.a), y = COLOURS.findIndex(c => c.name === a.b);
    return inDomain({ ...s, col: s.col.map(c => (c === x ? y : c === y ? x : c)) }, v);
  },
  inverse: { kind: "self" },
};

/** A card takes another suit (its rank stays): cards only. */
const suit: M = {
  id: "cards.suit", reps: ["cells"], title: "change a card's suit (its rank stays)", perSite: false,
  argHelp: v => ({ cell: cellHelp(N(v)), j: help("How many suits along", "♠ → ♥ → ♦ → ♣ → ♠", "1", { "1": "one suit along", "2": "two suits along", "3": "three suits along" }) }),
  describe: a => `move the card in ${cellWords(a.cell)} ${a.j} suit${a.j === "1" ? "" : "s"} along (${SUIT_NAMES.join(" → ")})`,
  args: v => fields(base(v, "cards.suit"), { cell: oneOf(cellNames(N(v))), j: oneOf(["1", "2", "3"]) }),
  apply: (s, _site, a, v) => {
    if (!cards(v)) return { invalid: "only a card has a suit" };
    const i = cellIndex(N(v), a.cell as string), x = s.sym[i]!;
    const moved = ((Math.floor(x / 13) + Number(a.j)) % 4) * 13 + (x % 13);
    return inDomain({ ...s, sym: s.sym.map((y, j) => (j === i ? moved : y)) }, v);
  },
  inverse: { kind: "mutator", id: "cards.suit", args: a => ({ ...a, j: String(4 - Number(a.j)) }) },
};

/** Every move of a board of side n with C colours: the number moves, the colour moves when C > 1, the suit move on cards. */
export function boardMutators(n: number, C: number, withCards: boolean): readonly M[] {
  return [add, swap, slideFor(n), reverse, swapLines, spin, ...(C > 1 ? [hueFor(n, C), trade] : []), ...(withCards ? [suit] : [])];
}
