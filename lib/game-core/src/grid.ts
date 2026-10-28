/**
 * The Grid object type: an N×N square of cells, each a (symbol, colour) pair.
 *
 * A GridType is the type constructor Grid applied to its parameters, e.g. Grid(5,base10,rgby).
 * It is NOT a room (a room is the lobby that configures and hosts games).
 *
 * Canonical wire format (docs/research/grid/architecture.md §6), used on the wire, in the
 * database and in sandboxes: rows joined by "/", cells by ",", each cell a symbol code followed by
 * a colour letter, e.g. "7R,3G,0B/1R,2R,9B/4G,4G,8R". Uniqueness is string equality.
 *
 * Indices match lib/grid-lab/gridlab/core.py exactly:
 *   symbols  digit sets: index = digit value; cards: index = suit * 13 + rank,
 *            rank 0..12 = A,2..10,J,Q,K and suit 0..3 = ♠ ♥ ♦ ♣ (codes "AS", "TH", "KC", ...)
 *   colours  spectral (rainbow) order: rgb = R G B, rgby = R Y G B, rainbow6 = R O Y G B V
 * These tables are frozen: persisted objects and calibration tables index them.
 */

export const GRID_SIZES = [3, 4, 5, 6, 7] as const;
export const GRID_SYMBOL_SETS = ["base10", "base12", "base16", "cards"] as const;
export const GRID_COLOUR_SETS = ["rgb", "rgby", "rainbow6"] as const;
export type GridSymbolSet = (typeof GRID_SYMBOL_SETS)[number];
export type GridColourSet = (typeof GRID_COLOUR_SETS)[number];

export interface GridTypeArgs {
  size: number;
  symbols: GridSymbolSet;
  colours: GridColourSet;
}

/** A decoded grid: row-major symbol and colour indices. */
export interface GridValue {
  size: number;
  sym: Uint8Array;
  col: Uint8Array;
}

export interface SymbolComponent {
  id: GridSymbolSet;
  label: string;
  emoji: string;
  /** Plain-language description of the symbols, for room settings. */
  kid: string;
  count: number;
  /** Wire code per index: fixed width within a set (1 for digits, 2 for cards). */
  codes: readonly string[];
  /** Display glyph per index ("7", "B", "10♥"). */
  glyphs: readonly string[];
  /** Readable name per index ("seven", "eleven", "ten of hearts"). */
  names: readonly string[];
  /** Points a symbol is worth: digits their value, cards A=1 .. K=13. */
  values: readonly number[];
}

export interface ColourComponent {
  id: GridColourSet;
  label: string;
  emoji: string;
  kid: string;
  count: number;
  /** Wire letter per index. */
  letters: readonly string[];
  names: readonly string[];
  /** Display colour per index. Chosen for distinct lightness; always pair with the letter or pattern. */
  css: readonly string[];
  /** Text colour that contrasts with each css colour (WCAG AA at small sizes). */
  ink: readonly string[];
}

const DIGITS = "0123456789ABCDEF";
const DIGIT_NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const RANK_CODES = "A23456789TJQK";
const RANK_GLYPHS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NAMES = ["ace", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king"];
const SUIT_CODES = "SHDC";
export const SUIT_GLYPHS = ["♠", "♥", "♦", "♣"] as const;
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"] as const;

function digits(id: GridSymbolSet, count: number, label: string, emoji: string, kid: string): SymbolComponent {
  const range = Array.from({ length: count }, (_, i) => i);
  return Object.freeze({
    id, label, emoji, kid, count,
    codes: Object.freeze(range.map(i => DIGITS[i])),
    glyphs: Object.freeze(range.map(i => DIGITS[i])),
    names: Object.freeze(range.map(i => DIGIT_NAMES[i])),
    values: Object.freeze(range),
  });
}

const cardIndices = Array.from({ length: 52 }, (_, i) => i);
export const SYMBOL_COMPONENTS: Readonly<Record<GridSymbolSet, SymbolComponent>> = Object.freeze({
  base10: digits("base10", 10, "Digits 0–9", "🔢", "Ordinary digits, 0 to 9"),
  base12: digits("base12", 12, "Base 12 (0–B)", "🕛", "Digits 0 to 9, then A = 10 and B = 11"),
  base16: digits("base16", 16, "Hex (0–F)", "🧮", "Digits 0 to 9, then A to F (10 to 15)"),
  cards: Object.freeze({
    id: "cards" as const, label: "Playing cards", emoji: "🃏", kid: "A full deck: ace to king in four suits", count: 52,
    codes: Object.freeze(cardIndices.map(i => RANK_CODES[i % 13] + SUIT_CODES[Math.floor(i / 13)])),
    glyphs: Object.freeze(cardIndices.map(i => RANK_GLYPHS[i % 13] + SUIT_GLYPHS[Math.floor(i / 13)])),
    names: Object.freeze(cardIndices.map(i => `${RANK_NAMES[i % 13]} of ${SUIT_NAMES[Math.floor(i / 13)]}`)),
    values: Object.freeze(cardIndices.map(i => (i % 13) + 1)),
  }),
});

const PALETTE: Record<string, { letter: string; css: string; ink: string }> = {
  red: { letter: "R", css: "#d7263d", ink: "#ffffff" },
  orange: { letter: "O", css: "#f28c28", ink: "#1a1a1a" },
  yellow: { letter: "Y", css: "#f5d000", ink: "#1a1a1a" },
  green: { letter: "G", css: "#2e9e44", ink: "#1a1a1a" },
  blue: { letter: "B", css: "#2667c9", ink: "#ffffff" },
  violet: { letter: "V", css: "#7b3fb8", ink: "#ffffff" },
};

function colours(id: GridColourSet, names: string[], label: string, emoji: string, kid: string): ColourComponent {
  return Object.freeze({
    id, label, emoji, kid, count: names.length,
    letters: Object.freeze(names.map(n => PALETTE[n].letter)),
    names: Object.freeze(names),
    css: Object.freeze(names.map(n => PALETTE[n].css)),
    ink: Object.freeze(names.map(n => PALETTE[n].ink)),
  });
}

export const COLOUR_COMPONENTS: Readonly<Record<GridColourSet, ColourComponent>> = Object.freeze({
  rgb: colours("rgb", ["red", "green", "blue"], "Red, green, blue", "🟥🟩🟦", "Three colours"),
  rgby: colours("rgby", ["red", "yellow", "green", "blue"], "Red, yellow, green, blue", "🟥🟨🟩🟦", "Four colours; yellow and blue mix to green"),
  rainbow6: colours("rainbow6", ["red", "orange", "yellow", "green", "blue", "violet"], "Rainbow (6 colours)", "🌈", "Six colours round the rainbow; paints mix"),
});

/** Every colour letter any set uses, with its display colour (for decoding without settings). */
export const COLOUR_LETTERS: Readonly<Record<string, { name: string; css: string; ink: string }>> = Object.freeze(
  Object.fromEntries(Object.entries(PALETTE).map(([name, p]) => [p.letter, { name, css: p.css, ink: p.ink }])));

export function gridTypeKey(t: GridTypeArgs): string {
  return `Grid(${t.size},${t.symbols},${t.colours})`;
}

export function isGridTypeArgs(t: Partial<GridTypeArgs>): t is GridTypeArgs {
  return (GRID_SIZES as readonly number[]).includes(t.size as number)
    && (GRID_SYMBOL_SETS as readonly string[]).includes(t.symbols as string)
    && (GRID_COLOUR_SETS as readonly string[]).includes(t.colours as string);
}

/** Longest canonical encoding: N² cells of (code + letter), plus N²-1 separators. */
export function gridMaxLength(t: GridTypeArgs): number {
  const width = SYMBOL_COMPONENTS[t.symbols].codes[0].length + 1;
  return t.size * t.size * (width + 1) - 1;
}

export function encodeGrid(g: GridValue, t: GridTypeArgs): string {
  const s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  const rows: string[] = [];
  for (let r = 0; r < g.size; r++) {
    const cells: string[] = [];
    for (let k = 0; k < g.size; k++) {
      const i = r * g.size + k;
      cells.push(s.codes[g.sym[i]] + c.letters[g.col[i]]);
    }
    rows.push(cells.join(","));
  }
  return rows.join("/");
}

const codeIndex = new Map<GridSymbolSet, Map<string, number>>();
const letterIndex = new Map<GridColourSet, Map<string, number>>();
function symbolIndex(set: GridSymbolSet): Map<string, number> {
  let m = codeIndex.get(set);
  if (!m) codeIndex.set(set, m = new Map(SYMBOL_COMPONENTS[set].codes.map((code, i) => [code, i])));
  return m;
}
function colourIndex(set: GridColourSet): Map<string, number> {
  let m = letterIndex.get(set);
  if (!m) letterIndex.set(set, m = new Map(COLOUR_COMPONENTS[set].letters.map((l, i) => [l, i])));
  return m;
}

/** Strict decode for a GridType. Throws on anything that is not the canonical encoding. */
export function decodeGrid(text: string, t: GridTypeArgs): GridValue {
  if (typeof text !== "string" || text.length > gridMaxLength(t)) throw new Error("Not a grid of this type");
  const rows = text.split("/");
  if (rows.length !== t.size) throw new Error(`Expected ${t.size} rows`);
  const syms = symbolIndex(t.symbols), cols = colourIndex(t.colours);
  const n = t.size, sym = new Uint8Array(n * n), col = new Uint8Array(n * n);
  rows.forEach((row, r) => {
    const cells = row.split(",");
    if (cells.length !== n) throw new Error(`Expected ${n} cells in row ${r + 1}`);
    cells.forEach((cell, k) => {
      const s = syms.get(cell.slice(0, -1)), c = cols.get(cell.slice(-1));
      if (s === undefined || c === undefined) throw new Error(`Invalid cell "${cell}" in row ${r + 1}`);
      sym[r * n + k] = s; col[r * n + k] = c;
    });
  });
  return { size: n, sym, col };
}

export function isGridValue(text: unknown, t: GridTypeArgs): text is string {
  if (typeof text !== "string") return false;
  try { return encodeGrid(decodeGrid(text, t), t) === text; } catch { return false; }
}

/** A cell read for display only, without knowing the room's settings. */
export interface GridCellView { code: string; letter: string }

/**
 * Lenient parse for display: any "rows/of,cells" string whose cells end in a known colour
 * letter. Returns null for anything else (callers then show the raw string).
 */
export function parseGridForDisplay(text: unknown): GridCellView[][] | null {
  if (typeof text !== "string" || !text || text.length > 4096) return null;
  const rows = text.split("/").map(row => row.split(","));
  const n = rows.length;
  if (n < 1 || n > 16 || rows.some(row => row.length !== n)) return null;
  const out: GridCellView[][] = [];
  for (const row of rows) {
    const cells: GridCellView[] = [];
    for (const cell of row) {
      const letter = cell.slice(-1), code = cell.slice(0, -1);
      if (!code || code.length > 2 || !COLOUR_LETTERS[letter] || !/^[0-9A-Z]+$/.test(code)) return null;
      cells.push({ code, letter });
    }
    out.push(cells);
  }
  return out;
}

/** Display glyph for a wire symbol code: "T♥" → "10♥", "7" → "7". */
export function glyphForCode(code: string): string {
  if (code.length === 2) {
    const rank = RANK_CODES.indexOf(code[0]), suit = SUIT_CODES.indexOf(code[1]);
    if (rank >= 0 && suit >= 0) return RANK_GLYPHS[rank] + SUIT_GLYPHS[suit];
  }
  return code;
}

/** Uniform over symbols × colours, independently per cell (the "uniform" spawn function). */
export function spawnGrid(t: GridTypeArgs, randomBelow: (bound: bigint) => bigint): string {
  const n = t.size, S = BigInt(SYMBOL_COMPONENTS[t.symbols].count), C = BigInt(COLOUR_COMPONENTS[t.colours].count);
  const sym = new Uint8Array(n * n), col = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const s = randomBelow(S), c = randomBelow(C);
    if (s < 0n || s >= S || c < 0n || c >= C) throw new Error("Random source returned an out-of-range value");
    sym[i] = Number(s); col[i] = Number(c);
  }
  return encodeGrid({ size: n, sym, col }, t);
}
