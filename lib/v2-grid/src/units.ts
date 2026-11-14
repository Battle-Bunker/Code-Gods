/** The board's groups of cells that representations, mutators and rules share (docs/engine-v2/grids.md §3). */
import { at, opposite } from "./grid.ts";

export const rowCells = (n: number, r: number): number[] => Array.from({ length: n }, (_, c) => at(n, r, c));
export const colCells = (n: number, c: number): number[] => Array.from({ length: n }, (_, r) => at(n, r, c));
export const rows = (n: number): number[][] => Array.from({ length: n }, (_, r) => rowCells(n, r));
export const cols = (n: number): number[][] => Array.from({ length: n }, (_, c) => colCells(n, c));

/** Rows then columns, named row0 … col(N−1): the "line" argument of tally, mirror and steps moves. */
export const lines = (n: number): { name: string; cells: number[] }[] => [
  ...rows(n).map((cells, r) => ({ name: `row${r}`, cells })),
  ...cols(n).map((cells, c) => ({ name: `col${c}`, cells })),
];

/** Opposite pairs: each cell of the top half (in reading order) with the cell a half turn takes it to. */
export const pairs = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < n * n; i++) if (i < opposite(n, i)) out.push([i, opposite(n, i)]);
  return out;
};

/** The corner boxes' names, in the order `boxes` lists them. */
export const BOX_NAMES = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** The four corner boxes (quarters of the board, N even): top-left, top-right, bottom-left, bottom-right. */
export const boxes = (n: number): number[][] => {
  const h = n / 2;
  return [[0, 0], [0, h], [h, 0], [h, h]].map(([r0, c0]) => {
    const out: number[] = [];
    for (let r = r0!; r < r0! + h; r++) for (let c = c0!; c < c0! + h; c++) out.push(at(n, r, c));
    return out;
  });
};

/** The four corners of the board. */
export const corners = (n: number): number[] => [at(n, 0, 0), at(n, 0, n - 1), at(n, n - 1, 0), at(n, n - 1, n - 1)];
