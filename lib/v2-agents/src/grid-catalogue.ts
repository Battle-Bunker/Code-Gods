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
  /** The tables the score reads (as GridLens.needs). */
  readonly needs?: readonly ("lines" | "boxes")[];
}

/** A rule scored by the dynamic energy measure: its utility only (no secondary preferences). */
const dyn = (family: string, simple: readonly GridLensId[], mainSays: string, ts: readonly string[], py: readonly string[]): GridFamilyEntry =>
  ({ family, simple, mainSays, main: { ts, py: ["import math", ...py] }, tieBreakers: {} });
const ROW_TS = (r: string) => `b[${r}] * 1000 + b[${r} + 1] * 100 + b[${r} + 2] * 10 + b[${r} + 3]`;

/**
 * The dealt grid rules (lib/v2-grid dynamic-families.ts; owner decision 50): each scores the board exactly as the engine
 * does (the starters test checks both languages against the engine on sampled boards).
 */
export const GRID_CATALOGUE: readonly GridFamilyEntry[] = [
  dyn("row-multiples", ["line"], "each row near a big multiple of k (bigger is better)", [
    "let main = 0;",
    "for (let r = 0; r < 16; r += 4) {",
    `  const R = ${ROW_TS("r")}, m = p.k * Math.floor(R / p.k + 0.5);   // the row as one number, and the multiple of k nearest it`,
    "  main += Math.log2(1 + m) - 4 * Math.log2(1 + Math.abs(R - m));",
    "}",
  ], [
    "main = 0",
    "for r in range(0, 16, 4):",
    "    R = b[r] * 1000 + b[r + 1] * 100 + b[r + 2] * 10 + b[r + 3]   # the row as one number",
    "    m = p[\"k\"] * math.floor(R / p[\"k\"] + 0.5)                     # the multiple of k nearest it",
    "    main += math.log2(1 + m) - 4 * math.log2(1 + abs(R - m))",
  ]),
  dyn("prime-columns", ["line"], "each column plus t near a big prime (bigger is better)", [
    "const isPrime = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };",
    "let main = 0;",
    "for (let c = 0; c < 4; c++) {",
    "  const x = b[c] * 1000 + b[c + 4] * 100 + b[c + 8] * 10 + b[c + 12] + p.t;   // the column as one number, plus t",
    "  let P = x <= 2 ? 2 : null;   // the prime nearest it (the lower one on a tie)",
    "  for (let d = 0; P === null; d++) P = isPrime(x - d) ? x - d : isPrime(x + d) ? x + d : null;",
    "  main += Math.log2(P) - 4 * Math.log2(1 + Math.abs(x - P));",
    "}",
  ], [
    "def is_prime(n):",
    "    return n >= 2 and all(n % d for d in range(2, int(n ** 0.5) + 1))",
    "main = 0",
    "for c in range(4):",
    "    x = b[c] * 1000 + b[c + 4] * 100 + b[c + 8] * 10 + b[c + 12] + p[\"t\"]   # the column as one number, plus t",
    "    P, d = (2 if x <= 2 else None), 0   # the prime nearest it (the lower one on a tie)",
    "    while P is None:",
    "        P = x - d if is_prime(x - d) else x + d if is_prime(x + d) else None",
    "        d += 1",
    "    main += math.log2(P) - 4 * math.log2(1 + abs(x - P))",
  ]),
  dyn("square-boxes", ["box"], "each corner box, read clockwise, near a big square plus j (bigger is better)", [
    "let main = 0;",
    "for (const [w, x, y, z] of [[0, 1, 5, 4], [2, 3, 7, 6], [8, 9, 13, 12], [10, 11, 15, 14]]) {   // each corner box, clockwise from its top-left",
    "  const B = b[w] * 1000 + b[x] * 100 + b[y] * 10 + b[z], n = Math.floor(Math.sqrt(Math.max(0, B - p.j)) + 0.5);   // n × n + j nearest it",
    "  main += Math.log2(1 + n) - 4 * Math.log2(1 + Math.abs(B - p.j - n * n));",
    "}",
  ], [
    "main = 0",
    "for w, x, y, z in [(0, 1, 5, 4), (2, 3, 7, 6), (8, 9, 13, 12), (10, 11, 15, 14)]:   # each corner box, clockwise from its top-left",
    "    B = b[w] * 1000 + b[x] * 100 + b[y] * 10 + b[z]",
    "    n = math.floor(math.sqrt(max(0, B - p[\"j\"])) + 0.5)   # n × n + j nearest it",
    "    main += math.log2(1 + n) - 4 * math.log2(1 + abs(B - p[\"j\"] - n * n))",
  ]),
  dyn("light-rows", ["swap"], "each row adding up to T and reading as big a number as it can (bigger is better)", [
    "let main = 0;",
    "for (let r = 0; r < 16; r += 4) {",
    `  const R = ${ROW_TS("r")}, total = b[r] + b[r + 1] + b[r + 2] + b[r + 3];   // the row as one number, and its total`,
    "  main += Math.log2(1 + R) - 3 * Math.abs(total - p.T);",
    "}",
  ], [
    "main = 0",
    "for r in range(0, 16, 4):",
    "    R = b[r] * 1000 + b[r + 1] * 100 + b[r + 2] * 10 + b[r + 3]   # the row as one number",
    "    main += math.log2(1 + R) - 3 * abs(sum(b[r:r + 4]) - p[\"T\"])",
  ]),
  dyn("mirror-gap", ["twin"], "each cell d more than its mirror image, with big pairs (bigger is better)", [
    "let main = 0;",
    "for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {   // each cell on the first side, and its mirror image",
    "  const [mr, mc, first] = p.axis === \"left-right\" ? [r, 3 - c, c < 2] : p.axis === \"top-bottom\" ? [3 - r, c, r < 2] : p.axis === \"diagonal\" ? [c, r, c > r] : [3 - c, 3 - r, r + c < 3];",
    "  if (first) main += (b[4 * r + c] + b[4 * mr + mc]) / 4 - 2 * Math.abs(b[4 * r + c] - b[4 * mr + mc] - p.d);",
    "}",
  ], [
    "main = 0",
    "for r in range(4):",
    "    for c in range(4):   # each cell on the first side, and its mirror image",
    "        a = p[\"axis\"]",
    "        mr, mc, first = (r, 3 - c, c < 2) if a == \"left-right\" else (3 - r, c, r < 2) if a == \"top-bottom\" else (c, r, c > r) if a == \"diagonal\" else (3 - c, 3 - r, r + c < 3)",
    "        if first:",
    "            main += (b[4 * r + c] + b[4 * mr + mc]) / 4 - 2 * abs(b[4 * r + c] - b[4 * mr + mc] - p[\"d\"])",
  ]),
  dyn("power-diagonals", ["twin"], "each diagonal near a big power of b (bigger is better)", [
    "let main = 0;",
    "for (const cells of [[0, 5, 10, 15], [3, 6, 9, 12]]) {   // each diagonal as one number",
    "  const D = cells.reduce((t, i) => t * 10 + b[i], 0);",
    "  let P = p.b;   // the power of b nearest it",
    "  for (let t = p.b; t <= 2 * D + p.b; t *= p.b) if (Math.abs(t - D) < Math.abs(P - D)) P = t;",
    "  main += Math.log2(P) - 4 * Math.log2(1 + Math.abs(D - P));",
    "}",
  ], [
    "main = 0",
    "for cells in ([0, 5, 10, 15], [3, 6, 9, 12]):   # each diagonal as one number",
    "    D = 0",
    "    for i in cells:",
    "        D = D * 10 + b[i]",
    "    P = t = p[\"b\"]   # the power of b nearest it",
    "    while t <= 2 * D + p[\"b\"]:",
    "        if abs(t - D) < abs(P - D):",
    "            P = t",
    "        t *= p[\"b\"]",
    "    main += math.log2(P) - 4 * math.log2(1 + abs(D - P))",
  ]),
  dyn("adding-rows", ["line"], "line a + line b = line c, with line c big (bigger is better)", [
    "const read = i => (p.by === \"rows\" ? [4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3] : [i, i + 4, i + 8, i + 12]).reduce((t, j) => t * 10 + b[j], 0);   // a row (or column) as one number",
    "const A = read(p.a), B = read(p.b), C = read(p.c);",
    "const main = Math.log2(1 + C) - 4 * Math.log2(1 + Math.abs(A + B - C));",
  ], [
    "def read(i):   # a row (or column) as one number",
    "    v = 0",
    "    for j in ([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3] if p[\"by\"] == \"rows\" else [i, i + 4, i + 8, i + 12]):",
    "        v = v * 10 + b[j]",
    "    return v",
    "A, B, C = read(p[\"a\"]), read(p[\"b\"]), read(p[\"c\"])",
    "main = math.log2(1 + C) - 4 * math.log2(1 + abs(A + B - C))",
  ]),
  dyn("census", [], "how many numbers are too many or too few for the dealt counts (fewer is better)", [
    "const want = [...p.counts].map(Number), have = Array(10).fill(0);",
    "for (const x of b) have[x]++;",
    "const main = -have.reduce((t, k, d) => t + Math.abs(k - want[d]), 0);",
  ], [
    "main = -sum(abs(b.count(d) - int(p[\"counts\"][d])) for d in range(10))",
  ]),
  dyn("snake", ["line"], "each step along the snake s more, round the clock (bigger is better)", [
    "const top = p.start.startsWith(\"top\"), left = p.start.endsWith(\"left\"), path = [];   // the snake's cells, in order",
    "const [laneFirst, runFirst] = p.by === \"rows\" ? [top, left] : [left, top];",
    "for (let k = 0; k < 4; k++) {",
    "  const lane = laneFirst ? k : 3 - k, fwd = (k % 2 === 0) === runFirst;",
    "  for (let j = 0; j < 4; j++) { const a = fwd ? j : 3 - j; path.push(p.by === \"rows\" ? 4 * lane + a : 4 * a + lane); }",
    "}",
    "let main = 0;",
    "for (let i = 1; i < 16; i++) { const m = (((b[path[i]] - b[path[i - 1]] - p.s) % 10) + 10) % 10; main -= Math.min(m, 10 - m); }",
  ], [
    "top, left, path = p[\"start\"].startswith(\"top\"), p[\"start\"].endswith(\"left\"), []   # the snake's cells, in order",
    "lane_first, run_first = (top, left) if p[\"by\"] == \"rows\" else (left, top)",
    "for k in range(4):",
    "    lane, fwd = (k if lane_first else 3 - k), ((k % 2 == 0) == run_first)",
    "    for j in range(4):",
    "        a = j if fwd else 3 - j",
    "        path.append(4 * lane + a if p[\"by\"] == \"rows\" else 4 * a + lane)",
    "main = 0",
    "for i in range(1, 16):",
    "    m = (b[path[i]] - b[path[i - 1]] - p[\"s\"]) % 10",
    "    main -= min(m, 10 - m)",
  ]),
];
