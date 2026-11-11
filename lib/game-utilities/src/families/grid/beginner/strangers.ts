/**
 * 👋 Strangers (beginner pool): touching numbers should share no divisor bigger than 1. Units: the 2N(N−1) touching
 * pairs. Primary points: pairs of strangers both bigger than 1 (gcd 1). Secondary points: a 1 touching a number bigger
 * than 1. A 0 never scores (every number divides 0), and nothing scores beside itself (1 beside 1 included).
 * The best board is a chessboard of two strangers (2 and 3): every touching pair scores, [2N(N−1), 0].
 */
import type { CardText, GridSpec } from "../_util.ts";
import { full, fromFn, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { tierPoints } from "../../../tuples.ts";

type StrangersP = Record<string, never>;

/** The biggest number that divides both (0 when both are 0): the shared divisor the lens names. */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const strangersText = (g: GridSpec): CardText => ({
  emoji: "👋", name: "Strangers", consts: [],
  about: sentences(
    "Try to make touching numbers strangers.",
    "Two numbers are strangers when no number bigger than 1 divides both: 4 and 9 are strangers, 4 and 6 are not (2 divides both).",
    "So keep even numbers apart, and keep a 3 away from a 6 or a 9.",
    `Each pair of touching strangers scores ${tierPoints(1, 0, 2)} when both numbers are bigger than 1.`,
    `Each 1 scores ${tierPoints(1, 1, 2)} for every number bigger than 1 it touches.`,
    "A 0 never scores, and neither do two equal numbers that touch.",
    "Two cells touch when they share a side.",
    g.say.valueKey(),
  ),
});

export const strangers = gridFamily<StrangersP>({
  id: "strangers", name: "Strangers", emoji: "👋", theme: "Touching numbers that share no divisor",
  // Numbers, not cards; up to 6×6 so the calibrated shapes stay few.
  requires: { classes: ["Numeral"], maxSize: 6 }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => strangersText(g).about,
  python: (_, g) => pyCard(strangersText(g), `
    def shared(a, b):
        while b != 0:
            a, b = b, a % b
        return a

    def utility(grid):
        strangers = 0
        ones = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is None:
                    continue
                low = min(cell.value, other.value)
                high = max(cell.value, other.value)
                if low > 1 and shared(low, high) == 1:
                    strangers += 1
                elif low == 1 and high > 1:
                    ones += 1
        return (strangers, ones)`),
  typescript: (_, g) => tsCard(strangersText(g), `
    function shared(a, b) {
      while (b !== 0) {
        const rest = a % b;
        a = b;
        b = rest;
      }
      return a;
    }

    function utility(grid) {
      let strangers = 0;
      let ones = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other === null) continue;
          const low = Math.min(cell.value, other.value);
          const high = Math.max(cell.value, other.value);
          if (low > 1 && shared(low, high) === 1) strangers += 1;
          else if (low === 1 && high > 1) ones += 1;
        }
      }
      return [strangers, ones];
    }`),
  // A chessboard of 2s and 3s: every touching pair is a 2 and a 3.
  exemplar: (_, g) => wire(g, fromFn(g.N, (r, c) => ((r + c) % 2 ? 3 : 2)), full(g.N, 0)),
  top: (_, g) => [2 * g.N * (g.N - 1), 0],
  example: () => ({
    sym: [[4, 9], [6, 1]], col: full(2, 0),
    caption: "4 and 9 are strangers: 1 primary point. 4 and 6 share 2: nothing. The 1 touches 9 and 6: 2 secondary points.",
  }),
});
