/**
 * The old game's coloured boards on engine v2 (archive/engine-v1 lib/game-types/src/grid/components.ts, codec.ts):
 * an N×N board whose every cell holds a symbol (a digit in base 10, 12 or 16, or a playing card) and a colour from one
 * of four sets. Copied and cleaned: the tables, codes and wire are the old game's.
 *
 * State. `sym[i]` is the symbol's index (digits: the digit; cards: suit·13 + rank, rank 0…12 = A…K, suit ♠ ♥ ♦ ♣);
 * `col[i]` is a colour in one palette shared by every set, in spectral order: R O Y G B V, then P (the one plain colour
 * of a numbers-only board). The wire needs no variant: every symbol code and colour letter is unique across sets.
 *
 * Law. Energy is per cell and a product (as the digit board, docs/engine-v2/grids.md §2): a symbol worth v costs
 * step·v bits (half a bit a unit), its suit and its colour are flat (log2 of how many there are). So the walk's
 * stationary law makes every cell independent: value geometric, colour and suit uniform.
 */
import type { Invalid, Variant } from "@workspace/v2-core";

export const BOARD_SIZES = [4, 5, 6, 7] as const;
export const SYMBOL_SETS = ["base10", "base12", "base16", "cards"] as const;
export const COLOUR_SETS = ["mono", "rgb", "rgby", "rainbow6"] as const;
export type SymbolSet = (typeof SYMBOL_SETS)[number];
export type ColourSet = (typeof COLOUR_SETS)[number];

export interface BoardState {
  /** N·N symbol indices in reading order. */
  readonly sym: readonly number[];
  /** N·N colours (indices into COLOURS) in reading order. */
  readonly col: readonly number[];
  /** A board of playing cards (the wire must know: a low card's index is also a hex digit's). */
  readonly cards?: true;
}

export interface BoardParams {
  readonly size: number;
  readonly symbols: SymbolSet;
  readonly colours: ColourSet;
  /** Bits of energy per unit of a symbol's value. */
  readonly step: number;
}

// ---------------------------------------------------------------- symbols

const DIGITS = "0123456789ABCDEF";
const DIGIT_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
export const RANK_CODES = "A23456789TJQK";
export const RANK_GLYPHS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const RANK_NAMES = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king"];
export const SUIT_CODES = "SHDC";
export const SUIT_GLYPHS = ["♠", "♥", "♦", "♣"] as const;
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"] as const;

/** How many symbols a set has. */
export const symbolCount = (set: SymbolSet): number => (set === "cards" ? 52 : set === "base16" ? 16 : set === "base12" ? 12 : 10);
/** The rank of a card (0 = ace … 12 = king) or a digit's value. */
export const rankOf = (set: SymbolSet, s: number): number => (set === "cards" ? s % 13 : s);
/** A card's suit (0 ♠, 1 ♥, 2 ♦, 3 ♣); digits have none. */
export const suitOf = (s: number): number => Math.floor(s / 13);
export const isCard = (set: SymbolSet): boolean => set === "cards";

/** The code of a symbol on the wire: one character for a digit, two (rank, suit) for a card. */
export function symbolCode(set: SymbolSet, s: number): string {
  return set === "cards" ? RANK_CODES[s % 13]! + SUIT_CODES[suitOf(s)]! : DIGITS[s]!;
}
/** How a symbol is shown: "7", "B", "10♥". */
export function symbolGlyph(set: SymbolSet, s: number): string {
  return set === "cards" ? RANK_GLYPHS[s % 13]! + SUIT_GLYPHS[suitOf(s)]! : DIGITS[s]!;
}
/** A symbol's name for people: "seven", "eleven", "ten of hearts". */
export function symbolName(set: SymbolSet, s: number): string {
  return set === "cards" ? `${RANK_NAMES[s % 13]} of ${SUIT_NAMES[suitOf(s)]}` : DIGIT_NAMES[s]!;
}

// ---------------------------------------------------------------- colours

export interface Colour { readonly letter: string; readonly name: string; readonly css: string; readonly ink: string; readonly pattern: string }
/** Every colour, in spectral order, then plain. The old game's palette (css chosen for distinct lightness). */
export const COLOURS: readonly Colour[] = [
  { letter: "R", name: "red", css: "#d7263d", ink: "#ffffff", pattern: "diagonal-up" },
  { letter: "O", name: "orange", css: "#f28c28", ink: "#1a1a1a", pattern: "dots" },
  { letter: "Y", name: "yellow", css: "#f5d000", ink: "#1a1a1a", pattern: "horizontal" },
  { letter: "G", name: "green", css: "#2e9e44", ink: "#1a1a1a", pattern: "grid" },
  { letter: "B", name: "blue", css: "#2667c9", ink: "#ffffff", pattern: "vertical" },
  { letter: "V", name: "violet", css: "#7b3fb8", ink: "#ffffff", pattern: "cross" },
  { letter: "P", name: "plain", css: "#f4f1ea", ink: "#1a1a1a", pattern: "none" },
];
const LETTER = new Map(COLOURS.map((c, i) => [c.letter, i]));
export const PLAIN = 6;
const SETS: Readonly<Record<ColourSet, readonly number[]>> = {
  mono: [PLAIN], rgb: [0, 3, 4], rgby: [0, 2, 3, 4], rainbow6: [0, 1, 2, 3, 4, 5],
};
/** The set's colours, in spectral order. */
export const colourSet = (set: ColourSet): readonly number[] => SETS[set];

// ---------------------------------------------------------------- variants and the law

export function boardParams(v: Variant): BoardParams {
  const p = v.params as Partial<BoardParams>;
  return { size: p.size ?? 4, symbols: p.symbols ?? "base10", colours: p.colours ?? "rgb", step: p.step ?? 0.5 };
}
/** The variant's colours, in spectral order. */
export const paletteOf = (v: Variant): readonly number[] => SETS[boardParams(v).colours];
/** What a symbol is worth: a digit its value, a card A = 1 … K = 13. */
export const symbolValue = (v: Variant, s: number): number => (isCard(boardParams(v).symbols) ? (s % 13) + 1 : s);

/** log2 of the cell code's normaliser: Σ over symbols of 2^−step·value, times the colours. */
export function log2Z(v: Variant): number {
  const { symbols, step } = boardParams(v);
  let z = 0;
  for (let s = 0; s < symbolCount(symbols); s++) z += 2 ** (-step * symbolValue(v, s));
  return Math.log2(z * paletteOf(v).length);
}
/** The bits to read one cell (its energy): step·value + log2 Z; the colour does not change it. */
export const cellBits = (v: Variant, s: number, _c: number): number => boardParams(v).step * symbolValue(v, s) + log2Z(v);

/** The board in the variant's domain, or why not. */
export function inDomain(s: BoardState, v: Variant): BoardState | Invalid {
  const { size, symbols, colours } = boardParams(v);
  const n2 = size * size, S = symbolCount(symbols);
  if (s.sym.length !== n2 || s.col.length !== n2) return { invalid: `this board has ${size} × ${size} cells` };
  if (Boolean(s.cards) !== isCard(symbols)) return { invalid: isCard(symbols) ? "this board holds playing cards" : "this board holds digits" };
  for (const x of s.sym) if (!Number.isInteger(x) || x < 0 || x >= S) return { invalid: `a cell holds one of the ${S} symbols of ${symbols}` };
  const allowed = SETS[colours];
  for (const c of s.col) if (!allowed.includes(c)) return { invalid: `a cell is one of ${allowed.map(i => COLOURS[i]!.name).join(", ")}` };
  return s;
}

// ---------------------------------------------------------------- wire

export function encodeBoard(s: BoardState): string {
  const n = Math.round(Math.sqrt(s.sym.length));
  const set: SymbolSet = s.cards ? "cards" : "base16";
  const cell = (i: number) => symbolCode(set, s.sym[i]!) + COLOURS[s.col[i]!]!.letter;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => cell(r * n + c)).join(",")).join("/");
}

/** A board from its wire; a card is two characters before the colour letter, a digit one. */
export function decodeBoard(w: string): BoardState {
  const rows = w.split("/").map(r => r.split(","));
  const n = rows.length;
  if (rows.some(r => r.length !== n)) throw new SyntaxError(`Not a square board: ${w}`);
  const sym: number[] = [], col: number[] = [];
  for (const cell of rows.flat()) {
    const c = LETTER.get(cell.slice(-1));
    const code = cell.slice(0, -1);
    let s = -1;
    if (code.length === 1) s = DIGITS.indexOf(code);
    else if (code.length === 2 && RANK_CODES.includes(code[0]!) && SUIT_CODES.includes(code[1]!)) s = SUIT_CODES.indexOf(code[1]!) * 13 + RANK_CODES.indexOf(code[0]!);
    if (c === undefined || s < 0) throw new SyntaxError(`Not a board cell: ${cell}`);
    sym.push(s);
    col.push(c);
  }
  // Every cell of a board is a card or every cell a digit.
  const widths = new Set(rows.flat().map(x => x.length));
  if (widths.size !== 1) throw new SyntaxError(`Not a board: ${w}`);
  return widths.has(3) ? { sym, col, cards: true } : { sym, col };
}
