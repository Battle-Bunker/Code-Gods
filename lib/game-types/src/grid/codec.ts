/**
 * Canonical wire format (docs/research/grid/architecture.md §6), used on the wire, in the database
 * and in sandboxes: rows joined by "/", cells by ",", each cell a symbol code followed by a colour
 * letter, e.g. "7R,3G,0B/1R,2R,9B/4G,4G,8R". Uniqueness is string equality.
 */
import {
  COLOUR_COMPONENTS, COLOUR_LETTERS, GRID_COLOUR_SETS, GRID_SIZES, GRID_SYMBOL_SETS, RANK_CODES, RANK_GLYPHS,
  SUIT_CODES, SUIT_GLYPHS, SYMBOL_COMPONENTS, type GridColourSet, type GridSymbolSet,
} from "./components.ts";

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
  if (g.size !== t.size || g.sym.length !== t.size * t.size || g.col.length !== t.size * t.size) throw new Error("Grid has the wrong size");
  const rows: string[] = [];
  for (let r = 0; r < g.size; r++) {
    const cells: string[] = [];
    for (let k = 0; k < g.size; k++) {
      const i = r * g.size + k, code = s.codes[g.sym[i]], letter = c.letters[g.col[i]];
      if (code === undefined || letter === undefined) throw new Error("Grid cell out of range");
      cells.push(code + letter);
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

/** Display glyph for a wire symbol code: "TH" → "10♥", "7" → "7". */
export function glyphForCode(code: string): string {
  if (code.length === 2) {
    const rank = RANK_CODES.indexOf(code[0]), suit = SUIT_CODES.indexOf(code[1]);
    if (rank >= 0 && suit >= 0) return RANK_GLYPHS[rank] + SUIT_GLYPHS[suit];
  }
  return code;
}
