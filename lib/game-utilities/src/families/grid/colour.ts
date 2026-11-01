/** Colour & visual-pattern lens rules (lib/grid-lab/gridlab/rules/colour.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import { lazySurvival, rowTransferCount, type AnalyticSurvival } from "../../analytic.ts";
import {
  SCALAR, article, cap, chance, climb, cname, colourPairs, fromFn, full, gridFamily, list, pick, product, pyCard, range, recipes, recolour, tsCard, tuple, wire, example, plainSymbols, symForValue,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";
import { MIXER_OPTIMA, mixerOptimum } from "../../analytic/maxima.ts";

// --- Stripe Painter --------------------------------------------------------------------------------
type StripeP = { axis: "rows" | "cols" };
const stripeText = (p: StripeP): CardText => {
  const kind = p.axis === "rows" ? "row" : "column";
  return {
    emoji: "🦓", name: "Stripe Painter", consts: [],
    about: `A stripe is a ${kind} that is all one colour. Each stripe scores 1 point, unless the ${kind} just before it `
      + `is a stripe of the same colour. Most points wins. If that's a tie, add up how many cells in each ${kind} `
      + "match that line's most common colour.",
  };
};
const stripePainter = gridFamily<StripeP>({
  id: "stripe_painter", name: "Stripe Painter", emoji: "🦓", theme: "A striped flag",
  analytic: solvedAnalytic("stripe_painter"),
  shape: tuple(2), tags: ["shortlist"],
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: p => stripeText(p).about,
  example: (p, g) => {
    const rows = fromFn(3, r => (r % 2 === 0 ? 0 : 1));
    return example(plainSymbols(g, 3), p.axis === "rows" ? rows : fromFn(3, (_, c) => (c % 2 === 0 ? 0 : 1)),
      pts => `Three ${p.axis === "rows" ? "rows" : "columns"}, each all one colour: ${pts}.`);
  },
  python: p => pyCard(stripeText(p), `
    def most_common(line):
        best = 0
        for cell in line:
            same = 0
            for other in line:
                if other.colour == cell.colour:
                    same += 1
            best = max(best, same)
        return best

    def utility(grid):
        stripes = 0
        nearly = 0
        previous = None
        for line in ${p.axis === "rows" ? "grid.rows" : "grid.columns"}:
            count = most_common(line)
            nearly += count
            if count == len(line):
                if line[0].colour != previous:
                    stripes += 1
                previous = line[0].colour
            else:
                previous = None
        return (stripes, nearly)`),
  typescript: p => tsCard(stripeText(p), `
    function mostCommon(line) {
      let best = 0;
      for (const cell of line) {
        let same = 0;
        for (const other of line) {
          if (other.colour === cell.colour) same += 1;
        }
        best = Math.max(best, same);
      }
      return best;
    }

    function utility(grid) {
      let stripes = 0;
      let nearly = 0;
      let previous = null;
      for (const line of ${p.axis === "rows" ? "grid.rows" : "grid.columns"}) {
        const count = mostCommon(line);
        nearly += count;
        if (count === line.length) {
          if (line[0].colour !== previous) stripes += 1;
          previous = line[0].colour;
        } else {
          previous = null;
        }
      }
      return [stripes, nearly];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => (p.axis === "rows" ? r : c) % g.C)),
});

// --- Feuding Families --------------------------------------------------------------------------------
type FeudP = { X: number; Y: number };
const feudText = (p: FeudP, g: GridSpec): CardText => {
  const X = cname(g, p.X), Y = cname(g, p.Y);
  return {
    emoji: "😤", name: "Feuding Families", consts: [["FAMILY_1", X], ["FAMILY_2", Y]],
    about: `${cap(X)} cells and ${Y} cells are two feuding families. A cell is safe if it doesn't touch a cell of the `
      + "other family. Count the safe cells in each family. Your score is the smaller count, 1 point per cell. "
      + "If that's a tie, more safe cells in total wins.",
  };
};
const feudingFamilies = gridFamily<FeudP>({
  id: "feuding_families", name: "Feuding Families", emoji: "😤", theme: "Two big families that must never touch",
  shape: tuple(2), tags: ["shortlist"],
  support: g => colourPairs(g).map(([X, Y]) => ({ X, Y })),
  canonical: p => recolour(p, ["X", "Y"]),
  summary: (p, g) => feudText(p, g).about,
  example: (p, g) => {
    const Z = range(g.C).find(k => k !== p.X && k !== p.Y)!;
    return example(plainSymbols(g, 3), fromFn(3, (_, c) => (c === 0 ? p.X : c === 2 ? p.Y : Z)),
      pts => `${cap(cname(g, p.X))} and ${cname(g, p.Y)} kept apart by ${article(cname(g, Z))} wall: ${pts}.`);
  },
  python: (p, g) => pyCard(feudText(p, g), `
    def safe(cell, enemy):
        for other in cell.neighbours:
            if other.colour == enemy:
                return False
        return True

    def utility(grid):
        safe_1 = 0
        safe_2 = 0
        for cell in grid.cells:
            if cell.colour == FAMILY_1 and safe(cell, FAMILY_2):
                safe_1 += 1
            if cell.colour == FAMILY_2 and safe(cell, FAMILY_1):
                safe_2 += 1
        return (min(safe_1, safe_2), safe_1 + safe_2)`),
  typescript: (p, g) => tsCard(feudText(p, g), `
    function safe(cell, enemy) {
      for (const other of cell.neighbours) {
        if (other.colour === enemy) return false;
      }
      return true;
    }

    function utility(grid) {
      let safe1 = 0;
      let safe2 = 0;
      for (const cell of grid.cells) {
        if (cell.colour === FAMILY_1 && safe(cell, FAMILY_2)) safe1 += 1;
        if (cell.colour === FAMILY_2 && safe(cell, FAMILY_1)) safe2 += 1;
      }
      return [Math.min(safe1, safe2), safe1 + safe2];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, Z = range(g.C).find(k => k !== p.X && k !== p.Y)!, h = Math.floor((N - 1) / 2), z = full(N, 0);
    return climb("feuding_families", p, ctx, [
      { sym: z, col: fromFn(N, r => (r < h ? p.X : r === h ? Z : p.Y)) },
      { sym: z, col: fromFn(N, (r, c) => (r + c < N - 1 ? p.X : r + c === N - 1 ? Z : p.Y)) },
    ], 0);
  },
});

// --- Colour Mixer ------------------------------------------------------------------------------------
type MixP = { P1: number; M: number; P2: number; strict: boolean };
const mixText = (p: MixP, g: GridSpec): CardText => {
  const P1 = cname(g, p.P1), P2 = cname(g, p.P2), M = cname(g, p.M);
  return {
    emoji: "🎨", name: "Colour Mixer", consts: [["PAINT_1", P1], ["PAINT_2", P2]],
    about: `${cap(P1)} and ${P2} paint mix to make ${M}. `
      + (p.strict
        ? `Each ${M} cell with ${P1} on one side and ${P2} on the opposite side (left and right, or above and below) `
          + "scores 1 point. "
        : `Each ${M} cell that touches both a ${P1} cell and a ${P2} cell scores 1 point. `)
      + `Most points wins. If that's a tie, more ${M} cells touching either paint wins.`,
  };
};
const colourMixer = gridFamily<MixP>({
  id: "colour_mixer", name: "Colour Mixer", emoji: "🎨", theme: "A mixed colour touching both its parents",
  requires: { classes: ["Mixable"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => recipes(g).flatMap(([P1, P2, M]) => [false, true].map(strict => ({ P1, M, P2, strict }))),
  sample: (rng, g) => {
    const [P1, P2, M] = pick(rng, recipes(g));
    return { P1, M, P2, strict: chance(rng, 1, 2) };
  },
  canonical: (p, g) => {
    const [P1, P2, M] = recipes(g)[0]; // all distinct colour triples are equivalent under colour permutation
    return { P1, M, P2, strict: p.strict };
  },
  summary: (p, g) => mixText(p, g).about,
  example: (p, g) => {
    const Z = range(g.C).find(k => k !== p.P1 && k !== p.M && k !== p.P2)!;
    return example(plainSymbols(g, 3), fromFn(3, (r, c) => (r === 1 ? [p.P1, p.M, p.P2][c]! : Z)),
      pts => `${cap(article(cname(g, p.M)))} cell between ${cname(g, p.P1)} and ${cname(g, p.P2)}: ${pts}.`);
  },
  python: (p, g) => pyCard(mixText(p, g), `
    MIXED = mix(PAINT_1, PAINT_2)

    def touches(cell, colour):
        for other in cell.neighbours:
            if other.colour == colour:
                return True
        return False
${p.strict ? `
    def between(cell, a, b):
        if a is None or b is None:
            return False
        return (a.colour == PAINT_1 and b.colour == PAINT_2) or (a.colour == PAINT_2 and b.colour == PAINT_1)
` : ""}
    def utility(grid):
        mixes = 0
        near = 0
        for cell in grid.cells:
            if cell.colour != MIXED:
                continue
            if touches(cell, PAINT_1) or touches(cell, PAINT_2):
                near += 1
            if ${p.strict ? "between(cell, cell.left, cell.right) or between(cell, cell.up, cell.down)"
    : "touches(cell, PAINT_1) and touches(cell, PAINT_2)"}:
                mixes += 1
        return (mixes, near)`),
  typescript: (p, g) => tsCard(mixText(p, g), `
    const MIXED = mix(PAINT_1, PAINT_2);

    function touches(cell, colour) {
      for (const other of cell.neighbours) {
        if (other.colour === colour) return true;
      }
      return false;
    }
${p.strict ? `
    function between(cell, a, b) {
      if (a === null || b === null) return false;
      return (a.colour === PAINT_1 && b.colour === PAINT_2) || (a.colour === PAINT_2 && b.colour === PAINT_1);
    }
` : ""}
    function utility(grid) {
      let mixes = 0;
      let near = 0;
      for (const cell of grid.cells) {
        if (cell.colour !== MIXED) continue;
        if (touches(cell, PAINT_1) || touches(cell, PAINT_2)) near += 1;
        if (${p.strict ? "between(cell, cell.left, cell.right) || between(cell, cell.up, cell.down)"
    : "touches(cell, PAINT_1) && touches(cell, PAINT_2)"}) mixes += 1;
      }
      return [mixes, near];
    }`),
  // The exact optimum of a max-plus transfer matrix over the letters P1/P2/M (src/analytic/maxima.ts): a proven maximum.
  exemplar: (p, g) => {
    const rows = MIXER_OPTIMA[g.N]?.[p.strict ? "strict" : "loose"] ?? mixerOptimum(g.N, p.strict).rows; // tabulated for every GRID_SIZES
    const colour = { A: p.P1, B: p.P2, M: p.M } as const;
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => colour[rows[r][c] as "A" | "B" | "M"]));
  },
});

// --- Fair Weaver ---------------------------------------------------------------------------------------
const weaverText = (g: GridSpec): CardText => ({
  emoji: "🧶", name: "Fair Weaver", consts: [],
  about: `A row or column is fair if every colour (${g.say.colours(range(g.C))}) appears almost equally often. `
    + "Its most common and least common colour may differ by at most 1. Each fair line scores 1 point. "
    + "Most points wins. If that's a tie, a smaller gap between most and least common, added up over all lines, wins.",
});
const fairWeaver = gridFamily<Record<string, never>>({
  id: "fair_weaver", name: "Fair Weaver", emoji: "🧶", theme: "Every colour gets a fair share of each line",
  shape: tuple(2), tags: ["shortlist"],
  support: () => [{}],
  summary: (_, g) => weaverText(g).about,
  example: (_p, g) => example(plainSymbols(g, 3), fromFn(3, (r, c) => (r + c) % 3),
    pts => `Every row and column shares its colours fairly: ${pts}.`),
  python: (_, g) => pyCard(weaverText(g), `
    def unfairness(line, palette):
        counts = []
        for colour in palette:
            n = 0
            for cell in line:
                if cell.colour == colour:
                    n += 1
            counts.append(n)
        return max(counts) - min(counts)

    def utility(grid):
        fair = 0
        spread = 0
        for line in grid.rows + grid.columns:
            d = unfairness(line, grid.palette)
            if d <= 1:
                fair += 1
            spread += d
        return (fair, -spread)`),
  typescript: (_, g) => tsCard(weaverText(g), `
    function unfairness(line, palette) {
      const counts = [];
      for (const colour of palette) {
        let n = 0;
        for (const cell of line) {
          if (cell.colour === colour) n += 1;
        }
        counts.push(n);
      }
      return Math.max(...counts) - Math.min(...counts);
    }

    function utility(grid) {
      let fair = 0;
      let spread = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        const d = unfairness(line, grid.palette);
        if (d <= 1) fair += 1;
        spread += d;
      }
      return [fair, -spread];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => (r + c) % g.C)),
});

// --- Lantern Lighter -----------------------------------------------------------------------------------
type LanternP = { X: number };
const lanternText = (p: LanternP, g: GridSpec): CardText => ({
  emoji: "🏮", name: "Lantern Lighter", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `${cap(article(cname(g, p.X)))} cell is a lantern if it is the only ${cname(g, p.X)} cell in its row and the `
    + "only one in its column. Each lantern scores 1 point.",
});
const lanternLighter = gridFamily<LanternP>({
  id: "lantern_lighter", name: "Lantern Lighter", emoji: "🏮", theme: "One lantern per row and column",
  shape: SCALAR, tags: ["shortlist"],
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => lanternText(p, g).about,
  example: (p, g) => example(plainSymbols(g, 3), fromFn(3, (r, c) => (r === c ? p.X : (p.X + 1) % g.C)),
    pts => `Three ${cname(g, p.X)} lanterns, each alone in its row and column: ${pts}.`),
  python: (p, g) => pyCard(lanternText(p, g), `
    def count_mine(line):
        n = 0
        for cell in line:
            if cell.colour == MY_COLOUR:
                n += 1
        return n

    def utility(grid):
        lanterns = 0
        for cell in grid.cells:
            if cell.colour != MY_COLOUR:
                continue
            if count_mine(grid.rows[cell.row]) == 1 and count_mine(grid.columns[cell.col]) == 1:
                lanterns += 1
        return lanterns`),
  typescript: (p, g) => tsCard(lanternText(p, g), `
    function countMine(line) {
      let n = 0;
      for (const cell of line) {
        if (cell.colour === MY_COLOUR) n += 1;
      }
      return n;
    }

    function utility(grid) {
      let lanterns = 0;
      for (const cell of grid.cells) {
        if (cell.colour !== MY_COLOUR) continue;
        if (countMine(grid.rows[cell.row]) === 1 && countMine(grid.columns[cell.col]) === 1) lanterns += 1;
      }
      return lanterns;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => (r === c ? p.X : (p.X + 1) % g.C))),
});


// ================================================================================================
// Not shortlisted (new cards, checked against grid-lab by test/gridlab_parity.py)
// ================================================================================================

const DIRS4 = ["→", "←", "↓", "↑"] as const;
type Dir4 = (typeof DIRS4)[number];
const PY_LINES: Record<Dir4, string> = {
  "→": "grid.rows", "←": "[list(reversed(row)) for row in grid.rows]",
  "↓": "grid.columns", "↑": "[list(reversed(c)) for c in grid.columns]",
};
const TS_LINES: Record<Dir4, string> = {
  "→": "grid.rows", "←": "grid.rows.map(row => [...row].reverse())",
  "↓": "grid.columns", "↑": "grid.columns.map(column => [...column].reverse())",
};
/** grid-lab unorient: the grid whose lines read in `dir` are rows with value f(position along the line). */
const unorient = (N: number, dir: Dir4, f: (i: number) => number) => fromFn(N, (r, c) =>
  f(dir === "→" ? c : dir === "←" ? N - 1 - c : dir === "↓" ? r : N - 1 - r));
/** "every row, left to right": the lines a direction reads, in plain words. */
const READ_LINES: Record<Dir4, string> = {
  "→": "every row, left to right", "←": "every row, right to left",
  "↓": "every column, top to bottom", "↑": "every column, bottom to top",
};
type PairP = { A: number; B: number };
const pairConsts = (p: PairP, g: GridSpec) => [["COLOUR_A", cname(g, p.A)], ["COLOUR_B", cname(g, p.B)]] as const;

// --- Best Friends ----------------------------------------------------------------------------------
const friendsText = (p: PairP, g: GridSpec): CardText => ({
  emoji: "🤗", name: "Best Friends", consts: pairConsts(p, g),
  about: `Each time ${article(cname(g, p.A))} cell touches ${article(cname(g, p.B))} cell, that scores 1 point. `
    + "Two cells touch when they share a side.",
});
const OPPOSITE_PY = `
    def friends(a, b):
        return (a.colour == COLOUR_A and b.colour == COLOUR_B) or (a.colour == COLOUR_B and b.colour == COLOUR_A)
`;
const OPPOSITE_TS = `
    function friends(a, b) {
      return (a.colour === COLOUR_A && b.colour === COLOUR_B) || (a.colour === COLOUR_B && b.colour === COLOUR_A);
    }
`;
/** Row states a transfer matrix may have before the analytic defers to sampling (≈ 0.6 s at 1024 states, 1 s at 1296). */
const TRANSFER_STATES = 1300;
const bestFriends = gridFamily<PairP>({
  id: "best_friends", name: "Best Friends", emoji: "🤗", theme: "Your two colours side by side", shape: SCALAR,
  support: g => colourPairs(g).map(([A, B]) => ({ A, B })),
  canonical: p => recolour(p, ["A", "B"]),
  summary: (p, g) => friendsText(p, g).about,
  example: (p, g) => example(plainSymbols(g, 2), [[p.A, p.B], [p.B, p.A]],
    pts => `${cap(cname(g, p.A))} and ${cname(g, p.B)} cells touch four times: ${pts}.`),
  python: (p, g) => pyCard(friendsText(p, g), `${OPPOSITE_PY}
    def utility(grid):
        seams = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and friends(cell, other):
                    seams += 1
        return seams`),
  typescript: (p, g) => tsCard(friendsText(p, g), `${OPPOSITE_TS}
    function utility(grid) {
      let seams = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && friends(cell, other)) seams += 1;
        }
      }
      return seams;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? p.A : p.B))),
  /**
   * Seams between the two colours are a 2-D pattern count: exact by a row-to-row transfer matrix whose state is a whole
   * row colouring (C^N states; tail-toolkit.md §6). Shapes with more than TRANSFER_STATES states fall back to sampling.
   * The law is computed lazily (about a second), so keying a table costs nothing.
   */
  analytic: (_p, g): AnalyticSurvival | null => {
    const N = g.N, C = g.C, M = C ** N;
    if (M > TRANSFER_STATES) return null;
    return lazySurvival("transfer-matrix-rows@1", () => {
    const rows: number[][] = Array.from({ length: M }, (_, r) => { const out: number[] = []; for (let i = 0, x = r; i < N; i++, x = Math.floor(x / C)) out.push(x % C); return out; });
    const friends = (a: number, b: number) => (a === 0 && b === 1) || (a === 1 && b === 0);
    const h = (r: number) => { let s = 0; for (let i = 0; i + 1 < N; i++) if (friends(rows[r][i], rows[r][i + 1])) s++; return s; };
    const v = new Uint8Array(M * M);
    for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) { let s = 0; for (let i = 0; i < N; i++) if (friends(rows[a][i], rows[b][i])) s++; v[a * M + b] = s; }
    return rowTransferCount(N, M, h, (a, b) => v[a * M + b], 2 * N * (N - 1));
    });
  },
});

// --- Rainbow Steps ----------------------------------------------------------------------------------
type DirP = { dir: Dir4 };
const stepsText = (p: DirP, g: GridSpec): CardText => ({
  emoji: "👣", name: "Rainbow Steps", consts: [],
  about: `Look along ${READ_LINES[p.dir]}. Each time a cell is followed by the next colour in rainbow order `
    + `(${[...g.colourNames, g.colourNames[0]].join(" → ")}), score 1 point.`,
});
const rainbowSteps = gridFamily<DirP>({
  id: "rainbow_steps", name: "Rainbow Steps", emoji: "👣", theme: "Next-door colours step round the rainbow",
  analytic: solvedAnalytic("rainbow_steps"),
  requires: { classes: ["Spectral"] }, shape: SCALAR,
  support: () => DIRS4.map(dir => ({ dir })),
  canonical: () => ({ dir: "→" }),
  summary: (p, g) => stepsText(p, g).about,
  example: (p, g) => example(plainSymbols(g, 3), unorient(3, p.dir, i => i % g.C),
    pts => `Along ${READ_LINES[p.dir]}, each colour is followed by the next: ${pts}.`),
  python: (p, g) => pyCard(stepsText(p, g), `
    def utility(grid):
        steps = 0
        for line in ${PY_LINES[p.dir]}:
            for i in range(len(line) - 1):
                if line[i + 1].colour == next_colour(line[i].colour):
                    steps += 1
        return steps`),
  typescript: (p, g) => tsCard(stepsText(p, g), `
    function utility(grid) {
      let steps = 0;
      for (const line of ${TS_LINES[p.dir]}) {
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i + 1].colour === nextColour(line[i].colour)) steps += 1;
        }
      }
      return steps;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), unorient(g.N, p.dir, i => i % g.C)),
});

// --- Quilt Maker -------------------------------------------------------------------------------------
const quiltText = (g: GridSpec): CardText => ({
  emoji: "🧵", name: "Quilt Maker", consts: [],
  about: g.C >= 4
    ? `Each 2×2 square that shows ${g.say.distinctColours(4)} scores 1 point.`
    : `Each 2×2 square that uses ${g.say.distinctColours(3)} scores 1 point, as long as no two cells sharing a side `
      + "match.",
});
const quiltMaker = gridFamily<Record<string, never>>({
  id: "quilt_maker", name: "Quilt Maker", emoji: "🧵", theme: "Patchwork squares with no two patches alike", shape: SCALAR,
  requires: { minColours: 3 },
  support: () => [{}],
  summary: (_, g) => quiltText(g).about,
  example: (_p, g) => example(plainSymbols(g, 2), [[0, 1], [2, g.C >= 4 ? 3 : 0]],
    pts => (g.C >= 4 ? `A 2×2 square showing ${g.say.distinctColours(4)}: ${pts}.` : `A square of ${g.say.distinctColours(3)} with no two touching cells alike: ${pts}.`)),
  python: (_, g) => pyCard(quiltText(g), `
    def utility(grid):
        squares = 0
        for cell in grid.cells:
            right, below = cell.right, cell.down
            if right is None or below is None:
                continue
            corner = below.right
            colours = set([cell.colour, right.colour, below.colour, corner.colour])${g.C >= 4 ? `
            if len(colours) == 4:` : `
            sides_differ = cell.colour != right.colour and cell.colour != below.colour
            sides_differ = sides_differ and corner.colour != right.colour and corner.colour != below.colour
            if len(colours) == 3 and sides_differ:`}
                squares += 1
        return squares`),
  typescript: (_, g) => tsCard(quiltText(g), `
    function utility(grid) {
      let squares = 0;
      for (const cell of grid.cells) {
        const right = cell.right, below = cell.down;
        if (right === null || below === null) continue;
        const corner = below.right;
        const colours = new Set([cell.colour, right.colour, below.colour, corner.colour]);${g.C >= 4 ? `
        if (colours.size === 4) squares += 1;` : `
        const sidesDiffer = cell.colour !== right.colour && cell.colour !== below.colour
          && corner.colour !== right.colour && corner.colour !== below.colour;
        if (colours.size === 3 && sidesDiffer) squares += 1;`}
      }
      return squares;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => (g.C >= 4 ? 2 * (r % 2) + (c % 2) : (r + c) % 3))),
});

// --- Flag Bearer -------------------------------------------------------------------------------------
type FlagP = { C: number; axis: "rows" | "cols" };
const flagText = (p: FlagP, g: GridSpec): CardText => ({
  emoji: "🚩", name: "Flag Bearer", consts: [["MY_COLOUR", cname(g, p.C)]],
  about: `Your colour is ${cname(g, p.C)}. A ${p.axis === "rows" ? "row" : "column"} is yours if it has more `
    + `${cname(g, p.C)} cells than cells of any other single colour. Each of your ${p.axis === "rows" ? "rows" : "columns"} `
    + "scores 1 point. Most points wins. If that's a tie, a bigger lead wins: your cells minus the best other "
    + "colour's cells, added up over all lines.",
});
const flagBearer = gridFamily<FlagP>({
  id: "flag_bearer", name: "Flag Bearer", emoji: "🚩", theme: "Your colour wins the vote in every row", shape: tuple(2),
  analytic: solvedAnalytic("flag_bearer"),
  support: g => product<FlagP>({ C: range(g.C), axis: ["rows", "cols"] }),
  canonical: () => ({ C: 0, axis: "rows" }),
  summary: (p, g) => flagText(p, g).about,
  example: (p, g) => {
    const Y = (p.C + 1) % g.C, wins = fromFn(3, (r, c) => ((r + c) % 3 === 2 ? Y : p.C));
    return example(plainSymbols(g, 3), p.axis === "rows" ? wins : fromFn(3, (r, c) => wins[c]![r]!),
      pts => `${cap(cname(g, p.C))} has the most cells in every ${p.axis === "rows" ? "row" : "column"}: ${pts}.`);
  },
  python: (p, g) => pyCard(flagText(p, g), `
    def count(line, colour):
        n = 0
        for cell in line:
            if cell.colour == colour:
                n += 1
        return n

    def utility(grid):
        won = 0
        lead = 0
        for line in ${p.axis === "rows" ? "grid.rows" : "grid.columns"}:
            mine = count(line, MY_COLOUR)
            rival = max(count(line, colour) for colour in grid.palette if colour != MY_COLOUR)
            if mine > rival:
                won += 1
            lead += mine - rival + grid.size
        return (won, lead)`),
  typescript: (p, g) => tsCard(flagText(p, g), `
    function count(line, colour) {
      return line.filter(cell => cell.colour === colour).length;
    }

    function utility(grid) {
      let won = 0;
      let lead = 0;
      for (const line of ${p.axis === "rows" ? "grid.rows" : "grid.columns"}) {
        const mine = count(line, MY_COLOUR);
        const others = grid.palette.filter(colour => colour !== MY_COLOUR);
        const rival = Math.max(...others.map(colour => count(line, colour)));
        if (mine > rival) won += 1;
        lead += mine - rival + grid.size;
      }
      return [won, lead];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.C)),
});

// --- Colour-by-Number ----------------------------------------------------------------------------------
type ShiftP = { t: number };
/** The colouring key, one short sentence per colour, with the values named as the board shows them. */
const keySentences = (p: ShiftP, g: GridSpec): string => {
  const values = [...new Set(g.value)].sort((a, b) => a - b);
  return [g.say.valueKey(), ...range(g.C).map(k => {
    const vs = values.filter(v => (v + p.t) % g.C === k);
    return vs.length ? `${cap(cname(g, k))} is for ${g.say.values(vs)}.` : "";
  })].filter(Boolean).join(" ");
};
const keyText = (p: ShiftP, g: GridSpec): CardText => ({
  emoji: "🔢", name: "Colour-by-Number", consts: [["SHIFT", p.t]],
  about: `Every ${g.cards ? "rank" : "number"} has its own colour. ` + keySentences(p, g)
    + ` Each cell painted the right colour for its ${g.cards ? "rank" : "number"} scores 1 point.`,
});
const colourByNumber = gridFamily<ShiftP>({
  id: "colour_by_number", name: "Colour-by-Number", emoji: "🔢", theme: "Every number has its own colour",
  analytic: solvedAnalytic("colour_by_number"),
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => range(g.C).map(t => ({ t })),
  canonical: () => ({ t: 0 }), // cyclic colour relabelling shifts t
  summary: (p, g) => keyText(p, g).about,
  example: (p, g) => {
    const vs = [g.vmin, g.vmin + 1, g.vmin + 2, g.vmin + 3];
    return example([[vs[0]!, vs[1]!], [vs[2]!, vs[3]!]].map(row => row.map(v => symForValue(g, v))),
      [[vs[0]!, vs[1]!], [vs[2]!, vs[3]!]].map(row => row.map(v => (v + p.t) % g.C)),
      pts => `Every cell painted the right colour for its ${g.cards ? "rank" : "number"}: ${pts}.`);
  },
  python: (p, g) => pyCard(keyText(p, g), `
    def utility(grid):
        right = 0
        for cell in grid.cells:
            if (cell.value + SHIFT) % len(grid.palette) == grid.palette.index(cell.colour):
                right += 1
        return right`),
  typescript: (p, g) => tsCard(keyText(p, g), `
    function utility(grid) {
      let right = 0;
      for (const cell of grid.cells) {
        if ((cell.value + SHIFT) % grid.palette.length === grid.palette.indexOf(cell.colour)) right += 1;
      }
      return right;
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, (_, c) => c % g.S), fromFn(g.N, (_, c) => (g.value[c % g.S] + p.t) % g.C)),
});

// --- Kingdom ------------------------------------------------------------------------------------------
type KingdomP = { C: number };
const kingdomText = (p: KingdomP, g: GridSpec): CardText => ({
  emoji: "🏰", name: "Kingdom", consts: [["MY_COLOUR", cname(g, p.C)]],
  about: `Your colour is ${cname(g, p.C)}. A patch is a group of ${cname(g, p.C)} cells joined side to side. `
    + "Score 1 point for each cell in your biggest patch.",
});
const kingdom = gridFamily<KingdomP>({
  id: "kingdom", name: "Kingdom", emoji: "🏰", theme: "The biggest patch of your colour", shape: SCALAR,
  support: g => range(g.C).map(C => ({ C })),
  canonical: p => recolour(p, ["C"]),
  summary: (p, g) => kingdomText(p, g).about,
  example: (p, g) => example(plainSymbols(g, 3), fromFn(3, (r, c) => (r === 1 || c === 1 ? p.C : (p.C + 1) % g.C)),
    pts => `${cap(article(cname(g, p.C)))} patch of five joined cells: ${pts}.`),
  python: (p, g) => pyCard(kingdomText(p, g), `
    def same_colour(a, b):
        return a.colour == b.colour

    def utility(grid):
        biggest = 0
        for patch in grid.regions(same_colour):
            if patch[0].colour == MY_COLOUR:
                biggest = max(biggest, len(patch))
        return biggest`),
  typescript: (p, g) => tsCard(kingdomText(p, g), `
    function sameColour(a, b) {
      return a.colour === b.colour;
    }

    function utility(grid) {
      let biggest = 0;
      for (const patch of grid.regions(sameColour)) {
        if (patch[0].colour === MY_COLOUR) biggest = Math.max(biggest, patch.length);
      }
      return biggest;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.C)),
});

// --- Wallpaper Weaver -----------------------------------------------------------------------------------
type PaperP = { p: number; dir: "right" | "down" };
const paperText = (p: PaperP): CardText => ({
  emoji: "🧱", name: "Wallpaper Weaver", consts: [["STEPS", p.p]],
  about: `Compare each cell with the cell ${p.p} steps ${p.dir === "right" ? "to its right" : "below it"}. `
    + "Each cell that has the same colour scores 1 point.",
});
const wallpaper = gridFamily<PaperP>({
  id: "wallpaper_weaver", name: "Wallpaper Weaver", emoji: "🧱", theme: "A repeating pattern", shape: SCALAR,
  analytic: solvedAnalytic("wallpaper_weaver"),
  support: g => product<PaperP>({ p: g.N >= 4 ? [2, 3] : [2], dir: ["right", "down"] }),
  canonical: p => ({ p: p.p, dir: "right" }),
  summary: p => paperText(p).about,
  example: (p, g) => {
    const k = p.p + 1;
    if (k > g.N) return null;
    const stripes = fromFn(k, (_, c) => c % p.p);
    return example(plainSymbols(g, k), p.dir === "right" ? stripes : fromFn(k, (r, c) => stripes[c]![r]!),
      pts => `The colours repeat every ${p.p} cells ${p.dir === "right" ? "across" : "down"}: ${pts}.`);
  },
  python: p => pyCard(paperText(p), `
    def utility(grid):
        repeats = 0
        for cell in grid.cells:
            if cell.${p.dir === "right" ? "col" : "row"} + STEPS < grid.size:
                other = grid.cell(${p.dir === "right" ? "cell.row, cell.col + STEPS" : "cell.row + STEPS, cell.col"})
                if other.colour == cell.colour:
                    repeats += 1
        return repeats`),
  typescript: p => tsCard(paperText(p), `
    function utility(grid) {
      let repeats = 0;
      for (const cell of grid.cells) {
        if (cell.${p.dir === "right" ? "col" : "row"} + STEPS < grid.size) {
          const other = grid.cell(${p.dir === "right" ? "cell.row, cell.col + STEPS" : "cell.row + STEPS, cell.col"});
          if (other.colour === cell.colour) repeats += 1;
        }
      }
      return repeats;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Sunset Sky --------------------------------------------------------------------------------------------
const sunsetText = (p: DirP, g: GridSpec): CardText => ({
  emoji: "🌅", name: "Sunset Sky", consts: [],
  about: `Look along ${READ_LINES[p.dir]}. A good step stays on the same colour or moves one step along the rainbow `
    + `(${g.colourNames.join(" → ")}), never back. A line is a sunset if every step is good and it uses at least 3 colours. `
    + "Each sunset scores 1 point. Most sunsets wins. If that's a tie, more good steps wins.",
});
const sunsetSky = gridFamily<DirP>({
  id: "sunset_sky", name: "Sunset Sky", emoji: "🌅", theme: "Lines that fade smoothly along the rainbow",
  analytic: solvedAnalytic("sunset_sky"),
  requires: { classes: ["Spectral"], minColours: 3 }, shape: tuple(2),
  support: () => DIRS4.map(dir => ({ dir })),
  canonical: () => ({ dir: "↓" }),
  summary: (p, g) => sunsetText(p, g).about,
  example: (p, g) => example(plainSymbols(g, 3), unorient(3, p.dir, i => i),
    pts => `Along ${READ_LINES[p.dir]}, the colours move one step along the rainbow: ${pts}.`),
  python: (p, g) => pyCard(sunsetText(p, g), `
    def utility(grid):
        sunsets = 0
        good = 0
        for line in ${PY_LINES[p.dir]}:
            places = [grid.palette.index(cell.colour) for cell in line]
            smooth = 0
            for i in range(len(places) - 1):
                if places[i + 1] - places[i] in (0, 1):
                    smooth += 1
            good += smooth
            if smooth == len(places) - 1 and len(set(places)) >= 3:
                sunsets += 1
        return (sunsets, good)`),
  typescript: (p, g) => tsCard(sunsetText(p, g), `
    function utility(grid) {
      let sunsets = 0;
      let good = 0;
      for (const line of ${TS_LINES[p.dir]}) {
        const places = line.map(cell => grid.palette.indexOf(cell.colour));
        let smooth = 0;
        for (let i = 0; i < places.length - 1; i++) {
          const step = places[i + 1] - places[i];
          if (step === 0 || step === 1) smooth += 1;
        }
        good += smooth;
        if (smooth === places.length - 1 && new Set(places).size >= 3) sunsets += 1;
      }
      return [sunsets, good];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), unorient(g.N, p.dir, i => Math.min(i, g.C - 1))),
});

// --- Colour Wheel Harmony -------------------------------------------------------------------------------------
type HarmonyP = { fav: number | null };
const harmonyText = (p: HarmonyP, g: GridSpec): CardText => {
  const h = g.C / 2;
  return {
    emoji: "☯️", name: "Colour Wheel Harmony", consts: p.fav === null ? [] : [["FAVOURITE", cname(g, p.fav)]],
    about: "Opposite colours on the colour wheel are "
      + list(range(h).map(i => `${cname(g, i)}–${cname(g, i + h)}`)) + ". Each time two opposite colours touch, "
      + (p.fav === null ? "score 1 point." : `score 1 point, or 2 points if one of them is ${cname(g, p.fav)}.`),
  };
};
const harmony = gridFamily<HarmonyP>({
  id: "colour_wheel_harmony", name: "Colour Wheel Harmony", emoji: "☯️", theme: "Opposite colours that make each other pop",
  requires: { classes: ["Wheel"], evenColours: true }, shape: SCALAR,
  support: g => [null, ...range(Math.floor(g.C / 2))].map(fav => ({ fav })),
  sample: (rng, g) => ({ fav: chance(rng, 1, 2) ? null : rng.int(Math.floor(g.C / 2)) }),
  canonical: p => ({ fav: p.fav === null ? null : 0 }),
  summary: (p, g) => harmonyText(p, g).about,
  example: (p, g) => {
    const a = p.fav ?? 0, b = a + g.C / 2;
    return example(plainSymbols(g, 2), [[a, b], [b, a]], pts => `Opposite colours ${cname(g, a)} and ${cname(g, b)} touch four times: ${pts}.`);
  },
  python: (p, g) => pyCard(harmonyText(p, g), `
    def opposite(grid, a, b):
        return abs(grid.palette.index(a.colour) - grid.palette.index(b.colour)) == len(grid.palette) // 2

    def utility(grid):
        points = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and opposite(grid, cell, other):${p.fav === null ? `
                    points += 1` : `
                    if cell.colour == FAVOURITE or other.colour == FAVOURITE:
                        points += 2
                    else:
                        points += 1`}
        return points`),
  typescript: (p, g) => tsCard(harmonyText(p, g), `
    function opposite(grid, a, b) {
      const apart = Math.abs(grid.palette.indexOf(a.colour) - grid.palette.indexOf(b.colour));
      return apart === Math.floor(grid.palette.length / 2);
    }

    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && opposite(grid, cell, other)) {
            ${p.fav === null ? "points += 1;" : "points += cell.colour === FAVOURITE || other.colour === FAVOURITE ? 2 : 1;"}
          }
        }
      }
      return points;
    }`),
  exemplar: (p, g) => {
    const a = p.fav ?? 0, b = a + Math.floor(g.C / 2);
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? a : b)));
  },
});

// --- Warm Hearts ---------------------------------------------------------------------------------------------------
type WarmP = { flip: boolean };
const warmText = (p: WarmP, g: GridSpec): CardText => {
  const first = range(g.C).filter(i => i < g.C / 2), second = range(g.C).filter(i => i >= g.C / 2);
  const [a, b] = p.flip ? ["Spades and clubs", "hearts and diamonds"] : ["Hearts and diamonds", "spades and clubs"];
  return {
    emoji: "❤️‍🔥", name: "Warm Hearts", consts: [],
    about: `${a} should wear ${g.say.colours(first, "or")}. ${cap(b)} should wear ${g.say.colours(second, "or")}. `
      + "Each card dressed that way scores 1 point. Each pair of touching dressed cards with the same suit and the "
      + "same colour scores 1 more.",
  };
};
const warmHearts = gridFamily<WarmP>({
  id: "warm_hearts", name: "Warm Hearts", emoji: "❤️‍🔥", theme: "Suits dressed in matching colours",
  requires: { classes: ["Suited", "Spectral"] }, shape: SCALAR,
  support: () => [{ flip: false }, { flip: true }],
  canonical: () => ({ flip: false }), // swapping red and black suits maps flip
  summary: (p, g) => warmText(p, g).about,
  example: (p, g) => {
    const warm = 0, cool = g.C - 1, [reds, blacks] = p.flip ? [cool, warm] : [warm, cool];
    return example([[13 + 6, 13 + 6], [6, 39 + 6]], [[reds, reds], [blacks, blacks]],
      pts => `Hearts dressed in ${cname(g, reds)}, spades and clubs in ${cname(g, blacks)}: ${pts}.`);
  },
  python: (p, g) => pyCard(warmText(p, g), `
    def dressed(grid, cell):
        red = cell.suit == "hearts" or cell.suit == "diamonds"
        warm = grid.palette.index(cell.colour) < len(grid.palette) / 2
        return red ${p.flip ? "!=" : "=="} warm

    def utility(grid):
        points = 0
        for cell in grid.cells:
            if not dressed(grid, cell):
                continue
            points += 1
            for other in (cell.right, cell.down):
                if other is not None and dressed(grid, other):
                    if other.suit == cell.suit and other.colour == cell.colour:
                        points += 1
        return points`),
  typescript: (p, g) => tsCard(warmText(p, g), `
    function dressed(grid, cell) {
      const red = cell.suit === "hearts" || cell.suit === "diamonds";
      const warm = grid.palette.indexOf(cell.colour) < grid.palette.length / 2;
      return red ${p.flip ? "!==" : "==="} warm;
    }

    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (!dressed(grid, cell)) continue;
        points += 1;
        for (const other of [cell.right, cell.down]) {
          if (other === null || !dressed(grid, other)) continue;
          if (other.suit === cell.suit && other.colour === cell.colour) points += 1;
        }
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 13), full(g.N, p.flip ? g.C - 1 : 0)),
});

// --- Twin Friends ------------------------------------------------------------------------------------------------------
const twinText = (p: PairP, g: GridSpec): CardText => ({
  emoji: "👯", name: "Twin Friends", consts: pairConsts(p, g),
  about: `Each time ${article(cname(g, p.A))} cell touches ${article(cname(g, p.B))} cell, that is a touch. A touch `
    + `where both cells show the same ${g.cards ? "rank" : "number"} scores 1 point. Most points wins. If that's a tie, `
    + "more touches of any kind wins.",
});
const twinFriends = gridFamily<PairP>({
  id: "twin_friends", name: "Twin Friends", emoji: "👯", theme: "Your two colours side by side on matching symbols",
  shape: tuple(2),
  support: g => colourPairs(g).map(([A, B]) => ({ A, B })),
  canonical: p => recolour(p, ["A", "B"]),
  summary: (p, g) => twinText(p, g).about,
  example: (p, g) => {
    const Z = range(g.C).find(k => k !== p.A && k !== p.B)!, s = symForValue(g, 3), t = symForValue(g, 3, g.cards ? 1 : 0);
    return example([[s, t], [symForValue(g, 5), symForValue(g, 7)]], [[p.A, p.B], [Z, Z]],
      pts => `${cap(article(cname(g, p.A)))} ${g.say.tile(s)} touching ${article(cname(g, p.B))} ${g.say.tile(t)}: ${pts}.`);
  },
  python: (p, g) => pyCard(twinText(p, g), `${OPPOSITE_PY}
    def utility(grid):
        twins = 0
        seams = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and friends(cell, other):
                    seams += 1
                    if other.value == cell.value:
                        twins += 1
        return (twins, seams)`),
  typescript: (p, g) => tsCard(twinText(p, g), `${OPPOSITE_TS}
    function utility(grid) {
      let twins = 0;
      let seams = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && friends(cell, other)) {
            seams += 1;
            if (other.value === cell.value) twins += 1;
          }
        }
      }
      return [twins, seams];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? p.A : p.B))),
});

export const COLOUR = [stripePainter, feudingFamilies, colourMixer, fairWeaver, lanternLighter, bestFriends, rainbowSteps,
  quiltMaker, flagBearer, colourByNumber, kingdom, wallpaper, sunsetSky, harmony, warmHearts, twinFriends];
