/**
 * ↙️ Crosswise Threes (beginner pool): fold the board along the diagonal from the top-right corner to the bottom-left
 * corner; each number and the number it lands on should be 3 apart. A pair 3 apart scores a primary point; every pair
 * deducts how far its difference is from 3. Fixed units (N(N−1)/2 pairs off the fold line), each depending on two cells
 * only; the N cells on the fold line have no partner and never count. Any size: the fold line needs no middle.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";
import { pairTop, type Pair } from "./_pairs.ts";

type CrossP = Record<string, never>;

/** The difference every pair aims at. */
export const APART = 3;

/**
 * Fold partners across the top-right to bottom-left diagonal, each pair once, in reading order of its first cell:
 * (r, c) ↔ (N−1−c, N−1−r) for r + c < N−1. Cells with r + c = N−1 lie on the fold line and have no partner.
 */
export function crosswisePairs(N: number): Pair[] {
  const out: Pair[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; r + c < N - 1; c++) out.push([{ r, c }, { r: N - 1 - c, c: N - 1 - r }]);
  return out;
}

const crossText = (g: GridSpec): CardText => ({
  emoji: "↙️", name: "Crosswise Threes", consts: [["APART", APART]],
  about: sentences(
    `Try to fold the board corner to corner so each number lands on a number ${APART} apart from it, like 2 and 5.`,
    `Each pair ${APART} apart scores ${tierPoints(1, 0, 2)}.`,
    `Each pair deducts as many secondary points as its difference is away from ${APART}, so 4 and 4 deduct 3 and 2 and 9 deduct 4.`,
    "The fold line runs from the top-right corner to the bottom-left corner, so the top row lands on the right column.",
    "Cells on the fold line have no partner, so they never score or deduct.",
    g.say.valueKey(),
  ),
});

export const crosswiseThrees = gridFamily<CrossP>({
  id: "crosswise_threes", name: "Crosswise Threes", emoji: "↙️", theme: "Fold corner to corner: numbers 3 apart",
  // Numbers, not cards; up to 6×6 keeps the calibrated shapes modest. Any parity: the fold line is a diagonal.
  requires: { classes: ["Numeral"], minSize: 4, maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => crossText(g).about,
  python: (_, g) => pyCard(crossText(g), `
    def utility(grid):
        threes = 0
        distance = 0
        last = grid.size - 1
        for cell in grid.cells:
            if cell.row + cell.col >= last:
                continue
            partner = grid.cell(last - cell.col, last - cell.row)  # where the fold takes it
            off = abs(abs(cell.value - partner.value) - APART)
            if off == 0:
                threes += 1
            distance += off
        return (threes, -distance)`),
  typescript: (_, g) => tsCard(crossText(g), `
    function utility(grid) {
      let threes = 0;
      let distance = 0;
      const last = grid.size - 1;
      for (const cell of grid.cells) {
        if (cell.row + cell.col >= last) continue;
        const partner = grid.cell(last - cell.col, last - cell.row); // where the fold takes it
        const off = Math.abs(Math.abs(cell.value - partner.value) - APART);
        if (off === 0) threes += 1;
        distance += off;
      }
      return [threes, -distance];
    }`),
  // 4 above the fold line, 7 below it (and 4 on it): every pair is 4 on 7.
  exemplar: (_, g) => wire(g, fromFn(g.N, (r, c) => (r + c > g.N - 1 ? 4 + APART : 4)), full(g.N, 0)),
  top: (_, g) => pairTop(crosswisePairs(g.N).length),
  example: () => ({
    sym: [[2, 7], [7, 5]], col: full(2, 0),
    caption: "Folded corner to corner, 2 lands on 5: 3 apart, 1 primary point. The two 7s sit on the fold line, so they never count.",
  }),
});
