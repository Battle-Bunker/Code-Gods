/**
 * The goal card's example object (src/core/goal/goal-card.tsx): a random legal value of the board's type, and the edits its
 * grid editor can make. Pure (no React), so it is unit tested
 * (test/object-editor-model.test.ts). Every value it returns is the type's canonical wire form, checked by the type's
 * own codec: the card only ever explains an object a game could hold.
 */
import {
  COLOUR_COMPONENTS, SYMBOL_COMPONENTS, decodeGrid, encodeGrid, gridArgs, objectType, seededRng,
  type Instantiation, type ObjectValue,
} from "@workspace/game-types";

/** A uniformly random object of the instantiation (the spawn prior), repeatable by seed. */
export function randomObject(inst: Instantiation, seed: number | string): ObjectValue {
  const t = objectType(inst.objectType);
  return t.codec(inst).encode(t.spawn(inst, seededRng(seed)));
}

export interface GridSymbolChoice { index: number; glyph: string; name: string }
export interface GridColourChoice { index: number; letter: string; name: string; css: string; ink: string }
/** The symbols and colours a cell of this board may have, in the type's own order. */
export function gridPalette(inst: Instantiation): { symbols: GridSymbolChoice[]; colours: GridColourChoice[] } {
  const t = gridArgs(inst), s = SYMBOL_COMPONENTS[t.symbols], c = COLOUR_COMPONENTS[t.colours];
  return {
    symbols: s.glyphs.map((glyph, index) => ({ index, glyph, name: s.names[index] })),
    colours: c.letters.map((letter, index) => ({ index, letter, name: c.names[index], css: c.css[index], ink: c.ink[index] })),
  };
}

export interface GridCell { sym: number; col: number }
/** The board's cells (row-major rows of symbol and colour indices), or null when the value is not a grid of this type. */
export function gridCellsOf(value: ObjectValue, inst: Instantiation): GridCell[][] | null {
  try {
    const g = decodeGrid(String(value), gridArgs(inst));
    return Array.from({ length: g.size }, (_, r) => Array.from({ length: g.size }, (_, k) => ({ sym: g.sym[r * g.size + k], col: g.col[r * g.size + k] })));
  } catch { return null; }
}

/** The grid with one cell's symbol and/or colour replaced. Throws on an index outside the board's palette. */
export function withGridCell(value: ObjectValue, inst: Instantiation, r: number, c: number, patch: Partial<GridCell>): string {
  const t = gridArgs(inst), g = decodeGrid(String(value), t);
  if (r < 0 || c < 0 || r >= g.size || c >= g.size) throw new Error("Cell out of range");
  const i = r * g.size + c;
  const sym = new Uint8Array(g.sym), col = new Uint8Array(g.col);
  if (patch.sym !== undefined) sym[i] = patch.sym;
  if (patch.col !== undefined) col[i] = patch.col;
  return encodeGrid({ size: g.size, sym, col }, t);
}
