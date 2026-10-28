/** Arithmetic & number-pattern lens rules (lib/grid-lab/gridlab/rules/arithmetic.py, cards from rules/cards.py). */
import type { Cand, CardText, GridSpec, Layer } from "./_util.ts";
import {
  SCALAR, an, bestOf, cap, chance, cname, fromFn, full, gridFamily, pick, product, pyCard, range, symForValue,
  thing, tsCard, tuple, wire,
} from "./_util.ts";

type Axis = "rows" | "cols" | "both";
const PY_AXIS: Record<Axis, [string, string]> = {
  rows: ["grid.rows", "row"], cols: ["grid.columns", "column"], both: ["grid.rows + grid.columns", "row and column"],
};
const TS_AXIS: Record<Axis, string> = { rows: "grid.rows", cols: "grid.columns", both: "[...grid.rows, ...grid.columns]" };
const AXIS_WORD: Record<Axis, string> = { rows: "row", cols: "column", both: "row and column" };
const symGrid = (g: GridSpec, v: Layer) => v.map(row => row.map(x => symForValue(g, x)));

// --- Straight Shooter ------------------------------------------------------------------------------
type ShootP = { step: 1 | -1; flush: boolean; ace_high: boolean };
const shootText = (p: ShootP, g: GridSpec): CardText => ({
  emoji: "🎯", name: "Straight Shooter", consts: [["STEP", p.step, p.step === 1 ? "count up" : "count down"]],
  about: `Find runs of 3 or more ${thing(g)}s that count ${p.step === 1 ? "up" : "down"} by one, reading rows left to `
    + `right and columns top to bottom. A run scores its length × its length${p.flush ? ", doubled if it is all one colour" : ""}.`
    + `${p.ace_high ? " Aces count as 14." : ""} If that's a tie, count single counting steps.`,
});
const straightShooter = gridFamily<ShootP>({
  id: "straight_shooter", name: "Straight Shooter", emoji: "🎯", theme: "Rows and columns that count",
  requires: { classes: ["Valued", "Ranked"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => product<ShootP>({ step: [1, -1], flush: [false, true], ace_high: g.cards ? [false, true] : [false] }),
  sample: (rng, g) => ({ step: pick(rng, [1, -1] as const), flush: chance(rng, 1, 2), ace_high: g.cards && chance(rng, 1, 2) }),
  canonical: p => ({ ...p, step: 1 }),
  summary: p => `Runs of 3 or more numbers that count ${p.step === 1 ? "up" : "down"} one at a time `
    + "(left to right, or top to bottom) score their length squared"
    + (p.flush ? ", doubled if the run is all one colour" : "")
    + (p.ace_high ? ". Aces are high (Q, K, A counts)." : "."),
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
  about: `Two touching cells are best friends when their ${thing(g)}s add up to ${g.vmax + 1}`
    + `${{ any: "", same: " and are the same colour", different: " and are different colours" }[p.mode]}. `
    + "Every pair of best friends scores a point.",
});
const numberBonds = gridFamily<BondsP>({
  id: "number_bonds", name: "Number Bonds", emoji: "🤝", theme: "Neighbours that make the magic number",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: () => (["any", "same", "different"] as const).map(mode => ({ mode })),
  summary: (p, g) => `Every pair of touching cells whose numbers add up to ${g.vmax + 1} scores a point`
    + { any: ".", same: ", but only if the two cells are the same colour.", different: ", but only if the two cells are different colours." }[p.mode],
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
  about: `Every ${AXIS_WORD[p.axis]} whose ${thing(g)}s add up to exactly ${p.T} scores a point. If that's a tie, `
    + `it's better when the totals are closer to ${p.T}.`,
});
const magicAccountant = gridFamily<MagicP>({
  id: "magic_accountant", name: "Magic Accountant", emoji: "🧮", theme: "Lines that add up to your magic number",
  requires: { classes: ["Valued"] }, shape: tuple(2), tags: ["shortlist"],
  support: g => product<MagicP>({ axis: ["rows", "cols", "both"], T: magicTargets(g) }),
  sample: (rng, g) => {
    const N = g.N, mid = roundHalfEven((N * (g.vmin + g.vmax)) / 2);
    const T = Math.min(Math.max(mid + rng.int(2 * N + 1) - N, N * g.vmin), N * g.vmax);
    return { axis: pick(rng, ["rows", "cols", "both"] as const), T };
  },
  canonical: (p, g) => ({ axis: p.axis === "cols" ? "rows" : p.axis, T: Math.min(p.T, g.N * (g.vmin + g.vmax) - p.T) }),
  summary: p => `Your magic number is ${p.T}. Every ${AXIS_WORD[p.axis]} whose numbers add up to exactly that `
    + "scores a point; otherwise closer is better.",
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
  about: `${cap(an(cname(g, p.X)))} cell is ${p.valley ? "in a valley" : "a king"} when its ${thing(g)} is `
    + `${p.valley ? "lower" : "higher"} than every cell touching it. Each one scores a point.`,
});
const kingOfTheHill = gridFamily<KingP>({
  id: "king_of_the_hill", name: "King of the Hill", emoji: "⛰️", theme: "Mountain tops in your colour",
  requires: { classes: ["Valued"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => product<KingP>({ X: range(g.C), valley: [false, true] }),
  sample: (rng, g) => ({ X: rng.int(g.C), valley: chance(rng, 3, 10) }),
  canonical: () => ({ X: 0, valley: false }), // value reflection maps valleys to peaks
  summary: (p, g) => `A ${p.valley ? "valley" : "mountain top"} is a ${cname(g, p.X)} cell whose number is `
    + `${p.valley ? "smaller" : "bigger"} than every touching neighbour. Count them.`,
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
  about: `Read each ${AXIS_WORD[p.scope]} as one big number${g.base === 10 ? "" : ` (base ${g.base}: the digits go 0-9 then A, B, ...)`}. `
    + `Every one that divides exactly by ${p.m} scores a point.`,
});
const divisibility = gridFamily<DivP>({
  id: "divisibility_detective", name: "Divisibility Detective", emoji: "🔍", theme: "Rows read as numbers that divide evenly",
  requires: { classes: ["Numeral"] }, shape: SCALAR, tags: ["shortlist"],
  support: g => product<DivP>({ m: DIVISORS[g.base!], scope: ["rows", "both"] }),
  summary: (p, g) => `Read each row${p.scope === "both" ? " (and each column, top to bottom)" : ""} as one big `
    + `base-${g.base} number. Score a point for each one that ${p.m} divides exactly.`,
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

export const ARITHMETIC = [straightShooter, numberBonds, magicAccountant, kingOfTheHill, divisibility];
export { roundHalfEven };
