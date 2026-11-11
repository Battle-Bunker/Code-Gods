/**
 * 🪑 Step-Stool Mirror (beginner pool): fold the board top onto bottom; each number and the number it lands on should
 * be one apart, like the steps of a stool. A pair one apart scores a primary point; every pair deducts how far its
 * difference is from 1. Fixed units (N²/2 pairs), each depending on two cells only.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";
import { foldPairs, pairTop } from "./_pairs.ts";

type StoolP = Record<string, never>;

const stoolText = (g: GridSpec): CardText => ({
  emoji: "🪑", name: "Step-Stool Mirror", consts: [],
  about: sentences(
    "Try to fold the board top onto bottom so each number lands on a number one apart from it, like 4 and 5.",
    `Each pair one apart scores ${tierPoints(1, 0, 2)}.`,
    "Each pair deducts as many secondary points as its difference is away from 1, so 4 and 4 deduct 1 and 2 and 6 deduct 3.",
    "Folding puts the top row on the bottom row, the second row on the second-last row, and so on.",
    g.say.valueKey(),
  ),
});

export const stepStool = gridFamily<StoolP>({
  id: "step_stool", name: "Step-Stool Mirror", emoji: "🪑", theme: "Fold the board: numbers one apart",
  requires: { classes: ["Numeral"], parity: "even", maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => stoolText(g).about,
  python: (_, g) => pyCard(stoolText(g), `
    def utility(grid):
        steps = 0
        distance = 0
        rows = grid.rows
        for r in range(len(rows) // 2):
            top = rows[r]
            bottom = rows[len(rows) - 1 - r]  # the row it folds onto
            for c in range(len(top)):
                off = abs(abs(top[c].value - bottom[c].value) - 1)
                if off == 0:
                    steps += 1
                distance += off
        return (steps, -distance)`),
  typescript: (_, g) => tsCard(stoolText(g), `
    function utility(grid) {
      let steps = 0;
      let distance = 0;
      const rows = grid.rows;
      for (let r = 0; r < Math.floor(rows.length / 2); r++) {
        const top = rows[r];
        const bottom = rows[rows.length - 1 - r]; // the row it folds onto
        for (let c = 0; c < top.length; c++) {
          const off = Math.abs(Math.abs(top[c].value - bottom[c].value) - 1);
          if (off === 0) steps += 1;
          distance += off;
        }
      }
      return [steps, -distance];
    }`),
  // The top half shows 4, the bottom half 5: every folded pair is one apart.
  exemplar: (_, g) => wire(g, fromFn(g.N, r => (r < g.N / 2 ? 4 : 5)), full(g.N, 0)),
  top: (_, g) => pairTop(foldPairs(g.N).length),
  example: () => ({
    sym: [[4, 7], [5, 5]], col: full(2, 0),
    caption: "Folded, 4 lands on 5: one apart, 1 primary point. 7 lands on 5: 2 apart, so it deducts 1 secondary point.",
  }),
});
