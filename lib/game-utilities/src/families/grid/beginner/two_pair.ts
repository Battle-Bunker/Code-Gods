/**
 * ✌️ Two Pair (a beginner family): the board is cut into 2×2 boxes that tile it (the 4 corner boxes on 4×4, 9 boxes on
 * 6×6). A box holding two different pairs (3 3 8 8 in any order) scores a primary point; a box with only one pair, or
 * three of a kind, a secondary point. Four of a kind and no pair score nothing.
 *
 * Why it suits beginners: fixed, non-overlapping scoring units; a cell's change touches one box; from any box one
 * changed cell reaches a better shape (no pair → one pair → two pairs; four of a kind → three of a kind → two pairs), and a
 * board of one number scores nothing.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";

type TwoPairP = Record<string, never>;

/** Boxes across (and down): the board is cut into (N/2)² boxes of 2×2. */
export const boxesAcross = (g: GridSpec) => g.N / 2;

const twoPairText = (g: GridSpec): CardText => {
  const k = boxesAcross(g), boxes = k * k, corner = k === 2;
  const which = corner ? `each of the ${boxes} corner boxes` : `each of the ${boxes} boxes`;
  return {
    emoji: "✌️", name: "Two Pair", consts: [],
    about: sentences(
      `Try to fill ${which} with two different pairs, like 3, 3, 8 and 8 in any order.`,
      `Each box with two different pairs scores ${tierPoints(1, 0, 2)}.`,
      `Each box with only one pair, or three of a kind, scores ${tierPoints(1, 1, 2)}.`,
      "Four of a kind scores nothing.",
      corner ? `The board is cut into ${boxes} corner boxes of 2×2 cells.`
        : `The board is cut into ${boxes} boxes of 2×2 cells, ${k} across and ${k} down.`,
    ),
  };
};

export const twoPair = gridFamily<TwoPairP>({
  id: "two_pair", name: "Two Pair", emoji: "✌️", theme: "Two different pairs in every box",
  // Numbers, not cards; boxes tile the board only on even sizes; up to 6×6 keeps the calibrated shapes modest.
  requires: { classes: ["Numeral"], parity: "even", maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_p, g) => twoPairText(g).about,
  top: (_p, g) => [boxesAcross(g) ** 2, 0],
  example: () => ({ sym: [[3, 8], [8, 3]], col: full(2, 0), caption: `Two different pairs: 3 3 and 8 8. ${tierPoints(1, 0, 2)}.` }),
  python: (_p, g) => pyCard(twoPairText(g), `
    def utility(grid):
        two_pairs = 0
        one_pair = 0
        for cell in grid.cells:
            if cell.row % 2 == 1 or cell.col % 2 == 1:
                continue
            box = [cell, cell.right, cell.down, cell.down.right]
            counts = {}
            for other in box:
                counts[other.value] = counts.get(other.value, 0) + 1
            sizes = sorted(counts.values())
            if sizes == [2, 2]:
                two_pairs += 1
            elif sizes == [1, 1, 2] or sizes == [1, 3]:
                one_pair += 1
        return (two_pairs, one_pair)`),
  typescript: (_p, g) => tsCard(twoPairText(g), `
    function utility(grid) {
      let twoPairs = 0;
      let onePair = 0;
      for (const cell of grid.cells) {
        if (cell.row % 2 === 1 || cell.col % 2 === 1) continue;
        const box = [cell, cell.right, cell.down, cell.down.right];
        const counts = new Map();
        for (const other of box) counts.set(other.value, (counts.get(other.value) ?? 0) + 1);
        const sizes = [...counts.values()].sort().join(" ");
        if (sizes === "2 2") twoPairs += 1;
        else if (sizes === "1 1 2" || sizes === "1 3") onePair += 1;
      }
      return [twoPairs, onePair];
    }`),
  // Every box 3 3 on top of 8 8.
  exemplar: (_p, g) => wire(g, fromFn(g.N, r => (r % 2 === 0 ? 3 : 8)), full(g.N, 0)),
});
