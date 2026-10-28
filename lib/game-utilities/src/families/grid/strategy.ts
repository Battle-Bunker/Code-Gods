/** Strategy-lens rules (lib/grid-lab/gridlab/rules/strategy.py, cards from rules/cards.py). */
import type { CardText, GridSpec } from "./_util.ts";
import {
  SCALAR, cap, chance, climb, cname, colourPairs, fromFn, full, gridFamily, isRim, pick, product, pyCard, range,
  recolour, symForValue, thing, tsCard, tuple, wire,
} from "./_util.ts";

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

// --- Rainbow Road ------------------------------------------------------------------------------
type RoadP = { dir: Dir4 };
const roadText = (p: RoadP, g: GridSpec): CardText => {
  const kind = p.dir === "→" || p.dir === "←" ? "row" : "column";
  const order = [...g.colourNames, g.colourNames[0]].join(" → ");
  return {
    emoji: "🌈", name: "Rainbow Road", consts: [],
    about: `Read every ${kind} ${DIR_NAMES[p.dir]}. A step scores when the next colour is the next one round the `
      + `rainbow (${order}). A whole ${kind} of rainbow steps beats any number of single steps.`,
  };
};
const rainbowRoad = gridFamily<RoadP>({
  id: "rainbow_road", name: "Rainbow Road", emoji: "🌈", theme: "Rows that march round the rainbow",
  requires: { classes: ["Spectral"] }, shape: tuple(2), tags: ["shortlist"],
  support: () => DIRS4.map(dir => ({ dir })),
  canonical: () => ({ dir: "→" }),
  summary: (p, g) => `Count the lines, read ${DIR_NAMES[p.dir]}, where every colour is the next one round the rainbow `
    + `(${g.colourNames.join(" → ")} → ${g.colourNames[0]} again).`,
  python: (p, g) => pyCard(roadText(p, g), `
    def utility(grid):
        whole_lines = 0
        steps = 0
        for line in ${PY_LINES[p.dir]}:
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
      for (const line of ${TS_LINES[p.dir]}) {
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
    const col = fromFn(N, (r, c) => p.dir === "→" ? k(r + c) : p.dir === "←" ? k(r + N - 1 - c)
      : p.dir === "↓" ? k(c + r) : k(c + N - 1 - r));
    return wire(g, full(N, 0), col);
  },
});

// --- Border Baron ------------------------------------------------------------------------------
type BaronP = { K: number };
const baronText = (p: BaronP): CardText => ({
  emoji: "🏰", name: "Border Baron", consts: [["BIG", p.K]],
  about: "Touching cells of one colour form a country. Every place where two countries touch is a border, and it "
    + `scores when both countries have at least ${p.K} cells. If that's a tie, each border counts the size of its `
    + `smaller country (up to ${p.K}).`,
});
const borderBaron = gridFamily<BaronP>({
  id: "border_baron", name: "Border Baron", emoji: "🏰", theme: "Long borders between big countries",
  shape: tuple(2), tags: ["shortlist"],
  support: g => [g.N - 1, g.N, 2 * g.N - 2].map(K => ({ K })),
  summary: p => `A country is a patch of touching cells of one colour. Countries of ${p.K} or more cells `
    + "are big. Score a point for every edge where two big countries touch.",
  python: p => pyCard(baronText(p), `
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
  typescript: p => tsCard(baronText(p), `
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
type ConqP = { A: number; B: number; weight: "one" | "value" };
const conqText = (p: ConqP, g: GridSpec): CardText => {
  const worth = p.weight === "value" ? "its value" : "1 point";
  return {
    emoji: "⚔️", name: "Conqueror", consts: [["MY_COLOUR", cname(g, p.A)], ["ENEMY_COLOUR", cname(g, p.B)]],
    about: `Your colour against your enemy's. Each ${cname(g, p.A)} cell adds ${worth}, and each `
      + `${cname(g, p.B)} cell takes ${worth} away.`,
  };
};
const conqueror = gridFamily<ConqP>({
  id: "conqueror", name: "Conqueror", emoji: "⚔️", theme: "Your army against your enemy",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => colourPairs(g).flatMap(([A, B]) => (["one", "value"] as const).map(weight => ({ A, B, weight }))),
  canonical: p => recolour(p, ["A", "B"]),
  summary: (p, g) => `${cap(cname(g, p.A))} is your army and ${cname(g, p.B)} your enemy. Score = `
    + (p.weight === "one" ? "how many army cells minus how many enemy cells."
      : "the total of the army's numbers minus the total of the enemy's numbers."),
  python: (p, g) => {
    const pts = p.weight === "value" ? "cell.value" : "1";
    return pyCard(conqText(p, g), `
      def utility(grid):
          points = 0
          for cell in grid.cells:
              if cell.colour == MY_COLOUR:
                  points += ${pts}
              elif cell.colour == ENEMY_COLOUR:
                  points -= ${pts}
          return points`);
  },
  typescript: (p, g) => {
    const pts = p.weight === "value" ? "cell.value" : "1";
    return tsCard(conqText(p, g), `
      function utility(grid) {
        let points = 0;
        for (const cell of grid.cells) {
          if (cell.colour === MY_COLOUR) points += ${pts};
          else if (cell.colour === ENEMY_COLOUR) points -= ${pts};
        }
        return points;
      }`);
  },
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, p.A)),
});

// --- Parity Painter ------------------------------------------------------------------------------
type ParityP = { P: number; Q: number; key: "parity" | "suit" };
const parityText = (p: ParityP, g: GridSpec): CardText => {
  const P = cname(g, p.P), Q = cname(g, p.Q);
  return p.key === "suit"
    ? {
      emoji: "🎭", name: "Parity Painter", consts: [["RED_SUIT_COLOUR", P], ["BLACK_SUIT_COLOUR", Q]],
      about: `Red suits (♥ ♦) should be ${P} and black suits (♠ ♣) should be ${Q}. A card in its right colour is +1; `
        + "a card wearing the other team's colour is −1.",
    }
    : {
      emoji: "🎭", name: "Parity Painter", consts: [["EVEN_COLOUR", P], ["ODD_COLOUR", Q]],
      about: `Even ${thing(g)}s should be ${P} and odd ones ${Q}. A cell in its right colour is +1; a cell wearing `
        + "the other team's colour is −1.",
    };
};
const parityPainter = gridFamily<ParityP>({
  id: "parity_painter", name: "Parity Painter", emoji: "🎭", theme: "Numbers wear the colour of their kind",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => colourPairs(g).flatMap(([P, Q]) =>
    (g.cards ? ["parity", "suit"] as const : ["parity"] as const).map(key => ({ P, Q, key }))),
  sample: (rng, g) => {
    const [P, Q] = pick(rng, colourPairs(g));
    return { P, Q, key: g.cards && chance(rng, 1, 2) ? "suit" : "parity" };
  },
  canonical: p => recolour(p, ["P", "Q"]),
  summary: (p, g) => (p.key === "parity"
    ? `Even numbers should wear ${cname(g, p.P)} and odd numbers ${cname(g, p.Q)}. `
    : `Red suits (♥♦) should wear ${cname(g, p.P)} and black suits (♠♣) ${cname(g, p.Q)}. `)
    + "+1 for each cell dressed right, -1 for each wearing the other one's colour.",
  python: (p, g) => pyCard(parityText(p, g), p.key === "suit" ? `
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
  typescript: (p, g) => tsCard(parityText(p, g), p.key === "suit" ? `
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
    const wears = (s: number) => (p.key === "suit" ? [1, 2].includes(Math.floor(s / 13)) : g.value[s] % 2 === 0);
    return wire(g, sym, sym.map(row => row.map(s => (wears(s) ? p.P : p.Q))));
  },
});

// --- Mirrormancer --------------------------------------------------------------------------------
type MirrorP = { axis: "LR" | "TB"; layer: "colour" | "symbol" };
const mirrorText = (p: MirrorP, g: GridSpec): CardText => {
  const kind = p.axis === "LR" ? "row" : "column";
  const shown = p.layer === "colour" ? "colours" : g.cards ? "ranks" : "numbers";
  return {
    emoji: "🪞", name: "Mirrormancer", consts: [],
    about: `A ${kind} is a mirror when its ${shown} read the same forwards and backwards. Count mirror ${kind}s; if `
      + "that's a tie, count matching pairs (first and last, second and second-last, ...).",
  };
};
const mirrormancer = gridFamily<MirrorP>({
  id: "mirrormancer", name: "Mirrormancer", emoji: "🪞", theme: "Lines that read the same both ways",
  shape: tuple(2), tags: ["shortlist"],
  support: () => product<MirrorP>({ axis: ["LR", "TB"], layer: ["colour", "symbol"] }),
  canonical: p => ({ ...p, axis: "LR" }),
  summary: p => `Count the ${p.axis === "LR" ? "rows" : "columns"} whose `
    + `${p.layer === "colour" ? "colours" : "symbols"} read the same forwards and backwards.`,
  python: (p, g) => {
    const what = p.layer === "colour" ? "colour" : "value";
    return pyCard(mirrorText(p, g), `
      def utility(grid):
          mirrors = 0
          pairs = 0
          for line in ${p.axis === "LR" ? "grid.rows" : "grid.columns"}:
              half = len(line) // 2
              matches = 0
              for i in range(half):
                  if line[i].${what} == line[len(line) - 1 - i].${what}:
                      matches += 1
              pairs += matches
              if matches == half:
                  mirrors += 1
          return (mirrors, pairs)`);
  },
  typescript: (p, g) => {
    const what = p.layer === "colour" ? "colour" : "value";
    return tsCard(mirrorText(p, g), `
      function utility(grid) {
        let mirrors = 0;
        let pairs = 0;
        for (const line of ${p.axis === "LR" ? "grid.rows" : "grid.columns"}) {
          const half = Math.floor(line.length / 2);
          let matches = 0;
          for (let i = 0; i < half; i++) {
            if (line[i].${what} === line[line.length - 1 - i].${what}) matches += 1;
          }
          pairs += matches;
          if (matches === half) mirrors += 1;
        }
        return [mirrors, pairs];
      }`);
  },
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Homebody ------------------------------------------------------------------------------------
type HomeP = { X: number; zone: "core" | "rim" };
const homeText = (p: HomeP, g: GridSpec): CardText => ({
  emoji: "🏡", name: "Homebody", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `Your colour likes to stay home in ${p.zone === "rim" ? "the edge (the outside ring)" : "the middle (everything off the edge)"}. `
    + `Each ${cname(g, p.X)} cell at home is +1, and each one away from home is −1.`,
});
const homebody = gridFamily<HomeP>({
  id: "homebody", name: "Homebody", emoji: "🏡", theme: "Your colour belongs at home",
  shape: SCALAR, tags: ["shortlist"],
  support: g => product<HomeP>({ X: range(g.C), zone: ["core", "rim"] }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `${cap(cname(g, p.X))} belongs `
    + `${p.zone === "rim" ? "on the outside edge" : "in the middle (away from the edge)"}. `
    + `+1 for each ${cname(g, p.X)} cell at home, -1 for each one that wandered off.`,
  python: (p, g) => pyCard(homeText(p, g), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.colour == MY_COLOUR:
                if ${p.zone === "rim" ? "cell.on_edge" : "not cell.on_edge"}:
                    points += 1
                else:
                    points -= 1
        return points`),
  typescript: (p, g) => tsCard(homeText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.colour === MY_COLOUR) {
          if (${p.zone === "rim" ? "cell.onEdge" : "!cell.onEdge"}) points += 1;
          else points -= 1;
        }
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0),
    fromFn(g.N, (r, c) => (isRim(g.N, r, c) === (p.zone === "rim") ? p.X : (p.X + 1) % g.C))),
});

// --- Lone Peak -----------------------------------------------------------------------------------
type PeakP = { X: number };
const peakText = (p: PeakP, g: GridSpec): CardText => ({
  emoji: "🏔️", name: "Lone Peak", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `The highest ${thing(g)} on the grid is the peak. If there is just one peak and it is ${cname(g, p.X)}, `
    + `score how far it stands above the next highest. If that's a tie, it helps if one of the peaks is ${cname(g, p.X)}.`,
});
const lonePeak = gridFamily<PeakP>({
  id: "lone_peak", name: "Lone Peak", emoji: "🏔️", theme: "One mountain towering over everything",
  requires: { classes: ["Valued"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `The biggest number on the grid should be alone and ${cname(g, p.X)}. Score = how much `
    + "bigger it is than the second biggest. If it is tied or the wrong colour you score 0.",
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
    const N = g.N, m = Math.floor(N / 2);
    const sym = fromFn(N, (r, c) => symForValue(g, r === m && c === m ? g.vmax : g.vmin));
    return wire(g, sym, fromFn(N, (r, c) => (r === m && c === m ? p.X : (p.X + 1) % g.C)));
  },
});

export const STRATEGY = [rainbowRoad, borderBaron, conqueror, parityPainter, mirrormancer, homebody, lonePeak];
