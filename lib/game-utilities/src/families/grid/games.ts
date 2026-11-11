/** Games-kids-know lens rules (lib/grid-lab/gridlab/rules/games.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import type { Params } from "../../types.ts";
import { setParam, colourParam, choiceParam, intParam } from "../../params.ts";
import { roundHalfEven } from "./arithmetic.ts";
import {
  RANK_NAMES, SCALAR, SUIT_NAMES, bestOf, cap, chance, choose, climb, fromFn, full, glyph, gridFamily, pyCard, range, sentences, symForValue, thing, tsCard, tuple, wire, colourAt, recolourNames,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";
import { tierPoints } from "../../tuples.ts";

const LINE_OPTIONS = [["rows", "rows"], ["cols", "columns"]] as const;
const lineWord = (dir: "rows" | "cols") => (dir === "rows" ? "row" : "column");
const pyLines = (dir: "rows" | "cols") => (dir === "rows" ? "grid.rows" : "grid.columns");
/** The options of a "colour or none" param: `none` (stored as that word) plus the shape's colour names. */
export const colourOrNone = (g: GridSpec, none: readonly [string, string]): (readonly [string, string])[] =>
  [none, ...g.colourNames.map(n => [n, n] as const)];
/** `recolourNames` for params that may hold a non-colour word ("any", "none"): only the colours are renamed. */
export const recolourSome = <P extends Params>(g: GridSpec, p: P, keys: readonly string[]): P =>
  recolourNames(g, p, keys.filter(k => g.colourNames.includes(p[k] as string)));
const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
/** A rank param's options: the rank a card shows (any suit) or the digit a number grid shows, with how each reads. */
export const rankOptions = (g: GridSpec): (readonly [string, string])[] => g.cards
  ? CARD_RANKS.map((k, i) => [k, RANK_NAMES[i + 1] ?? k] as const)
  : range(g.S).map(s => [glyph(g, s), s >= 10 ? `${glyph(g, s)} (${s})` : glyph(g, s)] as const);
/** The rank index (0 = ace, or the digit) of a rank param's value; throws for a rank this shape does not have. */
export function rankAt(g: GridSpec, name: string): number {
  const i = rankOptions(g).findIndex(([v]) => v === name);
  if (i < 0) throw new Error(`no rank ${JSON.stringify(name)} in ${g.symbols}`);
  return i;
}
/** A rank index as the value stored for a rank param. */
export const rankName = (g: GridSpec, rank: number) => rankOptions(g)[rank][0];
/** The suit params' options: a card deck's four suits by name, in the deck's order. */
export const suitOptions = (): (readonly [string, string])[] => SUIT_NAMES.map(n => [n, n] as const);

// --- Rummy Melder ------------------------------------------------------------------------------------
type RummyP = { axis: "rows" | "cols" };
const rummyText = (p: RummyP, g: GridSpec): CardText => {
  const suit = g.cards ? "suit" : "colour", three = g.cards ? g.say.distinctSuits(3) : g.say.distinctColours(3);
  return {
    emoji: "🃏", name: "Rummy Melder", consts: [],
    about: sentences(`Try to make sets and runs, like rummy. Look at every 3 touching cells in a ${lineWord(p.axis)}.`,
      `A set has the same ${g.cards ? "rank" : "number"} in ${three}.`,
      `A run counts up by 1, all in one ${suit}.`,
      "Every cell in a set or run scores its value in primary points, once.", g.say.valueKey(),
      `Each touching pair that could grow into a set or run scores ${tierPoints(1, 1, 2)}.`),
  };
};
const rummyMelder = gridFamily<RummyP>({
  id: "rummy_melder", name: "Rummy Melder", emoji: "🃏", theme: "Sets and runs, like rummy",
  requires: { classes: ["Valued", "Ranked"], minColours: 3 }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({ axis: choiceParam("Lines to look along", LINE_OPTIONS) }),
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: (p, g) => rummyText(p, g).about,
  python: (p, g) => pyCard(rummyText(p, g), `
    def suit(cell):
        return ${g.cards ? "cell.suit" : "cell.colour"}

    def is_set(a, b, c):
        return a.value == b.value == c.value and suit(a) != suit(b) and suit(b) != suit(c) and suit(a) != suit(c)

    def is_run(a, b, c):
        return b.value == a.value + 1 and c.value == b.value + 1 and suit(a) == suit(b) == suit(c)

    def half_meld(a, b):
        return (a.value == b.value and suit(a) != suit(b)) or (b.value == a.value + 1 and suit(a) == suit(b))

    def utility(grid):
        score = 0
        pairs = 0
        for line in ${pyLines(p.axis)}:
            in_meld = set()
            for i in range(len(line) - 2):
                a, b, c = line[i], line[i + 1], line[i + 2]
                if is_set(a, b, c) or is_run(a, b, c):
                    in_meld.update([a, b, c])
            for cell in in_meld:
                score += cell.value
            for i in range(len(line) - 1):
                if half_meld(line[i], line[i + 1]):
                    pairs += 1
        return (score, pairs)`),
  typescript: (p, g) => tsCard(rummyText(p, g), `
    function suit(cell) {
      return ${g.cards ? "cell.suit" : "cell.colour"};
    }

    function isSet(a, b, c) {
      return a.value === b.value && b.value === c.value
        && suit(a) !== suit(b) && suit(b) !== suit(c) && suit(a) !== suit(c);
    }

    function isRun(a, b, c) {
      return b.value === a.value + 1 && c.value === b.value + 1 && suit(a) === suit(b) && suit(b) === suit(c);
    }

    function halfMeld(a, b) {
      return (a.value === b.value && suit(a) !== suit(b)) || (b.value === a.value + 1 && suit(a) === suit(b));
    }

    function utility(grid) {
      let score = 0;
      let pairs = 0;
      for (const line of ${pyLines(p.axis)}) {
        const inMeld = new Set();
        for (let i = 0; i < line.length - 2; i++) {
          const a = line[i], b = line[i + 1], c = line[i + 2];
          if (isSet(a, b, c) || isRun(a, b, c)) {
            inMeld.add(a);
            inMeld.add(b);
            inMeld.add(c);
          }
        }
        for (const cell of inMeld) score += cell.value;
        for (let i = 0; i < line.length - 1; i++) {
          if (halfMeld(line[i], line[i + 1])) pairs += 1;
        }
      }
      return [score, pairs];
    }`),
  exemplar: (p, g) => {
    const pos = (r: number, c: number) => (p.axis === "rows" ? c : r);
    if (g.cards) return wire(g, fromFn(g.N, (r, c) => (pos(r, c) % 4) * 13 + 12), full(g.N, 0));
    return wire(g, full(g.N, g.vmax), fromFn(g.N, (r, c) => pos(r, c) % g.C));
  },
});

// --- Othello Sandwich ----------------------------------------------------------------------------------
/**
 * One geometry: across, down and both diagonals. "Diagonals count too" used to be a yes/no param, which only added
 * scoring opportunity to some gods (top 20.7 vs 26.0 bits on 4×4, base 12, rainbow6): params make peer rules of equal
 * opportunity (docs/rules-design.md P10), so the richer geometry is the rule and the param is gone.
 */
type SandP = { colour: string };
const sandText = (p: SandP, _g: GridSpec): CardText => ({
  emoji: "🥪", name: "Sandwich Maker", consts: [["MY_COLOUR", p.colour]],
  about: `Try to sandwich cells between your ${p.colour} cells. A cell is sandwiched when ${p.colour} cells are on both sides of it, and it isn't ${p.colour} itself. `
    + "Both sides means left and right, above and below, or opposite corners. Each sandwich scores 1 point.",
});
const othello = gridFamily<SandP>({
  id: "othello_sandwich", name: "Othello Sandwich", emoji: "🥪", theme: "Capture cells between two of yours",
  requires: { minColours: 2 },
  shape: SCALAR, tags: ["shortlist"],
  params: () => ({ colour: colourParam("Sandwiching colour") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => sandText(p, g).about,
  python: (p, g) => pyCard(sandText(p, g), `
    def is_mine(cell):
        return cell is not None and cell.colour == MY_COLOUR

    def utility(grid):
        sandwiches = 0
        for cell in grid.cells:
            if is_mine(cell):
                continue
            if is_mine(cell.left) and is_mine(cell.right):
                sandwiches += 1
            if is_mine(cell.up) and is_mine(cell.down):
                sandwiches += 1
            if is_mine(cell.up_left) and is_mine(cell.down_right):
                sandwiches += 1
            if is_mine(cell.up_right) and is_mine(cell.down_left):
                sandwiches += 1
        return sandwiches`),
  typescript: (p, g) => tsCard(sandText(p, g), `
    function isMine(cell) {
      return cell !== null && cell.colour === MY_COLOUR;
    }

    function utility(grid) {
      let sandwiches = 0;
      for (const cell of grid.cells) {
        if (isMine(cell)) continue;
        if (isMine(cell.left) && isMine(cell.right)) sandwiches += 1;
        if (isMine(cell.up) && isMine(cell.down)) sandwiches += 1;
        if (isMine(cell.upLeft) && isMine(cell.downRight)) sandwiches += 1;
        if (isMine(cell.upRight) && isMine(cell.downLeft)) sandwiches += 1;
      }
      return sandwiches;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, X = colourAt(g, p.colour), o = (X + 1) % g.C, z = full(N, 0);
    const cands: Cand[] = [
      { sym: z, col: fromFn(N, (r, c) => ((r + c) % 2 === 0 ? X : o)) },
      { sym: z, col: fromFn(N, (_, c) => (c % 2 === 0 ? X : o)) },
      { sym: z, col: fromFn(N, (r, c) => (r % 2 === 0 || c % 2 === 0 ? X : o)) },
    ];
    return climb("othello_sandwich", p, ctx, cands, 3);
  },
});

// --- Honest Minesweeper ---------------------------------------------------------------------------------
type MineP = { mine: string };
const mineText = (p: MineP, g: GridSpec): CardText => ({
  emoji: "💣", name: "Honest Minesweeper", consts: [["MINE", p.mine]],
  about: sentences(`Try to make honest cells. ${cap(p.mine)} cells are mines.`,
    `Any other cell is honest when its ${g.cards ? "value" : "number"} equals how many mines touch it (corners count).`,
    "Each honest cell scores its value in points.", g.say.valueKey()),
});
function count8(mine: boolean[][]): Layer {
  const N = mine.length;
  return fromFn(N, (r, c) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && mine[r + dr]?.[c + dc]) n++;
    }
    return n;
  });
}
const minesweeper = gridFamily<MineP>({
  id: "honest_minesweeper", name: "Honest Minesweeper", emoji: "💣", theme: "Numbers that count the mines around them",
  requires: { classes: ["Valued"], minColours: 2 }, shape: SCALAR, tags: ["shortlist"],
  params: () => ({ mine: colourParam("Mine colour") }),
  support: g => g.colourNames.map(mine => ({ mine })),
  canonical: (p, g) => recolourNames(g, p, ["mine"]),
  summary: (p, g) => mineText(p, g).about,
  python: (p, g) => pyCard(mineText(p, g), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.colour == MINE:
                continue
            mines = 0
            for other in cell.surrounding:
                if other.colour == MINE:
                    mines += 1
            if cell.value == mines:
                points += cell.value
        return points`),
  typescript: (p, g) => tsCard(mineText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.colour === MINE) continue;
        let mines = 0;
        for (const other of cell.surrounding) {
          if (other.colour === MINE) mines += 1;
        }
        if (cell.value === mines) points += cell.value;
      }
      return points;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, X = colourAt(g, p.mine), o = (X + 1) % g.C, have = new Set(g.value);
    const masks: ((r: number, c: number) => boolean)[] = [
      r => r % 2 === 0, (_, c) => c % 2 === 0, r => r % 2 === 1, (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0 && c % 2 === 0, (r, c) => r % 3 === 1 && c % 3 === 1, (r, c) => r % 3 !== 1 || c % 3 !== 1,
    ];
    const cands = masks.map(m => {
      const mine = range(N).map(r => range(N).map(c => m(r, c)));
      const cnt = count8(mine);
      const v = cnt.map(row => row.map(x => (have.has(x) ? x : g.vmax)));
      return { sym: v.map(row => row.map(x => symForValue(g, x))), col: mine.map(row => row.map(b => (b ? X : o))) };
    });
    return bestOf("honest_minesweeper", p, ctx, cands);
  },
});

// --- Bingo Caller -----------------------------------------------------------------------------------------
type BingoP = { called: readonly string[] };
function* combinations(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= n - k; i++) for (const rest of combinations(n, k - 1, i + 1)) yield [i, ...rest];
}
const calledCount = (g: GridSpec) => Math.ceil(g.ranks / 3);
const rankValue = (g: GridSpec, rank: number) => (g.cards ? rank + 1 : rank);
const bingoText = (p: BingoP, g: GridSpec): CardText => {
  const called = p.called.map(r => rankValue(g, rankAt(g, r))), free = g.N % 2 === 1;
  return {
    emoji: "🎱", name: "Bingo Caller",
    consts: [["CALLED", called, g.cards ? called.map(v => RANK_NAMES[v] ?? String(v)).join(", ") : ""]],
    about: sentences(`Try to fill lines with your called ${thing(g)}s, ${g.say.values(called)}.`, "Dab every cell showing one of them.",
      free ? "The middle cell is a free space." : "", "Each dab scores 1 point.",
      `A complete row, column or long diagonal is BINGO and scores ${g.N} more points.`),
  };
};
const bingoCaller = gridFamily<BingoP>({
  id: "bingo_caller", name: "Bingo Caller", emoji: "🎱", theme: "Dab your called numbers",
  analytic: solvedAnalytic("bingo_caller"),
  shape: SCALAR, tags: ["shortlist"],
  params: g => ({ called: setParam(g.cards ? "Called ranks (any suit)" : "Called numbers", calledCount(g), rankOptions(g)) }),
  support: g => [...combinations(g.ranks, calledCount(g))].map(called => ({ called: called.map(r => rankName(g, r)) })),
  sample: (rng, g) => ({ called: choose(rng, range(g.ranks), calledCount(g)).sort((a, b) => a - b).map(r => rankName(g, r)) }),
  canonical: (p, g) => ({ called: range(p.called.length).map(r => rankName(g, r)) }),
  summary: (p, g) => bingoText(p, g).about,
  python: (p, g) => pyCard(bingoText(p, g), `
    def dabbed(grid, cell):
        return ${g.N % 2 === 1 ? "cell.value in CALLED or cell is grid.cell(grid.size // 2, grid.size // 2)" : "cell.value in CALLED"}

    def utility(grid):
        points = 0
        for cell in grid.cells:
            if dabbed(grid, cell):
                points += 1
        for line in grid.rows + grid.columns + grid.diagonals:
            if all(dabbed(grid, cell) for cell in line):
                points += grid.size
        return points`),
  typescript: (p, g) => tsCard(bingoText(p, g), `
    function dabbed(grid, cell) {${g.N % 2 === 1 ? `
      const middle = grid.cell(Math.floor(grid.size / 2), Math.floor(grid.size / 2));
      return CALLED.includes(cell.value) || cell === middle;` : `
      return CALLED.includes(cell.value);`}
    }

    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (dabbed(grid, cell)) points += 1;
      }
      for (const line of [...grid.rows, ...grid.columns, ...grid.diagonals]) {
        if (line.every(cell => dabbed(grid, cell))) points += grid.size;
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, rankAt(g, p.called[0])), full(g.N, 0)),
});

// --- Sudoku Scholar ---------------------------------------------------------------------------------------
/**
 * One geometry: every row and every column (at N <= 4, all or nothing over the long diagonals too). "Rows | columns |
 * both" used to be a param, but rows alone has half the lines to score (top 8.6 vs 16.9 bits on 5×5): params make peer
 * rules of equal opportunity (docs/rules-design.md P10), so the richer rule is the rule and the param is gone.
 */
type SudokuP = Record<string, never>;
const sudokuText = (_p: SudokuP, g: GridSpec): CardText => {
  const word = g.cards ? "rank" : "number";
  return {
    emoji: "🔢", name: "Sudoku Scholar", consts: [],
    about: sentences(g.N <= 4
      ? `Try to repeat no ${word} in any row, column or long diagonal. All or nothing: you score 1 point only if none does.`
      : `Try to repeat no ${word} in your rows and columns. Every row and column where no ${word} appears twice scores 1 primary point. `
        + `In every row and column, each different ${word} scores 1 secondary point (a repeat counts once).`,
      g.cards ? "Cards compare rank only, so suits don't matter." : ""),
  };
};
const sudoku = gridFamily<SudokuP>({
  id: "sudoku_scholar", name: "Sudoku Scholar", emoji: "🔢", theme: "No number twice in a line",
  requires: { minColours: 2 },
  params: () => ({}),
  // All or nothing at N <= 4: grid-lab pads the tuple with a constant 0, the card returns 0 or 1.
  shape: g => (g.N <= 4 ? SCALAR : tuple(2)), tags: ["shortlist"],
  support: () => [{}],
  summary: (p, g) => sudokuText(p, g).about,
  python: (p, g) => pyCard(sudokuText(p, g), g.N <= 4 ? `
    def all_different(line):
        seen = []
        for cell in line:
            if cell.value in seen:
                return False
            seen.append(cell.value)
        return True

    def utility(grid):
        for line in grid.rows + grid.columns + grid.diagonals:
            if not all_different(line):
                return 0
        return 1` : `
    def different(line):
        seen = []
        for cell in line:
            if cell.value not in seen:
                seen.append(cell.value)
        return len(seen)

    def utility(grid):
        perfect = 0
        variety = 0
        for line in grid.rows + grid.columns:
            d = different(line)
            variety += d
            if d == len(line):
                perfect += 1
        return (perfect, variety)`),
  typescript: (p, g) => tsCard(sudokuText(p, g), g.N <= 4 ? `
    function allDifferent(line) {
      const seen = [];
      for (const cell of line) {
        if (seen.includes(cell.value)) return false;
        seen.push(cell.value);
      }
      return true;
    }

    function utility(grid) {
      for (const line of [...grid.rows, ...grid.columns, ...grid.diagonals]) {
        if (!allDifferent(line)) return 0;
      }
      return 1;
    }` : `
    function different(line) {
      const seen = [];
      for (const cell of line) {
        if (!seen.includes(cell.value)) seen.push(cell.value);
      }
      return seen.length;
    }

    function utility(grid) {
      let perfect = 0;
      let variety = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        const d = different(line);
        variety += d;
        if (d === line.length) perfect += 1;
      }
      return [perfect, variety];
    }`),
  exemplar: (_, g) => {
    const N = g.N;
    const k: Layer = N === 3 ? fromFn(3, (r, c) => r * 3 + c)
      : N === 4 ? [[0, 1, 2, 3], [2, 3, 0, 1], [3, 2, 1, 0], [1, 0, 3, 2]] : fromFn(N, (r, c) => (r + c) % N);
    return wire(g, k, full(N, 0));
  },
});

// --- Full House -------------------------------------------------------------------------------------------
type HouseP = { axis: "rows" | "cols" };
const houseText = (p: HouseP, g: GridSpec): CardText => ({
  emoji: "🏠", name: "Full House", consts: [],
  about: `Try to make poker hands. Look along each ${lineWord(p.axis)}. Every pair of cells showing the same ${g.cards ? "rank" : "number"} scores 1 point. `
    + "Three of a kind makes 3 pairs, and four of a kind makes 6.",
});
const fullHouse = gridFamily<HouseP>({
  id: "full_house", name: "Full House", emoji: "🏠", theme: "Rows read like poker hands",
  analytic: solvedAnalytic("full_house"),
  params: () => ({ axis: choiceParam("Lines to read", LINE_OPTIONS) }),
  shape: SCALAR, tags: ["shortlist"],
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: (p, g) => houseText(p, g).about,
  python: (p, g) => pyCard(houseText(p, g), `
    def utility(grid):
        pairs = 0
        for line in ${pyLines(p.axis)}:
            for i in range(len(line)):
                for j in range(i + 1, len(line)):
                    if line[i].value == line[j].value:
                        pairs += 1
        return pairs`),
  typescript: (p, g) => tsCard(houseText(p, g), `
    function utility(grid) {
      let pairs = 0;
      for (const line of ${pyLines(p.axis)}) {
        for (let i = 0; i < line.length; i++) {
          for (let j = i + 1; j < line.length; j++) {
            if (line[i].value === line[j].value) pairs += 1;
          }
        }
      }
      return pairs;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});


// ================================================================================================
// Not shortlisted (new cards, checked against grid-lab by test/gridlab_parity.py)
// ================================================================================================

const suitWord = (g: GridSpec) => (g.cards ? "suit" : "colour");
const suitOf = (g: GridSpec) => (g.cards ? "cell.suit" : "cell.colour");

// --- Flush Royale -------------------------------------------------------------------------------------
const flushText = (g: GridSpec): CardText => ({
  emoji: "♣️", name: "Flush Royale", consts: [],
  about: sentences(`Try to make flushes. A row or column that is all one ${suitWord(g)} is a flush.`,
    "A flush scores its total value in primary points.", g.say.valueKey(),
    "If its values are also a straight (all different, counting up in any order), it scores triple.",
    `In each row and column, the cells of the commonest ${suitWord(g)} score 1 secondary point each.`),
});
const flushRoyale = gridFamily<Record<string, never>>({
  id: "flush_royale", name: "Flush Royale", emoji: "♣️", theme: "Lines all in one suit",
  requires: { classes: ["Valued", "Ranked"], minColours: 2 }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => flushText(g).about,
  python: (_, g) => pyCard(flushText(g), `
    def suit(cell):
        return ${suitOf(g)}

    def utility(grid):
        score = 0
        nearly = 0
        for line in grid.rows + grid.columns:
            suits = [suit(cell) for cell in line]
            values = [cell.value for cell in line]
            nearly += max(suits.count(s) for s in suits)
            if suits.count(suits[0]) == len(suits):
                straight = len(set(values)) == len(values) and max(values) - min(values) == len(values) - 1
                if straight:
                    score += 3 * sum(values)
                else:
                    score += sum(values)
        return (score, nearly)`),
  typescript: (_, g) => tsCard(flushText(g), `
    function suit(cell) {
      return ${suitOf(g)};
    }

    function count(list, x) {
      return list.filter(y => y === x).length;
    }

    function utility(grid) {
      let score = 0;
      let nearly = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        const suits = line.map(suit);
        const values = line.map(cell => cell.value);
        nearly += Math.max(...suits.map(s => count(suits, s)));
        if (count(suits, suits[0]) === suits.length) {
          let total = 0;
          for (const v of values) total += v;
          const straight = new Set(values).size === values.length
            && Math.max(...values) - Math.min(...values) === values.length - 1;
          score += straight ? 3 * total : total;
        }
      }
      return [score, nearly];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, hi = g.vmax;
    return bestOf("flush_royale", p, ctx, [
      { sym: fromFn(N, (r, c) => symForValue(g, hi - N + 1 + ((r + c) % N))), col: full(N, 0) },
      { sym: full(N, symForValue(g, hi)), col: full(N, 0) }]);
  },
});

// --- Twenty-One -----------------------------------------------------------------------------------------
type TwentyP = { target: number };
/**
 * Number grids: grid-lab draws T uniformly from 2N .. round(0.7·N·(S−1)), up to 61 targets. Calibration enumerates
 * every target, so the product keeps at most 16 of them, evenly spaced and including both ends.
 */
function spread(g: GridSpec): number[] {
  const lo = 2 * g.N, hi = roundHalfEven(0.7 * g.N * (g.S - 1)), n = Math.min(16, hi - lo + 1);
  return [...new Set(range(n).map(k => lo + Math.round((k * (hi - lo)) / Math.max(1, n - 1))))];
}
/**
 * Equal opportunity (docs/rules-design.md P10): the targets of the full range are not peers (on 6×6, base 16, rainbow6
 * the top is 73 bits for target 12 and 52 for 49, and a random board's mean 0.09 vs 1.40 bits: a low target busts almost
 * every hand). Only the middle six of the sixteen spread targets agree within 15% on top bits (and 0.03 bits on the
 * mean) on every shipped shape, so those are the targets.
 */
function targets(g: GridSpec): number[] {
  return g.cards ? [21] : spread(g).slice(6, 12);
}
const twentyText = (p: TwentyP, g: GridSpec): CardText => ({
  emoji: "🃏", name: "Twenty-One", consts: [["TARGET", p.target]],
  about: sentences(`Try to get close to ${p.target} without going bust. Each row and column is a blackjack hand: add it up`
    + (g.cards ? " (J, Q and K count 10; an ace counts 11 unless that would go bust)." : "."), g.cards ? "" : g.say.valueKey(),
    `A hand of ${p.target} or less scores its total in points. Exactly ${p.target} scores ${p.target} more. Going over scores nothing.`),
});
const twentyOne = gridFamily<TwentyP>({
  id: "twenty_one", name: "Twenty-One", emoji: "🃏", theme: "Get close to your target without going bust",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: g => ({ target: intParam("Target total", targets(g)[0], targets(g)[targets(g).length - 1]) }),
  support: g => targets(g).map(target => ({ target })),
  summary: (p, g) => twentyText(p, g).about,
  python: (p, g) => pyCard(twentyText(p, g), `
    def utility(grid):
        score = 0
        for hand in grid.rows + grid.columns:
            total = 0
            for cell in hand:
                total += ${g.cards ? "min(cell.value, 10)" : "cell.value"}${g.cards ? `
            if any(cell.value == 1 for cell in hand) and total + 10 <= TARGET:
                total += 10  # an ace counts 11` : ""}
            if total <= TARGET:
                score += total
                if total == TARGET:
                    score += TARGET
        return score`),
  typescript: (p, g) => tsCard(twentyText(p, g), `
    function utility(grid) {
      let score = 0;
      for (const hand of [...grid.rows, ...grid.columns]) {
        let total = 0;
        for (const cell of hand) total += ${g.cards ? "Math.min(cell.value, 10)" : "cell.value"};${g.cards ? `
        if (hand.some(cell => cell.value === 1) && total + 10 <= TARGET) total += 10;  // an ace counts 11` : ""}
        if (total <= TARGET) {
          score += total;
          if (total === TARGET) score += TARGET;
        }
      }
      return score;
    }`),
  exemplar: (p, g) => {
    const N = g.N, [lo, hi] = g.cards ? [2, 10] : [g.vmin, g.vmax], row = Array<number>(N).fill(lo);
    let rem = p.target - N * lo;
    for (let i = 0; i < N; i++) { const add = Math.min(hi - lo, rem); row[i] += add; rem -= add; }
    return wire(g, fromFn(N, (r, c) => symForValue(g, row[(c + r) % N])), full(N, 0));
  },
});

// --- Go Fish Books ------------------------------------------------------------------------------------------
// Cards keep the rank (any suit): a book IS four of a rank, and a perfect book needs four suits (rules-design.md §3.1).
type FishP = { fish: string };
/** Distinct colours (digits) or suits (cards) a perfect book needs: four, or every colour when the set has fewer. */
const fishPerfect = (g: GridSpec) => (g.cards ? 4 : Math.min(4, g.C));
const fishText = (p: FishP, g: GridSpec): CardText => {
  const r = rankAt(g, p.fish), fish = g.say.rank(r), perfect = fishPerfect(g);
  return {
    emoji: "🐟", name: "Go Fish Books",
    consts: [["MY_FISH", rankValue(g, r), g.cards ? `${RANK_NAMES[rankValue(g, r)] ?? rankValue(g, r)} of any suit` : g.say.tile(r)],
      ["PERFECT", perfect, `different ${g.cards ? "suits" : "colours"} for a perfect book`]],
    about: `Try to collect books of ${fish}, your fish. A book is a 2×2 block of four cells that all show your fish. Each book scores `
      + `1 primary point. A perfect book scores 2 primary points instead: its four cells use ${g.cards ? g.say.distinctSuits(perfect) : g.say.distinctColours(perfect)}. `
      + "Each fish in a 2×2 block scores 1 secondary point (a fish in two blocks counts twice).",
  };
};
const goFish = gridFamily<FishP>({
  id: "go_fish_books", name: "Go Fish Books", emoji: "🐟", theme: "2×2 blocks of your fish", shape: tuple(2),
  requires: { minColours: 2 },
  params: g => ({ fish: choiceParam("Your fish", rankOptions(g)) }),
  support: g => range(g.ranks).map(r => ({ fish: rankName(g, r) })),
  canonical: (_, g) => ({ fish: rankName(g, 0) }),
  summary: (p, g) => fishText(p, g).about,
  top: (_p, g) => [2 * (g.N - 1) ** 2, 4 * (g.N - 1) ** 2],
  example: (p, g) => {
    const r = rankAt(g, p.fish), perfect = fishPerfect(g), mine = g.say.rankPlural(r);
    if (g.cards) return { sym: [[r, 13 + r], [26 + r, 39 + r]], col: full(2, 0), caption: `A perfect book: four ${mine}, one of each suit. 2 points.` };
    return { sym: full(2, r), col: [[0, 1], [2, perfect >= 4 ? 3 : 0]],
      caption: `A perfect book: four ${g.say.tile(r)} cells using ${g.say.distinctColours(perfect)}. 2 points.` };
  },
  python: (p, g) => pyCard(fishText(p, g), `
    def utility(grid):
        books = 0
        fish = 0
        for cell in grid.cells:
            right, below = cell.right, cell.down
            if right is None or below is None:
                continue
            block = [cell, right, below, below.right]
            mine = [other for other in block if other.value == MY_FISH]
            fish += len(mine)
            if len(mine) == 4:
                if len(set(other.${g.cards ? "suit" : "colour"} for other in block)) >= PERFECT:
                    books += 2
                else:
                    books += 1
        return (books, fish)`),
  typescript: (p, g) => tsCard(fishText(p, g), `
    function utility(grid) {
      let books = 0;
      let fish = 0;
      for (const cell of grid.cells) {
        const right = cell.right, below = cell.down;
        if (right === null || below === null) continue;
        const block = [cell, right, below, below.right];
        const mine = block.filter(other => other.value === MY_FISH);
        fish += mine.length;
        if (mine.length === 4) {
          books += new Set(block.map(other => other.${g.cards ? "suit" : "colour"})).size >= PERFECT ? 2 : 1;
        }
      }
      return [books, fish];
    }`),
  exemplar: (p, g) => {
    const N = g.N, rank = rankAt(g, p.fish);
    if (g.cards) return wire(g, fromFn(N, (r, c) => (2 * (r % 2) + (c % 2)) * 13 + rank), full(N, 0));
    return wire(g, full(N, rank), fromFn(N, (r, c) => (g.C >= 4 ? 2 * (r % 2) + (c % 2) : (r + c) % g.C)));
  },
});

// --- Set Spotter --------------------------------------------------------------------------------------------
/**
 * One geometry: across, down and both diagonals. The rule used to deal "diagonals too" as a yes/no param, which only
 * added scoring opportunity to some gods (top 72 vs 61 bits on 4×4): params must make peer rules of equal opportunity
 * (docs/rules-design.md P10), so the richer geometry is the rule and the param is gone.
 */
type SetP = Record<string, never>;
const setText = (_p: SetP, g: GridSpec): CardText => ({
  emoji: "🔺", name: "Set Spotter", consts: [],
  about: sentences("Try to spot SETs. Look at 3 cells in a line (across, down or diagonally).",
    `They are a SET when both of these are true. Their colours are all the same, or ${g.say.distinctColours(3)} are used.`,
    `Their ${g.cards ? "values" : "numbers"} are all the same or evenly spaced (like 2, 5, 8).`, g.say.valueKey(),
    "Each SET scores 1 point."),
});
const setSpotter = gridFamily<SetP>({
  id: "set_spotter", name: "Set Spotter", emoji: "🔺", theme: "Three in a line that make a SET",
  requires: { classes: ["Valued"], minColours: 3 }, shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (p, g) => setText(p, g).about,
  python: (p, g) => pyCard(setText(p, g), `
    def is_set(a, b, c):
        if b is None or c is None:
            return False
        colours = set([a.colour, b.colour, c.colour])
        return len(colours) != 2 and b.value - a.value == c.value - b.value

    def utility(grid):
        sets = 0
        for cell in grid.cells:
            if cell.right is not None and is_set(cell, cell.right, cell.right.right):
                sets += 1
            if cell.down is not None and is_set(cell, cell.down, cell.down.down):
                sets += 1
            if cell.down_right is not None and is_set(cell, cell.down_right, cell.down_right.down_right):
                sets += 1
            if cell.down_left is not None and is_set(cell, cell.down_left, cell.down_left.down_left):
                sets += 1
        return sets`),
  typescript: (p, g) => tsCard(setText(p, g), `
    function isSet(a, b, c) {
      if (b === null || c === null) return false;
      const colours = new Set([a.colour, b.colour, c.colour]);
      return colours.size !== 2 && b.value - a.value === c.value - b.value;
    }

    function utility(grid) {
      let sets = 0;
      for (const cell of grid.cells) {
        if (cell.right !== null && isSet(cell, cell.right, cell.right.right)) sets += 1;
        if (cell.down !== null && isSet(cell, cell.down, cell.down.down)) sets += 1;
        if (cell.downRight !== null && isSet(cell, cell.downRight, cell.downRight.downRight)) sets += 1;
        if (cell.downLeft !== null && isSet(cell, cell.downLeft, cell.downLeft.downLeft)) sets += 1;
      }
      return sets;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Knight Riders -------------------------------------------------------------------------------------------
type KnightP = { colour: string };
const knightText = (p: KnightP, g: GridSpec): CardText => ({
  emoji: "🐴", name: "Knight Riders", consts: p.colour === "any" ? [] : [["MY_COLOUR", p.colour]],
  about: "Try to make twins a knight's jump apart. A chess knight jumps 2 cells one way and 1 cell the other. Two cells a knight's jump apart are twins when they show "
    + `the same ${g.cards ? "card (rank and suit)" : "number"} in the same colour${p.colour === "any" ? "" : `, and that colour is ${p.colour}`}. `
    + "Each pair of twins scores 1 point.",
});
const knightRiders = gridFamily<KnightP>({
  id: "knight_riders", name: "Knight Riders", emoji: "🐴", theme: "Twins a knight's jump apart", shape: SCALAR,
  requires: { minColours: 2 },
  params: g => ({ colour: choiceParam("Twins' colour", colourOrNone(g, ["any", "any colour"])) }),
  support: g => ["any", ...g.colourNames].map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: chance(rng, 1, 2) ? g.colourNames[rng.int(g.C)] : "any" }),
  canonical: (p, g) => recolourSome(g, p, ["colour"]),
  summary: (p, g) => knightText(p, g).about,
  python: (p, g) => pyCard(knightText(p, g), `
    JUMPS = [(1, 2), (2, 1), (2, -1), (1, -2)]  # each pair once: the jumps that land lower down

    def utility(grid):
        twins = 0
        for cell in grid.cells:
            for down, across in JUMPS:
                row, col = cell.row + down, cell.col + across
                if 0 <= row < grid.size and 0 <= col < grid.size:
                    other = grid.cell(row, col)
                    if other.symbol == cell.symbol and other.colour == cell.colour${p.colour === "any" ? "" : " and cell.colour == MY_COLOUR"}:
                        twins += 1
        return twins`),
  typescript: (p, g) => tsCard(knightText(p, g), `
    const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2]];  // each pair once: the jumps that land lower down

    function utility(grid) {
      let twins = 0;
      for (const cell of grid.cells) {
        for (const [down, across] of JUMPS) {
          const row = cell.row + down, col = cell.col + across;
          if (row >= 0 && row < grid.size && col >= 0 && col < grid.size) {
            const other = grid.cell(row, col);
            const twin = other.symbol === cell.symbol && other.colour === cell.colour;
            if (twin${p.colour === "any" ? "" : " && cell.colour === MY_COLOUR"}) twins += 1;
          }
        }
      }
      return twins;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.colour === "any" ? 0 : colourAt(g, p.colour))),
});

// --- Uno Snake ---------------------------------------------------------------------------------------------------
type UnoP = { axis: "rows" | "cols" };
const unoText = (p: UnoP, g: GridSpec): CardText => ({
  emoji: "🐍", name: "Uno Snake", consts: [],
  about: "Try to make a long walk where every step matches. Walk the grid like a Snakes & Ladders board ("
    + (p.axis === "rows" ? "along the first row, back along the next, and so on" : "down the first column, back up the next, and so on")
    + `). A step is good when the two cells match in colour or ${g.cards ? "rank" : "number"}, like Uno. `
    + "Your longest unbroken walk of good steps scores 1 point per cell.",
});
const unoSnake = gridFamily<UnoP>({
  id: "uno_snake", name: "Uno Snake", emoji: "🐍", theme: "A zig-zag walk where every step matches", shape: SCALAR,
  requires: { minColours: 2 },
  analytic: solvedAnalytic("uno_snake"),
  params: () => ({ axis: choiceParam("Walk along", LINE_OPTIONS) }),
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: (p, g) => unoText(p, g).about,
  python: (p, g) => pyCard(unoText(p, g), `
    def walk(grid):
        path = []
        for i, line in enumerate(${p.axis === "rows" ? "grid.rows" : "grid.columns"}):
            if i % 2 == 1:
                line = list(reversed(line))
            path += line
        return path

    def utility(grid):
        path = walk(grid)
        best = 1
        run = 1
        for i in range(1, len(path)):
            a, b = path[i - 1], path[i]
            if a.colour == b.colour or a.value == b.value:
                run += 1
            else:
                run = 1
            best = max(best, run)
        return best`),
  typescript: (p, g) => tsCard(unoText(p, g), `
    function walk(grid) {
      const path = [];
      ${p.axis === "rows" ? "grid.rows" : "grid.columns"}.forEach((line, i) => path.push(...(i % 2 === 1 ? [...line].reverse() : line)));
      return path;
    }

    function utility(grid) {
      const path = walk(grid);
      let best = 1;
      let run = 1;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (a.colour === b.colour || a.value === b.value) run += 1;
        else run = 1;
        best = Math.max(best, run);
      }
      return best;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Court Parade -------------------------------------------------------------------------------------------------
/**
 * Your suit, and a parade is always all in one colour. Both options used to vary: "any one suit" (4× the parades of a
 * named suit, a random board's mean 0.28 vs 0.10 bits) and "all in one colour" yes/no (a restriction only some gods
 * had). Params make peer rules of equal opportunity (docs/rules-design.md P10): the four named suits are peers (a
 * permutation of suits), so they stay; the other options are fixed to the richer rule.
 */
type ParadeP = { suit: string };
const paradeText = (p: ParadeP, g: GridSpec): CardText => ({
  emoji: "🎺", name: "Court Parade", consts: [["MY_SUIT", p.suit]],
  about: `Try to march a parade of your suit. A parade is a Jack, Queen and King of ${g.say.suit(SUIT_NAMES.indexOf(p.suit as never))}, side by side in that order `
    + "along a row or column, all in one colour. A parade scores 1 primary point. "
    + "With your Ace just before the Jack, it scores 2 primary points. "
    + "Each side-by-side Jack-Queen or Queen-King pair of your suit scores 1 secondary point.",
});
const courtParade = gridFamily<ParadeP>({
  id: "court_parade", name: "Court Parade", emoji: "🎺", theme: "J, Q, K of one suit marching in a line",
  requires: { classes: ["Suited", "Faced"], minFaces: 3, minColours: 2 }, shape: tuple(2),
  params: () => ({ suit: choiceParam("Suit of the parade", suitOptions()) }),
  support: () => SUIT_NAMES.map(suit => ({ suit })),
  sample: rng => ({ suit: SUIT_NAMES[rng.int(4)] }),
  canonical: () => ({ suit: SUIT_NAMES[0] }),
  summary: (p, g) => paradeText(p, g).about,
  python: (p, g) => pyCard(paradeText(p, g), `
    def one_suit(cells):
        for cell in cells:
            if cell.suit != cells[0].suit or cell.suit != MY_SUIT:
                return False
        return True

    def utility(grid):
        parades = 0
        pairs = 0
        for line in grid.rows + grid.columns:
            for i in range(len(line) - 1):
                a, b = line[i], line[i + 1]
                if one_suit([a, b]) and ((a.value == 11 and b.value == 12) or (a.value == 12 and b.value == 13)):
                    pairs += 1
            for i in range(len(line) - 2):
                jack, queen, king = line[i], line[i + 1], line[i + 2]
                if jack.value == 11 and queen.value == 12 and king.value == 13 and one_suit([jack, queen, king]):
                    if jack.colour != queen.colour or queen.colour != king.colour:
                        continue
                    parades += 1
                    if i > 0 and line[i - 1].value == 1 and line[i - 1].suit == jack.suit:
                        parades += 1
        return (parades, pairs)`),
  typescript: (p, g) => tsCard(paradeText(p, g), `
    function oneSuit(cells) {
      return cells.every(cell => cell.suit === cells[0].suit && cell.suit === MY_SUIT);
    }

    function utility(grid) {
      let parades = 0;
      let pairs = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1];
          const courtly = (a.value === 11 && b.value === 12) || (a.value === 12 && b.value === 13);
          if (oneSuit([a, b]) && courtly) pairs += 1;
        }
        for (let i = 0; i < line.length - 2; i++) {
          const jack = line[i], queen = line[i + 1], king = line[i + 2];
          if (jack.value === 11 && queen.value === 12 && king.value === 13 && oneSuit([jack, queen, king])) {
            if (jack.colour !== queen.colour || queen.colour !== king.colour) continue;
            parades += 1;
            if (i > 0 && line[i - 1].value === 1 && line[i - 1].suit === jack.suit) parades += 1;
          }
        }
      }
      return [parades, pairs];
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, (r, c) => SUIT_NAMES.indexOf(p.suit as never) * 13 + [0, 10, 11, 12][(r + c) % 4]), full(g.N, 0)),
});

// --- King's Court ------------------------------------------------------------------------------------------------
type CourtRankP = { target: string };
const kingsText = (p: CourtRankP, g: GridSpec): CardText => ({
  emoji: "🤴", name: "King's Court",
  consts: [["MY_VALUE", rankValue(g, rankAt(g, p.target)), g.cards ? RANK_NAMES[rankValue(g, rankAt(g, p.target))] ?? "" : ""]],
  about: `Try to surround your target, ${g.say.rank(rankAt(g, p.target))}, with other colours. Each cell showing it scores 1 point for every cell around it `
    + "(corners too) that is a different colour from it.",
});
const kingsCourt = gridFamily<CourtRankP>({
  id: "kings_court", name: "King's Court", emoji: "🤴", theme: "Your symbol surrounded by every other colour",
  requires: { minColours: 2 },
  shape: SCALAR,
  params: g => ({ target: choiceParam("Your target", rankOptions(g)) }),
  support: g => range(g.ranks).map(r => ({ target: rankName(g, r) })),
  canonical: (_, g) => ({ target: rankName(g, 0) }),
  summary: (p, g) => kingsText(p, g).about,
  python: (p, g) => pyCard(kingsText(p, g), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.value != MY_VALUE:
                continue
            for other in cell.surrounding:
                if other.colour != cell.colour:
                    points += 1
        return points`),
  typescript: (p, g) => tsCard(kingsText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.value !== MY_VALUE) continue;
        for (const other of cell.surrounding) {
          if (other.colour !== cell.colour) points += 1;
        }
      }
      return points;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, sym = full(N, rankAt(g, p.target));
    return climb("kings_court", p, ctx, [(r: number, c: number) => 2 * (r % 2) + (c % 2), (r: number, c: number) => r + c,
      (r: number, c: number) => r + 2 * c, (r: number, c: number) => 2 * r + c].map(f => ({ sym, col: fromFn(N, (r, c) => f(r, c) % g.C) })), 0);
  },
});

// --- Connect Four ------------------------------------------------------------------------------------------------
type FourP = { colour: string };
const fourText = (p: FourP, g: GridSpec): CardText => ({
  emoji: "🔴", name: "Connect Four", consts: [["MY_COLOUR", p.colour]],
  about: `Try to connect four of your ${p.colour} counters. They fall to the bottom, so a counter only stands if every cell below it is `
    + `${p.colour} too. Every group of 4 standing counters in a row (across, down or diagonal) scores 1 primary point. A longer line `
    + "counts every group of 4 in it. Each standing counter scores 1 secondary point.",
});
const connectFour = gridFamily<FourP>({
  id: "connect_four", name: "Connect Four", emoji: "🔴", theme: "Four in a row, stacked from the bottom",
  analytic: solvedAnalytic("connect_four"),
  requires: { minSize: 4, minColours: 2 }, shape: tuple(2),
  params: () => ({ colour: colourParam("Your counters") }),
  support: g => g.colourNames.map(colour => ({ colour })),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => fourText(p, g).about,
  python: (p, g) => pyCard(fourText(p, g), `
    def standing(grid, row, col):
        if not (0 <= row < grid.size and 0 <= col < grid.size):
            return False
        for below in range(row, grid.size):
            if grid.cell(below, col).colour != MY_COLOUR:
                return False
        return True

    def utility(grid):
        rows_of_four = 0
        counters = 0
        for cell in grid.cells:
            if standing(grid, cell.row, cell.col):
                counters += 1
            for down, across in [(0, 1), (1, 0), (1, 1), (1, -1)]:
                if all(standing(grid, cell.row + i * down, cell.col + i * across) for i in range(4)):
                    rows_of_four += 1
        return (rows_of_four, counters)`),
  typescript: (p, g) => tsCard(fourText(p, g), `
    function standing(grid, row, col) {
      if (!(row >= 0 && row < grid.size && col >= 0 && col < grid.size)) return false;
      for (let below = row; below < grid.size; below++) {
        if (grid.cell(below, col).colour !== MY_COLOUR) return false;
      }
      return true;
    }

    function utility(grid) {
      let rowsOfFour = 0;
      let counters = 0;
      for (const cell of grid.cells) {
        if (standing(grid, cell.row, cell.col)) counters += 1;
        for (const [down, across] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const four = [0, 1, 2, 3].every(i => standing(grid, cell.row + i * down, cell.col + i * across));
          if (four) rowsOfFour += 1;
        }
      }
      return [rowsOfFour, counters];
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, colourAt(g, p.colour))),
});

// --- Any-Suit Parade (Court Parade of any one suit) ---------------------------------------------------------------------
/** Court Parade where the Jack, Queen and King may be of any one suit (all in one colour). A split of Court Parade (rules-design.md P10): no params. */
type AnyParadeP = Record<string, never>;
const anyParadeText = (_p: AnyParadeP, _g: GridSpec): CardText => ({
  emoji: "🎪", name: "Any-Suit Parade", consts: [],
  about: "Try to march a parade of any one suit. A parade is a Jack, Queen and King of one suit, side by side in that order "
    + "along a row or column, all in one colour. A parade scores 1 primary point. "
    + "With the Ace of that suit just before the Jack, it scores 2 primary points. "
    + "Each side-by-side Jack-Queen or Queen-King pair of one suit scores 1 secondary point.",
});
const anySuitParade = gridFamily<AnyParadeP>({
  id: "any_suit_parade", name: "Any-Suit Parade", emoji: "🎪", theme: "J, Q, K of any one suit marching in a line",
  requires: { classes: ["Suited", "Faced"], minFaces: 3, minColours: 2 }, shape: tuple(2),
  params: () => ({}),
  support: () => [{}],
  summary: (p, g) => anyParadeText(p, g).about,
  python: (p, g) => pyCard(anyParadeText(p, g), `
    def one_suit(cells):
        for cell in cells:
            if cell.suit != cells[0].suit:
                return False
        return True

    def utility(grid):
        parades = 0
        pairs = 0
        for line in grid.rows + grid.columns:
            for i in range(len(line) - 1):
                a, b = line[i], line[i + 1]
                if one_suit([a, b]) and ((a.value == 11 and b.value == 12) or (a.value == 12 and b.value == 13)):
                    pairs += 1
            for i in range(len(line) - 2):
                jack, queen, king = line[i], line[i + 1], line[i + 2]
                if jack.value == 11 and queen.value == 12 and king.value == 13 and one_suit([jack, queen, king]):
                    if jack.colour != queen.colour or queen.colour != king.colour:
                        continue
                    parades += 1
                    if i > 0 and line[i - 1].value == 1 and line[i - 1].suit == jack.suit:
                        parades += 1
        return (parades, pairs)`),
  typescript: (p, g) => tsCard(anyParadeText(p, g), `
    function oneSuit(cells) {
      return cells.every(cell => cell.suit === cells[0].suit);
    }

    function utility(grid) {
      let parades = 0;
      let pairs = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1];
          const courtly = (a.value === 11 && b.value === 12) || (a.value === 12 && b.value === 13);
          if (oneSuit([a, b]) && courtly) pairs += 1;
        }
        for (let i = 0; i < line.length - 2; i++) {
          const jack = line[i], queen = line[i + 1], king = line[i + 2];
          if (jack.value === 11 && queen.value === 12 && king.value === 13 && oneSuit([jack, queen, king])) {
            if (jack.colour !== queen.colour || queen.colour !== king.colour) continue;
            parades += 1;
            if (i > 0 && line[i - 1].value === 1 && line[i - 1].suit === jack.suit) parades += 1;
          }
        }
      }
      return [parades, pairs];
    }`),
  exemplar: (_, g) => wire(g, fromFn(g.N, (r, c) => [0, 10, 11, 12][(r + c) % 4]), full(g.N, 0)),
});

export const GAMES = [rummyMelder, othello, minesweeper, bingoCaller, sudoku, fullHouse, flushRoyale, twentyOne, goFish,
  setSpotter, knightRiders, unoSnake, courtParade, kingsCourt, connectFour, anySuitParade];
