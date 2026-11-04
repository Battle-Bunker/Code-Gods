/** Strategy-lens rules (lib/grid-lab/gridlab/rules/strategy.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import { colourParam, choiceParam, symbolParam } from "../../params.ts";
import type { Params } from "../../types.ts";
import {
  SCALAR, article, cap, chance, climb, cname, colourPairs, fromFn, full, glyph, gridFamily, isRim, pick, product, pyCard, range, recolour, sentences, symForValue, thing, tsCard, tuple, valueLaw, wire, colourAt, recolourNames, symbolAt, points,
} from "./_util.ts";
import {
  binomial, combine, distOf, exactSurvival, iidSum, lazySurvival, lineChainCount, logFactorial, mapDist, type AnalyticSurvival, type Dist,
} from "../../analytic.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";

const DIRS4 = ["→", "←", "↓", "↑"] as const;
type Dir4 = (typeof DIRS4)[number];
const DIR_CHOICES = [["→", "rows, left to right"], ["←", "rows, right to left"], ["↓", "columns, top to bottom"], ["↑", "columns, bottom to top"]] as const;
const dirLegacy = (p: Params): { direction: Dir4 } | null => (typeof p.dir === "string" ? { direction: p.dir as Dir4 } : null);
/** "every row, left to right": the lines a direction reads, in plain words. */
const READ_LINES: Record<Dir4, string> = {
  "→": "every row, left to right", "←": "every row, right to left",
  "↓": "every column, top to bottom", "↑": "every column, bottom to top",
};
/** Sentences joined by single spaces, skipping empty ones (a value key is "" on base 10). */
const PY_LINES: Record<Dir4, string> = {
  "→": "grid.rows", "←": "[list(reversed(row)) for row in grid.rows]",
  "↓": "grid.columns", "↑": "[list(reversed(c)) for c in grid.columns]",
};
const TS_LINES: Record<Dir4, string> = {
  "→": "grid.rows", "←": "grid.rows.map(row => [...row].reverse())",
  "↓": "grid.columns", "↑": "grid.columns.map(column => [...column].reverse())",
};

// --- Rainbow Road ------------------------------------------------------------------------------
type RoadP = { direction: Dir4 };
const roadText = (p: RoadP, g: GridSpec): CardText => {
  const kind = p.direction === "→" || p.direction === "←" ? "row" : "column";
  const order = [...g.colourNames, g.colourNames[0]].join(" → ");
  return {
    emoji: "🌈", name: "Rainbow Road", consts: [],
    about: `Look along ${READ_LINES[p.direction]}. A step is good if the next cell has the next colour in rainbow order `
      + `(${order}). Each ${kind} where every step is good scores 1 point. Most points wins. If that's a tie, `
      + "more good steps in total wins.",
  };
};
const rainbowRoad = gridFamily<RoadP>({
  id: "rainbow_road", name: "Rainbow Road", emoji: "🌈", theme: "Rows that march round the rainbow",
  requires: { classes: ["Spectral"] }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({ direction: choiceParam("Read the lines", DIR_CHOICES) }), legacy: dirLegacy,
  support: () => DIRS4.map(direction => ({ direction })),
  canonical: () => ({ direction: "→" }),
  summary: (p, g) => roadText(p, g).about,
  python: (p, g) => pyCard(roadText(p, g), `
    def utility(grid):
        whole_lines = 0
        steps = 0
        for line in ${PY_LINES[p.direction]}:
            good = 0
            for i in range(len(line) - 1):
                if line[i + 1].colour == next_colour(line[i].colour):
                    good += 1
            steps += good
            if good == len(line) - 1:
                whole_lines += 1
        return (whole_lines, steps)`),
  typescript: (p, g) => tsCard(roadText(p, g), `
    function utility(grid) {
      let wholeLines = 0;
      let steps = 0;
      for (const line of ${TS_LINES[p.direction]}) {
        let good = 0;
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i + 1].colour === nextColour(line[i].colour)) good += 1;
        }
        steps += good;
        if (good === line.length - 1) wholeLines += 1;
      }
      return [wholeLines, steps];
    }`),
  exemplar: (p, g) => {
    const N = g.N, k = (i: number) => i % g.C;
    // unorient((r + c) % C, dir): lines read in `dir` step round the rainbow.
    const col = fromFn(N, (r, c) => p.direction === "→" ? k(r + c) : p.direction === "←" ? k(r + N - 1 - c)
      : p.direction === "↓" ? k(c + r) : k(c + N - 1 - r));
    return wire(g, full(N, 0), col);
  },
  /**
   * Along a line the N−1 "next colour" indicators are iid Bernoulli(1/C): given the shared cell, each needs one
   * specific colour. So steps per line ~ Binomial(N−1, 1/C), a whole line iff all N−1; (wholeLines, steps) is the
   * N-fold iid sum of the per-line pair (tail-toolkit.md §3, independence and the union bound; §8.2, the table's bias).
   */
  analytic: (_p, g): AnalyticSurvival => {
    const steps = binomial(g.N - 1, 1 / g.C);
    const line = mapDist(steps, o => [o === g.N - 1 ? 1 : 0, o as number]);
    return exactSurvival("line-iid-tuple@1", iidSum(line, g.N));
  },
});

// --- Border Baron ------------------------------------------------------------------------------
/** A country is big at N cells (a row's worth): the sizes N−1, N and 2N−2 had top bits up to 60% apart (P10). */
type BaronP = Record<string, never>;
const baronText = (g: GridSpec): CardText => ({
  emoji: "🏰", name: "Border Baron", consts: [["BIG", g.N]],
  about: "A country is a group of touching cells of one colour. A border is a place where two countries touch. "
    + `Each border scores 1 point if both countries have at least ${g.N} cells. Most points wins. If that's a tie, `
    + `add up, for every border, the size of its smaller country (counting at most ${g.N}).`,
});
const borderBaron = gridFamily<BaronP>({
  id: "border_baron", name: "Border Baron", emoji: "🏰", theme: "Long borders between big countries",
  shape: tuple(2), tags: ["shortlist"],
  params: () => ({}),
  legacy: p => (Object.keys(p).length ? {} : null),
  support: () => [{}],
  summary: (_, g) => baronText(g).about,
  python: (_, g) => pyCard(baronText(g), `
    def same_colour(a, b):
        return a.colour == b.colour

    def utility(grid):
        size = {}
        for country in grid.regions(same_colour):
            for cell in country:
                size[cell] = len(country)
        big_borders = 0
        progress = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and other.colour != cell.colour:
                    smaller = min(size[cell], size[other], BIG)
                    progress += smaller
                    if smaller == BIG:
                        big_borders += 1
        return (big_borders, progress)`),
  typescript: (_, g) => tsCard(baronText(g), `
    function sameColour(a, b) {
      return a.colour === b.colour;
    }

    function utility(grid) {
      const size = new Map();
      for (const country of grid.regions(sameColour)) {
        for (const cell of country) size.set(cell, country.length);
      }
      let bigBorders = 0;
      let progress = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && other.colour !== cell.colour) {
            const smaller = Math.min(size.get(cell), size.get(other), BIG);
            progress += smaller;
            if (smaller === BIG) bigBorders += 1;
          }
        }
      }
      return [bigBorders, progress];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, C = g.C, z = full(N, 0);
    const comb = fromFn(N, (r, c) => (r === 0 || (c % 2 === 0 && r < N - 1) ? 0 : 1));
    return climb("border_baron", p, ctx, [
      { sym: z, col: fromFn(N, (_, c) => c % C) }, { sym: z, col: fromFn(N, (_, c) => Math.floor(c / 2) % C) },
      { sym: z, col: comb }, { sym: z, col: fromFn(N, (_, c) => (c >= Math.floor(N / 2) ? 1 : 0)) },
    ], 3);
  },
});

// --- Conqueror -----------------------------------------------------------------------------------
type ConqP = { colour: string; enemy_colour: string };
const conqText = (p: ConqP, g: GridSpec): CardText => ({
  emoji: "⚔️", name: "Conqueror", consts: [["MY_COLOUR", p.colour], ["ENEMY_COLOUR", p.enemy_colour]],
  about: sentences(`Your colour is ${p.colour} and your enemy's is ${p.enemy_colour}. Each ${p.colour} cell `
    + `scores points equal to its value. Each ${p.enemy_colour} cell loses points equal to its value.`, g.say.valueKey()),
});
const conqueror = gridFamily<ConqP>({
  id: "conqueror", name: "Conqueror", emoji: "⚔️", theme: "Your army against your enemy",
  analytic: solvedAnalytic("conqueror"),
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  params: () => ({ colour: colourParam("Your colour"), enemy_colour: colourParam("Your enemy's colour") }),
  // Counting every cell as 1 point left far fewer scores to chase than counting its value (25 vs 79 top bits on 4×4): values it is (P10).
  legacy: (p, g) => (typeof p.A === "number"
    ? { colour: g.colourNames[p.A], enemy_colour: g.colourNames[p.B as number] } : "weight" in p ? { colour: p.colour as string, enemy_colour: p.enemy_colour as string } : null),
  support: g => colourPairs(g).map(([A, B]) => ({ colour: g.colourNames[A], enemy_colour: g.colourNames[B] })),
  canonical: (p, g) => recolourNames(g, p, ["colour", "enemy_colour"]),
  summary: (p, g) => conqText(p, g).about,
  python: (p, g) => pyCard(conqText(p, g), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.colour == MY_COLOUR:
                points += cell.value
            elif cell.colour == ENEMY_COLOUR:
                points -= cell.value
        return points`),
  typescript: (p, g) => tsCard(conqText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.colour === MY_COLOUR) points += cell.value;
        else if (cell.colour === ENEMY_COLOUR) points -= cell.value;
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, colourAt(g, p.colour))),
});

// --- Parity Painter ------------------------------------------------------------------------------
type ParityP = { even_or_red: string; odd_or_black: string; split: "parity" | "suit" };
const parityText = (p: ParityP, g: GridSpec): CardText => {
  const P = p.even_or_red, Q = p.odd_or_black;
  return p.split === "suit"
    ? {
      emoji: "🎭", name: "Parity Painter", consts: [["RED_SUIT_COLOUR", P], ["BLACK_SUIT_COLOUR", Q]],
      about: `Hearts and diamonds (♥ ♦) should be ${P}. Spades and clubs (♠ ♣) should be ${Q}. A card in its right `
        + "colour scores 1 point. A card in the other suits' colour loses 1 point.",
    }
    : {
      emoji: "🎭", name: "Parity Painter", consts: [["EVEN_COLOUR", P], ["ODD_COLOUR", Q]],
      about: sentences(`Even ${thing(g)}s should be ${P} and odd ones ${Q}. A cell in its right colour scores 1 point. A cell in `
        + "the other kind's colour loses 1 point.", g.say.valueKey()),
    };
};
const parityPainter = gridFamily<ParityP>({
  id: "parity_painter", name: "Parity Painter", emoji: "🎭", theme: "Numbers wear the colour of their kind",
  analytic: solvedAnalytic("parity_painter"),
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  params: g => ({
    even_or_red: colourParam(g.cards ? "Colour for even values (or red suits)" : "Colour for even numbers"),
    odd_or_black: colourParam(g.cards ? "Colour for odd values (or black suits)" : "Colour for odd numbers"),
    split: choiceParam("Sort cells by", g.cards ? [["parity", "even or odd"], ["suit", "red or black suit"]] : [["parity", "even or odd"]]),
  }),
  legacy: (p, g) => (typeof p.P === "number" && typeof p.Q === "number"
    ? { even_or_red: g.colourNames[p.P], odd_or_black: g.colourNames[p.Q], split: p.key as ParityP["split"] } : null),
  support: g => colourPairs(g).flatMap(([P, Q]) =>
    (g.cards ? ["parity", "suit"] as const : ["parity"] as const).map(split => ({ even_or_red: g.colourNames[P], odd_or_black: g.colourNames[Q], split }))),
  sample: (rng, g) => {
    const [P, Q] = pick(rng, colourPairs(g));
    return { even_or_red: g.colourNames[P], odd_or_black: g.colourNames[Q], split: g.cards && chance(rng, 1, 2) ? "suit" : "parity" };
  },
  canonical: (p, g) => recolourNames(g, p, ["even_or_red", "odd_or_black"]),
  summary: (p, g) => parityText(p, g).about,
  python: (p, g) => pyCard(parityText(p, g), p.split === "suit" ? `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.suit == "hearts" or cell.suit == "diamonds":
                right, wrong = RED_SUIT_COLOUR, BLACK_SUIT_COLOUR
            else:
                right, wrong = BLACK_SUIT_COLOUR, RED_SUIT_COLOUR
            if cell.colour == right:
                points += 1
            elif cell.colour == wrong:
                points -= 1
        return points` : `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.value % 2 == 0:
                right, wrong = EVEN_COLOUR, ODD_COLOUR
            else:
                right, wrong = ODD_COLOUR, EVEN_COLOUR
            if cell.colour == right:
                points += 1
            elif cell.colour == wrong:
                points -= 1
        return points`),
  typescript: (p, g) => tsCard(parityText(p, g), p.split === "suit" ? `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        const red = cell.suit === "hearts" || cell.suit === "diamonds";
        const right = red ? RED_SUIT_COLOUR : BLACK_SUIT_COLOUR;
        const wrong = red ? BLACK_SUIT_COLOUR : RED_SUIT_COLOUR;
        if (cell.colour === right) points += 1;
        else if (cell.colour === wrong) points -= 1;
      }
      return points;
    }` : `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        const even = cell.value % 2 === 0;
        const right = even ? EVEN_COLOUR : ODD_COLOUR;
        const wrong = even ? ODD_COLOUR : EVEN_COLOUR;
        if (cell.colour === right) points += 1;
        else if (cell.colour === wrong) points -= 1;
      }
      return points;
    }`),
  exemplar: (p, g) => {
    const sym = fromFn(g.N, (r, c) => ((r * g.N + c) * 7) % g.S);
    const wears = (s: number) => (p.split === "suit" ? [1, 2].includes(Math.floor(s / 13)) : g.value[s] % 2 === 0);
    const P = colourAt(g, p.even_or_red), Q = colourAt(g, p.odd_or_black);
    return wire(g, sym, sym.map(row => row.map(s => (wears(s) ? P : Q))));
  },
});

// --- Mirrormancer --------------------------------------------------------------------------------
type MirrorP = { axis: "LR" | "TB" };
const mirrorText = (p: MirrorP, g: GridSpec): CardText => {
  const kind = p.axis === "LR" ? "row" : "column";
  const shown = g.cards ? "ranks" : "numbers";
  return {
    emoji: "🪞", name: "Mirrormancer", consts: [],
    about: `A ${kind} is a mirror if its ${shown} read the same forwards and backwards. Each mirror ${kind} scores `
      + "1 point. Most points wins. If that's a tie, more matching pairs wins (first and last, second and "
      + "second-last, and so on).",
  };
};
const mirrormancer = gridFamily<MirrorP>({
  id: "mirrormancer", name: "Mirrormancer", emoji: "🪞", theme: "Lines that read the same both ways",
  analytic: solvedAnalytic("mirrormancer"),
  shape: tuple(2), tags: ["shortlist"],
  params: () => ({ axis: choiceParam("Mirror lines", [["LR", "rows (left to right)"], ["TB", "columns (top to bottom)"]]) }),
  // Colours mirrored or numbers mirrored are two different ideas with top bits 2x apart (P10): numbers are left (colours: a split proposal).
  legacy: p => ("layer" in p ? { axis: p.axis as MirrorP["axis"] } : null),
  support: () => [{ axis: "LR" }, { axis: "TB" }],
  canonical: () => ({ axis: "LR" }),
  summary: (p, g) => mirrorText(p, g).about,
  python: (p, g) => pyCard(mirrorText(p, g), `
    def utility(grid):
        mirrors = 0
        pairs = 0
        for line in ${p.axis === "LR" ? "grid.rows" : "grid.columns"}:
            half = len(line) // 2
            matches = 0
            for i in range(half):
                if line[i].value == line[len(line) - 1 - i].value:
                    matches += 1
            pairs += matches
            if matches == half:
                mirrors += 1
        return (mirrors, pairs)`),
  typescript: (p, g) => tsCard(mirrorText(p, g), `
    function utility(grid) {
      let mirrors = 0;
      let pairs = 0;
      for (const line of ${p.axis === "LR" ? "grid.rows" : "grid.columns"}) {
        const half = Math.floor(line.length / 2);
        let matches = 0;
        for (let i = 0; i < half; i++) {
          if (line[i].value === line[line.length - 1 - i].value) matches += 1;
        }
        pairs += matches;
        if (matches === half) mirrors += 1;
      }
      return [mirrors, pairs];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Homebody ------------------------------------------------------------------------------------
type HomeP = { colour: string };
const homeText = (p: HomeP): CardText => ({
  emoji: "🏡", name: "Homebody", consts: [["MY_COLOUR", p.colour]],
  about: `Your colour is ${p.colour}. It likes to stay home on the edge (the outside ring of cells). `
    + `Each ${p.colour} cell at home scores 1 point. Each ${p.colour} cell away from home loses 1 point.`,
});
const homebody = gridFamily<HomeP>({
  id: "homebody", name: "Homebody", emoji: "🏡", theme: "Your colour belongs at home",
  analytic: solvedAnalytic("homebody"),
  shape: SCALAR, tags: ["shortlist"],
  params: () => ({ colour: colourParam("Your colour") }),
  // The middle holds fewer cells than the edge (4 vs 12 on 4×4), so "where it belongs" scored differently (13 vs 21 top bits): the edge it is (P10).
  legacy: (p, g) => (typeof p.X === "number" ? { colour: g.colourNames[p.X] } : "zone" in p ? { colour: p.colour as string } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: p => homeText(p).about,
  python: p => pyCard(homeText(p), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.colour == MY_COLOUR:
                if cell.on_edge:
                    points += 1
                else:
                    points -= 1
        return points`),
  typescript: p => tsCard(homeText(p), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.colour === MY_COLOUR) {
          if (cell.onEdge) points += 1;
          else points -= 1;
        }
      }
      return points;
    }`),
  exemplar: (p, g) => {
    const X = colourAt(g, p.colour);
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => (isRim(g.N, r, c) ? X : (X + 1) % g.C)));
  },
});

// --- Lone Peak -----------------------------------------------------------------------------------
type PeakP = { colour: string };
const peakText = (p: PeakP, g: GridSpec): CardText => ({
  emoji: "🏔️", name: "Lone Peak", consts: [["MY_COLOUR", p.colour]],
  about: sentences(`The highest ${g.cards ? "rank" : "number"} on the board is the peak.`, g.say.valueKey(),
    `If exactly one cell shows the peak and it is ${p.colour}, you score the gap down to the next highest, `
    + "1 point per step. Otherwise you score 0.",
    `If that's a tie, having ${article(p.colour)} cell among the peaks wins.`),
});
const lonePeak = gridFamily<PeakP>({
  id: "lone_peak", name: "Lone Peak", emoji: "🏔️", theme: "One mountain towering over everything",
  requires: { classes: ["Valued"] }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({ colour: colourParam("Your colour") }),
  legacy: (p, g) => (typeof p.X === "number" ? { colour: g.colourNames[p.X] } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => peakText(p, g).about,
  python: (p, g) => pyCard(peakText(p, g), `
    def utility(grid):
        top = max(cell.value for cell in grid.cells)
        peaks = [cell for cell in grid.cells if cell.value == top]
        gap = 0
        if len(peaks) == 1 and peaks[0].colour == MY_COLOUR:
            second = max(cell.value for cell in grid.cells if cell is not peaks[0])
            gap = top - second
        mine = 0
        for cell in peaks:
            if cell.colour == MY_COLOUR:
                mine = 1
        return (gap, mine)`),
  typescript: (p, g) => tsCard(peakText(p, g), `
    function utility(grid) {
      const top = Math.max(...grid.cells.map(cell => cell.value));
      const peaks = grid.cells.filter(cell => cell.value === top);
      let gap = 0;
      if (peaks.length === 1 && peaks[0].colour === MY_COLOUR) {
        const second = Math.max(...grid.cells.filter(cell => cell !== peaks[0]).map(cell => cell.value));
        gap = top - second;
      }
      let mine = 0;
      for (const cell of peaks) {
        if (cell.colour === MY_COLOUR) mine = 1;
      }
      return [gap, mine];
    }`),
  exemplar: (p, g) => {
    const N = g.N, m = Math.floor(N / 2), X = colourAt(g, p.colour);
    const sym = fromFn(N, (r, c) => symForValue(g, r === m && c === m ? g.vmax : g.vmin));
    return wire(g, sym, fromFn(N, (r, c) => (r === m && c === m ? X : (X + 1) % g.C)));
  },
  /**
   * (gap, mine), with F the value cdf, q = 1/C and p_m the mass of value m (tail-toolkit.md §1, exact maxima):
   *  μ{≥ (0,1)} = Σ_m [(F(m−1) + p_m)^n − (F(m−1) + p_m(1 − q))^n]   (the top value's cells include one of mine);
   *  μ{≥ (g,1)} = Σ_m n·q·p_m·F(m−g)^(n−1)   for g ≥ 1  (a unique peak of mine, everything else ≤ m − g).
   */
  analytic: (_p, g): AnalyticSurvival => {
    const n = g.N * g.N, q = 1 / g.C, pv = valueLaw(g);
    const values = pv.map((p, v) => [v, p] as const).filter(([, p]) => p > 0);
    const F = (x: number) => values.reduce((a, [v, p]) => a + (v <= x ? p : 0), 0);
    const levels: [readonly number[], number][] = [[[0, 0], 0]];
    const has = values.reduce((a, [m, p]) => a + (F(m - 1) + p) ** n - (F(m - 1) + p * (1 - q)) ** n, 0);
    levels.push([[0, 1], Math.log2(has)]);
    for (let gap = 1; gap <= g.vmax - g.vmin; gap++) {
      const tot = values.reduce((a, [m, p]) => a + n * q * p * F(m - gap) ** (n - 1), 0);
      if (tot > 0) levels.push([[gap, 1], Math.log2(tot)]);
    }
    return { id: "lone-peak@1", kind: "exact", levels };
  },
});


// ================================================================================================
// Not shortlisted (grid-lab has no cards for these; the cards below are new and checked by the parity tests)
// ================================================================================================

// --- Islander ------------------------------------------------------------------------------------
type ColourP = { colour: string };
const colourOnly = () => ({ colour: colourParam("Your colour") });
const colourOnlyLegacy = (p: Params, g: GridSpec): ColourP | null => (typeof p.X === "number" ? { colour: g.colourNames[p.X] } : null);
const islanderText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🏝️", name: "Islander", consts: [["MY_COLOUR", p.colour]],
  about: `${cap(article(p.colour))} cell is an island if every cell touching it is the same other colour. `
    + `Each island scores 1 point. Most points wins. If that's a tie, more ${p.colour} cells with no `
    + `${p.colour} cell touching them wins.`,
});
const islander = gridFamily<ColourP>({
  id: "islander", name: "Islander", emoji: "🏝️", theme: "Polka dots in a one-colour sea", shape: tuple(2),
  params: colourOnly, legacy: colourOnlyLegacy,
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => islanderText(p, g).about,
  python: (p, g) => pyCard(islanderText(p, g), `
    def utility(grid):
        islands = 0
        alone = 0
        for cell in grid.cells:
            if cell.colour != MY_COLOUR:
                continue
            sea = [other.colour for other in cell.neighbours]
            if MY_COLOUR not in sea:
                alone += 1
                if all(colour == sea[0] for colour in sea):
                    islands += 1
        return (islands, alone)`),
  typescript: (p, g) => tsCard(islanderText(p, g), `
    function utility(grid) {
      let islands = 0;
      let alone = 0;
      for (const cell of grid.cells) {
        if (cell.colour !== MY_COLOUR) continue;
        const sea = cell.neighbours.map(other => other.colour);
        if (!sea.includes(MY_COLOUR)) {
          alone += 1;
          if (sea.every(colour => colour === sea[0])) islands += 1;
        }
      }
      return [islands, alone];
    }`),
  exemplar: (p, g) => {
    const X = colourAt(g, p.colour);
    return wire(g, full(g.N, 0), fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? X : (X + 1) % g.C)));
  },
});

// --- Rook's Watch --------------------------------------------------------------------------------
type TokenP = { symbol: string; colour: string };
const tokenParams = (g: GridSpec) => ({ symbol: symbolParam(g.cards ? "Your card" : "Your number"), colour: colourParam("Your colour") });
const tokenLegacy = (p: Params, g: GridSpec): TokenP | null =>
  (typeof p.S === "number" ? { symbol: glyph(g, p.S), colour: g.colourNames[p.X as number] } : null);
const tokenSupport = (g: GridSpec) => product<TokenP>({ symbol: range(g.S).map(s => glyph(g, s)), colour: g.colourNames });
const rookText = (p: TokenP, g: GridSpec): CardText => ({
  emoji: "🏰", name: "Rook's Watch", consts: [["MY_SYMBOL", p.symbol], ["MY_COLOUR", p.colour]],
  about: `Your token is ${g.say.symbol(symbolAt(g, p.symbol))} in ${p.colour}. Each row and each column that holds a token scores `
    + "1 point. Most points wins. If that's a tie, more rows and columns holding a half-token wins: a cell with the "
    + "right symbol or the right colour, but not both.",
});
const rooksWatch = gridFamily<TokenP>({
  id: "rooks_watch", name: "Rook's Watch", emoji: "🏰", theme: "One token watching every row and column", shape: tuple(2),
  params: tokenParams, legacy: tokenLegacy, support: tokenSupport,
  canonical: (_p, g) => ({ symbol: glyph(g, 0), colour: g.colourNames[0] }),
  summary: (p, g) => rookText(p, g).about,
  python: (p, g) => pyCard(rookText(p, g), `
    def watched(lines, check):
        count = 0
        for line in lines:
            if any(check(cell) for cell in line):
                count += 1
        return count

    def token(cell):
        return cell.symbol == MY_SYMBOL and cell.colour == MY_COLOUR

    def half_token(cell):
        return (cell.symbol == MY_SYMBOL) != (cell.colour == MY_COLOUR)

    def utility(grid):
        lines = grid.rows + grid.columns
        return (watched(lines, token), watched(lines, half_token))`),
  typescript: (p, g) => tsCard(rookText(p, g), `
    function watched(lines, check) {
      let count = 0;
      for (const line of lines) {
        if (line.some(cell => check(cell))) count += 1;
      }
      return count;
    }

    function token(cell) {
      return cell.symbol === MY_SYMBOL && cell.colour === MY_COLOUR;
    }

    function halfToken(cell) {
      return (cell.symbol === MY_SYMBOL) !== (cell.colour === MY_COLOUR);
    }

    function utility(grid) {
      const lines = [...grid.rows, ...grid.columns];
      return [watched(lines, token), watched(lines, halfToken)];
    }`),
  exemplar: (p, g) => {
    const S = symbolAt(g, p.symbol);
    return wire(g, fromFn(g.N, (r, c) => (r === c ? S : (S + 1) % g.S)), full(g.N, colourAt(g, p.colour)));
  },
});

// --- Picture Frame -----------------------------------------------------------------------------------
/**
 * Owner's redesign (2026-11-03): a dealt colour and a dealt symbol (both params, nothing inferred from the board). An
 * edge cell with either scores FRAME_POINTS.edge.one and with both FRAME_POINTS.edge.both; a middle cell with either or
 * both loses the same (the family's "clear middle", kept symmetric: an ASSUMPTION the owner has not restated, so it is
 * this one table to change). The score is a sum of independent per-cell terms, so every level from the bottom to the
 * top, 4·(4N−4), is reachable and each is rarer than the last.
 */
export const FRAME_POINTS = Object.freeze({
  edge: Object.freeze({ none: 0, one: 1, both: 4 }),
  middle: Object.freeze({ none: 0, one: -1, both: -4 }),
});
type FrameP = { colour: string; symbol: string };
const frameText = (p: FrameP, g: GridSpec): CardText => {
  const X = p.colour, S = g.say.tile(symbolAt(g, p.symbol));
  const E = FRAME_POINTS.edge, M = FRAME_POINTS.middle;
  return {
    emoji: "🖼️", name: "Picture Frame",
    consts: [["MY_COLOUR", X], ["MY_SYMBOL", p.symbol], ["EDGE_ONE", E.one], ["EDGE_BOTH", E.both], ["MIDDLE_ONE", M.one], ["MIDDLE_BOTH", M.both]],
    about: sentences(
      `Your colour is ${X} and your symbol is ${g.say.symbol(symbolAt(g, p.symbol))}.`,
      "The edge is the outside ring of cells. The middle is every cell inside it.",
      `An edge cell that is ${X} or shows ${S} scores ${points(E.one)}; one that is both scores ${points(E.both)}.`,
      `A middle cell that is ${X} or shows ${S} loses ${points(-M.one)}; one that is both loses ${points(-M.both)}.`,
    ),
  };
};
/** One cell's law: neither, exactly one, or both of (colour, symbol), each independently with probability 1/C and 1/S. */
function frameCellLaw(g: GridSpec, pts: { none: number; one: number; both: number }): Dist {
  const pc = 1 / g.C, ps = 1 / g.S;
  return distOf([[pts.none, (1 - pc) * (1 - ps)], [pts.one, pc * (1 - ps) + ps * (1 - pc)], [pts.both, pc * ps]]);
}
const pictureFrame = gridFamily<FrameP>({
  id: "picture_frame", name: "Picture Frame", emoji: "🖼️", theme: "Your colour and your symbol around a clear middle", shape: SCALAR,
  params: g => ({ colour: colourParam("Your colour"), symbol: symbolParam(g.cards ? "Your card" : "Your number") }),
  // LEGACY (typed-params widen step): `{ X }` (an index) and `{ colour }` (before the symbol was dealt) read with the first symbol.
  legacy: (p, g) => {
    if (typeof p.X === "number") return { colour: g.colourNames[p.X], symbol: glyph(g, 0) };
    if (typeof p.colour === "string" && typeof p.symbol !== "string") return { colour: p.colour, symbol: glyph(g, 0) };
    return null;
  },
  support: g => g.colourNames.flatMap(colour => range(g.S).map(s => ({ colour, symbol: glyph(g, s) }))),
  // Colours and symbols are each exchangeable under the uniform prior and the rule only tests equality with them.
  canonical: (_p, g) => ({ colour: g.colourNames[0], symbol: glyph(g, 0) }),
  summary: (p, g) => frameText(p, g).about,
  python: (p, g) => pyCard(frameText(p, g), `
    def utility(grid):
        score = 0
        for cell in grid.cells:
            hits = (cell.colour == MY_COLOUR) + (cell.symbol == MY_SYMBOL)
            if hits == 0:
                continue
            if cell.on_edge:
                score += EDGE_BOTH if hits == 2 else EDGE_ONE
            else:
                score += MIDDLE_BOTH if hits == 2 else MIDDLE_ONE
        return score`),
  typescript: (p, g) => tsCard(frameText(p, g), `
    function utility(grid) {
      let score = 0;
      for (const cell of grid.cells) {
        const hits = (cell.colour === MY_COLOUR ? 1 : 0) + (cell.symbol === MY_SYMBOL ? 1 : 0);
        if (hits === 0) continue;
        if (cell.onEdge) score += hits === 2 ? EDGE_BOTH : EDGE_ONE;
        else score += hits === 2 ? MIDDLE_BOTH : MIDDLE_ONE;
      }
      return score;
    }`),
  exemplar: (p, g) => {
    const X = colourAt(g, p.colour), S = symbolAt(g, p.symbol);
    return wire(g, fromFn(g.N, (r, c) => (isRim(g.N, r, c) ? S : (S + 1) % g.S)), fromFn(g.N, (r, c) => (isRim(g.N, r, c) ? X : (X + 1) % g.C)));
  },
  top: (_p, g) => FRAME_POINTS.edge.both * (4 * g.N - 4),
  /** Exact: independent cells, so u is the sum of 4N−4 iid edge terms and (N−2)² iid middle terms (frameCellLaw). */
  analytic: (_p, g): AnalyticSurvival => lazySurvival("picture-frame@3", () => {
    const B = 4 * g.N - 4, M = (g.N - 2) ** 2;
    return combine(iidSum(frameCellLaw(g, FRAME_POINTS.edge), B), iidSum(frameCellLaw(g, FRAME_POINTS.middle), M),
      (x, y) => (x as number) + (y as number));
  }),
});

// --- Staircase Climber -------------------------------------------------------------------------------
type StairP = { direction: "→" | "↓" };
const stairText = (p: StairP, g: GridSpec): CardText => ({
  emoji: "🪜", name: "Staircase Climber", consts: [],
  about: sentences(`Score 1 point every time a ${thing(g)} is exactly one more than the ${thing(g)} `
    + `${p.direction === "→" ? "to its left" : "above it"}.`, g.say.valueKey()),
});
const staircase = gridFamily<StairP>({
  id: "staircase_climber", name: "Staircase Climber", emoji: "🪜", theme: "Numbers that go up one step at a time",
  requires: { classes: ["Valued", "Ranked"] }, shape: SCALAR,
  params: () => ({ direction: choiceParam("Look for a step up", [["→", "from left to right"], ["↓", "from top to bottom"]]) }),
  legacy: dirLegacy as (p: Params) => StairP | null,
  support: () => [{ direction: "→" }, { direction: "↓" }],
  canonical: () => ({ direction: "→" }),
  summary: (p, g) => stairText(p, g).about,
  python: (p, g) => pyCard(stairText(p, g), `
    def utility(grid):
        steps = 0
        for cell in grid.cells:
            before = cell.${p.direction === "→" ? "left" : "up"}
            if before is not None and cell.value == before.value + 1:
                steps += 1
        return steps`),
  typescript: (p, g) => tsCard(stairText(p, g), `
    function utility(grid) {
      let steps = 0;
      for (const cell of grid.cells) {
        const before = cell.${p.direction === "→" ? "left" : "up"};
        if (before !== null && cell.value === before.value + 1) steps += 1;
      }
      return steps;
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, (r, c) => symForValue(g, g.vmin + (p.direction === "→" ? c : r))), full(g.N, 0)),
  /**
   * Rows (or columns) are independent; within a line the count of "+1 steps" is a functional of the Markov chain of
   * iid values: a dynamic programme over (last value, count), then the N-fold iid sum over lines (tail-toolkit.md §4).
   */
  analytic: (_p, g): AnalyticSurvival => {
    const line = lineChainCount(g.N, valueLaw(g), (prev, v) => (prev !== null && v === prev + 1 ? 1 : 0));
    return exactSurvival("line-chain-sum@1", iidSum(line, g.N));
  },
});

// --- Lucky Token -------------------------------------------------------------------------------------
const luckyText = (p: TokenP, g: GridSpec): CardText => ({
  emoji: "🧿", name: "Lucky Token", consts: [["MY_SYMBOL", p.symbol], ["MY_COLOUR", p.colour]],
  about: `Your token is ${g.say.symbol(symbolAt(g, p.symbol))} in ${p.colour}. Each cell showing it scores 1 point. Most points wins. `
    + "If that's a tie, more halfway cells wins: a cell with the right symbol or the right colour, but not both.",
});
const luckyToken = gridFamily<TokenP>({
  id: "lucky_token", name: "Lucky Token", emoji: "🧿", theme: "Collect your lucky token", shape: tuple(2),
  analytic: solvedAnalytic("lucky_token"),
  tags: ["generalised-seed"],
  params: tokenParams, legacy: tokenLegacy, support: tokenSupport,
  canonical: (_p, g) => ({ symbol: glyph(g, 0), colour: g.colourNames[0] }),
  summary: (p, g) => luckyText(p, g).about,
  python: (p, g) => pyCard(luckyText(p, g), `
    def utility(grid):
        tokens = 0
        halfway = 0
        for cell in grid.cells:
            right_symbol = cell.symbol == MY_SYMBOL
            right_colour = cell.colour == MY_COLOUR
            if right_symbol and right_colour:
                tokens += 1
            elif right_symbol or right_colour:
                halfway += 1
        return (tokens, halfway)`),
  typescript: (p, g) => tsCard(luckyText(p, g), `
    function utility(grid) {
      let tokens = 0;
      let halfway = 0;
      for (const cell of grid.cells) {
        const rightSymbol = cell.symbol === MY_SYMBOL;
        const rightColour = cell.colour === MY_COLOUR;
        if (rightSymbol && rightColour) tokens += 1;
        else if (rightSymbol || rightColour) halfway += 1;
      }
      return [tokens, halfway];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symbolAt(g, p.symbol)), full(g.N, colourAt(g, p.colour))),
});

// --- Neighbourhood Vote --------------------------------------------------------------------------------
const voteText = (p: ColourP, g: GridSpec): CardText => ({
  emoji: "🗳️", name: "Neighbourhood Vote", consts: [["MY_COLOUR", p.colour]],
  about: "Each cell looks at the cells touching it and votes for the colour it sees most often. If two colours tie "
    + `for most, it doesn't vote. Each cell that votes ${p.colour} scores 1 point.`,
});
const neighbourhoodVote = gridFamily<ColourP>({
  id: "neighbourhood_vote", name: "Neighbourhood Vote", emoji: "🗳️", theme: "Every cell votes with its neighbours",
  shape: SCALAR,
  params: colourOnly, legacy: colourOnlyLegacy,
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => voteText(p, g).about,
  python: (p, g) => pyCard(voteText(p, g), `
    def seen(cell, colour):
        n = 0
        for other in cell.neighbours:
            if other.colour == colour:
                n += 1
        return n

    def utility(grid):
        votes = 0
        for cell in grid.cells:
            mine = seen(cell, MY_COLOUR)
            rivals = [seen(cell, colour) for colour in grid.palette if colour != MY_COLOUR]
            if mine > max(rivals):
                votes += 1
        return votes`),
  typescript: (p, g) => tsCard(voteText(p, g), `
    function seen(cell, colour) {
      let n = 0;
      for (const other of cell.neighbours) {
        if (other.colour === colour) n += 1;
      }
      return n;
    }

    function utility(grid) {
      let votes = 0;
      for (const cell of grid.cells) {
        const mine = seen(cell, MY_COLOUR);
        const rivals = grid.palette.filter(colour => colour !== MY_COLOUR).map(colour => seen(cell, colour));
        if (mine > Math.max(...rivals)) votes += 1;
      }
      return votes;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, colourAt(g, p.colour))),
});

// --- Far Apart -------------------------------------------------------------------------------------------
type PairP = { first_colour: string; second_colour: string };
const farText = (p: PairP, g: GridSpec): CardText => ({
  emoji: "↔️", name: "Far Apart", consts: [["COLOUR_A", p.first_colour], ["COLOUR_B", p.second_colour]],
  about: `Find the middle of all the ${p.first_colour} cells and the middle of all the ${p.second_colour} cells. `
    + "Count the steps across plus the steps down between the two middles. The further apart, the better, and part-steps "
    + "count too (each full step is worth 64 points). If either colour is missing, you score 0.",
});
const farApart = gridFamily<PairP>({
  id: "far_apart", name: "Far Apart", emoji: "↔️", theme: "Keep two colours as far apart as possible", shape: SCALAR,
  params: () => ({ first_colour: colourParam("First colour"), second_colour: colourParam("Second colour") }),
  legacy: (p, g) => (typeof p.A === "number" ? { first_colour: g.colourNames[p.A], second_colour: g.colourNames[p.B as number] } : null),
  support: g => colourPairs(g).map(([A, B]) => ({ first_colour: g.colourNames[A], second_colour: g.colourNames[B] })),
  canonical: (p, g) => recolourNames(g, p, ["first_colour", "second_colour"]),
  summary: (p, g) => farText(p, g).about,
  python: (p, g) => pyCard(farText(p, g), `
    def utility(grid):
        a = [cell for cell in grid.cells if cell.colour == COLOUR_A]
        b = [cell for cell in grid.cells if cell.colour == COLOUR_B]
        if len(a) == 0 or len(b) == 0:
            return 0
        down = abs(sum(cell.row for cell in a) * len(b) - sum(cell.row for cell in b) * len(a))
        across = abs(sum(cell.col for cell in a) * len(b) - sum(cell.col for cell in b) * len(a))
        return (down + across) * 64 // (len(a) * len(b))`),
  typescript: (p, g) => tsCard(farText(p, g), `
    function total(cells, side) {
      let sum = 0;
      for (const cell of cells) sum += cell[side];
      return sum;
    }

    function utility(grid) {
      const a = grid.cells.filter(cell => cell.colour === COLOUR_A);
      const b = grid.cells.filter(cell => cell.colour === COLOUR_B);
      if (a.length === 0 || b.length === 0) return 0;
      const down = Math.abs(total(a, "row") * b.length - total(b, "row") * a.length);
      const across = Math.abs(total(a, "col") * b.length - total(b, "col") * a.length);
      return Math.floor(((down + across) * 64) / (a.length * b.length));
    }`),
  exemplar: (p, g) => {
    const A = colourAt(g, p.first_colour), B = colourAt(g, p.second_colour);
    const other = range(g.C).find(k => k !== A && k !== B)!, N = g.N;
    return wire(g, full(N, 0), fromFn(N, (r, c) => (r === 0 && c === 0 ? A : r === N - 1 && c === N - 1 ? B : other)));
  },
});

export const STRATEGY = [rainbowRoad, borderBaron, conqueror, parityPainter, mirrormancer, homebody, lonePeak,
  islander, rooksWatch, pictureFrame, staircase, luckyToken, neighbourhoodVote, farApart];
