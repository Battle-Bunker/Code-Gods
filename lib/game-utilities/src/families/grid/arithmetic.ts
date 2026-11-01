/** Arithmetic & number-pattern lens rules (lib/grid-lab/gridlab/rules/arithmetic.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import {
  SCALAR, article, bestOf, cap, chance, climb, cname, colourPairs, fromFn, full, gridFamily, pick, product, pyCard, range, list, recolour, sentences, symForValue, thing, tsCard, tuple, wire, example, mark,
} from "./_util.ts";
import { solvedAnalytic } from "../../analytic/hook.ts";

type Axis = "rows" | "cols" | "both";
const PY_AXIS: Record<Axis, [string, string]> = {
  rows: ["grid.rows", "row"], cols: ["grid.columns", "column"], both: ["grid.rows + grid.columns", "row and column"],
};
const TS_AXIS: Record<Axis, string> = { rows: "grid.rows", cols: "grid.columns", both: "[...grid.rows, ...grid.columns]" };
const AXIS_WORD: Record<Axis, string> = { rows: "row", cols: "column", both: "row and column" };
const symGrid = (g: GridSpec, v: Layer) => v.map(row => row.map(x => symForValue(g, x)));

// --- the words the goal texts share (docs/rules-design.md §2) -----------------------------------------------
/** Joins sentences, skipping empty ones (the value key is "" on base 10). */
/** "every row", "every column", "every row and every column". */
const everyLine = (axis: Axis) => (axis === "both" ? "every row and every column" : `every ${AXIS_WORD[axis]}`);
/** What a tile's number is called, singular and plural: cards have values, digit sets have numbers. */
const num = (g: GridSpec) => (g.cards ? "value" : "number");
const nums = (g: GridSpec) => `${num(g)}s`;
/** "The digits go 0 to 9, then A (10), B (11)." ("" on base 10). */
const digitNote = (g: GridSpec) => (g.cards || g.vmax < 10 ? "" : `The digits go 0 to 9, then ${list(range(g.vmax - 9).map(i => g.say.tile(10 + i)))}.`);
/** A value as the board shows it: "7", "C (12)", cards "J". */
const valueTile = (g: GridSpec, v: number) => (g.cards ? g.say.tile(symForValue(g, v)).replace(/[♠♥♦♣]$/, "") : g.say.tile(v));

// --- Straight Shooter ------------------------------------------------------------------------------
type ShootP = { step: 1 | -1; flush: boolean; ace_high: boolean };
const shootText = (p: ShootP, g: GridSpec): CardText => ({
  emoji: "🎯", name: "Straight Shooter", consts: [["STEP", p.step, p.step === 1 ? "count up" : "count down"]],
  about: sentences(
    `A run is 3 or more ${thing(g)}s in a row that count ${p.step === 1 ? "up" : "down"} by one, like ${p.step === 1 ? "4, 5, 6" : "6, 5, 4"}.`,
    "Runs go left to right along rows, or top to bottom down columns.",
    p.ace_high ? `Aces count as 14, so a run can go ${p.step === 1 ? "Q, K, A" : "A, K, Q"}. Here J counts 11, Q counts 12 and K counts 13.` : g.say.valueKey(),
    "A run scores its length times itself, so 3 in a row is 9 points." + (p.flush ? " Double that if the whole run is one colour." : ""),
    "Most points wins. If that's a tie, the most single steps wins: each pair of neighbours in a line that count by one.",
  ),
});
const straightShooter = gridFamily<ShootP>({
  id: "straight_shooter", name: "Straight Shooter", emoji: "🎯", theme: "Rows and columns that count",
  requires: { classes: ["Valued", "Ranked"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => product<ShootP>({ step: [1, -1], flush: [false, true], ace_high: g.cards ? [false, true] : [false] }),
  sample: (rng, g) => ({ step: pick(rng, [1, -1] as const), flush: chance(rng, 1, 2), ace_high: g.cards && chance(rng, 1, 2) }),
  canonical: p => ({ ...p, step: 1 }),
  summary: (p, g) => shootText(p, g).about,
  example: (p, g) => {
    const vs = p.step === 1 ? [2, 3, 4] : [4, 3, 2];
    const sym = fromFn(3, (r, c) => symForValue(g, r === 0 ? vs[c]! : g.vmax));
    return example(sym, full(3, 0), pts => `The run ${g.say.values(vs)} along the top row${p.flush ? ", all one colour" : ""}: ${pts}.`);
  },
  python: (p, g) => pyCard(shootText(p, g), `
    def number(cell):
        return ${p.ace_high ? "14 if cell.value == 1 else cell.value" : "cell.value"}
${p.flush ? `
    def one_colour(run):
        for cell in run:
            if cell.colour != run[0].colour:
                return False
        return True
` : ""}
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
                if len(run) >= 3:${p.flush ? `
                    points = len(run) * len(run)
                    if one_colour(run):
                        points *= 2
                    score += points` : `
                    score += len(run) * len(run)`}
        return (score, steps)`),
  typescript: (p, g) => tsCard(shootText(p, g), `
    function number(cell) {
      return ${p.ace_high ? "cell.value === 1 ? 14 : cell.value" : "cell.value"};
    }
${p.flush ? `
    function oneColour(run) {
      for (const cell of run) {
        if (cell.colour !== run[0].colour) return false;
      }
      return true;
    }
` : ""}
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
          if (run.length >= 3) {${p.flush ? `
            let points = run.length * run.length;
            if (oneColour(run)) points *= 2;
            score += points;` : `
            score += run.length * run.length;`}
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
      if (p.step === -1) s = s.slice().reverse().map(row => row.slice().reverse());
      cands.push({ sym: s, col: full(N, 0) });
    }
    return bestOf("straight_shooter", p, ctx, cands);
  },
});

// --- Number Bonds ----------------------------------------------------------------------------------
type BondsP = { mode: "any" | "same" | "different" };
const bondsText = (p: BondsP, g: GridSpec): CardText => ({
  emoji: "🤝", name: "Number Bonds", consts: [["TARGET", g.vmax + 1]],
  about: sentences(
    `Two touching cells are best friends when their ${nums(g)} add up to ${g.vmax + 1}`
      + `${{ any: "", same: " and they are the same colour", different: " and they are different colours" }[p.mode]}.`,
    g.say.valueKey(),
    "Every pair of best friends scores 1 point.",
  ),
});
const numberBonds = gridFamily<BondsP>({
  id: "number_bonds", name: "Number Bonds", emoji: "🤝", theme: "Neighbours that make the magic number",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: () => (["any", "same", "different"] as const).map(mode => ({ mode })),
  summary: (p, g) => bondsText(p, g).about,
  example: (p, g) => {
    const T = g.vmax + 1, [a, b] = [3, T - 3], X = 0, Y = 1, Z = 2;
    return example(symGrid(g, [[a, b], [1, 1]]), [[X, p.mode === "same" ? X : Y], [Z, Z]],
      pts => `Touching cells showing ${g.say.values([a, b])} add up to ${T}: ${pts}.`);
  },
  python: (p, g) => pyCard(bondsText(p, g), `
    def utility(grid):
        bonds = 0
        for cell in grid.cells:
            for other in (cell.right, cell.down):
                if other is not None and cell.value + other.value == TARGET${{ any: "", same: " and cell.colour == other.colour", different: " and cell.colour != other.colour" }[p.mode]}:
                    bonds += 1
        return bonds`),
  typescript: (p, g) => tsCard(bondsText(p, g), `
    function utility(grid) {
      let bonds = 0;
      for (const cell of grid.cells) {
        for (const other of [cell.right, cell.down]) {
          if (other !== null && cell.value + other.value === TARGET${{ any: "", same: " && cell.colour === other.colour", different: " && cell.colour !== other.colour" }[p.mode]}) bonds += 1;
        }
      }
      return bonds;
    }`),
  exemplar: (p, g) => {
    const half = Math.floor((g.vmax + 1) / 2);
    return wire(g, full(g.N, symForValue(g, half)), fromFn(g.N, (r, c) => (p.mode === "different" ? (r + c) % 2 : 0)));
  },
});

// --- Magic Accountant ------------------------------------------------------------------------------
type MagicP = { axis: Axis; T: number };
/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
}
function magicTargets(g: GridSpec): number[] {
  const N = g.N, mid = roundHalfEven((N * (g.vmin + g.vmax)) / 2), out = new Set<number>();
  for (let k = -N; k <= N; k++) out.add(Math.min(Math.max(mid + k, N * g.vmin), N * g.vmax));
  return [...out].sort((a, b) => a - b);
}
const magicText = (p: MagicP, g: GridSpec): CardText => ({
  emoji: "🧮", name: "Magic Accountant", consts: [["TARGET", p.T]],
  about: sentences(
    `Your magic number is ${p.T}.`,
    `${cap(everyLine(p.axis))} whose ${nums(g)} add up to exactly ${p.T} scores 1 point.`,
    g.say.valueKey(),
    `Most points wins. If that's a tie, the totals that are closest to ${p.T} overall win.`,
  ),
});
const magicAccountant = gridFamily<MagicP>({
  id: "magic_accountant", name: "Magic Accountant", emoji: "🧮", theme: "Lines that add up to your magic number",
  analytic: solvedAnalytic("magic_accountant"),
  requires: { classes: ["Valued"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => product<MagicP>({ axis: ["rows", "cols", "both"], T: magicTargets(g) }),
  sample: (rng, g) => {
    const N = g.N, mid = roundHalfEven((N * (g.vmin + g.vmax)) / 2);
    const T = Math.min(Math.max(mid + rng.int(2 * N + 1) - N, N * g.vmin), N * g.vmax);
    return { axis: pick(rng, ["rows", "cols", "both"] as const), T };
  },
  canonical: (p, g) => ({ axis: p.axis === "cols" ? "rows" : p.axis, T: Math.min(p.T, g.N * (g.vmin + g.vmax) - p.T) }),
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
    let rem = p.T - N * g.vmin;
    for (let i = 0; i < N; i++) { const add = Math.min(g.vmax - g.vmin, rem); row[i] += add; rem -= add; }
    return wire(g, symGrid(g, fromFn(N, (r, c) => row[(c + r) % N])), full(N, 0));
  },
});

// --- King of the Hill ------------------------------------------------------------------------------
type KingP = { X: number; valley: boolean };
const kingText = (p: KingP, g: GridSpec): CardText => ({
  emoji: p.valley ? "🕳️" : "⛰️", name: p.valley ? "King of the Valley" : "King of the Hill",
  consts: [["MY_COLOUR", cname(g, p.X)]],
  about: sentences(
    `${cap(article(cname(g, p.X)))} cell is ${p.valley ? "in a valley" : "a king"} when its ${num(g)} is `
      + `${p.valley ? "smaller" : "bigger"} than every cell touching it.`,
    g.say.valueKey(),
    `Each ${p.valley ? "valley" : "king"} scores 1 point.`,
  ),
});
const kingOfTheHill = gridFamily<KingP>({
  id: "king_of_the_hill", name: "King of the Hill", emoji: "⛰️", theme: "Mountain tops in your colour",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => product<KingP>({ X: range(g.C), valley: [false, true] }),
  sample: (rng, g) => ({ X: rng.int(g.C), valley: chance(rng, 3, 10) }),
  canonical: () => ({ X: 0, valley: false }), // value reflection maps valleys to peaks
  summary: (p, g) => kingText(p, g).about,
  example: (p, g) => {
    const top = p.valley ? g.vmin : 9, around = p.valley ? [3, 4, 5, 6] : [1, 2, 3, 4], away = (p.X + 1) % g.C;
    const vs = fromFn(3, (r, c) => (r === 1 && c === 1 ? top : around[(r + c) % 4]!));
    return example(symGrid(g, vs), mark(3, [[1, 1]], p.X, away),
      pts => `${cap(article(cname(g, p.X)))} ${g.say.tile(symForValue(g, top))} ${p.valley ? "smaller" : "bigger"} than every cell touching it: ${pts}.`);
  },
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
    return wire(g, fromFn(g.N, (r, c) => ((r + c) % 2 === 0 ? top : bot)), full(g.N, p.X));
  },
});

// --- Divisibility Detective ------------------------------------------------------------------------
const DIVISORS: Readonly<Record<number, readonly number[]>> = { 10: [5, 10, 3, 9], 12: [3, 4, 6, 12, 11], 16: [4, 8, 16, 3, 5, 15] };
type DivP = { m: number; scope: "rows" | "both" };
const divText = (p: DivP, g: GridSpec): CardText => ({
  emoji: "🔍", name: "Divisibility Detective", consts: [["BASE", g.base!], ["DIVIDE_BY", p.m]],
  about: sentences(
    `Read ${p.scope === "both" ? "each row, and each column from top to bottom," : "each row"} as one big number in base ${g.base}.`,
    digitNote(g),
    `Each one that divides exactly by ${p.m}${g.base !== 10 && p.m >= 10 ? " (counting the normal way)" : ""} scores 1 point.`,
  ),
});
const divisibility = gridFamily<DivP>({
  id: "divisibility_detective", name: "Divisibility Detective", emoji: "🔍", theme: "Rows read as numbers that divide evenly",
  analytic: solvedAnalytic("divisibility_detective"),
  requires: { classes: ["Numeral"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => product<DivP>({ m: DIVISORS[g.base!], scope: ["rows", "both"] }),
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

/** An optional colour (grid-lab `colour if rng.random() < 0.5 else None`). */
type MaybeColour = number | null;
const maybeColours = (g: GridSpec): MaybeColour[] => [null, ...range(g.C)];
const sampleMaybe = (rng: Parameters<typeof pick>[0], g: GridSpec): MaybeColour => (chance(rng, 1, 2) ? rng.int(g.C) : null);
const colourConst = (g: GridSpec, X: MaybeColour) => (X === null ? [] : [["MY_COLOUR", cname(g, X)] as const]);

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
  support: () => (["rows", "cols", "both"] as const).map(axis => ({ axis })),
  canonical: p => ({ axis: p.axis === "cols" ? "rows" : p.axis }),
  summary: (p, g) => roundText(p, g).about,
  example: (p, g) => {
    const B = g.base!, vs = [[1, 2, B - 3], [2, B - 3, 1], [B - 3, 1, 2]];
    return example(symGrid(g, vs), full(3, 0), pts => `Every ${AXIS_WORD[p.axis]} adds up to ${B}, a round number: ${pts}.`);
  },
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
type SandP = { mode: "sandwich" | "fibonacci"; X: MaybeColour };
const sandText = (p: SandP, g: GridSpec): CardText => ({
  emoji: "🥙", name: "Number Sandwich", consts: colourConst(g, p.X),
  about: sentences(
    "Look at any 3 cells in a row, across or down.",
    p.mode === "sandwich"
      ? `If the middle ${num(g)} is the two outside ${nums(g)} added, that is a sandwich, like 2, 5, 3.`
      : `If the last ${num(g)} is the first two ${nums(g)} added, that is a sandwich, like 2, 3, 5.`,
    g.cards ? "" : p.mode === "sandwich" ? "The outside numbers can't be 0." : "The first two numbers can't be 0.",
    p.X === null ? "" : `The ${p.mode === "sandwich" ? "middle" : "last"} cell must be ${cname(g, p.X)}.`,
    g.say.valueKey(),
    "Each sandwich scores 1 point.",
  ),
});
const numberSandwich = gridFamily<SandP>({
  id: "number_sandwich", name: "Number Sandwich", emoji: "🥙", theme: "The middle number is the total",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => product<SandP>({ mode: ["sandwich", "fibonacci"], X: maybeColours(g) }),
  sample: (rng, g) => ({ mode: pick(rng, ["sandwich", "fibonacci"] as const), X: sampleMaybe(rng, g) }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => sandText(p, g).about,
  example: (p, g) => {
    const top = p.mode === "sandwich" ? [2, 5, 3] : [2, 3, 5];
    return example(symGrid(g, fromFn(3, (r, c) => (r === 0 ? top[c]! : g.vmax))), full(3, p.X ?? 0),
      pts => `In ${g.say.values(top)}, the ${p.mode === "sandwich" ? "middle" : "last"} ${num(g)} is the other two added: ${pts}.`);
  },
  python: (p, g) => {
    const test = p.mode === "sandwich" ? "a.value > 0 and c.value > 0 and b.value == a.value + c.value"
      : "a.value > 0 and b.value > 0 and c.value == a.value + b.value";
    const total = p.mode === "sandwich" ? "b" : "c";
    return pyCard(sandText(p, g), `
      def utility(grid):
          points = 0
          for line in grid.rows + grid.columns:
              for i in range(len(line) - 2):
                  a, b, c = line[i], line[i + 1], line[i + 2]
                  if ${test}${p.X === null ? "" : ` and ${total}.colour == MY_COLOUR`}:
                      points += 1
          return points`);
  },
  typescript: (p, g) => {
    const test = p.mode === "sandwich" ? "a.value > 0 && c.value > 0 && b.value === a.value + c.value"
      : "a.value > 0 && b.value > 0 && c.value === a.value + b.value";
    const total = p.mode === "sandwich" ? "b" : "c";
    return tsCard(sandText(p, g), `
      function utility(grid) {
        let points = 0;
        for (const line of [...grid.rows, ...grid.columns]) {
          for (let i = 0; i < line.length - 2; i++) {
            const a = line[i], b = line[i + 1], c = line[i + 2];
            if (${test}${p.X === null ? "" : ` && ${total}.colour === MY_COLOUR`}) points += 1;
          }
        }
        return points;
      }`);
  },
  exemplar: (p, g, ctx) => {
    const N = g.N, X = p.X ?? 0, fib = [1, 1, 2, 3, 5, 8, 13];
    const vs = [fromFn(N, (r, c) => ((r + c) % 2 === 0 ? 1 : 2)), fromFn(N, (r, c) => [1, 1, 2][(r + c) % 3]),
      fromFn(N, (_, c) => [1, 1, 2][c % 3])];
    if (g.vmax >= 8) vs.push(fromFn(N, (_, c) => fib[Math.min(c, g.vmax < 13 ? 5 : 6)]));
    return bestOf("number_sandwich", p, ctx, vs.map(v => ({ sym: symGrid(g, v), col: full(N, X) })));
  },
});

// --- Magic Window ---------------------------------------------------------------------------------------
type WindowP = { X: MaybeColour };
const windowText = (p: WindowP, g: GridSpec): CardText => ({
  emoji: "🪟", name: "Magic Window", consts: colourConst(g, p.X),
  about: sentences(
    "Look at every 3×3 window. In each one, a line is a row, column or diagonal of 3 cells.",
    `A line scores 1 point when its ${nums(g)} add up to 3 times the middle cell's ${num(g)}, unless all 3 are the same.`,
    p.X === null ? "" : `A window only counts if its middle cell is ${cname(g, p.X)}.`,
    g.say.valueKey(),
    "The window with the most scoring lines wins (8 is a perfect magic square). If that's a tie, the most scoring lines over all windows wins.",
  ),
});
const magicWindow = gridFamily<WindowP>({
  id: "magic_window", name: "Magic Window", emoji: "🪟", theme: "Find a magic square",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  support: g => maybeColours(g).map(X => ({ X })),
  sample: (rng, g) => ({ X: sampleMaybe(rng, g) }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => windowText(p, g).about,
  example: (p, g) => example(symGrid(g, [[2, 7, 6], [9, 5, 1], [4, 3, 8]]), full(3, p.X ?? 0),
    pts => `A perfect magic square: all 8 lines add up to 3 times the middle: ${pts}.`),
  python: (p, g) => pyCard(windowText(p, g), `
    def window_lines(grid, top, left):
        rows = [[grid.cell(top + i, left + j) for j in range(3)] for i in range(3)]
        columns = [[row[j] for row in rows] for j in range(3)]
        diagonals = [[rows[0][0], rows[1][1], rows[2][2]], [rows[0][2], rows[1][1], rows[2][0]]]
        return rows + columns + diagonals

    def magic(grid, top, left):
        middle = grid.cell(top + 1, left + 1)${p.X === null ? "" : `
        if middle.colour != MY_COLOUR:
            return 0`}
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
      const middle = grid.cell(top + 1, left + 1);${p.X === null ? "" : `
      if (middle.colour !== MY_COLOUR) return 0;`}
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
    return wire(g, symGrid(g, fromFn(g.N, (r, c) => (r < 3 && c < 3 ? sq[r][c] : 5))), full(g.N, p.X ?? 0));
  },
});

// --- Times-Table Territory --------------------------------------------------------------------------------
const TT_M: Readonly<Record<string, readonly number[]>> = { base10: [3, 4, 5], base12: [3, 4, 6], base16: [3, 4, 5], cards: [3, 4, 5] };
type TimesP = { m: number | "prime"; X: MaybeColour };
const timesText = (p: TimesP, g: GridSpec): CardText => ({
  emoji: "✖️", name: "Times-Table Territory",
  consts: [...(p.m === "prime" ? [["PRIMES", [2, 3, 5, 7, 11, 13]] as const] : [["TIMES", p.m] as const]), ...colourConst(g, p.X)],
  about: sentences(
    "Find the biggest patch of touching cells that all show "
      + (p.m === "prime" ? `prime ${nums(g)}` : `${nums(g)} in the ${p.m} times table`)
      + `: ${g.say.values(range(g.vmax + 1).filter(v => v >= g.vmin && (p.m === "prime" ? [2, 3, 5, 7, 11, 13].includes(v) : v % p.m === 0)), "or")}.`,
    p.X === null ? "" : `Every cell in the patch must also be ${cname(g, p.X)}.`,
    g.say.valueKey(),
    "Each cell in the patch scores 1 point.",
  ),
});
const timesTable = gridFamily<TimesP>({
  id: "times_table_territory", name: "Times-Table Territory", emoji: "✖️", theme: "The biggest patch of your times table",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => product<TimesP>({ m: [...TT_M[g.symbols], "prime"], X: maybeColours(g) }),
  sample: (rng, g) => ({ m: pick(rng, [...TT_M[g.symbols], "prime" as const]), X: sampleMaybe(rng, g) }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => timesText(p, g).about,
  example: (p, g) => {
    const prime = (v: number) => v > 1 && range(v).every(d => d < 2 || v % d !== 0);
    const member = (v: number) => (p.m === "prime" ? prime(v) : v % p.m === 0);
    const values = [...new Set(g.value)].sort((a, b) => a - b), ins = values.filter(member).slice(0, 3), out = values.find(v => !member(v))!;
    const away = p.X === null ? 0 : (p.X + 1) % g.C, X = p.X ?? 0;
    const third = ins[2] ?? out;
    return example(symGrid(g, [[ins[0]!, ins[1]!], [third, out]]), [[X, X], [ins[2] === undefined ? away : X, away]],
      pts => `Touching cells showing ${g.say.values(ins)}, all ${p.m === "prime" ? "prime" : `in the ${p.m} times table`}: ${pts}.`);
  },
  python: (p, g) => pyCard(timesText(p, g), `
    def good(cell):
        return ${p.m === "prime" ? "cell.value in PRIMES" : "cell.value % TIMES == 0"}${p.X === null ? "" : " and cell.colour == MY_COLOUR"}

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
      return ${p.m === "prime" ? "PRIMES.includes(cell.value)" : "cell.value % TIMES === 0"}${p.X === null ? "" : " && cell.colour === MY_COLOUR"};
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
  exemplar: (p, g) => {
    const v = p.m === "prime" ? 2 : g.vmin === 0 ? 0 : p.m;
    return wire(g, full(g.N, symForValue(g, v)), full(g.N, p.X ?? 0));
  },
});

// --- Odds & Evens ----------------------------------------------------------------------------------------
type OddP = { X: MaybeColour };
const oddText = (p: OddP, g: GridSpec): CardText => ({
  emoji: "🏁", name: "Odds & Evens", consts: colourConst(g, p.X),
  about: sentences(
    `Look at every 2×2 square. It is a chessboard when odd and even ${nums(g)} alternate: odd, even on top and even, odd below, or the other way round.`,
    g.say.valueKey(),
    `Each chessboard scores 1 point${p.X === null ? "" : `, as long as all its odd ${nums(g)} are on ${cname(g, p.X)} cells`}.`,
  ),
});
const oddsEvens = gridFamily<OddP>({
  id: "odds_evens", name: "Odds & Evens", emoji: "🏁", theme: "A chessboard of odd and even numbers",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => maybeColours(g).map(X => ({ X })),
  sample: (rng, g) => ({ X: sampleMaybe(rng, g) }),
  canonical: p => recolour(p, ["X"]),
  summary: (p, g) => oddText(p, g).about,
  example: (p, g) => example(symGrid(g, [[1, 2], [2, 1]]), full(2, p.X ?? 0), pts => `Odd and even ${nums(g)} take turns like a chessboard: ${pts}.`),
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
            if odd(cell) == odd(corner) and odd(right) == odd(below) and odd(cell) != odd(right):${p.X === null ? `
                boards += 1` : `
                square = [cell, right, below, corner]
                if all(other.colour == MY_COLOUR for other in square if odd(other)):
                    boards += 1`}
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
        if (odd(cell) === odd(corner) && odd(right) === odd(below) && odd(cell) !== odd(right)) {${p.X === null ? `
          boards += 1;` : `
          const square = [cell, right, below, corner];
          if (square.filter(odd).every(other => other.colour === MY_COLOUR)) boards += 1;`}
        }
      }
      return boards;
    }`),
  exemplar: (p, g) => wire(g, symGrid(g, fromFn(g.N, (r, c) => g.vmin + ((r + c) % 2))), full(g.N, p.X ?? 0)),
});

// --- Number Painter ---------------------------------------------------------------------------------------
type PaintP = { o: number };
const offsets = (g: GridSpec) => range(g.vmax - g.C + 1 - (g.vmin - 1)).map(k => g.vmin - 1 + k);
const paintText = (p: PaintP, g: GridSpec): CardText => ({
  emoji: "🖍️", name: "Number Painter", consts: [["FIRST", 1 + p.o, `${g.colourNames[0]} is worth this, the next colour one more, ...`]],
  about: sentences(
    "Each colour has a number: " + g.colourNames.map((n, i) => `${n} = ${valueTile(g, i + 1 + p.o)}`).join(", ") + ".",
    g.say.valueKey(),
    `Every cell whose ${num(g)} matches its colour scores 1 point.`,
  ),
});
const numberPainter = gridFamily<PaintP>({
  id: "number_painter", name: "Number Painter", emoji: "🖍️", theme: "Paint by numbers",
  analytic: solvedAnalytic("number_painter"),
  requires: { classes: ["Valued", "Spectral"] }, shape: SCALAR,
  support: g => offsets(g).map(o => ({ o })),
  canonical: (_, g) => ({ o: offsets(g)[0] }),
  summary: (p, g) => paintText(p, g).about,
  example: (p, g) => {
    const col = [[0, 1], [2, g.C > 3 ? 3 : 0]];
    return example(col.map(row => row.map(k => symForValue(g, k + 1 + p.o))), col, pts => `Every cell shows its colour's ${num(g)}: ${pts}.`);
  },
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
  exemplar: (p, g) => wire(g, full(g.N, symForValue(g, 1 + p.o)), full(g.N, 0)),
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
type SeesawP = { scope: Axis; mode: "halves" | "colours"; X: number | null; Y: number | null };
const seesawText = (p: SeesawP, g: GridSpec): CardText => ({
  emoji: "⚖️", name: "Seesaw", consts: p.mode === "colours" ? [["LEFT_COLOUR", cname(g, p.X!)], ["RIGHT_COLOUR", cname(g, p.Y!)]] : [],
  about: sentences(
    `Treat ${everyLine(p.scope)} as a seesaw.`,
    p.mode === "halves" ? `Add up the ${nums(g)} in its left half and its right half, skipping the middle cell if there is one.`
      : `Add up the ${nums(g)} on its ${cname(g, p.X!)} cells and on its ${cname(g, p.Y!)} cells.`,
    g.say.valueKey(),
    "A seesaw balances when both sides match. Each balanced seesaw scores 1 point.",
    "Most points wins. If that's a tie, the smaller total gap between the two sides wins.",
  ),
});
const seesaw = gridFamily<SeesawP>({
  id: "seesaw", name: "Seesaw", emoji: "⚖️", theme: "Lines that balance",
  analytic: solvedAnalytic("seesaw"),
  requires: { classes: ["Valued"] }, shape: tuple(2),
  support: g => (["rows", "cols", "both"] as const).flatMap(scope => [
    { scope, mode: "halves" as const, X: null, Y: null },
    ...colourPairs(g).map(([X, Y]) => ({ scope, mode: "colours" as const, X, Y }))]),
  sample: (rng, g) => {
    const scope = pick(rng, ["rows", "cols", "both"] as const), mode = pick(rng, ["halves", "colours"] as const);
    if (mode === "halves") return { scope, mode, X: null, Y: null };
    const [X, Y] = pick(rng, colourPairs(g));
    return { scope, mode, X, Y };
  },
  canonical: p => recolour({ ...p, scope: p.scope === "cols" ? "rows" : p.scope }, ["X", "Y"]),
  summary: (p, g) => seesawText(p, g).about,
  example: (p, g) => {
    if (p.mode === "halves") return example(symGrid(g, [[2, 7, 2], [5, 1, 5], [2, 7, 2]]), full(3, 0),
      pts => `Every ${AXIS_WORD[p.scope]} balances, its two halves adding up the same: ${pts}.`);
    const Z = range(g.C).find(k => k !== p.X && k !== p.Y)!, order = [p.X!, p.Y!, Z];
    return example(symGrid(g, full(3, 4)), fromFn(3, (r, c) => order[(r + c) % 3]!),
      pts => `In every ${AXIS_WORD[p.scope]}, the ${cname(g, p.X!)} and ${cname(g, p.Y!)} cells add up the same: ${pts}.`);
  },
  python: (p, g) => pyCard(seesawText(p, g), `
    def lean(line):${p.mode === "halves" ? `
        half = len(line) // 2
        left = sum(cell.value for cell in line[:half])
        right = sum(cell.value for cell in line[len(line) - half:])` : `
        left = sum(cell.value for cell in line if cell.colour == LEFT_COLOUR)
        right = sum(cell.value for cell in line if cell.colour == RIGHT_COLOUR)`}
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

    function lean(line) {${p.mode === "halves" ? `
      const half = Math.floor(line.length / 2);
      return Math.abs(total(line.slice(0, half)) - total(line.slice(line.length - half)));` : `
      const left = total(line.filter(cell => cell.colour === LEFT_COLOUR));
      const right = total(line.filter(cell => cell.colour === RIGHT_COLOUR));
      return Math.abs(left - right);`}
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
  exemplar: (p, g) => {
    const third = range(g.C).find(k => k !== p.X && k !== p.Y)!;
    return wire(g, full(g.N, symForValue(g, g.vmax)), full(g.N, third));
  },
});

// --- Stepping Stones ----------------------------------------------------------------------------------------
type HopP = { d: number };
const hopMenu = (g: GridSpec) => [...new Set([1, 2, 3, ...(g.symbols === "base16" ? [4] : []), Math.ceil(g.vmax / 2)])].sort((a, b) => a - b);
const hopText = (p: HopP, g: GridSpec): CardText => ({
  emoji: "🪨", name: "Stepping Stones", consts: [["HOP", p.d]],
  about: sentences(
    `You can hop between touching cells whose ${nums(g)} differ by exactly ${p.d}.`,
    g.say.valueKey(),
    "A group is every cell you can reach by hopping from one cell.",
    "Your score is the size of the biggest group, 1 point per cell.",
  ),
});
const steppingStones = gridFamily<HopP>({
  id: "stepping_stones", name: "Stepping Stones", emoji: "🪨", theme: "Hop between numbers that differ by your step",
  requires: { classes: ["Valued"] }, shape: SCALAR,
  support: g => hopMenu(g).map(d => ({ d })),
  summary: (p, g) => hopText(p, g).about,
  example: (p, g) => {
    const a = g.cards ? 2 : g.vmin, b = a + p.d;
    return example(symGrid(g, [[a, b], [b, a]]), full(2, 0), pts => `Cells showing ${g.say.values([a, b])} differ by ${p.d}, so you can hop round all four: ${pts}.`);
  },
  python: (p, g) => pyCard(hopText(p, g), `
    def hop(a, b):
        return abs(a.value - b.value) == HOP

    def utility(grid):
        best = 0
        for group in grid.regions(hop):
            best = max(best, len(group))
        return best`),
  typescript: (p, g) => tsCard(hopText(p, g), `
    function hop(a, b) {
      return Math.abs(a.value - b.value) === HOP;
    }

    function utility(grid) {
      let best = 0;
      for (const group of grid.regions(hop)) best = Math.max(best, group.length);
      return best;
    }`),
  exemplar: (p, g) => wire(g, symGrid(g, fromFn(g.N, (r, c) => g.vmin + p.d * ((r + c) % 2))), full(g.N, 0)),
});

// --- Column Addition ----------------------------------------------------------------------------------------
type SumP = { top: number };
const sumText = (p: SumP, g: GridSpec): CardText => ({
  emoji: "➕", name: "Column Addition", consts: [["TOP", p.top, "rows count from 0 at the top"], ["BASE", g.base!]],
  about: sentences(
    `Rows ${p.top + 1} and ${p.top + 2} are added together, like a written sum in base ${g.base}, and row ${p.top + 3} is the answer.`,
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
  support: g => range(g.N - 2).map(top => ({ top })),
  canonical: () => ({ top: 0 }),
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
  exemplar: (p, g) => wire(g, fromFn(g.N, r => (r === p.top || r === p.top + 1 ? 1 : r === p.top + 2 ? 2 : 0)), full(g.N, 0)),
});

// --- Ladder of Numbers ---------------------------------------------------------------------------------------
type LadderP = { dir: "down" | "up" };
const ladderText = (p: LadderP, g: GridSpec): CardText => ({
  emoji: "🪜", name: "Ladder of Numbers", consts: [["BASE", g.base!]],
  about: sentences(
    `Read each row as one big number in base ${g.base}.`,
    digitNote(g),
    `Going ${p.dir} the page, each row should be bigger than the row before it.`,
    "The longest unbroken climb wins: the most rows in a row that each beat the row before.",
    "If that's a tie, the most rows that beat the row before wins.",
  ),
});
const ladder = gridFamily<LadderP>({
  id: "ladder_of_numbers", name: "Ladder of Numbers", emoji: "🪜", theme: "Row numbers that keep getting bigger",
  requires: { classes: ["Numeral"] }, shape: tuple(2),
  support: () => [{ dir: "down" }, { dir: "up" }],
  canonical: () => ({ dir: "down" }),
  summary: (p, g) => ladderText(p, g).about,
  python: (p, g) => pyCard(ladderText(p, g), `
    def number(row):
        n = 0
        for cell in row:
            n = n * BASE + cell.value
        return n

    def utility(grid):
        numbers = [number(row) for row in ${p.dir === "down" ? "grid.rows" : "reversed(grid.rows)"}]
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
      const numbers = grid.rows.map(number)${p.dir === "down" ? "" : ".reverse()"};
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
  exemplar: (p, g) => wire(g, fromFn(g.N, (r, c) => (c === g.N - 1 ? (p.dir === "down" ? r : g.N - 1 - r) : 0)), full(g.N, 0)),
});

// --- Snap! ---------------------------------------------------------------------------------------------------
const snapText = (g: GridSpec): CardText => ({
  emoji: "🫰", name: "Snap!", consts: [],
  about: `Shout Snap! for every pair of touching cells showing the same ${g.cards ? "rank (any suit)" : "number"}. Each pair scores 1 point.`,
});
const snap = gridFamily<Record<string, never>>({
  id: "snap", name: "Snap!", emoji: "🫰", theme: "Touching twins", shape: SCALAR,
  support: () => [{}],
  summary: (_, g) => snapText(g).about,
  example: (_p, g) => {
    const s = symForValue(g, 3), t = symForValue(g, 3, g.cards ? 1 : 0);
    return example([[s, t], [symForValue(g, 5), symForValue(g, 7)]], full(2, 0), pts => `${g.say.tile(s)} and ${g.say.tile(t)} touch, so Snap: ${pts}.`);
  },
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
type CornerP = { K: "TL" | "TR" | "BL" | "BR" };
const uphillText = (p: CornerP, g: GridSpec): CardText => ({
  emoji: "⛷️", name: "Uphill", consts: [],
  about: sentences(
    `Walk toward the ${p.K[0] === "T" ? "top" : "bottom"}-${p.K[1] === "L" ? "left" : "right"} corner along every row and column.`,
    `Each step should reach a bigger ${num(g)}, never the same or a smaller one.`,
    g.say.valueKey(),
    "A line is whole when every step in it gets bigger.",
    "Most whole lines wins. If that's a tie, the most single bigger steps wins.",
  ),
});
const uphillLines = (p: CornerP, lang: "py" | "ts") => {
  const rows = p.K[1] === "R" ? "grid.rows" : lang === "py" ? "[list(reversed(row)) for row in grid.rows]" : "grid.rows.map(row => [...row].reverse())";
  const cols = p.K[0] === "B" ? "grid.columns" : lang === "py" ? "[list(reversed(c)) for c in grid.columns]" : "grid.columns.map(column => [...column].reverse())";
  return lang === "py" ? `${rows} + ${cols}` : `[\n        ...${rows},\n        ...${cols},\n      ]`;
};
const youngTableau = gridFamily<CornerP>({
  id: "young_tableau", name: "Uphill", emoji: "⛷️", theme: "Numbers rise toward your corner",
  requires: { classes: ["Valued"] }, shape: tuple(2),
  support: () => (["TL", "TR", "BL", "BR"] as const).map(K => ({ K })),
  canonical: () => ({ K: "BR" }),
  summary: (p, g) => uphillText(p, g).about,
  example: (p, g) => {
    const up = (r: number, c: number) => (p.K[0] === "B" ? r : 2 - r) + (p.K[1] === "R" ? c : 2 - c);
    return { ...example(symGrid(g, fromFn(3, (r, c) => g.vmin + up(r, c))), full(3, 0),
      pts => `Every row and column gets bigger toward the ${p.K[0] === "T" ? "top" : "bottom"}-${p.K[1] === "L" ? "left" : "right"} corner: ${pts}.`),
    unit: ["whole line", "whole lines"] as const };
  },
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
    const dist = (r: number, c: number) => (p.K[0] === "B" ? r : N - 1 - r) + (p.K[1] === "R" ? c : N - 1 - c);
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
  support: () => [{}],
  summary: (_, g) => fillText(g).about,
  example: (_p, g) => example(symGrid(g, [[2, 2], [1, 4]]), full(2, 0),
    pts => `Two ${g.say.rankPlural(g.cards ? 1 : 2)} side by side, and ${g.cards ? "an Ace" : "a 1"} on its own, are right: ${pts}.`),
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
  support: () => [{}],
  summary: (_, g) => ladderColourText(g).about,
  example: (_p, g) => {
    const v = g.vmin + 1;
    return example(symGrid(g, [[v, v + 1], [v + 1, v + 2]]), [[0, 1], [1, 2]], pts => `Bigger ${nums(g)} wear later rainbow colours: ${pts}.`);
  },
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
