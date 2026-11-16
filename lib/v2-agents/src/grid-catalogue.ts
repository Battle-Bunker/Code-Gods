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
   * The tables and helpers the snippet needs (LINE and LINES: the rows and columns, row i then column i; BOXES: the
   * four corner boxes; add: `add(i, k)`, the move that adds k to cell i).
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
  /** The tables the score reads (as GridLens.needs); `lead`: the helper `lead(base)`, the starts of base's powers (Leading Digits). */
  readonly needs?: readonly ("lines" | "boxes" | "lead")[];
}

const PRIMES_TS = "b.filter(x => [2, 3, 5, 7].includes(x)).length", PRIMES_PY = "len([x for x in b if x in (2, 3, 5, 7)])";
const primesTie = (lenses: readonly GridLensId[], tryThis: string, steps = 2): GridTieBreakerEntry =>
  ({ ts: PRIMES_TS, py: PRIMES_PY, says: "more cells holding 2, 3, 5 or 7 is better", lenses, steps, tryThis });
const zerosTie = (lenses: readonly GridLensId[], tryThis: string, steps = 2): GridTieBreakerEntry =>
  ({ ts: "b.filter(x => x === 0).length", py: "b.count(0)", says: "more 0s is better", lenses, steps, tryThis });
const CORNERS = { ts: "b[0] + b[3] + b[12] + b[15]", py: "b[0] + b[3] + b[12] + b[15]" };
const FIRST_COLUMN = { ts: "b[0] + b[4] + b[8] + b[12]", py: "b[0] + b[4] + b[8] + b[12]" };
const oddTie = (lenses: readonly GridLensId[], tryThis: string, steps = 2): GridTieBreakerEntry =>
  ({ ts: "b.filter(x => x % 2).length", py: "len([x for x in b if x % 2])", says: "more odd numbers is better", lenses, steps, tryThis });

/** The four readings (lib/v2-grid readings.ts): two rows (or columns) at a time read as one number, in the dealt layout. */
const READINGS = {
  ts: [
    "const R = p.layout === \"halves\" ? [0, 1, 2, 3] : [0, 2, 1, 3];   // the rows (and columns) in reading order: the first two, then the other two",
    "const read = (k, byRow) => [R[2 * k], R[2 * k + 1]].flatMap(r => [0, 1, 2, 3].map(j => (byRow ? b[4 * r + j] : b[4 * j + r]))).reduce((t, x) => t * 10 + x, 0);   // two rows (or two columns) as one number",
    "const x = [read(0, true), read(1, true), read(0, false), read(1, false)];   // the four readings",
  ],
  py: [
    "R = [0, 1, 2, 3] if p[\"layout\"] == \"halves\" else [0, 2, 1, 3]   # the rows (and columns) in reading order: the first two, then the other two",
    "x = []   # the four readings: two rows (or two columns) as one number",
    "for by_row in (True, False):",
    "    for k in (0, 1):",
    "        y = 0",
    "        for r in R[2 * k:2 * k + 2]:",
    "            for j in range(4):",
    "                y = y * 10 + (b[4 * r + j] if by_row else b[4 * j + r])",
    "        x.append(y)",
  ],
};
/** One off the main part for each row (or column) holding the same numbers as an earlier one. */
const REPEATS = {
  ts: [
    "const seen = new Set();",
    "for (let i = 0; i < 8; i++) { const k = (i < 4 ? \"r\" : \"c\") + [0, 1, 2, 3].map(j => (i < 4 ? b[4 * i + j] : b[4 * j + i - 4])).sort(); if (seen.has(k)) main--; else seen.add(k); }   // a row (or column) holding the same numbers as an earlier one: one off",
  ],
  py: [
    "seen = set()",
    "for i in range(8):   # a row (or column) holding the same numbers as an earlier one: one off",
    "    k = (i < 4, tuple(sorted(b[4 * i + j] if i < 4 else b[4 * j + i - 4] for j in range(4))))",
    "    if k in seen:",
    "        main -= 1",
    "    seen.add(k)",
  ],
};

/**
 * The beginner pool's eight families (owner decision 22), then the second pool's Box Totals, then the more-rules pool's seven
 * (lib/v2-grid more-families.ts). Each family of lib/v2-grid
 * without an entry here shows as "no shipped agents yet" in the grid test (gridUndescribed()).
 */
export const GRID_CATALOGUE: readonly GridFamilyEntry[] = [
  {
    family: "mirrormancer", simple: ["twin"],
    mainSays: "how far each row (or column, the dealt axis) is from reading the same backwards, added up (closer is better)",
    main: {
      ts: ["if (p.axis === \"columns\") b = b.map((_, i) => b[4 * (i % 4) + Math.floor(i / 4)]);   // dealt the columns: flip the board over its diagonal, so its columns read as rows", "let main = 0;", "for (let r = 0; r < 16; r += 4) main -= Math.abs(b[r] - b[r + 3]) + Math.abs(b[r + 1] - b[r + 2]);   // each row: its ends' gap and its middle's gap"],
      py: ["if p[\"axis\"] == \"columns\":   # dealt the columns: flip the board over its diagonal, so its columns read as rows", "    b = [b[4 * (i % 4) + i // 4] for i in range(16)]", "main = 0", "for r in range(0, 16, 4):   # each row: its ends' gap and its middle's gap", "    main -= abs(b[r] - b[r + 3]) + abs(b[r + 1] - b[r + 2])"],
    },
    tieBreakers: {
      middle: { ts: "b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14]", py: "b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14]", says: "bigger middle columns are better", lenses: ["add", "line"], steps: 2, tryThis: "remove the \"line\" line: can it raise the middle without a whole row at once?" },
      primes: primesTie(["add", "twin"], "change FAR = 2 to 1: single steps only, more turns at the same price per step; does it still reach primes?", 2),
      zeros: zerosTie(["add", "twin"], "add the \"line\" line from the Mirrormancer middle example: a whole row can drop at once.", 2),
      "mirror-other-way": {
        ts: "-[0, 1, 2, 3].reduce((t, c) => t + Math.abs(b[c] - b[c + 12]) + Math.abs(b[c + 4] - b[c + 8]) + (b[c] === b[c + 4] && b[c] === b[c + 8] && b[c] === b[c + 12] ? 1 : 0), 0)",
        py: "-sum(abs(b[c] - b[c + 12]) + abs(b[c + 4] - b[c + 8]) + (1 if b[c] == b[c + 4] == b[c + 8] == b[c + 12] else 0) for c in range(4))",
        says: "the other way (columns, or rows) closer to reading the same backwards, with two different numbers in each, is better", lenses: ["add", "twin"], steps: 2,
        tryThis: "remove the \"twin\" line: can single cells fix a column without spoiling a row?",
      },
      "one-apart": {
        ts: "-[0, 4, 8, 12].reduce((t, r) => t + Math.abs(Math.abs(b[r] - b[r + 1]) - 1) + Math.abs(Math.abs(b[r + 2] - b[r + 3]) - 1), 0)",
        py: "-sum(abs(abs(b[r] - b[r + 1]) - 1) + abs(abs(b[r + 2] - b[r + 3]) - 1) for r in range(0, 16, 4))",
        says: "each end number closer to one apart from the number beside it is better", lenses: ["add", "twin"], steps: 2,
        tryThis: "change FAR = 2 to 1: one apart is one step away; does it still get there?",
      },
      "small-middle": {
        ts: "-(b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14])",
        py: "-(b[1] + b[2] + b[5] + b[6] + b[9] + b[10] + b[13] + b[14])",
        says: "smaller middle numbers are better", lenses: ["add", "twin"], steps: 2,
        tryThis: "remove the \"twin\" line: can it lower a middle pair one cell at a time?",
      },
    },
  },
  {
    family: "magic-eighteen", simple: ["line"],
    mainSays: "how far the rows' (or columns', the dealt axis) totals are from T, added up (closer is better)",
    main: {
      ts: ["if (p.axis === \"columns\") b = b.map((_, i) => b[4 * (i % 4) + Math.floor(i / 4)]);   // dealt the columns: flip the board over its diagonal, so its columns read as rows", "let main = 0;", "for (let r = 0; r < 16; r += 4) main -= Math.abs(b[r] + b[r + 1] + b[r + 2] + b[r + 3] - p.T);   // each row: how far its total is from T"],
      py: ["if p[\"axis\"] == \"columns\":   # dealt the columns: flip the board over its diagonal, so its columns read as rows", "    b = [b[4 * (i % 4) + i // 4] for i in range(16)]", "main = 0", "for r in range(0, 16, 4):   # each row: how far its total is from T", "    main -= abs(b[r] + b[r + 1] + b[r + 2] + b[r + 3] - p[\"T\"])"],
    },
    tieBreakers: {
      "first-line": { ...FIRST_COLUMN, says: "a bigger first line the other way (column, or row) is better", lenses: ["add", "line", "swap"], steps: 2, tryThis: "remove the \"swap\" line: can it fill the first column without rearranging a row?" },
      primes: primesTie(["add", "line", "trade"], "change FAR = 2 to 1: moving 1 from cell to cell is cheapest, but does it still find primes?", 2),
      odd: oddTie(["add", "line", "trade"], "remove the \"line\" line: can it fix the rows one cell at a time just as cheaply?"),
      "other-way": {
        ts: "-[0, 1, 2, 3].reduce((t, c) => t + Math.abs(b[c] + b[c + 4] + b[c + 8] + b[c + 12] - p.T), 0)",
        py: "-sum(abs(b[c] + b[c + 4] + b[c + 8] + b[c + 12] - p[\"T\"]) for c in range(4))",
        says: "the other way (columns, or rows) adding up closer to T is better", lenses: ["add", "trade"], steps: 2,
        tryThis: "remove the \"trade\" line: can single cells fix the columns without spoiling the rows?",
      },
      "diagonals": {
        ts: "-Math.abs(b[0] + b[5] + b[10] + b[15] - p.T) - Math.abs(b[3] + b[6] + b[9] + b[12] - p.T)",
        py: "-abs(b[0] + b[5] + b[10] + b[15] - p[\"T\"]) - abs(b[3] + b[6] + b[9] + b[12] - p[\"T\"])",
        says: "diagonals adding up closer to T are better", lenses: ["add", "trade"], steps: 2,
        tryThis: "change FAR = 2 to 1: moving 1 at a time is cheapest; do the diagonals still come close?",
      },
      "different-numbers": {
        ts: "[0, 4, 8, 12].filter(r => new Set(b.slice(r, r + 4)).size === 4).length",
        py: "len([r for r in range(0, 16, 4) if len(set(b[r:r + 4])) == 4])",
        says: "more rows of four different numbers is better", lenses: ["add", "trade"], steps: 2,
        tryThis: "remove the \"trade\" line: can single cells make a row's numbers differ and keep its total?",
      },
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
      "top-half": { ts: "b.slice(0, 8).reduce((t, x) => t + x, 0)", py: "sum(b[:8])", says: "a bigger top half is better", lenses: ["add", "balance"], steps: 2, tryThis: "remove the \"balance\" line: can single cells raise the top half without breaking the pairs?" },
      primes: { ts: PRIMES_TS, py: PRIMES_PY, says: "more cells holding 2, 3, 5 or 7 is better", lenses: ["add", "balance"], steps: 2, tryThis: "add the \"swap\" line from the Two Pair corners example and compare what it spends." },
      odd: oddTie(["add", "balance"], "change FAR = 2 to 1: one step makes an even number odd.", 2),
      "mirror-nines": {
        ts: "-[0, 4, 8, 12].reduce((t, r) => t + Math.abs(b[r] + b[r + 3] - p.T) + Math.abs(b[r + 1] + b[r + 2] - p.T), 0)",
        py: "-sum(abs(b[r] + b[r + 3] - p[\"T\"]) + abs(b[r + 1] + b[r + 2] - p[\"T\"]) for r in range(0, 16, 4))",
        says: "each number and its mirror in the row adding up closer to T is better", lenses: ["add", "balance"], steps: 2,
        tryThis: "remove the \"balance\" line: can single cells fix the mirrors without breaking a pair?",
      },
      "different-splits": {
        pre: {
          ts: ["const splits = new Set();   // how each pair adding up to T splits it (its smaller number)", "for (let i = 0; i < 8; i++) if (b[i] + b[15 - i] === p.T) splits.add(Math.min(b[i], b[15 - i]));"],
          py: ["splits = {min(b[i], b[15 - i]) for i in range(8) if b[i] + b[15 - i] == p[\"T\"]}   # how each pair adding up to T splits it (its smaller number)"],
        },
        ts: "splits.size",
        py: "len(splits)",
        says: "pairs splitting T in more different ways is better", lenses: ["add", "balance"], steps: 2,
        tryThis: "change FAR = 2 to 1: does moving 1 across a pair still find new splits?",
      },
      "big-on-top": {
        ts: "[0, 1, 2, 3, 4, 5, 6, 7].filter(i => b[i] > b[15 - i]).length",
        py: "len([i for i in range(8) if b[i] > b[15 - i]])",
        says: "more pairs with the bigger number in the top half is better", lenses: ["add", "balance"], steps: 2,
        tryThis: "remove the \"balance\" line: can single cells tip a pair without breaking its total?",
      },
    },
  },
  {
    family: "two-pair", simple: ["swap"], needs: ["boxes"],
    mainSays: "how far each corner box is from holding two different pairs, added up (closer is better)",
    main: {
      ts: [
        "let main = 0;",
        "for (const x of BOXES) {",
        "  const [w, y, z, u] = x.map(i => b[i]).sort((s, t) => s - t);   // the box's four numbers, smallest first",
        "  main -= y - w + u - z + (w === u ? 2 : 0);   // pair the two smallest and the two biggest; four of a kind: two cells must move by 1",
        "}",
      ],
      py: [
        "main = 0",
        "for x in BOXES:",
        "    w, y, z, u = sorted(b[i] for i in x)   # the box's four numbers, smallest first",
        "    main -= y - w + u - z + (2 if w == u else 0)   # pair the two smallest and the two biggest; four of a kind: two cells must move by 1",
      ],
    },
    tieBreakers: {
      apart: {
        pre: {
          ts: ["let apart = 0;", "for (const x of BOXES) { const v = x.map(i => b[i]); apart += Math.max(...v) - Math.min(...v); }   // each box: biggest minus smallest"],
          py: ["apart = sum(max(b[i] for i in x) - min(b[i] for i in x) for x in BOXES)   # each box: biggest minus smallest"],
        },
        ts: "apart", py: "apart", says: "pairs further apart in each box are better", lenses: ["add", "twin"], steps: 2, tryThis: "remove the \"twin\" line: can single cells push the pairs apart?",
      },
      primes: primesTie(["add", "swap"], "add the \"trade\" line from the Thorough starter: moving an amount keeps a box's total."),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 2, tryThis: "remove the \"swap\" line: can it fill the corners without rearranging?" },
      "diagonal-pairs": {
        ts: "BOXES.filter(([s, t, u, w]) => b[s] === b[w] && b[t] === b[u] && b[s] !== b[t]).length",
        py: "len([1 for s, t, u, w in BOXES if b[s] == b[w] and b[t] == b[u] and b[s] != b[t]])",
        says: "more boxes with each pair on a diagonal of the box is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps move a pair onto a diagonal?",
      },
      "small-pairs": {
        ts: "-BOXES.reduce((t, x) => t + Math.min(...x.map(i => b[i])), 0)",
        py: "-sum(min(b[i] for i in x) for x in BOXES)",
        says: "a smaller small pair in each box is better", lenses: ["add", "twin"], steps: 2,
        tryThis: "remove the \"twin\" line: can it lower a pair one cell at a time?",
      },
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
      zeros: zerosTie(["add", "twin"], "remove the \"twin\" line: can single steps still find the zeros?", 2),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 2, tryThis: "remove the \"swap\" line: a corner is in only one square, so can single steps raise it?" },
      "spread-diagonal": {
        pre: {
          ts: ["let diag = 0;", "for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {   // each 2\u00d72 square: its biggest and smallest, each alone, on a diagonal", "  const v = [b[i], b[i + 1], b[i + 4], b[i + 5]], hi = Math.max(...v), lo = Math.min(...v);", "  if (v.filter(x => x === hi).length === 1 && v.filter(x => x === lo).length === 1 && v.indexOf(hi) + v.indexOf(lo) === 3) diag++;", "}"],
          py: ["diag = 0", "for i in [0, 1, 2, 4, 5, 6, 8, 9, 10]:   # each 2\u00d72 square: its biggest and smallest, each alone, on a diagonal", "    v = [b[i], b[i + 1], b[i + 4], b[i + 5]]", "    if v.count(max(v)) == 1 and v.count(min(v)) == 1 and v.index(max(v)) + v.index(min(v)) == 3:", "        diag += 1"],
        },
        ts: "diag",
        py: "diag",
        says: "more squares with their biggest and smallest on a diagonal is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps turn a square's spread onto its diagonal?",
      },
      "spread-small": {
        ts: "-[0, 1, 2, 4, 5, 6, 8, 9, 10].reduce((t, i) => t + Math.min(b[i], b[i + 1], b[i + 4], b[i + 5]), 0)",
        py: "-sum(min(b[i], b[i + 1], b[i + 4], b[i + 5]) for i in [0, 1, 2, 4, 5, 6, 8, 9, 10])",
        says: "smaller smallest numbers in the squares are better", lenses: ["add", "twin"], steps: 2,
        tryThis: "remove the \"twin\" line: can single steps lower the squares without spoiling a spread?",
      },
      "square-different": {
        ts: "[0, 1, 2, 4, 5, 6, 8, 9, 10].filter(i => new Set([b[i], b[i + 1], b[i + 4], b[i + 5]]).size === 4).length",
        py: "len([i for i in [0, 1, 2, 4, 5, 6, 8, 9, 10] if len({b[i], b[i + 1], b[i + 4], b[i + 5]}) == 4])",
        says: "more squares of four different numbers is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; can it still make the numbers differ?",
      },
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
      ones: { ts: "ones", py: "ones", says: "more 1s touching a bigger number in their box is better", lenses: ["add", "swap"], steps: 2, tryThis: "change FAR = 2 to 1: single steps, more turns, the same price per step: can it still find strangers?" },
      primes: primesTie(["add", "swap"], "remove the \"swap\" line: can single steps find primes that stay strangers?"),
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "swap"], steps: 2, tryThis: "remove the \"swap\" line: can single steps raise the corners?" },
      "prime-strangers": {
        pre: {
          ts: ["let primeSt = 0;", "for (const x of BOXES) for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {   // strangers that are both prime", "  const u = b[x[i]], w = b[x[j]];", "  if ([2, 3, 5, 7].includes(u) && [2, 3, 5, 7].includes(w) && gcd(u, w) === 1 && Math.abs(u - w) >= 2) primeSt++;", "}"],
          py: ["prime_st = 0", "for x in BOXES:", "    for i, j in [[0, 1], [2, 3], [0, 2], [1, 3]]:   # strangers that are both prime", "        u, w = b[x[i]], b[x[j]]", "        if u in (2, 3, 5, 7) and w in (2, 3, 5, 7) and gcd(u, w) == 1 and abs(u - w) >= 2:", "            prime_st += 1"],
        },
        ts: "primeSt",
        py: "prime_st",
        says: "more strangers that are both prime is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps turn strangers into primes?",
      },
      "across-strangers": {
        pre: {
          ts: ["let across = 0;   // touching pairs across the boxes' borders that are strangers", "for (const [i, j] of [[1, 2], [5, 6], [9, 10], [13, 14], [4, 8], [5, 9], [6, 10], [7, 11]]) if (b[i] > 1 && b[j] > 1 && gcd(b[i], b[j]) === 1 && Math.abs(b[i] - b[j]) >= 2) across++;"],
          py: ["across = 0   # touching pairs across the boxes' borders that are strangers", "for i, j in [[1, 2], [5, 6], [9, 10], [13, 14], [4, 8], [5, 9], [6, 10], [7, 11]]:", "    if b[i] > 1 and b[j] > 1 and gcd(b[i], b[j]) == 1 and abs(b[i] - b[j]) >= 2:", "        across += 1"],
        },
        ts: "across",
        py: "across",
        says: "more strangers across the corner boxes' borders is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find strangers across the borders?",
      },
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
      "first-column": { ...FIRST_COLUMN, says: "a bigger first column is better", lenses: ["add", "line"], steps: 2, tryThis: "remove the \"line\" line: adding to a whole row keeps its leaps, can single cells do as well?" },
      primes: primesTie(["add", "trade"], "remove the \"trade\" line: can single cells reach the primes?", 2),
      zeros: zerosTie(["add", "line", "twin"], "remove the \"line\" line: is lowering two cells at a time enough?", 2),
      "same-way": {
        ts: "[0, 4, 8, 12].filter(r => (b[r + 2] - b[r]) * (b[r + 3] - b[r + 1]) > 0).length",
        py: "len([r for r in range(0, 16, 4) if (b[r + 2] - b[r]) * (b[r + 3] - b[r + 1]) > 0])",
        says: "more rows whose two leaps go the same way (both up or both down) is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps turn a leap around?",
      },
      "columns-leap": {
        ts: "-[0, 1, 2, 3, 4, 5, 6, 7].reduce((t, i) => t + Math.abs(Math.abs(b[i] - b[i + 8]) - 1), 0)",
        py: "-sum(abs(abs(b[i] - b[i + 8]) - 1) for i in range(8))",
        says: "each number closer to one apart from the number two cells down is better", lenses: ["add", "line"], steps: 2,
        tryThis: "remove the \"line\" line: a whole row moves without spoiling its leaps; can single cells do as well?",
      },
      "middle-factors": {
        pre: {
          ts: ["const gcd = (x, y) => (y ? gcd(y, x % y) : x);   // the greatest common divisor (gcd(0, x) is x)"],
          py: ["def gcd(x, y):   # the greatest common divisor (gcd(0, x) is x)", "    return gcd(y, x % y) if y else x"],
        },
        ts: "[0, 1, 4, 5, 8, 9, 12, 13].filter(i => gcd(b[i + 1], b[i]) > 1 && gcd(b[i + 1], b[i + 2]) > 1).length",
        py: "len([i for i in [0, 1, 4, 5, 8, 9, 12, 13] if gcd(b[i + 1], b[i]) > 1 and gcd(b[i + 1], b[i + 2]) > 1])",
        says: "more numbers between leap partners that share a factor with both is better", lenses: ["add", "line"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find shared factors?",
      },
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
      "fold-line": { ts: "b[3] + b[6] + b[9] + b[12]", py: "b[3] + b[6] + b[9] + b[12]", says: "a bigger fold line (top-right to bottom-left) is better", lenses: ["add", "swap"], steps: 2, tryThis: "remove the \"swap\" line: can single steps raise the fold line?" },
      primes: primesTie(["add", "trade"], "remove the \"trade\" line: can single steps find primes that stay 3 apart?", 2),
      zeros: zerosTie(["add", "trade"], "remove the \"trade\" line: can single steps still make the zeros?", 2),
      "bigger-side": {
        ts: "[[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]].filter(([i, j]) => b[i] > b[j]).length",
        py: "len([1 for i, j in [[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]] if b[i] > b[j]])",
        says: "more fold pairs with the bigger number on the top-left side is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps tip a fold pair over?",
      },
      "other-fold": {
        ts: "-[[1, 4], [2, 8], [3, 12], [6, 9], [7, 13], [11, 14]].reduce((t, [i, j]) => t + Math.abs(Math.abs(b[i] - b[j]) - 3), 0)",
        py: "-sum(abs(abs(b[i] - b[j]) - 3) for i, j in [[1, 4], [2, 8], [3, 12], [6, 9], [7, 13], [11, 14]])",
        says: "cells folded on the other diagonal closer to 3 apart is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does the other fold still come close?",
      },
      "fold-factors": {
        pre: {
          ts: ["const gcd = (x, y) => (y ? gcd(y, x % y) : x);   // the greatest common divisor (gcd(0, x) is x)"],
          py: ["def gcd(x, y):   # the greatest common divisor (gcd(0, x) is x)", "    return gcd(y, x % y) if y else x"],
        },
        ts: "[[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]].filter(([i, j]) => gcd(b[i], b[j]) > 1).length",
        py: "len([1 for i, j in [[0, 15], [1, 11], [2, 7], [4, 14], [5, 10], [8, 13]] if gcd(b[i], b[j]) > 1])",
        says: "more fold pairs sharing a factor is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps find shared factors 3 apart?",
      },
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
      corners: { ...CORNERS, says: "bigger corners of the board are better", lenses: ["add", "box", "swap"], steps: 2, tryThis: "remove the \"swap\" line: can it fill the corners without rearranging?" },
      primes: primesTie(["add", "box", "trade"], "remove the \"trade\" line: can single cells reach the primes?", 2),
      zeros: zerosTie(["add", "box", "trade"], "remove the \"box\" line: is fixing one cell at a time as cheap?", 2),
    },
  },
  {
    family: "kings-and-subjects", simple: ["swap"], needs: ["boxes"],
    mainSays: "how far each corner box's biggest number is from the other three added up, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "const kings = [];", "for (const x of BOXES) {   // each corner box", "  const v = x.map(i => b[i]), m = Math.max(...v);   // m: the king", "  main -= v.filter(y => y === m).length > 1 ? 20 : Math.abs(2 * m - v.reduce((t, y) => t + y, 0));   // the king against his subjects added up; a tied biggest is no king, 20 off", "  if (v.filter(y => y === m).length === 1) kings.push([x[v.indexOf(m)], m, Math.min(...v)]);   // a king: his cell, his number, the smallest in his box", "}"],
      py: ["main = 0", "kings = []", "for x in BOXES:   # each corner box", "    v = [b[i] for i in x]", "    m = max(v)   # the king", "    main -= 20 if v.count(m) > 1 else abs(2 * m - sum(v))   # the king against his subjects added up; a tied biggest is no king, 20 off", "    if v.count(m) == 1:   # a king: his cell, his number, the smallest in his box", "        kings.append((x[v.index(m)], m, min(v)))"],
    },
    tieBreakers: {
      "different-kings": {
        ts: "kings.flatMap((a, k) => kings.slice(k + 1).filter(c => c[1] !== a[1])).length", py: "len([1 for k, a in enumerate(kings) for c in kings[k + 1:] if c[1] != a[1]])",
        says: "more pairs of kings that are different numbers is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps make the kings differ without spoiling the rule?",
      },
      "king-multiples": {
        ts: "kings.filter(([i, m, s]) => s >= 1 && m % s === 0).length", py: "len([1 for i, m, s in kings if s >= 1 and m % s == 0])",
        says: "more kings that are a multiple of the smallest number in their box is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find multiples?",
      },
      "kings-on-diagonals": {
        ts: "kings.filter(([i]) => Math.floor(i / 4) === i % 4 || Math.floor(i / 4) + i % 4 === 3).length", py: "len([1 for i, m, s in kings if i // 4 == i % 4 or i // 4 + i % 4 == 3])",
        says: "more kings on the board's two diagonals is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can it move a king onto a diagonal without swapping?",
      },
    },
  },
  {
    family: "stepping-stones", simple: ["swap"],
    mainSays: "the cells in the biggest group you can hop between, touching cells 2 apart (more is better)",
    main: {
      ts: ["const near = i => [i - 4, i + 4, i % 4 ? i - 1 : -1, i % 4 < 3 ? i + 1 : -1].filter(j => j >= 0 && j < 16);   // the cells touching cell i", "let best = [];   // the biggest group (the first found on a tie)", "const seen = new Set();", "for (let s = 0; s < 16; s++) {", "  if (seen.has(s)) continue;", "  const group = [s];", "  seen.add(s);", "  for (const i of group) for (const j of near(i)) if (!seen.has(j) && Math.abs(b[i] - b[j]) === 2) { seen.add(j); group.push(j); }   // hop on to touching cells 2 apart", "  if (group.length > best.length) best = group;", "}", "const main = best.length;"],
      py: ["def near(i):   # the cells touching cell i", "    return [j for j in (i - 4, i + 4, i - 1 if i % 4 else -1, i + 1 if i % 4 < 3 else -1) if 0 <= j < 16]", "best = []   # the biggest group (the first found on a tie)", "seen = set()", "for s in range(16):", "    if s in seen:", "        continue", "    group = [s]", "    seen.add(s)", "    for i in group:   # hop on to touching cells 2 apart", "        for j in near(i):", "            if j not in seen and abs(b[i] - b[j]) == 2:", "                seen.add(j)", "                group.append(j)", "    if len(group) > len(best):", "        best = group", "main = len(best)"],
    },
    tieBreakers: {
      "outside-small": {
        ts: "-b.reduce((t, x, i) => (best.includes(i) ? t : t + x), 0)", py: "-sum(b[i] for i in range(16) if i not in best)",
        says: "smaller numbers outside the biggest group are better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; can it still shrink the numbers around the group?",
      },
      "group-reach": {
        ts: "new Set(best.map(i => Math.floor(i / 4))).size + new Set(best.map(i => i % 4)).size", py: "len({i // 4 for i in best}) + len({i % 4 for i in best})",
        says: "a biggest group reaching into more rows and columns is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps stretch the group?",
      },
      "group-corners": {
        ts: "best.filter(i => [0, 3, 12, 15].includes(i)).length", py: "len([i for i in best if i in (0, 3, 12, 15)])",
        says: "more of the board's corners in the biggest group is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps reach a corner?",
      },
    },
  },
  {
    family: "mountain-climb", simple: ["swap"],
    mainSays: "the cells on the longest climb from the top-left cell, each step 1 bigger (more is better)",
    main: {
      ts: ["const near = i => [i - 4, i + 4, i % 4 ? i - 1 : -1, i % 4 < 3 ? i + 1 : -1].filter(j => j >= 0 && j < 16);   // the cells touching cell i", "let level = [0], main = 0;   // start at the top-left cell", "const reached = [];   // every cell on some climb", "while (level.length) { main++; reached.push(...level); level = [...new Set(level.flatMap(i => near(i).filter(j => b[j] === b[i] + 1)))]; }   // each step: touching cells exactly 1 bigger"],
      py: ["def near(i):   # the cells touching cell i", "    return [j for j in (i - 4, i + 4, i - 1 if i % 4 else -1, i + 1 if i % 4 < 3 else -1) if 0 <= j < 16]", "level, main = [0], 0   # start at the top-left cell", "reached = []   # every cell on some climb", "while level:", "    main += 1", "    reached += level", "    level = list({j for i in level for j in near(i) if b[j] == b[i] + 1})   # each step: touching cells exactly 1 bigger"],
    },
    tieBreakers: {
      "climb-reach": {
        ts: "reached.length", py: "len(reached)",
        says: "more cells on some climb from the top-left is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps open a second climb?",
      },
      "climb-far": {
        ts: "Math.max(...reached.map(i => Math.floor(i / 4) + i % 4))", py: "max(i // 4 + i % 4 for i in reached)",
        says: "a climb ending farther from the top-left cell (steps across and down) is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does the climb still head away?",
      },
      "climb-summit": {
        ts: "b[0] + main - 1", py: "b[0] + main - 1",
        says: "a climb reaching a bigger number is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can it raise the whole climb one cell at a time?",
      },
    },
  },
  {
    family: "uphill", simple: ["tilt"], needs: ["lines"],
    mainSays: "the steps along every row and column toward the corner that reach a bigger number (more is better)",
    main: {
      ts: ["const right = p.corner[1] === \"R\", down = p.corner[0] === \"B\";   // which way to walk", "const rises = [];   // each step toward the corner, along the rows and down the columns: how much it rises", "for (let i = 0; i < 16; i++) { if (i % 4 < 3) rises.push(right ? b[i + 1] - b[i] : b[i] - b[i + 1]); if (i < 12) rises.push(down ? b[i + 4] - b[i] : b[i] - b[i + 4]); }", "let main = rises.filter(d => d > 0).length;"],
      py: ["right, down = p[\"corner\"][1] == \"R\", p[\"corner\"][0] == \"B\"   # which way to walk", "rises = []   # each step toward the corner, along the rows and down the columns: how much it rises", "for i in range(16):", "    if i % 4 < 3:", "        rises.append(b[i + 1] - b[i] if right else b[i] - b[i + 1])", "    if i < 12:", "        rises.append(b[i + 4] - b[i] if down else b[i] - b[i + 4])", "main = len([d for d in rises if d > 0])"],
    },
    tieBreakers: {
      "rise-by-one": {
        ts: "rises.filter(d => d === 1).length", py: "len([d for d in rises if d == 1])",
        says: "more rising steps that rise by exactly 1 is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "add the \"tilt\" line from the Simple starter: does tilting by 1 make the rises even?",
      },
      "corner-peak": {
        ts: "b.filter(x => x < b[(down ? 12 : 0) + (right ? 3 : 0)]).length", py: "len([x for x in b if x < b[(12 if down else 0) + (3 if right else 0)]])",
        says: "more numbers smaller than the one in the corner you walk toward is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does the corner still grow?",
      },
      "start-low": {
        ts: "b.filter(x => x > b[15 - (down ? 12 : 0) - (right ? 3 : 0)]).length", py: "len([x for x in b if x > b[15 - (12 if down else 0) - (3 if right else 0)]])",
        says: "more numbers bigger than the one in the corner the walks start from is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps lower the starting corner?",
      },
    },
  },
  {
    family: "staircase", simple: ["swap"],
    mainSays: "the numbers exactly 1 more than the number before them (more is better)",
    main: {
      ts: ["const step = p.direction === \"right\" ? 1 : 4;   // the number before: to the left, or above", "let main = 0;", "for (let i = 0; i < 16; i++) if ((step === 1 ? i % 4 > 0 : i >= 4) && b[i] === b[i - step] + 1) main++;"],
      py: ["step = 1 if p[\"direction\"] == \"right\" else 4   # the number before: to the left, or above", "main = 0", "for i in range(16):", "    if (i % 4 > 0 if step == 1 else i >= 4) and b[i] == b[i - step] + 1:", "        main += 1"],
    },
    tieBreakers: {
      "long-flight": {
        pre: {
          ts: ["let flight = 1;   // the longest flight: stairs one after another, counting the cell it starts from", "for (let k = 0; k < 4; k++) { let run = 1; for (let j = 1; j < 4; j++) { const i = step === 1 ? 4 * k + j : 4 * j + k; run = b[i] === b[i - step] + 1 ? run + 1 : 1; flight = Math.max(flight, run); } }   // along each row (or down each column)"],
          py: ["flight = 1   # the longest flight: stairs one after another, counting the cell it starts from", "for k in range(4):   # along each row (or down each column)", "    run = 1", "    for j in range(1, 4):", "        i = 4 * k + j if step == 1 else 4 * j + k", "        run = run + 1 if b[i] == b[i - step] + 1 else 1", "        flight = max(flight, run)"],
        },
        ts: "flight", py: "flight",
        says: "a longer flight of stairs is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps join two flights?",
      },
      "double-stairs": {
        ts: "b.filter((x, i) => i >= 4 && i % 4 > 0 && x === b[i - 1] + 1 && x === b[i - 4] + 1).length", py: "len([i for i in range(16) if i >= 4 and i % 4 > 0 and b[i] == b[i - 1] + 1 and b[i] == b[i - 4] + 1])",
        says: "more stairs that are also 1 more the other way (above, or to the left) is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find stairs both ways?",
      },
      "low-stairs": {
        ts: "-b.reduce((t, x, i) => t + ((step === 1 ? i % 4 > 0 : i >= 4) && x === b[i - step] + 1 ? b[i - step] : 0), 0)", py: "-sum(b[i - step] for i in range(16) if (i % 4 > 0 if step == 1 else i >= 4) and b[i] == b[i - step] + 1)",
        says: "stairs climbing from smaller numbers is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps lower a whole stair at once?",
      },
    },
  },
  {
    family: "magic-accountant", simple: ["line"], needs: ["lines"],
    mainSays: "how far each row's (or column's) total is from T, added up (closer is better)",
    main: {
      ts: ["let main = 0;", "for (let k = 0; k < 4; k++) { let t = 0; for (let j = 0; j < 4; j++) t += p.axis === \"rows\" ? b[4 * k + j] : b[4 * j + k]; main -= Math.abs(t - p.T); }   // each line: how far its total is from T"],
      py: ["main = 0", "for k in range(4):   # each line: how far its total is from T", "    t = sum(b[4 * k + j] if p[\"axis\"] == \"rows\" else b[4 * j + k] for j in range(4))", "    main -= abs(t - p[\"T\"])"],
    },
    tieBreakers: {
      "other-way": {
        pre: {
          ts: ["let other = 0;", "for (let k = 0; k < 4; k++) { let t = 0; for (let j = 0; j < 4; j++) t += p.axis === \"rows\" ? b[4 * j + k] : b[4 * k + j]; other -= Math.abs(t - p.T); }   // the other way: each column (or row) against T"],
          py: ["other = 0", "for k in range(4):   # the other way: each column (or row) against T", "    other -= abs(sum(b[4 * j + k] if p[\"axis\"] == \"rows\" else b[4 * k + j] for j in range(4)) - p[\"T\"])"],
        },
        ts: "other", py: "other",
        says: "the columns (or rows, the other way) closer to T too is better", lenses: ["add", "trade"], steps: 2,
        tryThis: "remove the \"trade\" line: can single steps fix the other way without spoiling the totals?",
      },
      "diagonals": {
        ts: "-Math.abs(b[0] + b[5] + b[10] + b[15] - p.T) - Math.abs(b[3] + b[6] + b[9] + b[12] - p.T)", py: "-abs(b[0] + b[5] + b[10] + b[15] - p[\"T\"]) - abs(b[3] + b[6] + b[9] + b[12] - p[\"T\"])",
        says: "both diagonals closer to T too is better", lenses: ["add", "trade"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; do the diagonals still come close?",
      },
      "all-different": {
        ts: "[0, 1, 2, 3].filter(k => new Set([0, 1, 2, 3].map(j => (p.axis === \"rows\" ? b[4 * k + j] : b[4 * j + k]))).size === 4).length", py: "len([k for k in range(4) if len({b[4 * k + j] if p[\"axis\"] == \"rows\" else b[4 * j + k] for j in range(4)}) == 4])",
        says: "more rows (or columns, the dealt way) of four different numbers is better", lenses: ["add", "trade"], steps: 2,
        tryThis: "remove the \"trade\" line: can single steps make the numbers differ without spoiling the totals?",
      },
    },
  },
  {
    family: "fillomino", simple: ["swap"],
    mainSays: "the cells in patches of equal numbers whose size is their number (more is better)",
    main: {
      ts: ["const near = i => [i - 4, i + 4, i % 4 ? i - 1 : -1, i % 4 < 3 ? i + 1 : -1].filter(j => j >= 0 && j < 16);   // the cells touching cell i", "let main = 0;", "const patches = [];   // every patch of touching equal numbers", "const seen = new Set();", "for (let s = 0; s < 16; s++) {", "  if (seen.has(s)) continue;", "  const patch = [s];", "  patches.push(patch);", "  seen.add(s);", "  for (const i of patch) for (const j of near(i)) if (!seen.has(j) && b[j] === b[i]) { seen.add(j); patch.push(j); }   // touching cells holding the same number", "  if (b[s] > 0 && patch.length === b[s]) main += patch.length;   // a patch of the right size", "}"],
      py: ["def near(i):   # the cells touching cell i", "    return [j for j in (i - 4, i + 4, i - 1 if i % 4 else -1, i + 1 if i % 4 < 3 else -1) if 0 <= j < 16]", "main = 0", "patches = []   # every patch of touching equal numbers", "seen = set()", "for s in range(16):", "    if s in seen:", "        continue", "    patch = [s]", "    patches.append(patch)", "    seen.add(s)", "    for i in patch:   # touching cells holding the same number", "        for j in near(i):", "            if j not in seen and b[j] == b[i]:", "                seen.add(j)", "                patch.append(j)", "    if b[s] > 0 and len(patch) == b[s]:   # a patch of the right size", "        main += len(patch)"],
    },
    tieBreakers: {
      "patch-kinds": {
        ts: "new Set(patches.filter(x => b[x[0]] > 0 && x.length === b[x[0]]).map(x => b[x[0]])).size", py: "len({b[x[0]] for x in patches if b[x[0]] > 0 and len(x) == b[x[0]]})",
        says: "right-size patches of more different numbers is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find new kinds of patch?",
      },
      "patch-count": {
        ts: "patches.filter(x => b[x[0]] > 0 && x.length === b[x[0]]).length", py: "len([x for x in patches if b[x[0]] > 0 and len(x) == b[x[0]]])",
        says: "more right-size patches is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps split a patch into right-size ones?",
      },
      "near-misses": {
        ts: "-patches.filter(x => b[x[0]] > 0).reduce((t, x) => t + Math.abs(x.length - b[x[0]]), 0)", py: "-sum(abs(len(x) - b[x[0]]) for x in patches if b[x[0]] > 0)",
        says: "wrong-size patches closer to their number in size is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps grow or shrink a patch toward its number?",
      },
    },
  },
  {
    family: "divisibility", simple: ["swap"],
    mainSays: "the q's dividing the four readings (or the two differences), added up, less the repeated rows and columns (more is better)",
    main: {
      ts: [
        ...READINGS.ts,
        "const nums = p.lens === \"powers\" ? x : [x[0] - x[1], x[2] - x[3]];   // the numbers counted: the readings, or the rows' and the columns' differences",
        "let main = 0, leftover = 0;",
        "for (let y of nums) { if (!y) continue; let v = 0; while (y % p.q === 0) { y /= p.q; v++; } main += v; for (const d of String(Math.abs(y))) leftover += +d; }   // count the q's dividing it; what is left: its digits",
        ...REPEATS.ts,
      ],
      py: [
        ...READINGS.py,
        "nums = x if p[\"lens\"] == \"powers\" else [x[0] - x[1], x[2] - x[3]]   # the numbers counted: the readings, or the rows' and the columns' differences",
        "main, leftover = 0, 0",
        "for y in nums:   # count the q's dividing it; what is left: its digits",
        "    if y:",
        "        while y % p[\"q\"] == 0:",
        "            y //= p[\"q\"]",
        "            main += 1",
        "        leftover += sum(int(d) for d in str(abs(y)))",
        ...REPEATS.py,
      ],
    },
    tieBreakers: {
      "leftover-digits": {
        ts: "leftover", py: "leftover",
        says: "what is left after dividing out the q's, its digits added up, bigger is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "remove the \"swap\" line: can single steps change what is left without losing a q?",
      },
    },
  },
  {
    family: "leading-digits", simple: ["swap"], needs: ["lead"],
    mainSays: "the leading digits each reading shares with a power of b, added up, less the repeated rows and columns (more is better)",
    main: {
      ts: [
        ...READINGS.ts,
        "const t = lead(p.b);   // the starts of b's powers, each to its smallest exponent",
        "let main = 0, exponents = 0;",
        "for (const y of x) { const s = String(y); let n = 0; while (n < s.length && t.has(s.slice(0, n + 1))) n++; main += n; if (n) for (const d of String(t.get(s.slice(0, n)))) exponents += +d; }   // its digits matched, and that power's exponent's digits",
        ...REPEATS.ts,
      ],
      py: [
        ...READINGS.py,
        "t = lead(p[\"b\"])   # the starts of b's powers, each to its smallest exponent",
        "main, exponents = 0, 0",
        "for y in x:   # its digits matched, and that power's exponent's digits",
        "    s, n = str(y), 0",
        "    while n < len(s) and s[:n + 1] in t:",
        "        n += 1",
        "    main += n",
        "    if n:",
        "        exponents += sum(int(d) for d in str(t[s[:n]]))",
        ...REPEATS.py,
      ],
    },
    tieBreakers: {
      "exponent-digits": {
        ts: "exponents", py: "exponents",
        says: "the matched powers' exponents, their digits added up, bigger is better", lenses: ["add", "swap"], steps: 2,
        tryThis: "change FAR = 2 to 1: single steps only; does it still find powers with bigger exponents?",
      },
    },
  },
];
