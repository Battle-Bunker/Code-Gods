/** Games-kids-know lens rules (lib/grid-lab/gridlab/rules/games.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import { roundHalfEven } from "./arithmetic.ts";
import {
  RANK_NAMES, SCALAR, SUIT_NAMES, bestOf, cap, chance, choose, climb, cname, fromFn, full, gridFamily, pick, product,
  pyCard, range, recolour, symForValue, thing, tsCard, tuple, wire,
} from "./_util.ts";

const lineWord = (dir: "rows" | "cols") => (dir === "rows" ? "row" : "column");
const pyLines = (dir: "rows" | "cols") => (dir === "rows" ? "grid.rows" : "grid.columns");

// --- Rummy Melder ------------------------------------------------------------------------------------
type RummyP = { dir: "rows" | "cols" };
const rummyText = (p: RummyP, g: GridSpec): CardText => {
  const suit = g.cards ? "suit" : "colour";
  return {
    emoji: "🃏", name: "Rummy Melder", consts: [],
    about: `Look along each ${lineWord(p.dir)} at 3 cells in a row. They are a meld if they are a set (same `
      + `${thing(g)}, 3 different ${suit}s) or a run (counting up by one, all the same ${suit}). Every cell in a meld `
      + "scores its value. If that's a tie, count touching pairs that could start a meld.",
  };
};
const rummyMelder = gridFamily<RummyP>({
  id: "rummy_melder", name: "Rummy Melder", emoji: "🃏", theme: "Sets and runs, like rummy",
  requires: { classes: ["Valued", "Ranked"] }, shape: tuple(2), tags: ["shortlist"],
  support: () => [{ dir: "rows" }, { dir: "cols" }],
  canonical: () => ({ dir: "rows" }),
  summary: (p, g) => `Look at every 3 cells in a ${lineWord(p.dir)}. Three of the same `
    + `number in three different ${g.cards ? "suits" : "colours"} is a set; three counting up in one `
    + `${g.cards ? "suit" : "colour"} is a run. Every cell in a set or run scores its number.`,
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
        for line in ${pyLines(p.dir)}:
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
      for (const line of ${pyLines(p.dir)}) {
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
    const pos = (r: number, c: number) => (p.dir === "rows" ? c : r);
    if (g.cards) return wire(g, fromFn(g.N, (r, c) => (pos(r, c) % 4) * 13 + 12), full(g.N, 0));
    return wire(g, full(g.N, g.vmax), fromFn(g.N, (r, c) => pos(r, c) % g.C));
  },
});

// --- Othello Sandwich ----------------------------------------------------------------------------------
type SandP = { X: number; diag: boolean };
const sandText = (p: SandP, g: GridSpec): CardText => ({
  emoji: "🥪", name: "Sandwich Maker", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: "A cell is sandwiched when the cells on both sides of it ("
    + (p.diag ? "left and right, or above and below, or the two corners on either diagonal" : "left and right, or above and below")
    + `) are ${cname(g, p.X)} and it isn't. Each sandwich is a point.`,
});
const othello = gridFamily<SandP>({
  id: "othello_sandwich", name: "Othello Sandwich", emoji: "🥪", theme: "Capture cells between two of yours",
  shape: SCALAR, tags: ["shortlist"],
  support: g => product<SandP>({ X: range(g.C), diag: [false, true] }),
  sample: (rng, g) => ({ X: rng.int(g.C), diag: chance(rng, 1, 2) }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `Every single cell of another colour trapped between two ${cname(g, p.X)} cells in a line `
    + `(across or down${p.diag ? ", or diagonally" : ""}) is captured: one point each.`,
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
                sandwiches += 1${p.diag ? `
            if is_mine(cell.up_left) and is_mine(cell.down_right):
                sandwiches += 1
            if is_mine(cell.up_right) and is_mine(cell.down_left):
                sandwiches += 1` : ""}
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
        if (isMine(cell.up) && isMine(cell.down)) sandwiches += 1;${p.diag ? `
        if (isMine(cell.upLeft) && isMine(cell.downRight)) sandwiches += 1;
        if (isMine(cell.upRight) && isMine(cell.downLeft)) sandwiches += 1;` : ""}
      }
      return sandwiches;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, X = p.X, o = (X + 1) % g.C, z = full(N, 0);
    const cands: Cand[] = [
      { sym: z, col: fromFn(N, (r, c) => ((r + c) % 2 === 0 ? X : o)) },
      { sym: z, col: fromFn(N, (_, c) => (c % 2 === 0 ? X : o)) },
      { sym: z, col: fromFn(N, (r, c) => (r % 2 === 0 || c % 2 === 0 ? X : o)) },
    ];
    return climb("othello_sandwich", p, ctx, cands, 3);
  },
});

// --- Honest Minesweeper ---------------------------------------------------------------------------------
type MineP = { X: number };
const mineText = (p: MineP, g: GridSpec): CardText => ({
  emoji: "💣", name: "Honest Minesweeper", consts: [["MINE", cname(g, p.X)]],
  about: `${cname(g, p.X)[0].toUpperCase()}${cname(g, p.X).slice(1)} cells are mines. Any other cell is honest when its `
    + `${thing(g)} equals how many mines surround it (corners count). Each honest cell scores its value.`,
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
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `Your ${cname(g, p.X)} cells are mines. Every other cell whose number says exactly how many `
    + "mines touch it (corners too) scores that number.",
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
    const N = g.N, X = p.X, o = (X + 1) % g.C, have = new Set(g.value);
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
type BingoP = { called: readonly number[] };
function* combinations(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= n - k; i++) for (const rest of combinations(n, k - 1, i + 1)) yield [i, ...rest];
}
const calledCount = (g: GridSpec) => Math.ceil(g.ranks / 3);
const rankValue = (g: GridSpec, rank: number) => (g.cards ? rank + 1 : rank);
const bingoText = (p: BingoP, g: GridSpec): CardText => {
  const called = p.called.map(r => rankValue(g, r)), free = g.N % 2 === 1;
  return {
    emoji: "🎱", name: "Bingo Caller",
    consts: [["CALLED", called, g.cards ? called.map(v => RANK_NAMES[v] ?? String(v)).join(", ") : ""]],
    about: `Dab every cell showing a called ${thing(g)}${g.cards ? " (any suit)" : ""}.${free ? " The middle cell is a free space." : ""} `
      + `Each dab is a point, and every complete row, column or long diagonal is BINGO: ${g.N} more points.`,
  };
};
const bingoCaller = gridFamily<BingoP>({
  id: "bingo_caller", name: "Bingo Caller", emoji: "🎱", theme: "Dab your called numbers",
  shape: SCALAR, tags: ["shortlist"],
  support: g => [...combinations(g.ranks, calledCount(g))].map(called => ({ called })),
  sample: (rng, g) => ({ called: choose(rng, range(g.ranks), calledCount(g)).sort((a, b) => a - b) }),
  canonical: p => ({ called: range(p.called.length) }),
  summary: (p, g) => "Your called numbers are "
    + p.called.map(r => (g.cards ? ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][r] : "0123456789ABCDEF"[r])).join(", ")
    + (g.cards ? " (any suit)" : "") + ". Dab every cell showing one" + (g.N % 2 ? " (the centre is a free space)" : "")
    + `. Each dab is a point; a full row, column or long diagonal is BINGO for ${g.N} more.`,
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
  exemplar: (p, g) => wire(g, full(g.N, p.called[0]), full(g.N, 0)),
});

// --- Sudoku Scholar ---------------------------------------------------------------------------------------
type SudokuP = { dir: "rows" | "cols" | "both" };
const SUDOKU_AXIS = { rows: ["grid.rows", "[...grid.rows]", "row"], cols: ["grid.columns", "[...grid.columns]", "column"],
  both: ["grid.rows + grid.columns", "[...grid.rows, ...grid.columns]", "row and column"] } as const;
const sudokuText = (p: SudokuP, g: GridSpec): CardText => {
  const word = g.cards ? "rank" : "number";
  return {
    emoji: "🔢", name: "Sudoku Scholar", consts: [],
    about: g.N <= 4
      ? `All or nothing: you score only if no ${word} appears twice in any row, column or long diagonal.`
      : `Every ${SUDOKU_AXIS[p.dir][2]} where no ${word} appears twice scores a point. If that's a tie, more `
        + `different ${word}s in each line is better.`,
  };
};
const sudoku = gridFamily<SudokuP>({
  id: "sudoku_scholar", name: "Sudoku Scholar", emoji: "🔢", theme: "No number twice in a line",
  // All or nothing at N <= 4: grid-lab pads the tuple with a constant 0, the card returns 0 or 1.
  shape: g => (g.N <= 4 ? SCALAR : tuple(2)), tags: ["shortlist"],
  support: () => (["rows", "cols", "both"] as const).map(dir => ({ dir })),
  canonical: (p, g) => ({ dir: g.N <= 4 || p.dir === "both" ? "both" : "rows" }),
  summary: (p, g) => (g.N <= 4
    ? "All or nothing: you score only if no number appears twice in any row, column or long diagonal."
    : `Score a point for every ${SUDOKU_AXIS[p.dir][2]} where no number appears twice; more different numbers is better.`)
    + (g.cards ? " Cards compare rank only." : ""),
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
        for line in ${SUDOKU_AXIS[p.dir][0]}:
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
      for (const line of ${SUDOKU_AXIS[p.dir][1]}) {
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
type HouseP = { dir: "rows" | "cols" };
const houseText = (p: HouseP, g: GridSpec): CardText => ({
  emoji: "🏠", name: "Full House", consts: [],
  about: `In each ${lineWord(p.dir)}, every pair of cells showing the same ${g.cards ? "rank" : "number"} scores a point `
    + "(three of a kind makes 3 pairs, four makes 6).",
});
const fullHouse = gridFamily<HouseP>({
  id: "full_house", name: "Full House", emoji: "🏠", theme: "Rows read like poker hands",
  shape: SCALAR, tags: ["shortlist"],
  support: () => [{ dir: "rows" }, { dir: "cols" }],
  canonical: () => ({ dir: "rows" }),
  summary: p => `Read each ${lineWord(p.dir)} like a poker hand. Every pair of `
    + "matching numbers in it scores a point (three of a kind = 3, four of a kind = 6).",
  python: (p, g) => pyCard(houseText(p, g), `
    def utility(grid):
        pairs = 0
        for line in ${pyLines(p.dir)}:
            for i in range(len(line)):
                for j in range(i + 1, len(line)):
                    if line[i].value == line[j].value:
                        pairs += 1
        return pairs`),
  typescript: (p, g) => tsCard(houseText(p, g), `
    function utility(grid) {
      let pairs = 0;
      for (const line of ${pyLines(p.dir)}) {
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
type MaybeColour = number | null;

// --- Flush Royale -------------------------------------------------------------------------------------
const flushText = (g: GridSpec): CardText => ({
  emoji: "♣️", name: "Flush Royale", consts: [],
  about: `A row or column whose cells are all one ${suitWord(g)} is a flush and scores the total of its numbers; if its `
    + "numbers are also a straight (all in a run, any order) it scores triple. If that's a tie, count the commonest "
    + `${suitWord(g)} in each line.`,
});
const flushRoyale = gridFamily<Record<string, never>>({
  id: "flush_royale", name: "Flush Royale", emoji: "♣️", theme: "Lines all in one suit",
  requires: { classes: ["Valued", "Ranked"] }, shape: tuple(2),
  support: () => [{}],
  summary: (_, g) => `A row or column whose cells are all one ${suitWord(g)} is a flush and scores the total of its `
    + "numbers; if its numbers are also a straight (all in a run, any order) it scores triple.",
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
type TwentyP = { T: number };
/**
 * Number grids: grid-lab draws T uniformly from 2N .. round(0.7·N·(S−1)), up to 61 targets. Calibration enumerates
 * every target, so the product keeps at most 16 of them, evenly spaced and including both ends.
 */
function targets(g: GridSpec): number[] {
  if (g.cards) return [21];
  const lo = 2 * g.N, hi = roundHalfEven(0.7 * g.N * (g.S - 1)), n = Math.min(16, hi - lo + 1);
  return [...new Set(range(n).map(k => lo + Math.round((k * (hi - lo)) / Math.max(1, n - 1))))];
}
const twentyText = (p: TwentyP, g: GridSpec): CardText => ({
  emoji: "🃏", name: "Twenty-One", consts: [["TARGET", p.T]],
  about: "Each row and column is a blackjack hand: add it up"
    + (g.cards ? " (J, Q and K count 10; an ace counts 11 unless that would go bust)" : "")
    + `. A hand of ${p.T} or less scores its total, exactly ${p.T} scores ${p.T} more, and going over scores nothing.`,
});
const twentyOne = gridFamily<TwentyP>({
  id: "twenty_one", name: "Twenty-One", emoji: "🃏", theme: "Get close to your target without going bust",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => targets(g).map(T => ({ T })),
  summary: (p, g) => "Each row and column is a blackjack hand: add it up"
    + (g.cards ? " (J, Q, K count 10; an ace counts 11 unless that busts)" : "")
    + `. A hand of ${p.T} or less scores its total, exactly ${p.T} scores ${p.T} more, and going over scores nothing.`,
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
    let rem = p.T - N * lo;
    for (let i = 0; i < N; i++) { const add = Math.min(hi - lo, rem); row[i] += add; rem -= add; }
    return wire(g, fromFn(N, (r, c) => symForValue(g, row[(c + r) % N])), full(N, 0));
  },
});

// --- Go Fish Books ------------------------------------------------------------------------------------------
type FishP = { r: number };
const fishText = (p: FishP, g: GridSpec): CardText => ({
  emoji: "🐟", name: "Go Fish Books",
  consts: [["MY_FISH", rankValue(g, p.r), g.cards ? RANK_NAMES[rankValue(g, p.r)] ?? "" : ""], ["PERFECT", g.cards ? 4 : Math.min(4, g.C)]],
  about: `Your fish is the ${thing(g)} worth ${rankValue(g, p.r)}${g.cards ? " (any suit)" : ""}. Every 2×2 block of four `
    + `of them is a book (1 point), or a perfect book (2 points) with PERFECT different ${suitWord(g)}s. If that's a tie, `
    + "count your fish in every 2×2 block.",
});
const goFish = gridFamily<FishP>({
  id: "go_fish_books", name: "Go Fish Books", emoji: "🐟", theme: "2×2 blocks of your fish", shape: tuple(2),
  support: g => range(g.ranks).map(r => ({ r })),
  canonical: () => ({ r: 0 }),
  summary: (p, g) => `Your fish is the ${thing(g)} worth ${rankValue(g, p.r)}${g.cards ? " (any suit)" : ""}. Every 2×2 `
    + `block of four of them is a book (1 point), or a perfect book (2 points) if they are all different ${suitWord(g)}s.`,
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
    const N = g.N;
    if (g.cards) return wire(g, fromFn(N, (r, c) => (2 * (r % 2) + (c % 2)) * 13 + p.r), full(N, 0));
    return wire(g, full(N, p.r), fromFn(N, (r, c) => (g.C >= 4 ? 2 * (r % 2) + (c % 2) : (r + c) % 3)));
  },
});

// --- Set Spotter --------------------------------------------------------------------------------------------
type SetP = { diag: boolean };
const setText = (p: SetP): CardText => ({
  emoji: "🔺", name: "Set Spotter", consts: [],
  about: `Three cells in a line (across or down${p.diag ? ", or diagonally" : ""}) are a SET if their colours are all the `
    + "same or all different AND their numbers are all the same or evenly spaced (like 2, 5, 8). Each SET scores a point.",
});
const setSpotter = gridFamily<SetP>({
  id: "set_spotter", name: "Set Spotter", emoji: "🔺", theme: "Three in a line that make a SET",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: () => [{ diag: false }, { diag: true }],
  sample: rng => ({ diag: chance(rng, 1, 2) }),
  summary: p => setText(p).about,
  python: p => pyCard(setText(p), `
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
                sets += 1${p.diag ? `
            if cell.down_right is not None and is_set(cell, cell.down_right, cell.down_right.down_right):
                sets += 1
            if cell.down_left is not None and is_set(cell, cell.down_left, cell.down_left.down_left):
                sets += 1` : ""}
        return sets`),
  typescript: p => tsCard(setText(p), `
    function isSet(a, b, c) {
      if (b === null || c === null) return false;
      const colours = new Set([a.colour, b.colour, c.colour]);
      return colours.size !== 2 && b.value - a.value === c.value - b.value;
    }

    function utility(grid) {
      let sets = 0;
      for (const cell of grid.cells) {
        if (cell.right !== null && isSet(cell, cell.right, cell.right.right)) sets += 1;
        if (cell.down !== null && isSet(cell, cell.down, cell.down.down)) sets += 1;${p.diag ? `
        if (cell.downRight !== null && isSet(cell, cell.downRight, cell.downRight.downRight)) sets += 1;
        if (cell.downLeft !== null && isSet(cell, cell.downLeft, cell.downLeft.downLeft)) sets += 1;` : ""}
      }
      return sets;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Knight Riders -------------------------------------------------------------------------------------------
type KnightP = { X: MaybeColour };
const knightText = (p: KnightP, g: GridSpec): CardText => ({
  emoji: "🐴", name: "Knight Riders", consts: p.X === null ? [] : [["MY_COLOUR", cname(g, p.X)]],
  about: "Every pair of cells a chess knight's jump apart that are exact twins (same symbol and same colour"
    + (p.X === null ? "" : `, and ${cname(g, p.X)}`) + ") scores a point.",
});
const knightRiders = gridFamily<KnightP>({
  id: "knight_riders", name: "Knight Riders", emoji: "🐴", theme: "Twins a knight's jump apart", shape: SCALAR,
  support: g => [null, ...range(g.C)].map(X => ({ X })),
  sample: (rng, g) => ({ X: chance(rng, 1, 2) ? rng.int(g.C) : null }),
  canonical: p => recolour(p, ["X"]),
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
                    if other.symbol == cell.symbol and other.colour == cell.colour${p.X === null ? "" : " and cell.colour == MY_COLOUR"}:
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
            if (twin${p.X === null ? "" : " && cell.colour === MY_COLOUR"}) twins += 1;
          }
        }
      }
      return twins;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.X ?? 0)),
});

// --- Uno Snake ---------------------------------------------------------------------------------------------------
type UnoP = { axis: "rows" | "cols" };
const unoText = (p: UnoP): CardText => ({
  emoji: "🐍", name: "Uno Snake", consts: [],
  about: "Walk the grid like a Snakes & Ladders board ("
    + (p.axis === "rows" ? "along the first row, back along the next, and so on" : "down the first column, back up the next, and so on")
    + "). Each step must match the colour or the number, like Uno. Score your longest unbroken walk.",
});
const unoSnake = gridFamily<UnoP>({
  id: "uno_snake", name: "Uno Snake", emoji: "🐍", theme: "A zig-zag walk where every step matches", shape: SCALAR,
  support: () => [{ axis: "rows" }, { axis: "cols" }],
  canonical: () => ({ axis: "rows" }),
  summary: p => unoText(p).about,
  python: p => pyCard(unoText(p), `
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
  typescript: p => tsCard(unoText(p), `
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
type ParadeP = { suit: number | null; match: boolean };
const paradeText = (p: ParadeP): CardText => ({
  emoji: "🎺", name: "Court Parade", consts: p.suit === null ? [] : [["MY_SUIT", SUIT_NAMES[p.suit]]],
  about: `A Jack, Queen and King of the same suit${p.suit === null ? "" : " (your suit)"} standing in that order (left to `
    + `right or top to bottom)${p.match ? " and all one colour" : ""} is a parade; with its Ace just before the Jack it `
    + "scores double. If that's a tie, count Jack-Queen and Queen-King pairs in a row.",
});
const courtParade = gridFamily<ParadeP>({
  id: "court_parade", name: "Court Parade", emoji: "🎺", theme: "J, Q, K of one suit marching in a line",
  requires: { classes: ["Suited", "Faced"] }, shape: tuple(2),
  support: () => product<ParadeP>({ suit: [null, 0, 1, 2, 3], match: [false, true] }),
  sample: rng => ({ suit: chance(rng, 1, 2) ? null : rng.int(4), match: chance(rng, 3, 10) }),
  canonical: p => ({ suit: p.suit === null ? null : 0, match: p.match }),
  summary: p => "A Jack, Queen and King of the same suit" + (p.suit === null ? "" : ` (${"♠♥♦♣"[p.suit]})`)
    + " standing in that order (left to right or top to bottom)" + (p.match ? " and all one colour" : "")
    + " is a parade; with its Ace just before the Jack it's a grand parade worth double.",
  python: p => pyCard(paradeText(p), `
    def one_suit(cells):
        for cell in cells:
            if cell.suit != cells[0].suit${p.suit === null ? "" : " or cell.suit != MY_SUIT"}:
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
                if jack.value == 11 and queen.value == 12 and king.value == 13 and one_suit([jack, queen, king]):${p.match ? `
                    if jack.colour != queen.colour or queen.colour != king.colour:
                        continue` : ""}
                    parades += 1
                    if i > 0 and line[i - 1].value == 1 and line[i - 1].suit == jack.suit:
                        parades += 1
        return (parades, pairs)`),
  typescript: p => tsCard(paradeText(p), `
    function oneSuit(cells) {
      return cells.every(cell => cell.suit === cells[0].suit${p.suit === null ? "" : " && cell.suit === MY_SUIT"});
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
          if (jack.value === 11 && queen.value === 12 && king.value === 13 && oneSuit([jack, queen, king])) {${p.match ? `
            if (jack.colour !== queen.colour || queen.colour !== king.colour) continue;` : ""}
            parades += 1;
            if (i > 0 && line[i - 1].value === 1 && line[i - 1].suit === jack.suit) parades += 1;
          }
        }
      }
      return [parades, pairs];
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, (r, c) => (p.suit ?? 0) * 13 + [0, 10, 11, 12][(r + c) % 4]), full(g.N, 0)),
});

// --- King's Court ------------------------------------------------------------------------------------------------
type CourtRankP = { r: number };
const kingsText = (p: CourtRankP, g: GridSpec): CardText => ({
  emoji: "🤴", name: "King's Court",
  consts: [["MY_VALUE", rankValue(g, p.r), g.cards ? RANK_NAMES[rankValue(g, p.r)] ?? "" : ""]],
  about: `Every cell worth ${rankValue(g, p.r)}${g.cards ? " (any suit)" : ""} scores a point for each of the cells around `
    + "it (corners too) that is a different colour from it.",
});
const kingsCourt = gridFamily<CourtRankP>({
  id: "kings_court", name: "King's Court", emoji: "🤴", theme: "Your symbol surrounded by every other colour",
  shape: SCALAR,
  support: g => range(g.ranks).map(r => ({ r })),
  canonical: () => ({ r: 0 }),
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
    const N = g.N, sym = full(N, p.r);
    return climb("kings_court", p, ctx, [(r: number, c: number) => 2 * (r % 2) + (c % 2), (r: number, c: number) => r + c,
      (r: number, c: number) => r + 2 * c, (r: number, c: number) => 2 * r + c].map(f => ({ sym, col: fromFn(N, (r, c) => f(r, c) % g.C) })), 0);
  },
});

// --- Connect Four ------------------------------------------------------------------------------------------------
type FourP = { X: number };
const fourText = (p: FourP, g: GridSpec): CardText => ({
  emoji: "🔴", name: "Connect Four", consts: [["MY_COLOUR", cname(g, p.X)]],
  about: `Your counters are ${cname(g, p.X)} and they fall to the bottom: a counter only stands if everything below it is `
    + `${cname(g, p.X)} too. Score every four-in-a-row of standing counters (across, down or diagonal); if that's a tie, `
    + "count standing counters.",
});
const connectFour = gridFamily<FourP>({
  id: "connect_four", name: "Connect Four", emoji: "🔴", theme: "Four in a row, stacked from the bottom",
  requires: { minSize: 4 }, shape: tuple(2),
  support: g => range(g.C).map(X => ({ X })),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => `Your counters are ${cname(g, p.X)} and they fall to the bottom: a counter only stands if everything `
    + `below it is ${cname(g, p.X)} too. Score every four-in-a-row of standing counters (across, down or diagonal).`,
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
  exemplar: (p, g) => wire(g, full(g.N, 0), full(g.N, p.X)),
});

export const GAMES = [rummyMelder, othello, minesweeper, bingoCaller, sudoku, fullHouse, flushRoyale, twentyOne, goFish,
  setSpotter, knightRiders, unoSnake, courtParade, kingsCourt, connectFour];
