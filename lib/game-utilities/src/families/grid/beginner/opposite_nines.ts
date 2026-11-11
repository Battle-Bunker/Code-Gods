/**
 * 🙃 Opposite Nines (beginner pool): every cell has an opposite, where a half turn of the board takes it. Each opposite
 * pair whose numbers add up to the biggest digit (9 on base 10, B on base 12, F on hex) scores a primary point; every
 * pair deducts how far its total is from it. Fixed units (N²/2 pairs), each depending on two cells only.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";
import { halfTurnPairs, pairTop } from "./_pairs.ts";

type NinesP = Record<string, never>;

/** The pair total that scores: the biggest digit, S − 1 (so every digit has exactly one partner digit). */
export const ninesTarget = (g: GridSpec) => g.vmax;

const ninesText = (g: GridSpec): CardText => {
  const T = ninesTarget(g), t = g.say.tile(T);
  return {
    emoji: "🙃", name: "Opposite Nines", consts: [["TARGET", T]],
    about: sentences(
      `Try to make opposite cells add up to ${t}.`,
      `Each opposite pair that adds up to ${t} scores ${tierPoints(1, 0, 2)}.`,
      `Each pair deducts as many secondary points as its total is away from ${T}.`,
      "A cell's opposite is where it lands when you turn the board half way round, like the top-left and bottom-right corners.",
      g.say.valueKey(),
    ),
  };
};

export const oppositeNines = gridFamily<NinesP>({
  id: "opposite_nines", name: "Opposite Nines", emoji: "🙃", theme: "Opposite cells that add up to nine",
  requires: { classes: ["Numeral"], parity: "even", maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => ninesText(g).about,
  python: (_, g) => pyCard(ninesText(g), `
    def utility(grid):
        nines = 0
        distance = 0
        cells = grid.cells
        for i in range(len(cells) // 2):
            opposite = cells[len(cells) - 1 - i]  # the cell a half turn takes cells[i] to
            total = cells[i].value + opposite.value
            if total == TARGET:
                nines += 1
            distance += abs(total - TARGET)
        return (nines, -distance)`),
  typescript: (_, g) => tsCard(ninesText(g), `
    function utility(grid) {
      let nines = 0;
      let distance = 0;
      const cells = grid.cells;
      for (let i = 0; i < Math.floor(cells.length / 2); i++) {
        const opposite = cells[cells.length - 1 - i]; // the cell a half turn takes cells[i] to
        const total = cells[i].value + opposite.value;
        if (total === TARGET) nines += 1;
        distance += Math.abs(total - TARGET);
      }
      return [nines, -distance];
    }`),
  // The first half of the cells shows ⌊T/2⌋, the second half the rest of T: every opposite pair makes T.
  exemplar: (_, g) => {
    const T = ninesTarget(g), lo = Math.floor(T / 2), N = g.N;
    return wire(g, fromFn(N, (r, c) => (r * N + c < (N * N) / 2 ? lo : T - lo)), full(N, 0));
  },
  top: (_, g) => pairTop(halfTurnPairs(g.N).length),
  example: (_, g) => {
    const T = ninesTarget(g), lo = Math.floor(T / 2), hi = T - lo, tile = g.say.tile;
    return {
      sym: [[lo, hi], [lo - 2, hi]], col: full(2, 0),
      caption: `${tile(lo)} and ${tile(hi)} are opposite and add up to ${tile(T)}: 1 primary point. `
        + `${tile(hi)} and ${tile(lo - 2)} make ${T - 2}, 2 away: 2 secondary points off.`,
    };
  },
});
