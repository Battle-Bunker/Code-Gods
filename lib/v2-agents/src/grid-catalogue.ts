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

/**
 * One family for now, the pattern for the rest: the grid pool is being revised (owner decision 22), and each family of
 * lib/v2-grid without an entry here shows as "no shipped agents yet" in the starters test (gridUndescribed()).
 */
export const GRID_CATALOGUE: readonly GridFamilyEntry[] = [
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
