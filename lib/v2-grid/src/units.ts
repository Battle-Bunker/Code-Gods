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

/** The (N−1)² overlapping 2×2 windows, by top-left cell in reading order. */
export const windows = (n: number): number[][] => {
  const out: number[][] = [];
  for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) out.push([at(n, r, c), at(n, r, c + 1), at(n, r + 1, c), at(n, r + 1, c + 1)]);
  return out;
};

/** Pairs two apart in a row (leaping over the cell between): (r, k) with (r, k + 2), row by row. */
export const leaps = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let k = 0; k + 2 < n; k++) out.push([at(n, r, k), at(n, r, k + 2)]);
  return out;
};

/** Fold partners across the diagonal from the top-right to the bottom-left corner: (r, c) with (N−1−c, N−1−r), r + c < N − 1. */
export const folds = (n: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (r + c < n - 1) out.push([at(n, r, c), at(n, n - 1 - c, n - 1 - r)]);
  return out;
};
/** The cells on that fold line (no partner). */
export const foldLine = (n: number): number[] => Array.from({ length: n }, (_, r) => at(n, r, n - 1 - r));

/** The touching pairs inside a 2×2 box [top-left, top-right, bottom-left, bottom-right]: across the top and bottom, down both sides. */
export const boxEdges = (box: readonly number[]): [number, number][] => [[box[0]!, box[1]!], [box[2]!, box[3]!], [box[0]!, box[2]!], [box[1]!, box[3]!]];

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** Strangers: both bigger than 1, no common divisor bigger than 1, and at least 2 apart. */
export const strangers = (a: number, b: number): boolean => a > 1 && b > 1 && gcd(a, b) === 1 && Math.abs(a - b) >= 2;
/** How far four numbers are from making two different pairs: the best pairing's two gaps, plus 2 for four of a kind (two cells must move by 1). */
export const twoPairGap = (a: number, b: number, c: number, d: number): number => {
  const g = Math.min(Math.abs(a - b) + Math.abs(c - d), Math.abs(a - c) + Math.abs(b - d), Math.abs(a - d) + Math.abs(b - c));
  return g + (a === b && b === c && c === d ? 2 : 0);
};

/** A cell's distance from the edge: 0 on the outer ring, 1 one ring in (v1's rings). */
export const depth = (n: number, i: number): number => {
  const r = Math.floor(i / n), c = i % n;
  return Math.min(r, c, n - 1 - r, n - 1 - c);
};
/** The board's rings, outermost first (a 4×4 board: the outer twelve cells, then the centre four). */
export const rings = (n: number): number[][] =>
  Array.from({ length: Math.floor((n + 1) / 2) }, (_, d) => Array.from({ length: n * n }, (_, i) => i).filter(i => depth(n, i) === d));
/** The rings' names and people's words, in the order `rings` lists them. */
export const RING_NAMES = ["outer", "centre"] as const;
export const RING_WORDS: Readonly<Record<string, string>> = { outer: "the outer ring", centre: "the centre (the four middle cells)" };

/** The k×k squares (k smaller than the board), by top-left cell in reading order, each in reading order: v1's 3×3 blocks. */
export const bigSquares = (n: number, k = 3): number[][] => {
  const out: number[][] = [];
  for (let r = 0; r + k <= n && k < n; r++) for (let c = 0; c + k <= n; c++) {
    const sq: number[] = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) sq.push(at(n, r + i, c + j));
    out.push(sq);
  }
  return out;
};
