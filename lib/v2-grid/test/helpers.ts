import type { GridState } from "../src/grid.ts";

/** A board from rows of digits: board("0120", "3001", "0000", "9000"). */
export const board = (...rows: string[]): GridState => ({ cells: rows.flatMap(r => [...r].map(Number)) });
export const rowsOf = (s: GridState, n = 4): string[] => Array.from({ length: n }, (_, r) => s.cells.slice(r * n, r * n + n).join(""));
