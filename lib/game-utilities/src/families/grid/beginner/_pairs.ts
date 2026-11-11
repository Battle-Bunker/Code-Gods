/**
 * What the beginner "pair" families share (Opposite Nines, Leapfrog): fixed pairs of cells, each scored on its own.
 * A pair's score depends on its two cells only, so a one-cell change moves at most two units (their lenses draw each
 * pair as a link).
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

/** The best points tuple of a pair family: every pair scores its primary point and deducts nothing. */
export const pairTop = (pairs: number): [number, number] => [pairs, 0];
