/**
 * 🐸 Leapfrog (beginner pool): in every row, each number and the number two cells along (leaping over the cell between)
 * should be one apart, like 4 _ 5. Units: the pairs (c[r][k], c[r][k+2]) for k = 0..N−3, N(N−2) in all (8 on 4×4).
 * Each pair one apart scores 1 point (a single tier: a near-miss tier made it win 49% of measured games).
 * A pair depends on two cells only; a board of one number scores nothing; rows of 4 4 5 5 … score every pair.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { SCALAR, fromFn, full, gridFamily, pyCard, sentences, tsCard, wire } from "../_util.ts";
import type { Pair } from "./_pairs.ts";

type LeapfrogP = Record<string, never>;

/** Every pair two cells apart in a row, (r, k) with (r, k + 2), row by row. */
export function leapPairs(N: number): Pair[] {
  const out: Pair[] = [];
  for (let r = 0; r < N; r++) for (let k = 0; k + 2 < N; k++) out.push([{ r, c: k }, { r, c: k + 2 }]);
  return out;
}

const leapText = (g: GridSpec): CardText => ({
  emoji: "🐸", name: "Leapfrog", consts: [],
  about: sentences(
    "Try to make every number one away from the number two cells along its row, like 4 _ 5: leap over the cell between.",
    "Each such pair scores 1 point.",
    g.say.valueKey(),
  ),
});

export const leapfrog = gridFamily<LeapfrogP>({
  id: "leapfrog", name: "Leapfrog", emoji: "🐸", theme: "Numbers one apart, leaping over a cell",
  // Numbers, not cards; a row needs a cell to leap over and a few pairs; up to 6×6 keeps the calibrated shapes modest.
  requires: { classes: ["Numeral"], minSize: 4, maxSize: 6 }, shape: SCALAR, tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => leapText(g).about,
  python: (_, g) => pyCard(leapText(g), `
    def utility(grid):
        leaps = 0
        for row in grid.rows:
            for k in range(len(row) - 2):
                if abs(row[k].value - row[k + 2].value) == 1:
                    leaps += 1
        return leaps`),
  typescript: (_, g) => tsCard(leapText(g), `
    function utility(grid) {
      let leaps = 0;
      for (const row of grid.rows) {
        for (let k = 0; k + 2 < row.length; k++) {
          if (Math.abs(row[k].value - row[k + 2].value) === 1) leaps += 1;
        }
      }
      return leaps;
    }`),
  // Every row reads 4 4 5 5 4 4 …: each number leaps onto the other one.
  exemplar: (_, g) => wire(g, fromFn(g.N, (_r, c) => (c % 4 < 2 ? 4 : 5)), full(g.N, 0)),
  top: (_, g) => g.N * (g.N - 2),
  example: () => ({
    sym: [[4, 1, 5], [4, 8, 7], [9, 3, 8]], col: full(3, 0),
    caption: "4 leaps over the 1 to 5: one apart, 1 point. 9 and 8 score too. 4 and 7 are 3 apart: nothing.",
  }),
});
