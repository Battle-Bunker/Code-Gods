/**
 * 🫅 Kings and Subjects (the owner's "kings and subjects"; the design's Royal Court, docs/layered-rules-design.md §5.1).
 * The family id is `kings_and_subjects`: `royal_court` is the cards family 👑 Royal Court (geometry.ts).
 *
 * A 2×2 box is a COURT when its single biggest number (the king) equals the other three (the subjects) added up, like
 * 9 with 2, 3 and 4. Two numbers that tie for biggest crown no king, so the all-zero board and every 0/k checkerboard
 * score nothing (§10 finding 1).
 *
 * The base is graded by closeness: `[courts, −total gap]`, where a box's gap is how far its king is from the sum of its
 * subjects, and a box without a king deducts NO_KING (twice the number of symbols: more than any king's gap, so
 * crowning a king always helps). Measured on 4×4 digits (docs/layered-rules-measurements/royal-court.md): DIFF 0.0,
 * K 3.0, against DIFF 16.8 for "2 points for a court, 1 for one away" (greedy traps on 17% of starts).
 *
 * `squares: "corners"` is the dealt base: the boxes that tile the board (four corner boxes on 4×4), disjoint units with
 * an exact law, so it carries tiers (./court-tiers.ts). `squares: "all"` is the expert variant on every overlapping 2×2
 * square (DIFF 20.7 on 4×4: not a beginner base, §1): it is in the params' domain for a setup that asks for it, never
 * in `support`, and it carries no tiers (no disjoint units).
 */
import type { CardText, GridSpec } from "../_util.ts";
import { fromFn, full, gridFamily, pyCard, sentences, tsCard, tuple, wire } from "../_util.ts";
import { choiceParam } from "../../../params.ts";
import { tierPoints } from "../../../tuples.ts";
import type { GridTiers, TierValue } from "../tiers.ts";
import { COURT_INTERACTIONS } from "./court-tiers.ts";

export type CourtSquares = "corners" | "all";
export type CourtP = { squares: CourtSquares };

/** What a box without a single biggest number deducts: more than the worst gap a king can have (2S − 5). */
export const noKingPenalty = (g: GridSpec) => 2 * g.S;

/** One 2×2 square's score from its four numbers: `[court, −gap]`, and which of the four is the king (−1: none). */
export function courtScore(values: readonly number[], noKing: number): { readonly score: readonly [number, number]; readonly king: number } {
  let king = 0, total = 0, ties = 0;
  for (let i = 0; i < values.length; i++) { total += values[i]; if (values[i] > values[king]) king = i; }
  for (const v of values) if (v === values[king]) ties += 1;
  if (ties > 1) return { score: [0, -noKing], king: -1 };
  const away = Math.abs(2 * values[king] - total);
  return { score: away === 0 ? [1, 0] : [0, -away], king };
}

/** The top-left cells of the squares that score: the tiling boxes, or every 2×2 square. */
export function courtSquares(N: number, squares: CourtSquares): { r: number; c: number }[] {
  const step = squares === "corners" ? 2 : 1, out = [];
  for (let r = 0; r + 1 < N; r += step) for (let c = 0; c + 1 < N; c += step) out.push({ r, c });
  return out;
}

const courtText = (p: CourtP, g: GridSpec): CardText => {
  const corners = p.squares === "corners", n = courtSquares(g.N, p.squares).length, k = g.N / 2;
  const box = corners ? "box" : "square";
  const which = k === 2 ? `each of the ${n} corner boxes` : `each of the ${n} boxes`;
  return {
    emoji: "🫅", name: "Kings and Subjects", consts: [["NO_KING", noKingPenalty(g)]],
    about: sentences(
      corners ? `Try to make ${which} a court.` : "Try to turn as many 2×2 squares as you can into courts.",
      `A ${box} is a court when its biggest number, the king, equals the other three, the subjects, added up, like 9 with 2, 3 and 4.`,
      `Each court scores ${tierPoints(1, 0, 2)}.`,
      `Each ${box} deducts as many secondary points as its king is away from the sum of its subjects.`,
      `A ${box} whose biggest number appears more than once has no king: it is no court and deducts ${tierPoints(noKingPenalty(g), 1, 2)}.`,
      corners ? (k === 2 ? `The board is cut into ${n} corner boxes of 2×2 cells.` : `The board is cut into ${n} boxes of 2×2 cells, ${k} across and ${k} down.`)
        : `Every 2×2 square on the board counts, ${n} in all, and they overlap.`,
      g.say.valueKey(),
    ),
  };
};

/**
 * Tiers on the corner base (measured on 4×4 digits: docs/layered-rules-measurements/royal-court.md, reproduced by
 * scripts/royal-court-sweep.ts; test/royal-court.test.ts re-runs the liveness check of every dealt value).
 *
 * - Gate: the base's greedy ten-move level of its first component. One-cell greedy holds 3.99 courts of 4 after ten
 *   moves (396 of 400 random boards at 4), so the gate is every box a court.
 * - `pairs` (x): pairs of kings joined by a path with x in between. Dealt for x = 1..5: the count runs 0..6 one pair at
 *   a time and adds 12.2 to 13.3 bits. The owner's plain count of paths (`paths`) adds 22 to 53 bits for all but two
 *   values of x (its best boards hold 13 to 20 paths), above the cap of 20; so does the two-component `pathPairs`
 *   for all but five.
 * - `sameRoads` (y): roads of subjects showing one number, of exactly y cells. Dealt for y = 4 (12.4 bits); y = 2 and 3 are too rare at the top to calibrate (see COURT_LAB).
 *   The owner's "longest road" is maxed by 91% of the boards with four courts; roads of exactly y subjects depend only
 *   on where the kings sit (dead, or under 5 bits); the longest same-number road is topped by 1111/1331/1331/1111.
 * - Lab: alive, but above the cap.
 *
 * Kings and Subjects has no complement symmetry, so no value folds onto another.
 */
const COURT_DEALT: readonly TierValue[] = [
  ...[1, 2, 3, 4, 5].map(x => ({ id: "pairs", x })),
  { id: "sameRoads", y: 4 },
];
// Same-number roads of 2 and 3 are not dealt at all, Lab included: their best tier is so rare (about 21 and 24 to 26 bits
// over the base) that the hybrid law misses it by up to 5 bits at the shipped budget
// (docs/layered-rules-measurements/kings-and-subjects.md).
const COURT_LAB: readonly TierValue[] = [{ id: "paths", x: 17 }, { id: "paths", x: 20 }, { id: "pairs", x: 13 }];
/**
 * Expert (two tiers: pairs of kings, then same-number roads among boards equal on pairs), on 4×4 digits against a band
 * of 6 to 26 bits for the two together (docs/layered-rules-measurements/expert-pairs.md). With every pair of kings
 * scoring, one road of four equal subjects is the most that fits.
 */
const COURT_PAIRS: readonly (readonly [TierValue, TierValue])[] = [2, 3].map(x => [{ id: "pairs", x }, { id: "sameRoads", y: 4 }] as const);

export const courtTiers: GridTiers<CourtP> = {
  interactions: COURT_INTERACTIONS,
  gate: g => (g.N / 2) ** 2,
  gateText: gate => `${gate} courts`,
  dealt: g => (g.N === 4 && g.base === 10 ? COURT_DEALT : []),
  lab: g => (g.N === 4 && g.base === 10 ? COURT_LAB : []),
  dealtPairs: g => (g.N === 4 && g.base === 10 ? COURT_PAIRS : []),
  base: (p, g) => (p.squares !== "corners" ? null : {
    id: "kings-and-subjects-boxes@1", symbols: g.S, cells: g.N * g.N, arity: 2,
    units: courtSquares(g.N, "corners").map(({ r, c }) => [r * g.N + c, r * g.N + c + 1, (r + 1) * g.N + c, (r + 1) * g.N + c + 1]),
    score: symbols => courtScore(symbols.map(s => g.value[s]), noKingPenalty(g)).score,
  }),
};

const skipTs = (p: CourtP) => (p.squares === "corners" ? "if (cell.row % 2 === 1 || cell.col % 2 === 1) continue;" : "if (!cell.right || !cell.down) continue;");
const skipPy = (p: CourtP) => (p.squares === "corners" ? "if cell.row % 2 == 1 or cell.col % 2 == 1:" : "if cell.right is None or cell.down is None:");
const vocab = (p: CourtP) => p.squares === "corners";

export const kingsAndSubjects = gridFamily<CourtP>({
  tiers: courtTiers,
  id: "kings_and_subjects", name: "Kings and Subjects", emoji: "🫅", theme: "A king who equals his three subjects added up",
  // Numbers, not cards; boxes tile the board only on even sizes; up to 6×6 keeps the calibrated shapes modest.
  requires: { classes: ["Numeral"], parity: "even", maxSize: 4 }, shape: tuple(2), tags: ["layered"],
  // Every overlapping square a court is known to be reachable on 4×4 only (the exemplar below).
  needs: p => (p.squares === "all" ? { maxSize: 4 } : {}),
  params: () => ({ squares: choiceParam("Squares that count", [["corners", "the boxes that tile the board"], ["all", "every 2×2 square (expert)"]]) }),
  support: () => [{ squares: "corners" }],
  summary: (p, g) => courtText(p, g).about,
  top: (p, g) => [courtSquares(g.N, p.squares).length, 0],
  example: () => ({ sym: [[9, 2], [3, 4]], col: full(2, 0), caption: `9 is the king, and 2 + 3 + 4 = 9: a court. ${tierPoints(1, 0, 2)}.` }),
  python: (p, g) => pyCard(courtText(p, g), `
    def utility(grid):
        courts = 0
        gap = 0${vocab(p) ? `
        kings = []     # The king of each court.
        subjects = []  # The other three cells of each court.` : ""}
        for cell in grid.cells:
            ${skipPy(p)}
                continue
            box = [cell, cell.right, cell.down, cell.down.right]
            king = box[0]
            for other in box:
                if other.value > king.value:
                    king = other  # The biggest number so far.
            rest = [other for other in box if other is not king]
            if max(other.value for other in rest) == king.value:  # The biggest number appears twice: no king.
                gap += NO_KING
                continue
            away = abs(king.value - sum(other.value for other in rest))
            gap += away
            if away == 0:
                courts += 1${vocab(p) ? `
                kings.append(king)
                subjects.extend(rest)` : ""}
        return (courts, -gap)`),
  typescript: (p, g) => tsCard(courtText(p, g), `
    function utility(grid) {
      let courts = 0;
      let gap = 0;${vocab(p) ? `
      const kings = [];     // The king of each court.
      const subjects = [];  // The other three cells of each court.` : ""}
      for (const cell of grid.cells) {
        ${skipTs(p)}
        const box = [cell, cell.right, cell.down, cell.down.right];
        box.sort((a, b) => b.value - a.value);  // Biggest number first.
        const king = box[0];
        const rest = box.slice(1);
        if (rest[0].value === king.value) {  // The biggest number appears twice: no king.
          gap += NO_KING;
          continue;
        }
        const away = Math.abs(king.value - (rest[0].value + rest[1].value + rest[2].value));
        gap += away;
        if (away === 0) {
          courts += 1;${vocab(p) ? `
          kings.push(king);
          subjects.push(...rest);` : ""}
        }
      }
      return [courts, -gap];
    }`),
  // Corners: every box 9 2 over 3 4. All: a board found by search, every one of the 9 squares a court.
  exemplar: (p, g) => (p.squares === "corners"
    ? wire(g, fromFn(g.N, (r, c) => [[9, 2], [3, 4]][r % 2][c % 2]), full(g.N, 0))
    : wire(g, [[2, 2, 0, 2], [7, 3, 1, 3], [0, 4, 0, 4], [2, 2, 2, 2]], full(g.N, 0))),
});
