/**
 * What the beginner "pair" families share (Opposite Nines, Step-Stool Mirror): the board split into fixed pairs of
 * cells, each scored on its own. A pair's score depends on its two cells only, so a one-cell change moves exactly one
 * unit (their lenses draw each pair as a link: src/explain/lenses/pair-unit.ts).
 */
/** A cell by row and column, counting from 0 at the top-left. */
export interface Cell { readonly r: number; readonly c: number }
export type Pair = readonly [Cell, Cell];

/**
 * Half-turn partners, each pair once: the i-th cell in reading order with the i-th from the end, which is where a half
 * turn of the board takes it ((r, c) ↔ (N−1−r, N−1−c)). On an odd size the middle cell has no partner.
 */
export function halfTurnPairs(N: number): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < Math.floor((N * N) / 2); i++) {
    const j = N * N - 1 - i;
    out.push([{ r: Math.floor(i / N), c: i % N }, { r: Math.floor(j / N), c: j % N }]);
  }
  return out;
}

/**
 * Fold partners (the board folded top onto bottom), row by row: (r, c) ↔ (N−1−r, c) for r < N/2. On an odd size the
 * middle row has no partner.
 */
export function foldPairs(N: number): Pair[] {
  const out: Pair[] = [];
  for (let r = 0; r < Math.floor(N / 2); r++) for (let c = 0; c < N; c++) out.push([{ r, c }, { r: N - 1 - r, c }]);
  return out;
}

/** The best points tuple of a pair family: every pair scores its primary point and deducts nothing. */
export const pairTop = (pairs: number): [number, number] => [pairs, 0];
