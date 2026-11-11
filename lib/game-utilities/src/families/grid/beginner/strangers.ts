/**
 * 👋 Strangers (beginner pool): touching numbers inside each 2×2 box that tiles the board should be strangers: no
 * divisor bigger than 1 in common, and not next to each other when counting (2 and 3 are not strangers). Units: the 4
 * touching pairs of each of the (N/2)² boxes, (c[r][k], c[r][k+1]) for even k and (c[r][k], c[r+1][k]) for even r:
 * 16 on 4×4. Pairs across two boxes are not units. Primary points: pairs of strangers both bigger than 1. Secondary
 * points: a 1 beside a number bigger than 1. The best board is a chessboard of 2s and 5s: [4(N/2)², 0] = [N², 0].
 */
import type { CardText, GridSpec } from "../_util.ts";
import { full, fromFn, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";

type StrangersP = Record<string, never>;

/** The biggest number that divides both (0 when both are 0): the shared divisor the lens names. */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const strangersText = (g: GridSpec): CardText => {
  const k = g.N / 2, corner = k === 2;
  return {
    emoji: "👋", name: "Strangers", consts: [],
    about: sentences(
      `Try to make touching numbers in the same ${corner ? "corner" : "2×2"} box strangers.`,
      "Two numbers are strangers when no number bigger than 1 divides both and they are not next to each other when counting.",
      "So 4 and 9 are strangers; 4 and 6 share 2; 4 and 5 are next-door.",
      `Each pair of strangers scores ${tierPoints(1, 0, 2)} when both are bigger than 1.`,
      `Each 1 scores ${tierPoints(1, 1, 2)} for every bigger number it touches in its box.`,
      corner ? "" : `The board is cut into ${k * k} boxes of 2×2 cells, ${k} across and ${k} down.`,
      g.say.valueKey(),
    ),
  };
};

export const strangers = gridFamily<StrangersP>({
  id: "strangers", name: "Strangers", emoji: "👋", theme: "Touching numbers in a box that share no divisor",
  // Numbers, not cards; the boxes tile the board only on even sizes; up to 6×6 so the calibrated shapes stay few.
  requires: { classes: ["Numeral"], parity: "even", maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => strangersText(g).about,
  python: (_, g) => pyCard(strangersText(g), `
    def shared(a, b):
        # The biggest number that divides both.
        return a if b == 0 else shared(b, a % b)

    def utility(grid):
        pairs = 0
        ones = 0
        for line in grid.rows + grid.columns:
            # The touching pairs inside the boxes: cells 1 and 2, 3 and 4, and so on.
            for k in range(0, len(line), 2):
                a = line[k].value
                b = line[k + 1].value
                if a * b < 2 or shared(a, b) > 1:
                    continue  # A 0, two 1s, or a shared divisor.
                if a == 1 or b == 1:
                    ones += 1
                elif abs(a - b) > 1:
                    pairs += 1
        return (pairs, ones)`),
  typescript: (_, g) => tsCard(strangersText(g), `
    function shared(a, b) {
      // The biggest number that divides both.
      return b === 0 ? a : shared(b, a % b);
    }

    function utility(grid) {
      let pairs = 0;
      let ones = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        // The touching pairs inside the boxes: cells 1 and 2, 3 and 4, and so on.
        for (let k = 0; k < line.length; k += 2) {
          const a = line[k].value;
          const b = line[k + 1].value;
          if (a * b < 2 || shared(a, b) > 1) continue; // A 0, two 1s, or a shared divisor.
          if (a === 1 || b === 1) ones++;
          else if (Math.abs(a - b) > 1) pairs++;
        }
      }
      return [pairs, ones];
    }`),
  // A chessboard of 2s and 5s: every touching pair is a 2 and a 5, strangers 3 apart.
  exemplar: (_, g) => wire(g, fromFn(g.N, (r, c) => ((r + c) % 2 ? 5 : 2)), full(g.N, 0)),
  top: (_, g) => [g.N * g.N, 0],
  example: () => ({
    sym: [[4, 9], [5, 1]], col: full(2, 0),
    caption: "4 and 9 are strangers: 1 primary point. 4 and 5 are next-door: nothing. The 1 touches 9 and 5: 2 secondary points.",
  }),
});
