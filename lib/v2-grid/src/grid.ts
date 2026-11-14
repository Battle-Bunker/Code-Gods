/**
 * The grid object (docs/engine-v2/grids.md §1): one N×N board of whole numbers 0 … cap, read row by row. Energy is per
 * cell, by steps: a cell holding v costs step·v + log2 Z bits, so a board's energy is half its total plus a constant,
 * and the walk's stationary law is a product of independent cells (§2, §5).
 */
import type { Invalid, Variant } from "@workspace/v2-core";

export interface GridState {
  /** N·N whole numbers in reading order: cells[r·N + c]. */
  readonly cells: readonly number[];
}

export interface GridParams {
  /** N: the board is N×N. */
  readonly size: number;
  /** The largest number a cell may hold. */
  readonly cap: number;
  /** Bits of energy per unit in a cell. */
  readonly step: number;
}

export function gridParams(v: Variant): GridParams {
  const p = v.params as Partial<GridParams>;
  return { size: p.size ?? 4, cap: p.cap ?? 9, step: p.step ?? 0.5 };
}

/** log2 of Σ_{v=0}^{cap} 2^−step·v: the constant that makes the cell code complete. */
export function log2Z(v: Variant): number {
  const { cap, step } = gridParams(v);
  let z = 0;
  for (let x = 0; x <= cap; x++) z += 2 ** (-step * x);
  return Math.log2(z);
}

/** The bits to read one cell holding x (its energy): step·x + log2 Z. */
export const cellBits = (x: number, v: Variant): number => gridParams(v).step * x + log2Z(v);

/** The probability of a cell holding x under the walk's stationary law: 2^−cellBits. */
export const cellProbability = (x: number, v: Variant): number => 2 ** -cellBits(x, v);

/** The board in the variant's domain, or why not. */
export function inDomain(s: GridState, v: Variant): GridState | Invalid {
  const { size, cap } = gridParams(v);
  if (s.cells.length !== size * size) return { invalid: `this board has ${size} × ${size} cells` };
  for (const x of s.cells) {
    if (!Number.isInteger(x) || x < 0) return { invalid: "a cell holds a whole number, 0 or more" };
    if (x > cap) return { invalid: `a cell holds at most ${cap}` };
  }
  return s;
}


export function encodeGrid(s: GridState): string {
  const n = Math.round(Math.sqrt(s.cells.length));
  const sep = s.cells.some(x => x > 9) ? "," : "";
  return Array.from({ length: n }, (_, r) => s.cells.slice(r * n, r * n + n).join(sep)).join("/");
}

export function decodeGrid(w: string): GridState {
  const rows = w.split("/");
  const wide = w.includes(",");
  const cells = rows.flatMap(r => (wide ? r.split(",") : [...r]));
  if (!cells.every(x => /^\d+$/.test(x)) || rows.some(r => (wide ? r.split(",") : [...r]).length !== rows.length)) throw new SyntaxError(`Not a grid: ${w}`);
  const s = { cells: cells.map(Number) };
  if (encodeGrid(s) !== w) throw new SyntaxError(`Not a canonical grid: ${w}`);
  return s;
}


/** Cell index of row r, column c. */
export const at = (n: number, r: number, c: number): number => r * n + c;
/** The cell a half turn of the board takes cell i to. */
export const opposite = (n: number, i: number): number => n * n - 1 - i;
/** "row 2, column 3" (1-based, for people). */
export const cellLabel = (n: number, i: number): string => `row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
/** The element name of cell i: r0c0 … (0-based, for agents). */
export const cellName = (n: number, i: number): string => `r${Math.floor(i / n)}c${i % n}`;
