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
import { foldTotal, linesSum, windowsSum, type GridTiers, type TierValue } from "../tiers.ts";

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

/**
 * Tiers (docs/layered-rules-design.md §5.3; docs/layered-rules-measurements/crosswise-threes.md): "lines add up to x"
 * and "2×2 squares add up to x". The base reads differences only, so turning every number v into (S−1) − v leaves it
 * alone and takes a total of k cells to k(S−1) − x: x folds with 36 − x on 4×4 digits, for lines and squares alike.
 *
 * Why these interact with this base rather than sit beside it: the base pairs 12 of the 16 cells across the fold and
 * leaves the 4 cells of the fold line free, and every row and every column holds exactly one free cell — the same one,
 * since the fold line's cell in row r is the one in column N−1−r. So the free cells cannot tune a row and its column
 * apart, and the ↙ diagonal is the fold line itself, four free cells, while the ↘ diagonal is two folded pairs.
 */
export const threesTiers: GridTiers<CrossP> = {
  interactions: [
    { ...linesSum, canonical: foldTotal("lines", g => g.N * g.vmax) },
    { ...windowsSum, canonical: foldTotal("squares", g => 4 * g.vmax) },
  ],
  // The base's greedy ten-move level (scripts/tier-sweep.ts crosswise_threes --gate): every pair, on 400 of 400 starts.
  gate: g => crosswisePairs(g.N).length,
  gateText: gate => `${gate} pairs ${APART} apart`,
  dealt: g => (g.N === 4 && g.base === 10 ? THREES_DEALT : []),
  lab: g => (g.N === 4 && g.base === 10 ? THREES_LAB : []),
  base: (_p, g) => ({
    id: "crosswise-threes-pairs@1", symbols: g.S, cells: g.N * g.N, arity: 2,
    units: crosswisePairs(g.N).map(([a, b]) => [a.r * g.N + a.c, b.r * g.N + b.c]),
    score: ([a, b]) => {
      const off = Math.abs(Math.abs(g.value[a] - g.value[b]) - APART);
      return [off === 0 ? 1 : 0, -off];
    },
  }),
};
/**
 * The values dealt on 4×4 digits (measured, docs/layered-rules-measurements/crosswise-threes.md): each is alive at the
 * base's top, adds 15.3 to 19.7 bits over it (the band is 6 to 20) and tops at 5 or 6 of the 10 lines, and their tops
 * stay within 14% of each other (equal opportunity, test/equal-opportunity.test.ts). Line totals below 11 all reach
 * further than that — the base leaves four cells free, which is room enough to make low lines common — and every
 * squares value does, so this base carries one dealt interaction.
 */
const THREES_DEALT: readonly TierValue[] = [11, 12, 13, 14, 15, 16, 17, 18].map(x => ({ id: "lines", x }));
/**
 * Lab ("uncapped"): alive, but reaching past the band. Lines of 9 and 10 add 20.1 and 21.2 bits where the dealt values
 * add at most 19.7; the gentlest squares values, 17 and 18, add 21.0 and 20.8, and every other squares value more.
 */
const THREES_LAB: readonly TierValue[] = [
  ...[9, 10].map(x => ({ id: "lines", x })), ...[17, 18].map(x => ({ id: "squares", x })),
];

export const crosswiseThrees = gridFamily<CrossP>({
  tiers: threesTiers,
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
