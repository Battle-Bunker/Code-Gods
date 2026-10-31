/** Colour & visual-pattern lens rules (lib/grid-lab/gridlab/rules/colour.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import { lazySurvival, rowTransferCount, type AnalyticSurvival } from "../../analytic.ts";
import {
  SCALAR, an, cap, chance, climb, cname, colourPairs, fromFn, full, gridFamily, pick, product, pyCard, range,
  recipes, recolour, tsCard, tuple, wire,
} from "./_util.ts";

// --- Stripe Painter --------------------------------------------------------------------------------
type StripeP = { axis: "rows" | "cols" };
const stripeText = (p: StripeP): CardText => {
  const kind = p.axis === "rows" ? "row" : "column";
  return {
    emoji: "🦓", name: "Stripe Painter", consts: [],
    about: `A stripe is a ${kind} all in one colour. Each stripe scores a point unless the ${kind} just before it is `
      + `a stripe of the same colour. If that's a tie, count how many cells of each ${kind} match its most common colour.`,
  };
};
const stripePainter = gridFamily<StripeP>({
  id: "stripe_painter", name: "Stripe Painter", emoji: "🦓", theme: "A striped flag",
  shape: tuple(2), tags: ["shortlist"],
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: p => `Every ${p.axis === "rows" ? "row" : "column"} painted one solid colour, different from `
    + "the solid stripe next to it, scores a point, like a flag.",
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
    about: `${cap(X)} and ${Y} cells are feuding. A cell is safe when it doesn't touch the other family. Score the `
      + "safe cells of whichever family has fewer; if that's a tie, count all safe cells.",
  };
};
const feudingFamilies = gridFamily<FeudP>({
  id: "feuding_families", name: "Feuding Families", emoji: "😤", theme: "Two big families that must never touch",
  shape: tuple(2), tags: ["shortlist"],
  support: g => colourPairs(g).map(([X, Y]) => ({ X, Y })),
  canonical: p => recolour(p, ["X", "Y"]),
  summary: (p, g) => `You want lots of ${cname(g, p.X)} and lots of ${cname(g, p.Y)}, but they must never `
    + "touch. A cell is safe if it doesn't touch the other family; your score is the smaller family's safe count.",
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
    about: p.strict
      ? `${cap(P1)} + ${P2} = ${M}. A ${M} cell scores when it sits between its two paints: ${P1} on one side and `
        + `${P2} on the opposite side. If that's a tie, count ${M} cells touching either paint.`
      : `${cap(P1)} + ${P2} = ${M}. A ${M} cell scores when it touches both of its paints. If that's a tie, count `
        + `${M} cells touching either paint.`,
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
  summary: (p, g) => `${cap(cname(g, p.P1))} and ${cname(g, p.P2)} make ${cname(g, p.M)}. Every ${cname(g, p.M)} cell `
    + (p.strict ? "with one parent on each side of it (left/right or above/below)" : "touching both parents")
    + " is a perfect mix.",
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
  exemplar: (p, g, ctx) => {
    const seq = [p.P1, p.M, p.P2, p.M];
    return climb("colour_mixer", p, ctx, [{ sym: full(g.N, 0), col: fromFn(g.N, (_, c) => seq[c % 4]) }], 2);
  },
});

// --- Fair Weaver ---------------------------------------------------------------------------------------
const weaverText = (g: GridSpec): CardText => ({
  emoji: "🧶", name: "Fair Weaver", consts: [],
  about: `A row or column is fair when every colour (${g.colourNames.join(", ")}) appears almost equally often: the `
    + "most common and least common differ by at most 1. Count the fair lines; if that's a tie, smaller differences "
    + "are better.",
});
const fairWeaver = gridFamily<Record<string, never>>({
  id: "fair_weaver", name: "Fair Weaver", emoji: "🧶", theme: "Every colour gets a fair share of each line",
  shape: tuple(2), tags: ["shortlist"],
  support: () => [{}],
  summary: () => "A row or column is fair when every colour appears about equally often (never more than one "
    + "extra). Score a point for each fair line; fairer is better.",
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
  about: `${cap(an(cname(g, p.X)))} cell is a lantern when it is the only ${cname(g, p.X)} cell in its row and the only `
    + "one in its column. Each lantern scores a point.",
});
const lanternLighter = gridFamily<LanternP>({
  id: "lantern_lighter", name: "Lantern Lighter", emoji: "🏮", theme: "One lantern per row and column",
  shape: SCALAR, tags: ["shortlist"],
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `A ${cname(g, p.X)} cell is a lit lantern if it is the only ${cname(g, p.X)} in its row `
    + "and the only one in its column. Count your lanterns.",
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
const DIR_NAMES: Record<Dir4, string> = { "→": "left to right", "←": "right to left", "↓": "top to bottom", "↑": "bottom to top" };
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
type PairP = { A: number; B: number };
const pairConsts = (p: PairP, g: GridSpec) => [["COLOUR_A", cname(g, p.A)], ["COLOUR_B", cname(g, p.B)]] as const;

// --- Best Friends ----------------------------------------------------------------------------------
const friendsText = (p: PairP, g: GridSpec): CardText => ({
  emoji: "🤗", name: "Best Friends", consts: pairConsts(p, g),
  about: `Every place ${an(cname(g, p.A))} cell touches ${an(cname(g, p.B))} cell scores a point.`,
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
  summary: (p, g) => `Every place a ${cname(g, p.A)} cell touches a ${cname(g, p.B)} cell scores a point.`,
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
  about: `Read every line ${DIR_NAMES[p.dir]}. Every step onto the next colour of the rainbow `
    + `(${[...g.colourNames, g.colourNames[0]].join(" → ")}) scores a point.`,
});
const rainbowSteps = gridFamily<DirP>({
  id: "rainbow_steps", name: "Rainbow Steps", emoji: "👣", theme: "Next-door colours step round the rainbow",
  requires: { classes: ["Spectral"] }, shape: SCALAR,
  support: () => DIRS4.map(dir => ({ dir })),
  canonical: () => ({ dir: "→" }),
  summary: (p, g) => `Every time a cell's next neighbour (${DIR_NAMES[p.dir]}) is the next colour of the rainbow `
    + `(${g.colourNames.join(" → ")} → ${g.colourNames[0]}), score a point.`,
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
  about: g.C >= 4 ? "Every little 2×2 square whose four patches are all different colours scores a point."
    : "Every little 2×2 square that uses all three colours, with no two side-by-side patches matching, scores a point.",
});
const quiltMaker = gridFamily<Record<string, never>>({
  id: "quilt_maker", name: "Quilt Maker", emoji: "🧵", theme: "Patchwork squares with no two patches alike", shape: SCALAR,
  support: () => [{}],
  summary: (_, g) => quiltText(g).about,
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
  about: `A ${p.axis === "rows" ? "row" : "column"} is yours if it has more ${cname(g, p.C)} than any other single `
    + "colour. Count your lines; if that's a tie, a bigger lead (summed over all lines) is better.",
});
const flagBearer = gridFamily<FlagP>({
  id: "flag_bearer", name: "Flag Bearer", emoji: "🚩", theme: "Your colour wins the vote in every row", shape: tuple(2),
  support: g => product<FlagP>({ C: range(g.C), axis: ["rows", "cols"] }),
  canonical: () => ({ C: 0, axis: "rows" }),
  summary: (p, g) => `A ${p.axis === "rows" ? "row" : "column"} is yours if it has more ${cname(g, p.C)} `
    + "than any other single colour. Count your lines; a bigger lead is better.",
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
const keyText = (p: ShiftP, g: GridSpec): CardText => ({
  emoji: "🔢", name: "Colour-by-Number", consts: [["SHIFT", p.t]],
  about: "Your colouring key: " + range(g.C).map(k => `${cname(g, k)} for `
    + [...new Set(g.value)].sort((a, b) => a - b).filter(v => (v + p.t) % g.C === k).join(",")).join("; ")
    + ". In other words, (number + SHIFT) divided by how many colours leaves the colour's place in the rainbow. "
    + "Score a point for every cell painted right.",
});
const colourByNumber = gridFamily<ShiftP>({
  id: "colour_by_number", name: "Colour-by-Number", emoji: "🔢", theme: "Every number has its own colour",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => range(g.C).map(t => ({ t })),
  canonical: () => ({ t: 0 }), // cyclic colour relabelling shifts t
  summary: (p, g) => "Your colouring key: " + range(g.C).map(k => `${cname(g, k)} for `
    + [...new Set(g.value)].sort((a, b) => a - b).filter(v => (v + p.t) % g.C === k).join(",")).join("; ")
    + ". Score a point for every cell painted the right colour for its number.",
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
  about: `Score the size of your biggest joined-up patch of ${cname(g, p.C)} cells.`,
});
const kingdom = gridFamily<KingdomP>({
  id: "kingdom", name: "Kingdom", emoji: "🏰", theme: "The biggest patch of your colour", shape: SCALAR,
  support: g => range(g.C).map(C => ({ C })),
  canonical: p => recolour(p, ["C"]),
  summary: (p, g) => `Score the size of your biggest joined-up patch of ${cname(g, p.C)} cells.`,
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
  about: `Every cell whose colour matches the cell ${p.p} steps ${p.dir === "right" ? "to its right" : "below it"} scores a point.`,
});
const wallpaper = gridFamily<PaperP>({
  id: "wallpaper_weaver", name: "Wallpaper Weaver", emoji: "🧱", theme: "A repeating pattern", shape: SCALAR,
  support: g => product<PaperP>({ p: g.N >= 4 ? [2, 3] : [2], dir: ["right", "down"] }),
  canonical: p => ({ p: p.p, dir: "right" }),
  summary: p => `Every cell whose colour matches the cell ${p.p} steps ${p.dir === "right" ? "to its right" : "below it"} scores a point.`,
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
  about: `Read each line ${DIR_NAMES[p.dir]}. It is a sunset if every step stays the same colour or moves one step along `
    + `the rainbow (${g.colourNames.join(", ")}), never back, and it uses at least 3 colours. Count your sunsets; if that's `
    + "a tie, count good steps.",
});
const sunsetSky = gridFamily<DirP>({
  id: "sunset_sky", name: "Sunset Sky", emoji: "🌅", theme: "Lines that fade smoothly along the rainbow",
  requires: { classes: ["Spectral"] }, shape: tuple(2),
  support: () => DIRS4.map(dir => ({ dir })),
  canonical: () => ({ dir: "↓" }),
  summary: (p, g) => `Read each line ${DIR_NAMES[p.dir]}. It is a sunset if every step stays the same colour or moves `
    + `one step along the rainbow (${g.colourNames.join(", ")}), never back, and it uses at least 3 colours. Count your sunsets.`,
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
    about: "Every time two opposite colours on the wheel touch ("
      + range(h).map(i => `${cname(g, i)}–${cname(g, i + h)}`).join(", ") + "), score a point"
      + (p.fav === null ? "." : `; a pair with ${cname(g, p.fav)} in it scores double.`),
  };
};
const harmony = gridFamily<HarmonyP>({
  id: "colour_wheel_harmony", name: "Colour Wheel Harmony", emoji: "☯️", theme: "Opposite colours that make each other pop",
  requires: { classes: ["Wheel"] }, shape: SCALAR,
  support: g => [null, ...range(Math.floor(g.C / 2))].map(fav => ({ fav })),
  sample: (rng, g) => ({ fav: chance(rng, 1, 2) ? null : rng.int(Math.floor(g.C / 2)) }),
  canonical: p => ({ fav: p.fav === null ? null : 0 }),
  summary: (p, g) => harmonyText(p, g).about,
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
  const warm = g.colourNames.filter((_, i) => i < g.C / 2), cool = g.colourNames.filter((_, i) => i >= g.C / 2);
  const [a, b] = p.flip ? ["Spades and clubs", "hearts and diamonds"] : ["Hearts and diamonds", "spades and clubs"];
  return {
    emoji: "❤️‍🔥", name: "Warm Hearts", consts: [],
    about: `${a} should wear warm colours (${warm.join(", ")}) and ${b} cool ones (${cool.join(", ")}). Each well-dressed `
      + "card scores a point, plus one for each touching pair of well-dressed cards in the same suit and colour.",
  };
};
const warmHearts = gridFamily<WarmP>({
  id: "warm_hearts", name: "Warm Hearts", emoji: "❤️‍🔥", theme: "Suits dressed in matching colours",
  requires: { classes: ["Suited", "Spectral"] }, shape: SCALAR,
  support: () => [{ flip: false }, { flip: true }],
  canonical: () => ({ flip: false }), // swapping red and black suits maps flip
  summary: (p, g) => warmText(p, g).about,
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
  about: `Every place ${an(cname(g, p.A))} cell touches ${an(cname(g, p.B))} cell with the same ${g.cards ? "rank" : "number"} `
    + "scores a point. If that's a tie, count every place they touch.",
});
const twinFriends = gridFamily<PairP>({
  id: "twin_friends", name: "Twin Friends", emoji: "👯", theme: "Your two colours side by side on matching symbols",
  shape: tuple(2),
  support: g => colourPairs(g).map(([A, B]) => ({ A, B })),
  canonical: p => recolour(p, ["A", "B"]),
  summary: (p, g) => `Every place a ${cname(g, p.A)} cell touches a ${cname(g, p.B)} cell with the same symbol scores a `
    + "point (touching with different symbols is a small step).",
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
