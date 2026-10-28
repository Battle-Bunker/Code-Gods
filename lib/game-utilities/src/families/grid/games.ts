/** Games-kids-know lens rules (lib/grid-lab/gridlab/rules/games.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import {
  RANK_NAMES, SCALAR, bestOf, chance, choose, climb, cname, fromFn, full, gridFamily, product, pyCard, range,
  recolour, symForValue, thing, tsCard, tuple, wire,
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
    function dabbed(grid, cell) {
      return ${g.N % 2 === 1
    ? "CALLED.includes(cell.value) || cell === grid.cell(Math.floor(grid.size / 2), Math.floor(grid.size / 2))"
    : "CALLED.includes(cell.value)"};
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

export const GAMES = [rummyMelder, othello, minesweeper, bingoCaller, sudoku, fullHouse];
