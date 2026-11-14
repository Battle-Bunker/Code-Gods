/**
 * The grid's description for the shipped agents (grid-starters.ts), beside the line's (catalogue.ts): for every grid
 * family (lib/v2-grid, docs/engine-v2/grids.md §6), how an agent scores a 4×4 board itself (its main part and each
 * tie-breaker, in both languages), and which moves can raise each tie-breaker without spoiling the main part.
 *
 * An agent reads the board once as `b`, its 16 numbers row by row (b[4·r + c] is row r, column c, both from 0). Scores
 * mirror lib/v2-grid's families exactly (the starters test checks every one against the engine's evaluation on sampled
 * boards). Moves are simulated in the agent's own head by the snippets in GRID_LENSES, through the one helper every
 * grid agent defines, `edit(b, cells, f)`: the board after adding f(0), f(1), … to the cells listed, or null past
 * 0 … 9. Moves that rearrange a line (tally.rotate, mirror.reverse) and turn.spin get a lens when a family needs one.
 */

/** Code lines in each language. */
export interface GridLines { readonly ts: readonly string[]; readonly py: readonly string[] }

/** A way to change the board, as the agent predicts it: snippets that add [plan, board after] pairs to `tries`. */
export interface GridLens {
  readonly comment: string;
  /** True: the snippet uses an amount k, and goes inside the loop over k. */
  readonly k: boolean;
  readonly ts: string;
  readonly py: readonly string[];
  /**
   * The tables and helpers the snippet needs (LINE and LINES: rows then columns; BOXES: the four corner boxes; add:
   * `add(i, k)`, the move that adds k to cell i).
   */
  readonly needs?: readonly ("lines" | "boxes" | "add")[];
}

export const GRID_LENSES = {
  add: {
    comment: "add k to one cell", k: true, needs: ["add"],
    ts: `for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);`,
    py: ["for i in range(16):", `    tries.append((add(i, k), edit(b, [i], lambda j: k)))`],
  },
  trade: {
    comment: "move k from one cell to another (their total is kept)", k: true, needs: ["add"],
    ts: `for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, -k)], edit(b, [i, i2], j => (j ? -k : k))]);`,
    py: [
      "for i in range(16):",
      "    for i2 in range(i + 1, 16):",
      `        tries.append(([add(i, k), add(i2, -k)], edit(b, [i, i2], lambda j: -k if j else k)))`,
    ],
  },
  twin: {
    comment: "add k to two cells at once", k: true, needs: ["add"],
    ts: `for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, k)], edit(b, [i, i2], j => k)]);`,
    py: [
      "for i in range(16):",
      "    for i2 in range(i + 1, 16):",
      `        tries.append(([add(i, k), add(i2, k)], edit(b, [i, i2], lambda j: k)))`,
    ],
  },
  line: {
    comment: "add k to every cell of a row or column", k: true, needs: ["lines"],
    ts: `for (let i = 0; i < 8; i++) tries.push([move("tally.add", { line: LINE[i], k }), edit(b, LINES[i], j => k)]);`,
    py: ["for i in range(8):", `    tries.append((move("tally.add", line=LINE[i], k=k), edit(b, LINES[i], lambda j: k)))`],
  },
  tilt: {
    comment: "make every step along a row or column bigger by k", k: true, needs: ["lines"],
    ts: `for (let i = 0; i < 8; i++) tries.push([move("steps.tilt", { line: LINE[i], k }), edit(b, LINES[i], j => j * k)]);`,
    py: ["for i in range(8):", `    tries.append((move("steps.tilt", line=LINE[i], k=k), edit(b, LINES[i], lambda j: j * k)))`],
  },
  balance: {
    comment: "move k from a cell to its opposite, a half turn away (their total is kept)", k: true,
    ts: `for (let i = 0; i < 8; i++) tries.push([move("turn.balance", { pair: "pair" + i, k }), edit(b, [i, 15 - i], j => (j ? -k : k))]);`,
    py: ["for i in range(8):", `    tries.append((move("turn.balance", pair="pair" + str(i), k=k), edit(b, [i, 15 - i], lambda j: -k if j else k)))`],
  },
  box: {
    comment: "add k to every cell of a corner box", k: true, needs: ["boxes"],
    ts: `for (let i = 0; i < 4; i++) tries.push([move("boxes.add", { box: "box" + i, k }), edit(b, BOXES[i], j => k)]);`,
    py: ["for i in range(4):", `    tries.append((move("boxes.add", box="box" + str(i), k=k), edit(b, BOXES[i], lambda j: k)))`],
  },
  swap: {
    comment: "swap two cells (the same as moving their difference from one to the other)", k: false,
    ts: `for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) { const d = b[i2] - b[i]; tries.push([move("cells.swap", { a: NAME[i], b: NAME[i2] }), edit(b, [i, i2], j => (j ? -d : d))]); }`,
    py: [
      "for i in range(16):",
      "    for i2 in range(i + 1, 16):",
      "        d = b[i2] - b[i]",
      `        tries.append((move("cells.swap", a=NAME[i], b=NAME[i2]), edit(b, [i, i2], lambda j: -d if j else d)))`,
    ],
  },
} satisfies Record<string, GridLens>;
export type GridLensId = keyof typeof GRID_LENSES;

export interface GridTieBreakerEntry {
  /** The tie-breaker's part of the score: one expression in each language, of the board b. */
  readonly ts: string;
  readonly py: string;
  /** Lines to compute first, if the expression needs them. */
  readonly pre?: GridLines;
  /** In plain words, for the comment beside it. */
  readonly says: string;
  /** The moves the example tries: they can raise this tie-breaker while the main part stays at its best. */
  readonly lenses: readonly GridLensId[];
  /** How far one change may go (k from 1 to steps, both ways). */
  readonly steps: number;
  /** The example's one "Try this:" change. */
  readonly tryThis: string;
}

export interface GridFamilyEntry {
  readonly family: string;
  /** Lines computing `main` from the board b (and the rule's numbers p). */
  readonly main: GridLines;
  readonly mainSays: string;
  readonly tieBreakers: Readonly<Record<string, GridTieBreakerEntry>>;
  /** The Simple starter's moves besides adding to one cell, and the Bold starter's besides its two-cell moves. */
  readonly simple: readonly GridLensId[];
  /** The tables the score reads (as GridLens.needs). */
  readonly needs?: readonly ("lines" | "boxes")[];
}

const PRIMES_TS = "b.filter(x => [2, 3, 5, 7].includes(x)).length", PRIMES_PY = "len([x for x in b if x in (2, 3, 5, 7)])";
const primesTie = (lenses: readonly GridLensId[], tryThis: string, steps = 3): GridTieBreakerEntry =>
  ({ ts: PRIMES_TS, py: PRIMES_PY, says: "more cells holding 2, 3, 5 or 7 is better", lenses, steps, tryThis });
const zerosTie = (lenses: readonly GridLensId[], tryThis: string, steps = 3): GridTieBreakerEntry =>
  ({ ts: "b.filter(x => x === 0).length", py: "b.count(0)", says: "more 0s is better", lenses, steps, tryThis });
const CORNERS = { ts: "b[0] + b[3] + b[12] + b[15]", py: "b[0] + b[3] + b[12] + b[15]" };
const FIRST_COLUMN = { ts: "b[0] + b[4] + b[8] + b[12]", py: "b[0] + b[4] + b[8] + b[12]" };
const oddTie = (lenses: readonly GridLensId[], tryThis: string, steps = 2): GridTieBreakerEntry =>
  ({ ts: "b.filter(x => x % 2).length", py: "len([x for x in b if x % 2])", says: "more odd numbers is better", lenses, steps, tryThis });

/**
 * The beginner pool's eight families (owner decision 22), then the second pool's Box Totals. Each family of lib/v2-grid
 * without an entry here shows as "no shipped agents yet" in the grid test (gridUndescribed()).
 */
export const GRID_CATALOGUE: readonly GridFamilyEntry[] = [
  {
    family: "mirrormancer", simple: ["twin"],
    mainSays: "how far each row is from reading the same backwards, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (let r = 0; r < 16; r += 4) main -= Math.abs(b[r] - b[r + 3]) + Math.abs(b[r + 1] - b[r + 2]);   // each row: its ends' gap and its middle's gap"],
      py: ["main = 0", "for r in range(0, 16, 4):   # each row: its ends' gap and its middle's gap", "    main -= abs(b[r] - b[r + 3]) + abs(b[r + 1] - b[r + 2])"],
    },
    tieBreakers: {
      middle: { ts: "b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14]", py: "b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14]", says: "bigger middle columns are better", lenses: ["add", "line"], steps: 3, tryThis: "remove the \"line\" line: can it raise the middle without a whole row at once?" },
      primes: primesTie(["add", "twin"], "change FAR = 2 to 3 so two cells can jump to a prime together (it thinks longer: mind the step limit).", 2),
      zeros: zerosTie(["add", "twin"], "add the \"line\" line from the Mirrormancer middle example: a whole row can drop at once.", 2),
    },
  },
  {
    family: "magic-eighteen", simple: ["line"],
    mainSays: "how far the rows' totals are from T, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (let r = 0; r < 16; r += 4) main -= Math.abs(b[r] + b[r + 1] + b[r + 2] + b[r + 3] - p.T);   // each row: how far its total is from T"],
      py: ["main = 0", "for r in range(0, 16, 4):   # each row: how far its total is from T", "    main -= abs(b[r] + b[r + 1] + b[r + 2] + b[r + 3] - p[\"T\"])"],
    },
    tieBreakers: {
      "first-column": { ...FIRST_COLUMN, says: "a bigger first column is better", lenses: ["add", "line", "swap"], steps: 3, tryThis: "remove the \"swap\" line: can it fill the first column without rearranging a row?" },
      primes: primesTie(["add", "line", "trade"], "change FAR = 2 to 1: moving 1 from cell to cell is cheapest, but does it still find primes?", 2),
      odd: oddTie(["add", "line", "trade"], "remove the \"line\" line: can it fix the rows one cell at a time just as cheaply?"),
    },
  },
  {
    family: "opposite-nines", simple: ["balance"],
    mainSays: "how far each cell and its opposite are from adding up to T, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (let i = 0; i < 8; i++) main -= Math.abs(b[i] + b[15 - i] - p.T);   // cell i and its opposite, 15 - i"],
      py: ["main = 0", "for i in range(8):   # cell i and its opposite, 15 - i", "    main -= abs(b[i] + b[15 - i] - p[\"T\"])"],
    },
    tieBreakers: {
      "top-half": { ts: "b.slice(0, 8).reduce((t, x) => t + x, 0)", py: "sum(b[:8])", says: "a bigger top half is better", lenses: ["add", "balance"], steps: 4, tryThis: "change FAR = 4 to 9: one balance move can carry a whole pair's total to the top." },
      primes: { ts: PRIMES_TS, py: PRIMES_PY, says: "more cells holding 2, 3, 5 or 7 is better", lenses: ["add", "balance"], steps: 4, tryThis: "add the \"swap\" line from the Two Pair corners example and compare what it spends." },
      odd: oddTie(["add", "balance"], "change FAR = 3 to 1: one step makes an even number odd.", 3),
    },
  },
  {
    family: "two-pair", simple: ["swap"], needs: ["boxes"],
    mainSays: "how far each corner box is from holding two different pairs, added up (closer is better)",
    main: {
      ts: [
        "let main = 0;",
        "for (const x of BOXES) {                        // each box: the best way to pair its four numbers",
        "  const [w, y, z, u] = x.map(i => b[i]);",
        "  main -= Math.min(Math.abs(w - y) + Math.abs(z - u), Math.abs(w - z) + Math.abs(y - u), Math.abs(w - u) + Math.abs(y - z)) + (w === y && y === z && z === u ? 2 : 0);   // four of a kind: two cells must move by 1 to make two different pairs",
        "}",
      ],
      py: [
        "main = 0",
        "for x in BOXES:   # each box: the best way to pair its four numbers",
        "    w, y, z, u = (b[i] for i in x)",
        "    main -= min(abs(w - y) + abs(z - u), abs(w - z) + abs(y - u), abs(w - u) + abs(y - z)) + (2 if w == y == z == u else 0)   # four of a kind: two cells must move by 1 to make two different pairs",
      ],
    },
    tieBreakers: {
      apart: {
        pre: {
          ts: ["let apart = 0;", "for (const x of BOXES) { const v = x.map(i => b[i]); apart += Math.max(...v) - Math.min(...v); }   // each box: biggest minus smallest"],
          py: ["apart = sum(max(b[i] for i in x) - min(b[i] for i in x) for x in BOXES)   # each box: biggest minus smallest"],
        },
        ts: "apart", py: "apart", says: "pairs further apart in each box are better", lenses: ["add", "twin"], steps: 2, tryThis: "change FAR = 2 to 3 so a pair can jump further (it thinks longer: mind the step limit).",
      },
      primes: primesTie(["add", "swap"], "add the \"trade\" line from the Thorough starter: moving an amount keeps a box's total."),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 3, tryThis: "remove the \"swap\" line: can it fill the corners without rearranging?" },
    },
  },
  {
    family: "spread-of-three", simple: ["swap"],
    mainSays: "how far each 2×2 square's spread is from 3, added up (closer is better)",
    main: {
      ts: [
        "let main = 0;",
        "for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {    // each 2×2 square, by its top-left cell (they overlap)",
        "  const v = [b[i], b[i + 1], b[i + 4], b[i + 5]];",
        "  main -= Math.abs(Math.max(...v) - Math.min(...v) - 3);   // its spread: biggest minus smallest",
        "}",
      ],
      py: [
        "main = 0",
        "for i in [0, 1, 2, 4, 5, 6, 8, 9, 10]:   # each 2×2 square, by its top-left cell (they overlap)",
        "    v = [b[i], b[i + 1], b[i + 4], b[i + 5]]",
        "    main -= abs(max(v) - min(v) - 3)   # its spread: biggest minus smallest",
      ],
    },
    tieBreakers: {
      primes: primesTie(["add", "trade"], "remove the \"trade\" line: can single steps find primes without spoiling a square?", 2),
      zeros: zerosTie(["add", "twin"], "change FAR = 2 to 3: a 3 next to a 0 is a spread of 3 (it thinks longer: mind the step limit).", 2),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 3, tryThis: "remove the \"swap\" line: a corner is in only one square, so can single steps raise it?" },
    },
  },
  {
    family: "strangers", simple: [], needs: ["boxes"],
    mainSays: "how many touching pairs in the corner boxes are strangers (more is better)",
    main: {
      ts: [
        "const gcd = (x, y) => (y ? gcd(y, x % y) : x);   // the greatest common divisor",
        "let main = 0, ones = 0;",
        "for (const x of BOXES) for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {   // each box's four touching pairs",
        "  const u = b[x[i]], w = b[x[j]];",
        "  if (u > 1 && w > 1 && gcd(u, w) === 1 && Math.abs(u - w) >= 2) main++;   // strangers: like 2 and 5",
        "  if ((u === 1 && w > 1) || (w === 1 && u > 1)) ones++;                    // a 1 touching a bigger number",
        "}",
      ],
      py: [
        "def gcd(x, y):   # the greatest common divisor",
        "    return gcd(y, x % y) if y else x",
        "main, ones = 0, 0",
        "for x in BOXES:",
        "    for i, j in [[0, 1], [2, 3], [0, 2], [1, 3]]:   # each box's four touching pairs",
        "        u, w = b[x[i]], b[x[j]]",
        "        if u > 1 and w > 1 and gcd(u, w) == 1 and abs(u - w) >= 2:   # strangers: like 2 and 5",
        "            main += 1",
        "        if (u == 1 and w > 1) or (w == 1 and u > 1):   # a 1 touching a bigger number",
        "            ones += 1",
      ],
    },
    tieBreakers: {
      ones: { ts: "ones", py: "ones", says: "more 1s touching a bigger number in their box is better", lenses: ["add", "swap"], steps: 5, tryThis: "change FAR = 5 to 2: smaller steps, cheaper moves, but can it still find strangers?" },
      primes: primesTie(["add", "swap"], "remove the \"swap\" line: can single steps find primes that stay strangers?"),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 3, tryThis: "change FAR = 3 to 5: bigger jumps to big corners." },
    },
  },
  {
    family: "leapfrog", simple: ["line"],
    mainSays: "how far each number and the number two cells along its row are from one apart, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (const i of [0, 1, 4, 5, 8, 9, 12, 13]) main -= Math.abs(Math.abs(b[i] - b[i + 2]) - 1);   // cell i and the cell two along"],
      py: ["main = 0", "for i in [0, 1, 4, 5, 8, 9, 12, 13]:   # cell i and the cell two along", "    main -= abs(abs(b[i] - b[i + 2]) - 1)"],
    },
    tieBreakers: {
      "first-column": { ...FIRST_COLUMN, says: "a bigger first column is better", lenses: ["add", "line"], steps: 3, tryThis: "remove the \"line\" line: adding to a whole row keeps its leaps, can single cells do as well?" },
      primes: primesTie(["add", "trade"], "change FAR = 2 to 3 so a trade can reach a prime further away (it thinks longer: mind the step limit).", 2),
      zeros: zerosTie(["add", "line", "twin"], "remove the \"line\" line: is lowering two cells at a time enough?", 2),
    },
  },
  {
    family: "crosswise-threes", simple: ["swap"],
    mainSays: "how far each number and the number it folds onto are from 3 apart, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (const [i, j] of [[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]]) main -= Math.abs(Math.abs(b[i] - b[j]) - 3);   // each cell and its fold partner"],
      py: ["main = 0", "for i, j in [[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]]:   # each cell and its fold partner", "    main -= abs(abs(b[i] - b[j]) - 3)"],
    },
    tieBreakers: {
      "fold-line": { ts: "b[3] + b[6] + b[9] + b[12]", py: "b[3] + b[6] + b[9] + b[12]", says: "a bigger fold line (top-right to bottom-left) is better", lenses: ["add", "swap"], steps: 3, tryThis: "change FAR = 3 to 5: the fold line has no partner, so it can jump freely." },
      primes: primesTie(["add", "trade"], "remove the \"trade\" line: can single steps find primes that stay 3 apart?", 2),
      zeros: zerosTie(["add", "trade"], "change FAR = 2 to 3: a 0 folds onto a 3 (it thinks longer: mind the step limit).", 2),
    },
  },
  {
    family: "box-totals", simple: ["box"], needs: ["boxes"],
    mainSays: "how far the corner boxes' totals are from T, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (const x of BOXES) main -= Math.abs(x.reduce((t, i) => t + b[i], 0) - p.T);   // each box: how far its total is from T"],
      py: ["main = 0", "for x in BOXES:   # each box: how far its total is from T", "    main -= abs(sum(b[i] for i in x) - p[\"T\"])"],
    },
    tieBreakers: {
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "box", "swap"], steps: 3, tryThis: "remove the \"swap\" line: can it fill the corners without rearranging?" },
      primes: primesTie(["add", "box", "trade"], "change FAR = 2 to 3 so a trade can reach a prime further away (it thinks longer: mind the step limit).", 2),
      zeros: zerosTie(["add", "box", "trade"], "remove the \"box\" line: is fixing one cell at a time as cheap?", 2),
    },
  },
];
