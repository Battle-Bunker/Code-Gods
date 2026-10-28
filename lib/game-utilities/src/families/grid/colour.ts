/** Colour & visual-pattern lens rules (lib/grid-lab/gridlab/rules/colour.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, an, cap, chance, climb, cname, colourPairs, fromFn, full, gridFamily, pick, pyCard, range,
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

export const COLOUR = [stripePainter, feudingFamilies, colourMixer, fairWeaver, lanternLighter];
