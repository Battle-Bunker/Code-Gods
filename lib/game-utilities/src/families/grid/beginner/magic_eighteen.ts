/**
 * 🎩 Magic Eighteen (beginner pool): Magic Accountant (families/grid/arithmetic.ts) with the magic number fixed at the
 * middle total a line can make, N·(S−1)/2: 18 on 4×4 digits, 22 on base 12, 30 on hex, 27 on 6×6 digits. Each row (or
 * column, the dealt axis) that adds up to it scores a primary point; every line deducts its distance from it. The same
 * card program as Magic Accountant's; only the target is not dealt. Even sizes only, where that total is whole.
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, product, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { choiceParam } from "../../../params.ts";
import { tierPoints } from "../../../tuples.ts";
import { AXIS_OPTIONS, AXIS_WORD, everyLine, magicLinesPy, magicLinesTs, type Axis } from "../arithmetic.ts";

type EighteenP = { axis: Axis };

/** The total every line aims at: the middle of 0 … N·(S−1), whole on even sizes (every Numeral base is even). */
export const eighteenTarget = (g: GridSpec) => (g.N * (g.vmin + g.vmax)) / 2;

const eighteenText = (p: EighteenP, g: GridSpec): CardText => {
  const T = eighteenTarget(g), line = AXIS_WORD[p.axis];
  return {
    emoji: "🎩", name: "Magic Eighteen", consts: [["TARGET", T]],
    about: sentences(
      `Try to make ${everyLine(p.axis)} add up to ${T}.`,
      `Each ${line} that adds up to exactly ${T} scores ${tierPoints(1, 0, 2)}.`,
      `Each ${line} deducts as many secondary points as its total is away from ${T}.`,
      g.say.valueKey(),
    ),
  };
};

export const magicEighteen = gridFamily<EighteenP>({
  id: "magic_eighteen", name: "Magic Eighteen", emoji: "🎩", theme: "Every line adds up to the board's middle total",
  // Numbers, not cards; even sizes, where the middle total is whole; up to 6×6 keeps the calibrated shapes modest.
  requires: { classes: ["Numeral"], parity: "even", maxSize: 6 }, shape: tuple(2), tags: ["beginner"],
  params: () => ({ axis: choiceParam("Lines that count", AXIS_OPTIONS) }),
  // Rows and columns are transposes of each other: symmetric peers, canonically rows.
  support: () => product<EighteenP>({ axis: ["rows", "cols"] }),
  canonical: () => ({ axis: "rows" }),
  summary: (p, g) => eighteenText(p, g).about,
  python: (p, g) => pyCard(eighteenText(p, g), magicLinesPy(p.axis)),
  typescript: (p, g) => tsCard(eighteenText(p, g), magicLinesTs(p.axis)),
  // A chessboard of the smallest and biggest numbers: every row and column holds N/2 of each, the middle total.
  exemplar: (_, g) => wire(g, fromFn(g.N, (r, c) => ((r + c) % 2 ? g.vmax : g.vmin)), full(g.N, 0)),
  top: (_, g) => [g.N, 0],
});
