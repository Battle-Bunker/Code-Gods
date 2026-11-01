/** The three seed rules (lib/grid-lab/gridlab/rules/seeds.py, cards from rules/cards.py). */
import type { GridSpec } from "./_util.ts";
import { exactSurvival, multinomial } from "../../analytic.ts";
import {
  SCALAR, article, chance, cname, cap, colourIndex, fromFn, full, gridFamily, product, pyCard, range, recolour, symForValue, tsCard, tuple, valueNote, valueLaw, wire, example,
} from "./_util.ts";

// --- Seed 1: Line Painter ---------------------------------------------------------------------
type LineP = { colour: number; diag: boolean };
const linePainter = gridFamily<LineP>({
  id: "seed1_line_painter", name: "Line Painter", emoji: "🖍️", theme: "Straight lines of one colour",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["seed", "shortlist"],
  support: g => product<LineP>({ colour: range(g.C), diag: [false, true] }),
  sample: (rng, g) => ({ colour: rng.int(g.C), diag: chance(rng, 1, 4) }),
  canonical: p => recolour(p, ["colour"]),
  summary: (p, g) => text(p, g).about,
  example: (p, g) => {
    const s = symForValue(g, 3), away = (p.colour + 1) % g.C;
    return example([[s, s], [symForValue(g, 1), symForValue(g, 1)]], [[p.colour, p.colour], [away, away]],
      pts => `Two ${cname(g, p.colour)} cells showing ${g.say.tile(s)}, side by side: ${pts}.`);
  },
  python: (p, g) => pyCard(text(p, g), `
    def is_mine(cell):
        return cell is not None and cell.colour == MY_COLOUR

    def utility(grid):
        points = 0
        for cell in grid.cells:
            if not is_mine(cell):
                continue
            if is_mine(cell.left) or is_mine(cell.right):
                points += cell.value
            if is_mine(cell.up) or is_mine(cell.down):
                points += cell.value${p.diag ? `
            if is_mine(cell.up_left) or is_mine(cell.down_right):
                points += cell.value
            if is_mine(cell.up_right) or is_mine(cell.down_left):
                points += cell.value` : ""}
        return points`),
  typescript: (p, g) => tsCard(text(p, g), `
    function isMine(cell) {
      return cell !== null && cell.colour === MY_COLOUR;
    }

    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (!isMine(cell)) continue;
        if (isMine(cell.left) || isMine(cell.right)) points += cell.value;
        if (isMine(cell.up) || isMine(cell.down)) points += cell.value;${p.diag ? `
        if (isMine(cell.upLeft) || isMine(cell.downRight)) points += cell.value;
        if (isMine(cell.upRight) || isMine(cell.downLeft)) points += cell.value;` : ""}
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, p.colour)),
});
function text(p: LineP, g: GridSpec) {
  const c = cname(g, p.colour);
  const dirs = p.diag ? "across, down and along both diagonals" : "across and down";
  return {
    emoji: "🖍️", name: "Line Painter", consts: [["MY_COLOUR", c]] as const,
    about: [
      `Your colour is ${c}. ${cap(article(c))} cell scores its value in points once for each direction in which it touches another ${c} cell.`,
      `The directions are ${dirs}.`, g.say.valueKey(),
    ].filter(Boolean).join(" "),
  };
}

// --- Seed 2: Patchwork --------------------------------------------------------------------------
const patchwork = gridFamily<Record<string, never>>({
  id: "seed2_patchwork", name: "Patchwork", emoji: "🧩",
  theme: "Same-symbol patches with no two touching colours alike",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["seed", "shortlist"],
  support: () => [{}],
  summary: (_, g) => patchText(g).about,
  example: (_p, g) => {
    const s = symForValue(g, 2);
    return example(full(2, s), [[0, 1], [1, 0]], pts => `Four touching ${g.say.tile(s)} cells, no two touching ones the same colour: ${pts}.`);
  },
  python: (_, g) => pyCard(patchText(g), `
    def same_value(a, b):
        return a.value == b.value

    def colourful(patch):
        for cell in patch:
            for other in cell.neighbours:
                if other in patch and other.colour == cell.colour:
                    return False
        return True

    def utility(grid):
        points = 0
        for patch in grid.regions(same_value):
            if len(patch) >= 2 and colourful(patch):
                points += len(patch) * patch[0].value
        return points`),
  typescript: (_, g) => tsCard(patchText(g), `
    function sameValue(a, b) {
      return a.value === b.value;
    }

    function colourful(patch) {
      for (const cell of patch) {
        for (const other of cell.neighbours) {
          if (patch.includes(other) && other.colour === cell.colour) return false;
        }
      }
      return true;
    }

    function utility(grid) {
      let points = 0;
      for (const patch of grid.regions(sameValue)) {
        if (patch.length >= 2 && colourful(patch)) points += patch.length * patch[0].value;
      }
      return points;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, symForValue(g, g.vmax)), fromFn(g.N, (r, c) => (r + c) % 2)),
});
const patchText = (g: GridSpec) => ({
  emoji: "🧩", name: "Patchwork", consts: [],
  about: [
    `A patch is a group of 2 or more touching cells showing the same ${g.cards ? "rank (any suit)" : "number"}.`,
    "A patch only counts if no two touching cells inside it share a colour.",
    `A patch that counts scores its size times its ${g.cards ? "value" : "number"}, in points: 3 cells showing 4 score 12.`,
    g.say.valueKey(),
  ].filter(Boolean).join(" "),
});

// --- Seed 3: Green Ones -------------------------------------------------------------------------
type GreenP = { colour: number; value: number };
const greenOnes = gridFamily<GreenP>({
  id: "seed3_green_ones", name: "Green Ones", emoji: "🍀", theme: "Lucky green ones",
  shape: tuple(2), tags: ["seed", "shortlist"],
  // grid-lab's sampler always deals green (every colour set has it) and 1 (every symbol set has it).
  support: g => [{ colour: colourIndex(g, "green"), value: 1 }],
  canonical: (_, g) => ({ colour: 0, value: g.vmin }),
  summary: (p, g) => greenText(p, g).about,
  example: (p, g) => {
    const s = symForValue(g, p.value), blank = symForValue(g, p.value + 1), away = (p.colour + 1) % g.C;
    return example([[s, blank], [blank, s]], [[p.colour, away], [away, p.colour]],
      pts => `Two ${cname(g, p.colour)} cells showing ${g.say.tile(s)}: ${pts}.`);
  },
  python: (p, g) => pyCard(greenText(p, g), `
    def utility(grid):
        perfect = 0
        halfway = 0
        for cell in grid.cells:
            right_colour = cell.colour == MY_COLOUR
            right_value = cell.value == MY_VALUE
            if right_colour and right_value:
                perfect += 1
            elif right_colour or right_value:
                halfway += 1
        return (perfect, halfway)`),
  typescript: (p, g) => tsCard(greenText(p, g), `
    function utility(grid) {
      let perfect = 0;
      let halfway = 0;
      for (const cell of grid.cells) {
        const rightColour = cell.colour === MY_COLOUR;
        const rightValue = cell.value === MY_VALUE;
        if (rightColour && rightValue) perfect += 1;
        else if (rightColour || rightValue) halfway += 1;
      }
      return [perfect, halfway];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, p.value)), full(g.N, p.colour)),
  /**
   * Each cell is independently perfect (right colour and value, probability 1/C · p_v), halfway (one of the two,
   * 1/C + p_v − 2/C · p_v) or neither: the pair (perfect, halfway) is trinomial over N² cells and the lexicographic
   * survival follows from its law (tail-toolkit.md §2, lexicographic tuples).
   */
  analytic: (p, g) => {
    const pc = 1 / g.C, pv = valueLaw(g)[p.value] ?? 0;
    if (!(pv > 0)) return null;
    const both = pc * pv, half = pc + pv - 2 * both;
    return exactSurvival("trinomial-cells@1", multinomial(g.N * g.N, [both, half, 1 - both - half], c => [c[0], c[1]]));
  },
});
function greenText(p: GreenP, g: GridSpec) {
  return {
    emoji: "🍀", name: "Green Ones",
    consts: [["MY_COLOUR", cname(g, p.colour)], ["MY_VALUE", p.value, valueNote(g, p.value)]] as const,
    about: `Count the ${cname(g, p.colour)} cells showing ${g.say.value(p.value)}. Most of those wins. `
      + "If that's a tie, count the cells that are halfway there: "
      + `the right colour or the right ${g.cards ? "rank" : "number"}, but not both.`,
  };
}

export const SEEDS = [linePainter, patchwork, greenOnes];
