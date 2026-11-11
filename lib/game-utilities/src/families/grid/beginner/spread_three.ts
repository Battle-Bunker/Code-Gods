/**
 * 📏 Spread of Three (a beginner family): every 2×2 square of the board (they overlap: (N−1)² of them) scores a primary
 * point when its biggest number is exactly 3 more than its smallest, and deducts a secondary point for each step its
 * spread is away from 3.
 *
 * Why it suits beginners: small fixed units; a cell's change touches at most 4 squares; the deduction rewards every step
 * towards 3, so one-cell moves always have somewhere to go; a board of one number spreads 0 everywhere (the worst
 * secondary score), and the best board is a chessboard of two numbers 3 apart.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";

type SpreadP = Record<string, never>;

/** The spread every square aims at: its biggest number minus its smallest. */
export const SPREAD = 3;

const spreadText = (g: GridSpec): CardText => {
  const squares = (g.N - 1) ** 2;
  return {
    emoji: "📏", name: "Spread of Three", consts: [["SPREAD", SPREAD, "biggest minus smallest, in every 2×2 square"]],
    about: sentences(
      `Try to give every 2×2 square a spread of exactly ${SPREAD}.`,
      `Each 2×2 square with a spread of exactly ${SPREAD} scores ${tierPoints(1, 0, 2)}.`,
      `Each square deducts 1 secondary point for each step its spread is away from ${SPREAD}.`,
      `A square's spread is its biggest number minus its smallest: 7, 4, 5 and 6 spread 7 − 4 = ${SPREAD}.`,
      `There are ${squares} squares on this board, and they overlap, so a cell can be in up to 4 of them.`,
      g.say.valueKey(),
    ),
  };
};

export const spreadThree = gridFamily<SpreadP>({
  id: "spread_three", name: "Spread of Three", emoji: "📏", theme: "Every 2×2 square spans exactly 3",
  // Numbers, not cards; up to 6×6 keeps the calibrated shapes modest.
  requires: { classes: ["Numeral"], minSize: 4, maxSize: 6 }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_p, g) => spreadText(g).about,
  top: (_p, g) => [(g.N - 1) ** 2, 0],
  example: () => ({ sym: [[7, 4], [5, 6]], col: full(2, 0), caption: `Biggest 7, smallest 4: 7 − 4 = ${SPREAD}. ${tierPoints(1, 0, 2)}.` }),
  python: (_p, g) => pyCard(spreadText(g), `
    def utility(grid):
        spot_on = 0
        secondary = 0
        for cell in grid.cells:
            if cell.right is None or cell.down is None:
                continue
            square = [cell.value, cell.right.value, cell.down.value, cell.down.right.value]
            spread = max(square) - min(square)
            if spread == SPREAD:
                spot_on += 1
            secondary -= abs(spread - SPREAD)
        return (spot_on, secondary)`),
  typescript: (_p, g) => tsCard(spreadText(g), `
    function utility(grid) {
      let spotOn = 0;
      let secondary = 0;
      for (const cell of grid.cells) {
        if (cell.right === null || cell.down === null) continue;
        const square = [cell.value, cell.right.value, cell.down.value, cell.down.right.value];
        const spread = Math.max(...square) - Math.min(...square);
        if (spread === SPREAD) spotOn += 1;
        secondary -= Math.abs(spread - SPREAD);
      }
      return [spotOn, secondary];
    }`),
  // A chessboard of 0s and 3s: every 2×2 square holds both.
  exemplar: (_p, g) => wire(g, fromFn(g.N, (r, c) => ((r + c) % 2) * SPREAD), full(g.N, 0)),
});
