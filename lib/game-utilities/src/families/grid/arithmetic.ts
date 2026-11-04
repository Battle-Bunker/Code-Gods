/** Arithmetic & number-pattern lens rules (lib/grid-lab/gridlab/rules/arithmetic.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import { boolParam, choiceParam, colourParam, intParam } from "../../params.ts";
import {
  SCALAR, article, bestOf, cap, chance, climb, colourAt, fromFn, full, gridFamily, pick, product, pyCard, range, list, recolourNames, sentences, symForValue, thing, tsCard, tuple, wire,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";

/** Which lines a rule scores: rows or columns, which are transposes of each other (canonically rows). "Both" was an option until P10. */
type Axis = "rows" | "cols";
const PY_AXIS: Record<Axis, [string, string]> = { rows: ["grid.rows", "row"], cols: ["grid.columns", "column"] };
const TS_AXIS: Record<Axis, string> = { rows: "grid.rows", cols: "grid.columns" };
const AXIS_WORD: Record<Axis, string> = { rows: "row", cols: "column" };
const AXIS_OPTIONS = [["rows", "rows"], ["cols", "columns"]] as const;
/** A stored `axis` / `scope` as today's: "both" (rows and columns together) is no longer a choice and reads as rows. */
const legacyAxis = (v: unknown): Axis => (v === "cols" ? "cols" : "rows");
/** A stored colour (an index, a name, or null / "any" from before a colour was required) as a colour name: "any" becomes the first colour. */
const legacyColour = (g: GridSpec, v: unknown): string => (typeof v === "number" ? g.colourNames[v] : typeof v === "string" && v !== "any" ? v : g.colourNames[0]);
const symGrid = (g: GridSpec, v: Layer) => v.map(row => row.map(x => symForValue(g, x)));

// --- the words the goal texts share (docs/rules-design.md §2) -----------------------------------------------
/** Joins sentences, skipping empty ones (the value key is "" on base 10). */
/** "every row", "every column". */
const everyLine = (axis: Axis) => `every ${AXIS_WORD[axis]}`;
/** What a tile's number is called, singular and plural: cards have values, digit sets have numbers. */
const num = (g: GridSpec) => (g.cards ? "value" : "number");
const nums = (g: GridSpec) => `${num(g)}s`;
/** "The digits go 0 to 9, then A (10), B (11)." ("" on base 10). */
const digitNote = (g: GridSpec) => (g.cards || g.vmax < 10 ? "" : `The digits go 0 to 9, then ${list(range(g.vmax - 9).map(i => g.say.tile(10 + i)))}.`);
/** A value as the board shows it: "7", "C (12)", cards "J". */
const valueTile = (g: GridSpec, v: number) => (g.cards ? g.say.tile(symForValue(g, v)).replace(/[♠♥♦♣]$/, "") : g.say.tile(v));

// --- Straight Shooter ------------------------------------------------------------------------------
type ShootP = { direction: "up" | "down"; ace_high: boolean };
const shootText = (p: ShootP, g: GridSpec): CardText => ({
  emoji: "🎯", name: "Straight Shooter", consts: [["STEP", p.direction === "up" ? 1 : -1, p.direction === "up" ? "count up" : "count down"]],
  about: sentences(
    `A run is 3 or more ${thing(g)}s in a row that count ${p.direction} by one, like ${p.direction === "up" ? "4, 5, 6" : "6, 5, 4"}.`,
    "Runs go left to right along rows, or top to bottom down columns.",
    p.ace_high ? `Aces count as 14, so a run can go ${p.direction === "up" ? "Q, K, A" : "A, K, Q"}. Here J counts 11, Q counts 12 and K counts 13.` : g.say.valueKey(),
    "A run scores its length times itself, so 3 in a row is 9 points. Double that if the whole run is one colour.",
    "Most points wins. If that's a tie, the most single steps wins: each pair of neighbours in a line that count by one.",
  ),
});
const straightShooter = gridFamily<ShootP>({
  id: "straight_shooter", name: "Straight Shooter", emoji: "🎯", theme: "Rows and columns that count",
  requires: { classes: ["Valued", "Ranked"] }, shape: tuple(2), tags: ["shortlist"],
  params: () => ({
    direction: choiceParam("Counting", [["up", "count up"], ["down", "count down"]]),
    ace_high: boolParam("Aces count high"),
  }),
  // The "double for one colour" option only added scoring opportunity (P10): runs of one colour always double.
  legacy: p => (typeof p.step === "number" || "flush" in p
    ? { direction: typeof p.step === "number" ? (p.step === 1 ? "up" : "down") : p.direction as ShootP["direction"], ace_high: p.ace_high as boolean } : null),
  support: g => product<ShootP>({ direction: ["up", "down"], ace_high: g.cards ? [false, true] : [false] }),
  sample: (rng, g) => ({ direction: pick(rng, ["up", "down"] as const), ace_high: g.cards && chance(rng, 1, 2) }),
  canonical: p => ({ ...p, direction: "up" }),
  summary: (p, g) => shootText(p, g).about,
  python: (p, g) => pyCard(shootText(p, g), `
    def number(cell):
        return ${p.ace_high ? "14 if cell.value == 1 else cell.value" : "cell.value"}

    def one_colour(run):
        for cell in run:
            if cell.colour != run[0].colour:
                return False
        return True

    def runs(line):
        out = [[line[0]]]
        for cell in line[1:]:
            if number(cell) == number(out[-1][-1]) + STEP:
                out[-1].append(cell)
            else:
                out.append([cell])
        return out

    def utility(grid):
        score = 0
        steps = 0
        for line in grid.rows + grid.columns:
            for run in runs(line):
                steps += len(run) - 1
                if len(run) >= 3:
                    points = len(run) * len(run)
                    if one_colour(run):
                        points *= 2
                    score += points
        return (score, steps)`),
  typescript: (p, g) => tsCard(shootText(p, g), `
    function number(cell) {
      return ${p.ace_high ? "cell.value === 1 ? 14 : cell.value" : "cell.value"};
    }

    function oneColour(run) {
      for (const cell of run) {
        if (cell.colour !== run[0].colour) return false;
      }
      return true;
    }

    function runs(line) {
      const out = [[line[0]]];
      for (const cell of line.slice(1)) {
        const last = out[out.length - 1];
        if (number(cell) === number(last[last.length - 1]) + STEP) last.push(cell);
        else out.push([cell]);
      }
      return out;
    }

    function utility(grid) {
      let score = 0;
      let steps = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        for (const run of runs(line)) {
          steps += run.length - 1;
          if (run.length >= 3) {
            let points = run.length * run.length;
            if (oneColour(run)) points *= 2;
            score += points;
          }
        }
      }
      return [score, steps];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, [lo, hi] = p.ace_high ? [2, 14] : [g.vmin, g.vmax], R = hi - lo;
    const sg = (v: Layer): Layer => (p.ace_high ? v.map(row => row.map(x => (x === 14 ? 0 : x - 1))) : symGrid(g, v));
    const cands: Cand[] = [];
    for (const f of [(r: number, c: number) => lo + r + c, (_: number, c: number) => lo + c,
      (r: number, c: number) => lo + Math.min(r + c, R), (r: number, c: number) => lo + ((r + c) % (R + 1))]) {
      const v = fromFn(N, f);
      if (Math.max(...v.flat()) > hi) continue;
      let s = sg(v);
      if (p.direction === "down") s = s.slice().reverse().map(row => row.slice().reverse());
      cands.push({ sym: s, col: full(N, 0) });
    }
    return bestOf("straight_shooter", p, ctx, cands);
  },
});

// --- Number Bonds ----------------------------------------------------------------------------------
type BondsP = Record<string, never>;
const bondsText = (g: GridSpec): CardText => ({
  emoji: "🤝", name: "Number Bonds", consts: [["TARGET", g.vmax + 1]],
  about: sentences(
    `Two touching cells are best friends when their ${nums(g)} add up to ${g.vmax + 1}.`,
    g.say.valueKey(),
    "Every pair of best friends scores 1 point.",
  ),
});
const numberBonds = gridFamily<BondsP>({
  id: "number_bonds", name: "Number Bonds", emoji: "🤝", theme: "Neighbours that make the magic number",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  params: () => ({}),
  // The pair-colour mode (any | same | different) changed what can score, not just how: only "any colours" is left (P10).
  legacy: p => (Object.keys(p).length ? {} : null),
  support: () => [{}],
  summary: (_, g) => bondsText(g).about,
  python: (_, g) => pyCard(bondsText(g), `
    def utility(grid):
        bonds = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and cell.value + other.value == TARGET:
                    bonds += 1
        return bonds`),
  typescript: (_, g) => tsCard(bondsText(g), `
    function utility(grid) {
      let bonds = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && cell.value + other.value === TARGET) bonds += 1;
        }
      }
      return bonds;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, symForValue(g, Math.floor((g.vmax + 1) / 2))), full(g.N, 0)),
});

// --- Magic Accountant ------------------------------------------------------------------------------
type MagicP = { axis: Axis; target: number };
/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
}
/** Magic numbers within this many of the middle total are equally hard to hit (top bits agree within 15% on every shape). */
const MAGIC_SPREAD = 3;
function magicTargets(g: GridSpec): number[] {
  const N = g.N, mid = roundHalfEven((N * (g.vmin + g.vmax)) / 2), out = new Set<number>();
  for (let k = -MAGIC_SPREAD; k <= MAGIC_SPREAD; k++) out.add(Math.min(Math.max(mid + k, N * g.vmin), N * g.vmax));
  return [...out].sort((a, b) => a - b);
}
const magicText = (p: MagicP, g: GridSpec): CardText => ({
  emoji: "🧮", name: "Magic Accountant", consts: [["TARGET", p.target]],
  about: sentences(
    `Your magic number is ${p.target}.`,
    `${cap(everyLine(p.axis))} whose ${nums(g)} add up to exactly ${p.target} scores 1 point.`,
    g.say.valueKey(),
    `Most points wins. If that's a tie, the totals that are closest to ${p.target} overall win.`,
  ),
});
const magicAccountant = gridFamily<MagicP>({
  id: "magic_accountant", name: "Magic Accountant", emoji: "🧮", theme: "Lines that add up to your magic number",
  analytic: solvedAnalytic("magic_accountant"),
  requires: { classes: ["Valued"] }, shape: tuple(2), tags: ["shortlist"],
  params: g => {
    const t = magicTargets(g);
    return {
      axis: choiceParam("Lines that count", AXIS_OPTIONS),
      target: intParam("Magic number", t[0], t[t.length - 1]),
    };
  },
  // "Rows and columns" doubled the lines that could score, and magic numbers far from the middle total are harder to hit (P10).
  legacy: p => (typeof p.T === "number" || p.axis === "both"
    ? { axis: legacyAxis(p.axis), target: typeof p.T === "number" ? p.T : p.target as number } : null),
  support: g => product<MagicP>({ axis: ["rows", "cols"], target: magicTargets(g) }),
  sample: (rng, g) => {
    const N = g.N, mid = roundHalfEven((N * (g.vmin + g.vmax)) / 2);
    const target = Math.min(Math.max(mid + rng.int(2 * MAGIC_SPREAD + 1) - MAGIC_SPREAD, N * g.vmin), N * g.vmax);
    return { axis: pick(rng, ["rows", "cols"] as const), target };
  },
  canonical: (p, g) => ({ axis: "rows", target: Math.min(p.target, g.N * (g.vmin + g.vmax) - p.target) }),
  summary: (p, g) => magicText(p, g).about,
  python: (p, g) => pyCard(magicText(p, g), `
    def utility(grid):
        exact = 0
        distance = 0
        for line in ${PY_AXIS[p.axis][0]}:
            total = 0
            for cell in line:
                total += cell.value
            if total == TARGET:
                exact += 1
            distance += abs(total - TARGET)
        return (exact, -distance)`),
  typescript: (p, g) => tsCard(magicText(p, g), `
    function utility(grid) {
      let exact = 0;
      let distance = 0;
      for (const line of ${TS_AXIS[p.axis]}) {
        let total = 0;
        for (const cell of line) total += cell.value;
        if (total === TARGET) exact += 1;
        distance += Math.abs(total - TARGET);
      }
      return [exact, -distance];
    }`),
  exemplar: (p, g) => {
    const N = g.N, row = Array<number>(N).fill(g.vmin);
    let rem = p.target - N * g.vmin;
    for (let i = 0; i < N; i++) { const add = Math.min(g.vmax - g.vmin, rem); row[i] += add; rem -= add; }
    return wire(g, symGrid(g, fromFn(N, (r, c) => row[(c + r) % N])), full(N, 0));
  },
});

// --- King of the Hill ------------------------------------------------------------------------------
type KingP = { colour: string; valley: boolean };
const kingText = (p: KingP, g: GridSpec): CardText => ({
  emoji: p.valley ? "🕳️" : "⛰️", name: p.valley ? "King of the Valley" : "King of the Hill",
  consts: [["MY_COLOUR", p.colour]],
  about: sentences(
    `${cap(article(p.colour))} cell is ${p.valley ? "in a valley" : "a king"} when its ${num(g)} is `
      + `${p.valley ? "smaller" : "bigger"} than every cell touching it.`,
    g.say.valueKey(),
    `Each ${p.valley ? "valley" : "king"} scores 1 point.`,
  ),
});
const kingOfTheHill = gridFamily<KingP>({
  id: "king_of_the_hill", name: "King of the Hill", emoji: "⛰️", theme: "Mountain tops in your colour",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  params: () => ({ colour: colourParam("Your colour"), valley: boolParam("Valleys instead of hills") }),
  legacy: (p, g) => (typeof p.X === "number" ? { colour: g.colourNames[p.X], valley: p.valley as boolean } : null),
  support: g => product<KingP>({ colour: g.colourNames, valley: [false, true] }),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)], valley: chance(rng, 3, 10) }),
  canonical: (_, g) => ({ colour: g.colourNames[0], valley: false }), // value reflection maps valleys to peaks
  summary: (p, g) => kingText(p, g).about,
  python: (p, g) => pyCard(kingText(p, g), `
    def utility(grid):
        kings = 0
        for cell in grid.cells:
            if cell.colour != MY_COLOUR:
                continue
            if all(cell.value ${p.valley ? "<" : ">"} other.value for other in cell.neighbours):
                kings += 1
        return kings`),
  typescript: (p, g) => tsCard(kingText(p, g), `
    function utility(grid) {
      let kings = 0;
      for (const cell of grid.cells) {
        if (cell.colour !== MY_COLOUR) continue;
        if (cell.neighbours.every(other => cell.value ${p.valley ? "<" : ">"} other.value)) kings += 1;
      }
      return kings;
    }`),
  exemplar: (p, g) => {
    const hi = symForValue(g, g.vmax), lo = symForValue(g, g.vmin), [top, bot] = p.valley ? [lo, hi] : [hi, lo];
    return wire(g, fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? top : bot)), full(g.N, colourAt(g, p.colour)));
  },
});

// --- Divisibility Detective ------------------------------------------------------------------------
type DivP = { scope: Axis };
/** The divisor: one less than the base (9 in base 10, the digit-sum rule). Divisors differ in how often a line divides (P10). */
const divisorOf = (g: GridSpec) => g.base! - 1;
const divText = (p: DivP, g: GridSpec): CardText => ({
  emoji: "🔍", name: "Divisibility Detective", consts: [["BASE", g.base!], ["DIVIDE_BY", divisorOf(g)]],
  about: sentences(
    `Read ${p.scope === "cols" ? "each column from top to bottom" : "each row"} as one big number in base ${g.base}.`,
    digitNote(g),
    `Each one that divides exactly by ${divisorOf(g)}${g.base !== 10 && divisorOf(g) >= 10 ? " (counting the normal way)" : ""} scores 1 point.`,
  ),
});
const divisibility = gridFamily<DivP>({
  id: "divisibility_detective", name: "Divisibility Detective", emoji: "🔍", theme: "Rows read as numbers that divide evenly",
  analytic: solvedAnalytic("divisibility_detective"),
  requires: { classes: ["Numeral"] }, shape: SCALAR, tags: ["shortlist"],
  params: () => ({ scope: choiceParam("Numbers read", [["rows", "rows"], ["cols", "columns"]]) }),
  // Divisors other than base − 1, and reading rows and columns together, changed what can score (P10).
  legacy: p => (typeof p.m === "number" || "divisor" in p || p.scope === "both" ? { scope: legacyAxis(p.scope) } : null),
  support: () => (["rows", "cols"] as const).map(scope => ({ scope })),
  canonical: () => ({ scope: "rows" }),
  summary: (p, g) => divText(p, g).about,
  python: (p, g) => pyCard(divText(p, g), `
    def utility(grid):
        found = 0
        for line in ${PY_AXIS[p.scope][0]}:
            number = 0
            for cell in line:
                number = number * BASE + cell.value
            if number % DIVIDE_BY == 0:
                found += 1
        return found`),
  typescript: (p, g) => tsCard(divText(p, g), `
    function utility(grid) {
      let found = 0;
      for (const line of ${TS_AXIS[p.scope]}) {
        let number = 0;
        for (const cell of line) number = number * BASE + cell.value;
        if (number % DIVIDE_BY === 0) found += 1;
      }
      return found;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

export { roundHalfEven };

// ================================================================================================
// Not shortlisted (new cards, checked against grid-lab by test/gridlab_parity.py)
// ================================================================================================

/** The card constant for the colour a rule is about. */
const colourConst = (colour: string) => [["MY_COLOUR", colour] as const];

// --- Round Numbers -----------------------------------------------------------------------------------
type RoundP = { axis: Axis };
const roundText = (p: RoundP, g: GridSpec): CardText => ({
  emoji: "⭕", name: "Round Numbers", consts: [["BASE", g.base!]],
  about: sentences(
    `Add up the numbers in ${everyLine(p.axis)}.`,
    g.say.valueKey(),
    `A total that is a multiple of ${g.base} is a round number (it ends in 0 in base ${g.base}) and scores 1 point.`,
    `Most points wins. If that's a tie, totals nearer to a multiple of ${g.base} win.`,
  ),
});
const roundNumbers = gridFamily<RoundP>({
  id: "round_numbers", name: "Round Numbers", emoji: "⭕", theme: "Line totals that end in zero",
  analytic: solvedAnalytic("round_numbers"),
  requires: { classes: ["Numeral"] }, shape: tuple(2),
  params: () => ({ axis: choiceParam("Lines that count", AXIS_OPTIONS) }),
  // Rows and columns together doubled the lines that could score (P10).
  legacy: p => (p.axis === "both" ? { axis: "rows" } : null),
  support: () => (["rows", "cols"] as const).map(axis => ({ axis })),
  canonical: () => ({ axis: "rows" }),
  summary: (p, g) => roundText(p, g).about,
  python: (p, g) => pyCard(roundText(p, g), `
    def utility(grid):
        round_lines = 0
        near = 0
        for line in ${PY_AXIS[p.axis][0]}:
            total = 0
            for cell in line:
                total += cell.value
            left = total % BASE
            if left == 0:
                round_lines += 1
            near += BASE // 2 - min(left, BASE - left)
        return (round_lines, near)`),
  typescript: (p, g) => tsCard(roundText(p, g), `
    function utility(grid) {
      let roundLines = 0;
      let near = 0;
      for (const line of ${TS_AXIS[p.axis]}) {
        let total = 0;
        for (const cell of line) total += cell.value;
        const left = total % BASE;
        if (left === 0) roundLines += 1;
        near += Math.floor(BASE / 2) - Math.min(left, BASE - left);
      }
      return [roundLines, near];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Number Sandwich --------------------------------------------------------------------------------------
type SandP = { colour: string };
const sandText = (p: SandP, g: GridSpec): CardText => ({
  emoji: "🥙", name: "Number Sandwich", consts: colourConst(p.colour),
  about: sentences(
    "Look at any 3 cells in a row, across or down.",
    `If the middle ${num(g)} is the two outside ${nums(g)} added, that is a sandwich, like 2, 5, 3.`,
    g.cards ? "" : "The outside numbers can't be 0.",
    `The middle cell must be ${p.colour}.`,
    g.say.valueKey(),
    "Each sandwich scores 1 point.",
  ),
});
const numberSandwich = gridFamily<SandP>({
  id: "number_sandwich", name: "Number Sandwich", emoji: "🥙", theme: "The middle number is the total",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: g => ({ colour: colourParam("Colour of the total cell") }),
  // The "last is the total" kind and "any colour" changed what can score, not just how (P10): only a coloured middle total is left.
  legacy: (p, g) => ("X" in p || "mode" in p || p.colour === "any" ? { colour: legacyColour(g, "X" in p ? p.X : p.colour) } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => sandText(p, g).about,
  python: (p, g) => pyCard(sandText(p, g), `
    def utility(grid):
        points = 0
        for line in grid.rows + grid.columns:
            for i in range(len(line) - 2):
                a, b, c = line[i], line[i + 1], line[i + 2]
                if a.value > 0 and c.value > 0 and b.value == a.value + c.value and b.colour == MY_COLOUR:
                    points += 1
        return points`),
  typescript: (p, g) => tsCard(sandText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const line of [...grid.rows, ...grid.columns]) {
        for (let i = 0; i < line.length - 2; i++) {
          const a = line[i], b = line[i + 1], c = line[i + 2];
          if (a.value > 0 && c.value > 0 && b.value === a.value + c.value && b.colour === MY_COLOUR) points += 1;
        }
      }
      return points;
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, X = colourAt(g, p.colour), fib = [1, 1, 2, 3, 5, 8, 13];
    const vs = [fromFn(N, (r, c) => ((r + c) % 2 === 0 ? 1 : 2)), fromFn(N, (r, c) => [1, 1, 2][(r + c) % 3]),
      fromFn(N, (_, c) => [1, 1, 2][c % 3])];
    if (g.vmax >= 8) vs.push(fromFn(N, (_, c) => fib[Math.min(c, g.vmax < 13 ? 5 : 6)]));
    return bestOf("number_sandwich", p, ctx, vs.map(v => ({ sym: symGrid(g, v), col: full(N, X) })));
  },
});

// --- Magic Window ---------------------------------------------------------------------------------------
type WindowP = { colour: string };
const windowText = (p: WindowP, g: GridSpec): CardText => ({
  emoji: "🪟", name: "Magic Window", consts: colourConst(p.colour),
  about: sentences(
    "Look at every 3×3 window. In each one, a line is a row, column or diagonal of 3 cells.",
    `A line scores 1 point when its ${nums(g)} add up to 3 times the middle cell's ${num(g)}, unless all 3 are the same.`,
    `A window only counts if its middle cell is ${p.colour}.`,
    g.say.valueKey(),
    "The window with the most scoring lines wins (8 is a perfect magic square). If that's a tie, the most scoring lines over all windows wins.",
  ),
});
const magicWindow = gridFamily<WindowP>({
  id: "magic_window", name: "Magic Window", emoji: "🪟", theme: "Find a magic square",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  params: () => ({ colour: colourParam("Colour of the middle cell") }),
  // "Any colour" let every window count (P10): the middle cell has to be a colour.
  legacy: (p, g) => ("X" in p || p.colour === "any" ? { colour: legacyColour(g, "X" in p ? p.X : p.colour) } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => windowText(p, g).about,
  python: (p, g) => pyCard(windowText(p, g), `
    def window_lines(grid, top, left):
        rows = [[grid.cell(top + i, left + j) for j in range(3)] for i in range(3)]
        columns = [[row[j] for row in rows] for j in range(3)]
        diagonals = [[rows[0][0], rows[1][1], rows[2][2]], [rows[0][2], rows[1][1], rows[2][0]]]
        return rows + columns + diagonals

    def magic(grid, top, left):
        middle = grid.cell(top + 1, left + 1)
        if middle.colour != MY_COLOUR:
            return 0
        lines = 0
        for line in window_lines(grid, top, left):
            values = [cell.value for cell in line]
            if sum(values) == 3 * middle.value and len(set(values)) > 1:
                lines += 1
        return lines

    def utility(grid):
        best = 0
        total = 0
        for top in range(grid.size - 2):
            for left in range(grid.size - 2):
                lines = magic(grid, top, left)
                best = max(best, lines)
                total += lines
        return (best, total)`),
  typescript: (p, g) => tsCard(windowText(p, g), `
    function windowLines(grid, top, left) {
      const rows = [0, 1, 2].map(i => [0, 1, 2].map(j => grid.cell(top + i, left + j)));
      const columns = [0, 1, 2].map(j => rows.map(row => row[j]));
      const diagonals = [[rows[0][0], rows[1][1], rows[2][2]], [rows[0][2], rows[1][1], rows[2][0]]];
      return [...rows, ...columns, ...diagonals];
    }

    function magic(grid, top, left) {
      const middle = grid.cell(top + 1, left + 1);
      if (middle.colour !== MY_COLOUR) return 0;
      let lines = 0;
      for (const line of windowLines(grid, top, left)) {
        const values = line.map(cell => cell.value);
        const sum = values[0] + values[1] + values[2];
        if (sum === 3 * middle.value && new Set(values).size > 1) lines += 1;
      }
      return lines;
    }

    function utility(grid) {
      let best = 0;
      let total = 0;
      for (let top = 0; top < grid.size - 2; top++) {
        for (let left = 0; left < grid.size - 2; left++) {
          const lines = magic(grid, top, left);
          best = Math.max(best, lines);
          total += lines;
        }
      }
      return [best, total];
    }`),
  exemplar: (p, g) => {
    const sq = [[2, 7, 6], [9, 5, 1], [4, 3, 8]];
    return wire(g, symGrid(g, fromFn(g.N, (r, c) => (r < 3 && c < 3 ? sq[r][c] : 5))), full(g.N, colourAt(g, p.colour)));
  },
});

// --- Times-Table Territory --------------------------------------------------------------------------------
/** The times table: tables (3, 4, 5, primes) differ in how many numbers they hold, so top bits differ by up to 40% (P10); 4 is on every menu. */
const TIMES = 4;
type TimesP = { colour: string };
const timesText = (p: TimesP, g: GridSpec): CardText => ({
  emoji: "✖️", name: "Times-Table Territory",
  consts: [["TIMES", TIMES], ...colourConst(p.colour)],
  about: sentences(
    `Find the biggest patch of touching cells that all show ${nums(g)} in the ${TIMES} times table`
      + `: ${g.say.values(range(g.vmax + 1).filter(v => v >= g.vmin && v % TIMES === 0), "or")}.`,
    `Every cell in the patch must also be ${p.colour}.`,
    g.say.valueKey(),
    "Each cell in the patch scores 1 point.",
  ),
});
const timesTable = gridFamily<TimesP>({
  id: "times_table_territory", name: "Times-Table Territory", emoji: "✖️", theme: "The biggest patch of your times table",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({ colour: colourParam("Colour of the patch") }),
  // Other tables (3, 5, 6, primes) and "any colour" changed what can score, not just how (P10): the 4 times table in a colour is left.
  legacy: (p, g) => ("X" in p || "table" in p || p.colour === "any" ? { colour: legacyColour(g, "X" in p ? p.X : p.colour) } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => timesText(p, g).about,
  python: (p, g) => pyCard(timesText(p, g), `
    def good(cell):
        return cell.value % TIMES == 0 and cell.colour == MY_COLOUR

    def both_good(a, b):
        return good(a) and good(b)

    def utility(grid):
        best = 0
        for patch in grid.regions(both_good):
            if good(patch[0]):
                best = max(best, len(patch))
        return best`),
  typescript: (p, g) => tsCard(timesText(p, g), `
    function good(cell) {
      return cell.value % TIMES === 0 && cell.colour === MY_COLOUR;
    }

    function bothGood(a, b) {
      return good(a) && good(b);
    }

    function utility(grid) {
      let best = 0;
      for (const patch of grid.regions(bothGood)) {
        if (good(patch[0])) best = Math.max(best, patch.length);
      }
      return best;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, g.vmin === 0 ? 0 : TIMES)), full(g.N, colourAt(g, p.colour))),
});

// --- Odds & Evens ----------------------------------------------------------------------------------------
type OddP = { colour: string };
const oddText = (p: OddP, g: GridSpec): CardText => ({
  emoji: "🏁", name: "Odds & Evens", consts: colourConst(p.colour),
  about: sentences(
    `Look at every 2×2 square. It is a chessboard when odd and even ${nums(g)} alternate: odd, even on top and even, odd below, or the other way round.`,
    g.say.valueKey(),
    `Each chessboard scores 1 point, as long as all its odd ${nums(g)} are on ${p.colour} cells.`,
  ),
});
const oddsEvens = gridFamily<OddP>({
  id: "odds_evens", name: "Odds & Evens", emoji: "🏁", theme: "A chessboard of odd and even numbers",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({ colour: colourParam("Colour of the odd numbers") }),
  // "Any colour" let every chessboard count (P10): the odd numbers have to sit on a colour.
  legacy: (p, g) => ("X" in p || p.colour === "any" ? { colour: legacyColour(g, "X" in p ? p.X : p.colour) } : null),
  support: g => g.colourNames.map(colour => ({ colour })),
  sample: (rng, g) => ({ colour: g.colourNames[rng.int(g.C)] }),
  canonical: (p, g) => recolourNames(g, p, ["colour"]),
  summary: (p, g) => oddText(p, g).about,
  python: (p, g) => pyCard(oddText(p, g), `
    def odd(cell):
        return cell.value % 2 == 1

    def utility(grid):
        boards = 0
        for cell in grid.cells:
            right, below = cell.right, cell.down
            if right is None or below is None:
                continue
            corner = below.right
            if odd(cell) == odd(corner) and odd(right) == odd(below) and odd(cell) != odd(right):
                square = [cell, right, below, corner]
                if all(other.colour == MY_COLOUR for other in square if odd(other)):
                    boards += 1
        return boards`),
  typescript: (p, g) => tsCard(oddText(p, g), `
    function odd(cell) {
      return cell.value % 2 === 1;
    }

    function utility(grid) {
      let boards = 0;
      for (const cell of grid.cells) {
        const right = cell.right, below = cell.down;
        if (right === null || below === null) continue;
        const corner = below.right;
        if (odd(cell) === odd(corner) && odd(right) === odd(below) && odd(cell) !== odd(right)) {
          const square = [cell, right, below, corner];
          if (square.filter(odd).every(other => other.colour === MY_COLOUR)) boards += 1;
        }
      }
      return boards;
    }`),
  exemplar: (p, g) => wire(g, symGrid(g, fromFn(g.N, (r, c) => g.vmin + ((r + c) % 2))), full(g.N, colourAt(g, p.colour))),
});

// --- Number Painter ---------------------------------------------------------------------------------------
type PaintP = { first_number: number };
/** The number the first colour is worth: every value that leaves room for the other colours after it. */
const firstNumbers = (g: GridSpec) => range(g.vmax - g.C + 2 - g.vmin).map(k => g.vmin + k);
const paintText = (p: PaintP, g: GridSpec): CardText => ({
  emoji: "🖍️", name: "Number Painter", consts: [["FIRST", p.first_number, `${g.colourNames[0]} is worth this, the next colour one more, ...`]],
  about: sentences(
    "Each colour has a number: " + g.colourNames.map((n, i) => `${n} = ${valueTile(g, i + p.first_number)}`).join(", ") + ".",
    g.say.valueKey(),
    `Every cell whose ${num(g)} matches its colour scores 1 point.`,
  ),
});
const numberPainter = gridFamily<PaintP>({
  id: "number_painter", name: "Number Painter", emoji: "🖍️", theme: "Paint by numbers",
  analytic: solvedAnalytic("number_painter"),
  requires: { classes: ["Valued", "Spectral"] }, shape: SCALAR,
  params: g => ({ first_number: intParam("Number of the first colour", g.vmin, g.vmax - g.C + 1) }),
  legacy: p => (typeof p.o === "number" ? { first_number: p.o + 1 } : null),
  support: g => firstNumbers(g).map(first_number => ({ first_number })),
  canonical: (_, g) => ({ first_number: firstNumbers(g)[0] }),
  summary: (p, g) => paintText(p, g).about,
  python: (p, g) => pyCard(paintText(p, g), `
    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.value == FIRST + grid.palette.index(cell.colour):
                points += 1
        return points`),
  typescript: (p, g) => tsCard(paintText(p, g), `
    function utility(grid) {
      let points = 0;
      for (const cell of grid.cells) {
        if (cell.value === FIRST + grid.palette.indexOf(cell.colour)) points += 1;
      }
      return points;
    }`),
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, p.first_number)), full(g.N, 0)),
});

// --- Robin Hood -------------------------------------------------------------------------------------------
const robinText = (g: GridSpec): CardText => ({
  emoji: "🏹", name: "Robin Hood", consts: [],
  about: sentences(
    `Add up the ${nums(g)} of each colour.`,
    g.say.valueKey(),
    "The poorest colour has the smallest total and the richest has the biggest.",
    "Your score in points is the poorest total, minus how far the richest total is ahead of it.",
  ),
});
const robinHood = gridFamily<Record<string, never>>({
  id: "robin_hood", name: "Robin Hood", emoji: "🏹", theme: "Fair shares for every colour",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => robinText(g).about,
  python: (_, g) => pyCard(robinText(g), `
    def utility(grid):
        totals = []
        for colour in grid.palette:
            total = 0
            for cell in grid.cells:
                if cell.colour == colour:
                    total += cell.value
            totals.append(total)
        poorest = min(totals)
        richest = max(totals)
        return poorest - (richest - poorest)`),
  typescript: (_, g) => tsCard(robinText(g), `
    function utility(grid) {
      const totals = [];
      for (const colour of grid.palette) {
        let total = 0;
        for (const cell of grid.cells) {
          if (cell.colour === colour) total += cell.value;
        }
        totals.push(total);
      }
      const poorest = Math.min(...totals);
      const richest = Math.max(...totals);
      return poorest - (richest - poorest);
    }`),
  exemplar: (_, g) => {
    const N = g.N, C = g.C, lo = g.vmin, hi = g.vmax, n = N * N, T = Math.floor(n / C) * hi;
    const col = range(n).map(i => i % C), v = Array<number>(n).fill(0);
    for (let k = 0; k < C; k++) {
      const idx = range(n).filter(i => col[i] === k);
      let rem = T;
      idx.forEach((i, j) => { v[i] = Math.max(lo, Math.min(hi, rem - (idx.length - j - 1) * lo)); rem -= v[i]; });
    }
    return wire(g, fromFn(N, (r, c) => symForValue(g, v[r * N + c])), fromFn(N, (r, c) => col[r * N + c]));
  },
});

// --- Seesaw ------------------------------------------------------------------------------------------------
type SeesawP = { scope: Axis };
const seesawText = (p: SeesawP, g: GridSpec): CardText => ({
  emoji: "⚖️", name: "Seesaw", consts: [],
  about: sentences(
    `Treat ${everyLine(p.scope)} as a seesaw.`,
    `Add up the ${nums(g)} in its left half and its right half, skipping the middle cell if there is one.`,
    g.say.valueKey(),
    "A seesaw balances when both sides match. Each balanced seesaw scores 1 point.",
    "Most points wins. If that's a tie, the smaller total gap between the two sides wins.",
  ),
});
const seesaw = gridFamily<SeesawP>({
  id: "seesaw", name: "Seesaw", emoji: "⚖️", theme: "Lines that balance",
  analytic: solvedAnalytic("seesaw"),
  requires: { classes: ["Valued"] }, shape: tuple(2),
  params: () => ({ scope: choiceParam("Lines that count", AXIS_OPTIONS) }),
  // Rows and columns together, and sides by colour, changed what can score, not just how (P10): left and right halves of rows or columns are left.
  legacy: p => ("X" in p || "mode" in p || p.scope === "both" ? { scope: legacyAxis(p.scope) } : null),
  support: () => (["rows", "cols"] as const).map(scope => ({ scope })),
  canonical: () => ({ scope: "rows" }),
  summary: (p, g) => seesawText(p, g).about,
  python: (p, g) => pyCard(seesawText(p, g), `
    def lean(line):
        half = len(line) // 2
        left = sum(cell.value for cell in line[:half])
        right = sum(cell.value for cell in line[len(line) - half:])
        return abs(left - right)

    def utility(grid):
        balanced = 0
        wobble = 0
        for line in ${PY_AXIS[p.scope][0]}:
            off = lean(line)
            if off == 0:
                balanced += 1
            wobble += off
        return (balanced, -wobble)`),
  typescript: (p, g) => tsCard(seesawText(p, g), `
    function total(cells) {
      let sum = 0;
      for (const cell of cells) sum += cell.value;
      return sum;
    }

    function lean(line) {
      const half = Math.floor(line.length / 2);
      return Math.abs(total(line.slice(0, half)) - total(line.slice(line.length - half)));
    }

    function utility(grid) {
      let balanced = 0;
      let wobble = 0;
      for (const line of ${TS_AXIS[p.scope]}) {
        const off = lean(line);
        if (off === 0) balanced += 1;
        wobble += off;
      }
      return [balanced, -wobble];
    }`),
  exemplar: (_, g) => wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, 0)),
});

// --- Stepping Stones ----------------------------------------------------------------------------------------
/** The hop: sizes differ in how many neighbours they join, so top bits differ by up to 60% across hops (P10); 2 is on every menu. */
const HOP = 2;
type HopP = Record<string, never>;
const hopText = (g: GridSpec): CardText => ({
  emoji: "🪨", name: "Stepping Stones", consts: [["HOP", HOP]],
  about: sentences(
    `You can hop between touching cells whose ${nums(g)} differ by exactly ${HOP}.`,
    g.say.valueKey(),
    "A group is every cell you can reach by hopping from one cell.",
    "Your score is the size of the biggest group, 1 point per cell.",
  ),
});
const steppingStones = gridFamily<HopP>({
  id: "stepping_stones", name: "Stepping Stones", emoji: "🪨", theme: "Hop between numbers that differ by your step",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({}),
  // The hop size was a param; sizes joined different numbers of neighbours (P10), so only one is left.
  legacy: p => (Object.keys(p).length ? {} : null),
  support: () => [{}],
  summary: (_, g) => hopText(g).about,
  python: (_, g) => pyCard(hopText(g), `
    def hop(a, b):
        return abs(a.value - b.value) == HOP

    def utility(grid):
        best = 0
        for group in grid.regions(hop):
            best = max(best, len(group))
        return best`),
  typescript: (_, g) => tsCard(hopText(g), `
    function hop(a, b) {
      return Math.abs(a.value - b.value) === HOP;
    }

    function utility(grid) {
      let best = 0;
      for (const group of grid.regions(hop)) best = Math.max(best, group.length);
      return best;
    }`),
  exemplar: (_, g) => wire(g, symGrid(g, fromFn(g.N, (r, c) => g.vmin + HOP * ((r + c) % 2))), full(g.N, 0)),
});

// --- Column Addition ----------------------------------------------------------------------------------------
type SumP = { top_row: number };
const sumText = (p: SumP, g: GridSpec): CardText => ({
  emoji: "➕", name: "Column Addition", consts: [["TOP", p.top_row, "rows count from 0 at the top"], ["BASE", g.base!]],
  about: sentences(
    `Rows ${p.top_row + 1} and ${p.top_row + 2} are added together, like a written sum in base ${g.base}, and row ${p.top_row + 3} is the answer.`,
    digitNote(g),
    `Work from the right-hand end, and carry 1 whenever a column adds up to ${g.base} or more.`,
    "Most columns right in a row from the right-hand end wins. If that's a tie, the most right columns anywhere wins.",
    "The top row of the sum can't be all zeros.",
  ),
});
const columnAddition = gridFamily<SumP>({
  id: "column_addition", name: "Column Addition", emoji: "➕", theme: "Three rows make a written sum",
  analytic: solvedAnalytic("column_addition"),
  requires: { classes: ["Numeral"] }, shape: tuple(2),
  params: g => ({ top_row: intParam("Row of the first number (0 is the top)", 0, g.N - 3) }),
  legacy: p => (typeof p.top === "number" ? { top_row: p.top } : null),
  support: g => range(g.N - 2).map(top_row => ({ top_row })),
  canonical: () => ({ top_row: 0 }),
  summary: (p, g) => sumText(p, g).about,
  python: (p, g) => pyCard(sumText(p, g), `
    def utility(grid):
        a, b, answer = grid.rows[TOP], grid.rows[TOP + 1], grid.rows[TOP + 2]
        if all(cell.value == 0 for cell in a):
            return (0, 0)
        carry = 0
        from_right = 0
        right = 0
        still_right = True
        for i in range(grid.size - 1, -1, -1):
            total = a[i].value + b[i].value + carry
            ok = total % BASE == answer[i].value
            if ok:
                right += 1
            still_right = still_right and ok
            if still_right:
                from_right += 1
            carry = total // BASE
        return (from_right, right)`),
  typescript: (p, g) => tsCard(sumText(p, g), `
    function utility(grid) {
      const a = grid.rows[TOP], b = grid.rows[TOP + 1], answer = grid.rows[TOP + 2];
      if (a.every(cell => cell.value === 0)) return [0, 0];
      let carry = 0;
      let fromRight = 0;
      let right = 0;
      let stillRight = true;
      for (let i = grid.size - 1; i >= 0; i--) {
        const total = a[i].value + b[i].value + carry;
        const ok = total % BASE === answer[i].value;
        if (ok) right += 1;
        stillRight = stillRight && ok;
        if (stillRight) fromRight += 1;
        carry = Math.floor(total / BASE);
      }
      return [fromRight, right];
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, r => (r === p.top_row || r === p.top_row + 1 ? 1 : r === p.top_row + 2 ? 2 : 0)), full(g.N, 0)),
});

// --- Ladder of Numbers ---------------------------------------------------------------------------------------
type LadderP = { direction: "down" | "up" };
const ladderText = (p: LadderP, g: GridSpec): CardText => ({
  emoji: "🪜", name: "Ladder of Numbers", consts: [["BASE", g.base!]],
  about: sentences(
    `Read each row as one big number in base ${g.base}.`,
    digitNote(g),
    `Going ${p.direction} the page, each row should be bigger than the row before it.`,
    "The longest unbroken climb wins: the most rows in a row that each beat the row before.",
    "If that's a tie, the most rows that beat the row before wins.",
  ),
});
const ladder = gridFamily<LadderP>({
  id: "ladder_of_numbers", name: "Ladder of Numbers", emoji: "🪜", theme: "Row numbers that keep getting bigger",
  requires: { classes: ["Numeral"] }, shape: tuple(2),
  params: () => ({ direction: choiceParam("Climbing", [["down", "down the page"], ["up", "up the page"]]) }),
  legacy: p => ("dir" in p ? { direction: p.dir as LadderP["direction"] } : null),
  support: () => [{ direction: "down" }, { direction: "up" }],
  canonical: () => ({ direction: "down" }),
  summary: (p, g) => ladderText(p, g).about,
  python: (p, g) => pyCard(ladderText(p, g), `
    def number(row):
        n = 0
        for cell in row:
            n = n * BASE + cell.value
        return n

    def utility(grid):
        numbers = [number(row) for row in ${p.direction === "down" ? "grid.rows" : "reversed(grid.rows)"}]
        best = 0
        climb = 0
        rises = 0
        for i in range(1, len(numbers)):
            if numbers[i] > numbers[i - 1]:
                climb += 1
                rises += 1
            else:
                climb = 0
            best = max(best, climb)
        return (best, rises)`),
  typescript: (p, g) => tsCard(ladderText(p, g), `
    function number(row) {
      let n = 0;
      for (const cell of row) n = n * BASE + cell.value;
      return n;
    }

    function utility(grid) {
      const numbers = grid.rows.map(number)${p.direction === "down" ? "" : ".reverse()"};
      let best = 0;
      let climb = 0;
      let rises = 0;
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] > numbers[i - 1]) {
          climb += 1;
          rises += 1;
        } else {
          climb = 0;
        }
        best = Math.max(best, climb);
      }
      return [best, rises];
    }`),
  exemplar: (p, g) => wire(g, fromFn(g.N, (r, c) => (c === g.N - 1 ? (p.direction === "down" ? r : g.N - 1 - r) : 0)), full(g.N, 0)),
});

// --- Snap! ---------------------------------------------------------------------------------------------------
const snapText = (g: GridSpec): CardText => ({
  emoji: "🫰", name: "Snap!", consts: [],
  about: `Shout Snap! for every pair of touching cells showing the same ${g.cards ? "rank (any suit)" : "number"}. Each pair scores 1 point.`,
});
const snap = gridFamily<Record<string, never>>({
  id: "snap", name: "Snap!", emoji: "🫰", theme: "Touching twins", shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => snapText(g).about,
  python: (_, g) => pyCard(snapText(g), `
    def utility(grid):
        snaps = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and other.value == cell.value:
                    snaps += 1
        return snaps`),
  typescript: (_, g) => tsCard(snapText(g), `
    function utility(grid) {
      let snaps = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && other.value === cell.value) snaps += 1;
        }
      }
      return snaps;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

// --- Uphill (Young tableau) ------------------------------------------------------------------------------------
type CornerP = { corner: "TL" | "TR" | "BL" | "BR" };
const uphillText = (p: CornerP, g: GridSpec): CardText => ({
  emoji: "⛷️", name: "Uphill", consts: [],
  about: sentences(
    `Walk toward the ${p.corner[0] === "T" ? "top" : "bottom"}-${p.corner[1] === "L" ? "left" : "right"} corner along every row and column.`,
    `Each step should reach a bigger ${num(g)}, never the same or a smaller one.`,
    g.say.valueKey(),
    "A line is whole when every step in it gets bigger.",
    "Most whole lines wins. If that's a tie, the most single bigger steps wins.",
  ),
});
const uphillLines = (p: CornerP, lang: "py" | "ts") => {
  const rows = p.corner[1] === "R" ? "grid.rows" : lang === "py" ? "[list(reversed(row)) for row in grid.rows]" : "grid.rows.map(row => [...row].reverse())";
  const cols = p.corner[0] === "B" ? "grid.columns" : lang === "py" ? "[list(reversed(c)) for c in grid.columns]" : "grid.columns.map(column => [...column].reverse())";
  return lang === "py" ? `${rows} + ${cols}` : `[\n        ...${rows},\n        ...${cols},\n      ]`;
};
const youngTableau = gridFamily<CornerP>({
  id: "young_tableau", name: "Uphill", emoji: "⛷️", theme: "Numbers rise toward your corner",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  params: () => ({
    corner: choiceParam("Corner the numbers rise toward", [["TL", "top-left"], ["TR", "top-right"], ["BL", "bottom-left"], ["BR", "bottom-right"]]),
  }),
  legacy: p => ("K" in p ? { corner: p.K as CornerP["corner"] } : null),
  support: () => (["TL", "TR", "BL", "BR"] as const).map(corner => ({ corner })),
  canonical: () => ({ corner: "BR" }),
  summary: (p, g) => uphillText(p, g).about,
  python: (p, g) => pyCard(uphillText(p, g), `
    def utility(grid):
        whole = 0
        steps = 0
        for line in ${uphillLines(p, "py")}:
            good = 0
            for i in range(len(line) - 1):
                if line[i + 1].value > line[i].value:
                    good += 1
            steps += good
            if good == len(line) - 1:
                whole += 1
        return (whole, steps)`),
  typescript: (p, g) => tsCard(uphillText(p, g), `
    function utility(grid) {
      let whole = 0;
      let steps = 0;
      const lines = ${uphillLines(p, "ts")};
      for (const line of lines) {
        let good = 0;
        for (let i = 0; i < line.length - 1; i++) {
          if (line[i + 1].value > line[i].value) good += 1;
        }
        steps += good;
        if (good === line.length - 1) whole += 1;
      }
      return [whole, steps];
    }`),
  exemplar: (p, g, ctx) => {
    const N = g.N, R = g.vmax - g.vmin;
    const dist = (r: number, c: number) => (p.corner[0] === "B" ? r : N - 1 - r) + (p.corner[1] === "R" ? c : N - 1 - c);
    const sym = fromFn(N, (r, c) => symForValue(g, g.vmin + Math.min(dist(r, c), R)));
    return climb("young_tableau", p, ctx, [{ sym, col: full(N, 0) }], 0, range(R + 1).map(k => symForValue(g, g.vmin + k)));
  },
});

// --- Fillomino ---------------------------------------------------------------------------------------------------
const fillText = (g: GridSpec): CardText => ({
  emoji: "🧩", name: "Fillomino", consts: [],
  about: sentences(
    `A group is a patch of touching cells showing the same ${g.cards ? "rank (any suit)" : "number"}.`,
    g.say.valueKey(),
    `A group is right when it has exactly as many cells as its ${num(g)}: a group of 3 cells showing 3 is right.`,
    "Every cell in a right group scores 1 point.",
  ),
});
const fillomino = gridFamily<Record<string, never>>({
  id: "fillomino", name: "Fillomino", emoji: "🧩", theme: "A 3 lives in a group of three",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => fillText(g).about,
  python: (_, g) => pyCard(fillText(g), `
    def same_value(a, b):
        return a.value == b.value

    def utility(grid):
        points = 0
        for group in grid.regions(same_value):
            if len(group) == group[0].value:
                points += len(group)
        return points`),
  typescript: (_, g) => tsCard(fillText(g), `
    function sameValue(a, b) {
      return a.value === b.value;
    }

    function utility(grid) {
      let points = 0;
      for (const group of grid.regions(sameValue)) {
        if (group.length === group[0].value) points += group.length;
      }
      return points;
    }`),
  // Every cell scores (N², the maximum): even rows are one group of N worth N; odd rows are 1s and 2-dominoes.
  exemplar: (_, g) => {
    const N = g.N, odd = { 3: "122", 4: "1221", 5: "22122", 6: "122122", 7: "1221221" }[N]!;
    return wire(g, fromFn(N, (r, c) => symForValue(g, r % 2 === 0 ? N : Number(odd[c]))), full(N, 0));
  },
});

// --- Colour Ladder -------------------------------------------------------------------------------------------------
const ladderColourText = (g: GridSpec): CardText => ({
  emoji: "🎚️", name: "Colour Ladder", consts: [],
  about: sentences(
    `The rainbow order of the colours is ${g.say.colours(range(g.C))}.`,
    "Look at every pair of touching cells.",
    `If one ${num(g)} is bigger, its colour should come later in the rainbow order. If the ${nums(g)} are equal, the colours should match.`,
    g.say.valueKey(),
    "Each pair that agrees scores 1 point.",
  ),
});
const colourValueLadder = gridFamily<Record<string, never>>({
  id: "colour_value_ladder", name: "Colour Ladder", emoji: "🎚️", theme: "Bigger numbers wear later rainbow colours",
  requires: { classes: ["Valued", "Spectral"] }, shape: SCALAR,
  params: () => ({}),
  support: () => [{}],
  summary: (_, g) => ladderColourText(g).about,
  python: (_, g) => pyCard(ladderColourText(g), `
    def sign(x):
        if x > 0:
            return 1
        if x < 0:
            return -1
        return 0

    def utility(grid):
        agree = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is None:
                    continue
                up_value = other.value - cell.value
                up_colour = grid.palette.index(other.colour) - grid.palette.index(cell.colour)
                if sign(up_value) == sign(up_colour):
                    agree += 1
        return agree`),
  typescript: (_, g) => tsCard(ladderColourText(g), `
    function utility(grid) {
      let agree = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other === null) continue;
          const upValue = other.value - cell.value;
          const upColour = grid.palette.indexOf(other.colour) - grid.palette.indexOf(cell.colour);
          if (Math.sign(upValue) === Math.sign(upColour)) agree += 1;
        }
      }
      return agree;
    }`),
  exemplar: (_, g) => wire(g, full(g.N, 0), full(g.N, 0)),
});

export const ARITHMETIC = [straightShooter, numberBonds, magicAccountant, roundNumbers, kingOfTheHill, divisibility,
  numberSandwich, magicWindow, timesTable, oddsEvens, numberPainter, robinHood, seesaw, steppingStones, columnAddition,
  ladder, snap, youngTableau, fillomino, colourValueLadder];
