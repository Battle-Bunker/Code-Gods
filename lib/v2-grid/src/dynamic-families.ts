/**
 * The grid rules for the dynamic energy measure (owner decision 50; docs/engine-v2/energy.md, "Grids"): each is ONE
 * pure function from the board to a real number, bigger better, with no tie-breakers. A fresh set (the coordinator,
 * 17 Nov: "a clean set of newly formulated pure real function utility functions ... a balanced and interestingly
 * diverse set"); the old grid families are one line each in docs/engine-v2/old-rule-ideas.md.
 *
 * What they read, so that one board rarely suits several at once:
 *   rows as numbers (Row Multiples, Light Rows, Adding Rows), columns as numbers (Prime Columns), the corner boxes read
 *   clockwise (Square Boxes), the diagonals (Power Diagonals), mirror pairs (Mirror Gap), the multiset of digits
 *   (Census) and the snake path through every cell (Snake).
 * Pulls: Row Multiples, Prime Columns, Square Boxes and Power Diagonals want big numbers on different anchors (multiples,
 * primes, squares, powers) through shared cells; Light Rows wants each row's digits to add up to T, which keeps most of
 * a row 0 (against every "big" rule); Census fixes how many of each digit the board holds (against every rule that
 * wants 9s); Snake wants each step along its path to be s, so it fights every rule that wants repeated digits; Mirror
 * Gap wants one half of the board d more than the other.
 *
 * A rule whose utility is a sum over disjoint groups of cells (`parts`) gives the estimator its anchors: the group
 * contents worth reaching (energy.ts combines the cheapest per group). The others give their own candidates.
 */
import { q, ref, type DynamicRule, type Invalid, type ParamSpace, type RuleFamily } from "@workspace/v2-core";
import { at, cellName, type GridState } from "./grid.ts";
import { boxes, cols, rows } from "./units.ts";

const log2 = Math.log2, abs = Math.abs;
/** The digits read left to right as one whole number ("0123" is 123). */
export const numOf = (ds: readonly number[]): number => ds.reduce((t, x) => t * 10 + x, 0);
/** n as `len` digits (leading 0s). */
export const digitsOf = (n: number, len: number): number[] => Array.from({ length: len }, (_, i) => Math.floor(n / 10 ** (len - 1 - i)) % 10);

/** The separable form: u is the sum of part(the group's digits) over the groups (disjoint lists of cells). */
export interface GridParts<P> {
  groups(n: number, p: P): readonly (readonly number[])[];
  part(ds: readonly number[], p: P): number;
  /** Contents of one group worth reaching (each a list of digits as long as the group). */
  anchors(len: number, p: P): readonly (readonly number[])[];
}
export interface GridDynamicRule<P> extends DynamicRule<GridState, P> {
  readonly parts?: GridParts<P>;
}

export interface GridRuleSpec<P> {
  readonly id: string;
  readonly title: string;
  /** The main part's title, short. */
  readonly goal: string;
  /** The goal card, in a 12-year-old's words. */
  card(p: P): string;
  /** Where the views focus: a representation. */
  readonly rep: string;
  readonly space: ParamSpace<P>;
  readonly peers: readonly P[];
  u?(cells: readonly number[], p: P, n: number): number;
  readonly parts?: GridParts<P>;
  /** Boards reachable in one turn from x worth trying for utility uStar (free-energy.ts): the rule's own heuristic. */
  candidates?(x: GridState, uStar: number, p: P): readonly GridState[];
  /** The cells the views pick out (focus marks), for a rule that reads only some of the board. */
  focus?(n: number, p: P): readonly number[];
}

const sideOf = (cells: readonly number[]) => Math.round(Math.sqrt(cells.length));
/** A grid rule family from its spec: evaluate records u as the main term "utility" (to a millionth). */
export function dynamicGrid<P>(s: GridRuleSpec<P>): RuleFamily<GridState, P> {
  const parts = s.parts;
  const u = (cells: readonly number[], p: P): number => {
    const n = sideOf(cells);
    if (parts) return parts.groups(n, p).reduce((t, g) => t + parts.part(g.map(i => cells[i]!), p), 0);
    return s.u!(cells, p, n);
  };
  const dynamic: GridDynamicRule<P> = { reads: ["cells"], u: (st, p) => u(st.cells, p), ...(s.candidates ? { candidates: s.candidates } : {}), ...(parts ? { parts } : {}) };
  return {
    id: s.id, title: s.title, card: p => s.card(p), params: [], dealable: () => s.peers, depends: [...new Set(["cells", s.rep])],
    main: { id: "utility", title: s.goal, rep: s.rep, sense: "max", sentence: p => s.card(p) },
    tieBreakers: [], keepsParams: true, space: s.space, dynamic,
    evaluate(ctx, p) {
      const n = Math.round(Math.sqrt(ctx.state.cells.length)), refs = Array.from({ length: n * n }, (_, i) => ref("cells", cellName(n, i)));
      for (const r of refs) ctx.read(r);
      const x = u(ctx.state.cells, p);
      ctx.term("utility", s.goal, Number.isFinite(x) ? q(BigInt(Math.round(x * 1e6)), 1000000n) : { undefined: "this board has no score under this rule" }, refs);
      for (const i of s.focus?.(n, p) ?? []) ctx.mark({ kind: "focus", ref: refs[i]! });
    },
  };
}

// ------------------------------------------------------------------ parameter spaces

const intSpace = (name: string, lo: number, hi: number, hint: string, ok: (k: number) => boolean = () => true): ParamSpace<Record<string, number>> => {
  const all: number[] = [];
  for (let k = lo; k <= hi; k++) if (ok(k)) all.push(k);
  return {
    size: all.length, hint,
    draw: r => ({ [name]: all[r.below(all.length)]! }),
    parse(text) {
      const t = text.trim().replace(new RegExp(`^${name}\\s*=\\s*`), ""), k = /^\d+$/.test(t) ? Number(t) : NaN;
      return Number.isInteger(k) && k >= lo && k <= hi && ok(k) ? { [name]: k } : { invalid: hint };
    },
    label: p => String(p[name]),
  };
};

// ------------------------------------------------------------------ number helpers (nothing at import time)

let SIEVE: Uint8Array | null = null;
/** Primality below 12,000 (a sieve built on first use). */
export function isPrimeSmall(n: number): boolean {
  if (!SIEVE) {
    SIEVE = new Uint8Array(12000).fill(1);
    SIEVE[0] = SIEVE[1] = 0;
    for (let i = 2; i * i < 12000; i++) if (SIEVE[i]) for (let j = i * i; j < 12000; j += i) SIEVE[j] = 0;
  }
  return n >= 0 && n < 12000 && SIEVE[n] === 1;
}
/** The prime nearest x (ties: the lower; 2 at least). */
export function nearestPrime(x: number): number {
  if (x <= 2) return 2;
  for (let d = 0; ; d++) { if (isPrimeSmall(x - d)) return x - d; if (isPrimeSmall(x + d)) return x + d; }
}
const allOfLength = (len: number, ok: (v: number) => boolean): number[][] => {
  const out: number[][] = [];
  for (let v = 0; v < 10 ** len; v++) if (ok(v)) out.push(digitsOf(v, len));
  return out;
};
const digitSum = (ds: readonly number[]) => ds.reduce((t, x) => t + x, 0);
/** Whether no one-digit line (1111, 2222, …, 9999) has the property: a one-digit board must not sit on a rule's anchors. */
const noRepdigit = (has: (v: number) => boolean) => [1, 2, 3, 4, 5, 6, 7, 8, 9].every(d => !has(1111 * d));

// ------------------------------------------------------------------ 1. Row Multiples: rows as numbers, multiples of k

export const rowMultiples = dynamicGrid<{ k: number }>({
  id: "row-multiples", title: "Row Multiples", goal: "every row a big multiple of k", rep: "tally",
  card: ({ k }) => `Read each row from left to right as one number (0 4 2 7 is 427). Every row should be a multiple of ${k}, and a bigger multiple scores more (the number of binary digits of the multiple nearest the row). Being d away from that multiple loses 4 × log2(1 + d). The score is the four rows' scores added up.`,
  // k never divides a one-digit row (1111 × d: not 7, 9, 11, 33, 77, 99 or 101), so a one-digit board is never on its anchors.
  space: intSpace("k", 7, 199, "k, a whole number from 7 to 199 that does not end in 0, 2, 4, 5, 6 or 8 and does not divide 1111 × d (d 1 to 9), e.g. 13",
    k => k % 2 !== 0 && k % 5 !== 0 && noRepdigit(v => v % k === 0)) as unknown as ParamSpace<{ k: number }>,
  peers: [{ k: 13 }, { k: 37 }],
  parts: {
    groups: n => rows(n),
    part: (ds, { k }) => { const R = numOf(ds), m = k * Math.round(R / k); return log2(1 + m) - 4 * log2(1 + abs(R - m)); },
    anchors: (len, { k }) => allOfLength(len, v => v % k === 0),
  },
});

// ------------------------------------------------------------------ 2. Prime Columns: column + t prime

export const primeColumns = dynamicGrid<{ t: number }>({
  id: "prime-columns", title: "Prime Columns", goal: "every column plus t a big prime", rep: "tally",
  card: ({ t }) => `Read each column from top to bottom as one number, and add ${t}. That should be a prime number, and a bigger prime scores more (its number of binary digits). Being d away from the nearest prime loses 4 × log2(1 + d). The score is the four columns' scores added up.`,
  // No one-digit column (1111 × d) plus t is prime, so a one-digit board is never on its anchors.
  space: intSpace("t", 0, 999, "t, a whole number from 0 to 999 such that 1111 × d + t is not prime for any d from 1 to 9, e.g. 54",
    t => noRepdigit(v => isPrimeSmall(v + t))) as unknown as ParamSpace<{ t: number }>,
  peers: [{ t: 0 }, { t: 54 }],
  parts: {
    groups: n => cols(n),
    part: (ds, { t }) => { const x = numOf(ds) + t, p = nearestPrime(x); return log2(p) - 4 * log2(1 + abs(x - p)); },
    anchors: (len, { t }) => allOfLength(len, v => isPrimeSmall(v + t)),
  },
});

// ------------------------------------------------------------------ 3. Square Boxes: each corner box clockwise, a square plus j

/** A corner box's cells read clockwise from its top-left: top-left, top-right, bottom-right, bottom-left. */
export const clockwiseBoxes = (n: number): number[][] => boxes(n).map(b => (b.length === 4 ? [b[0]!, b[1]!, b[3]!, b[2]!] : b));
export const squareBoxes = dynamicGrid<{ j: number }>({
  id: "square-boxes", title: "Square Boxes", goal: "every corner box a big square plus j", rep: "boxes",
  card: ({ j }) => `Read each corner box (a 2 × 2 quarter of the board) clockwise from its top-left cell as one number. It should be a square number plus ${j} (n × n + ${j}), and a bigger n scores more (log2(1 + n)). Being d away loses 4 × log2(1 + d). The score is the four boxes' scores added up.`,
  space: intSpace("j", 0, 99, "j, a whole number from 0 to 99 such that 1111 × d − j is not a square for any d from 1 to 9, e.g. 17",
    j => noRepdigit(v => Number.isInteger(Math.sqrt(v - j)))) as unknown as ParamSpace<{ j: number }>,
  peers: [{ j: 0 }, { j: 17 }],
  parts: {
    groups: n => clockwiseBoxes(n),
    part: (ds, { j }) => { const B = numOf(ds), x = Math.max(0, B - j), m = Math.round(Math.sqrt(x)); return log2(1 + m) - 4 * log2(1 + abs(B - j - m * m)); },
    anchors: (len, { j }) => allOfLength(len, v => v >= j && Number.isInteger(Math.sqrt(v - j))),
  },
});

// ------------------------------------------------------------------ 4. Light Rows: each row adds up to T and reads big

export const lightRows = dynamicGrid<{ T: number }>({
  id: "light-rows", title: "Light Rows", goal: "every row's digits adding up to T, the row as big as can be", rep: "tally",
  card: ({ T }) => `Each row's four numbers should add up to exactly ${T}, and, read from left to right as one number, the row should be as big as it can be (log2(1 + the row)). Every unit the row's total is away from ${T} loses 3. The score is the four rows' scores added up.`,
  space: intSpace("T", 10, 30, "T, a whole number from 10 to 30") as unknown as ParamSpace<{ T: number }>,
  peers: [{ T: 11 }, { T: 23 }],
  parts: {
    groups: n => rows(n),
    part: (ds, { T }) => log2(1 + numOf(ds)) - 3 * abs(digitSum(ds) - T),
    anchors: (len, { T }) => allOfLength(len, v => digitSum(digitsOf(v, len)) === T),
  },
});

// ------------------------------------------------------------------ 5. Mirror Gap: each cell d more than its mirror image

export const AXES = ["left-right", "top-bottom", "diagonal", "other-diagonal"] as const;
export type Axis = (typeof AXES)[number];
const AXIS_WORDS: Readonly<Record<Axis, [string, string]>> = {
  "left-right": ["the left half", "the right half (the board flipped left to right)"],
  "top-bottom": ["the top half", "the bottom half (the board flipped upside down)"],
  "diagonal": ["the cells above the diagonal from the top-left corner", "the cells below it (the board flipped over that diagonal)"],
  "other-diagonal": ["the cells above the diagonal from the top-right corner", "the cells below it (the board flipped over that diagonal)"],
};
/** Each cell of the first side with its mirror image across the axis. */
export function mirrorPairs(n: number, axis: Axis): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const [mr, mc, first] = axis === "left-right" ? [r, n - 1 - c, c < n / 2] : axis === "top-bottom" ? [n - 1 - r, c, r < n / 2]
      : axis === "diagonal" ? [c, r, c > r] : [n - 1 - c, n - 1 - r, r + c < n - 1];
    if (first) out.push([at(n, r, c), at(n, mr, mc)]);
  }
  return out;
}
const mirrorSpace: ParamSpace<{ axis: Axis; d: number }> = {
  size: AXES.length * 9, hint: "a mirror (left-right, top-bottom, diagonal or other-diagonal) and d from 1 to 9, e.g. left-right 3",
  draw: r => ({ axis: AXES[r.below(AXES.length)]!, d: 1 + r.below(9) }),
  parse(text): { axis: Axis; d: number } | Invalid {
    const m = /^\s*([a-z-]+)[\s,]+(\d)\s*$/.exec(text);
    return m && (AXES as readonly string[]).includes(m[1]!) && Number(m[2]) >= 1 ? { axis: m[1] as Axis, d: Number(m[2]) } : { invalid: mirrorSpace.hint };
  },
  label: p => `${p.axis} ${p.d}`,
};
export const mirrorGap = dynamicGrid<{ axis: Axis; d: number }>({
  id: "mirror-gap", title: "Mirror Gap", goal: "each cell d more than its mirror image", rep: "cells",
  card: ({ axis, d }) => `Fold the board: each cell of ${AXIS_WORDS[axis][0]} should be exactly ${d} more than its mirror image in ${AXIS_WORDS[axis][1]}. Each pair scores a quarter of its two numbers added together, and loses 2 for every unit its difference is away from ${d}.`,
  space: mirrorSpace,
  peers: [{ axis: "left-right", d: 3 }, { axis: "diagonal", d: 5 }],
  focus: (n, { axis }) => mirrorPairs(n, axis).flat(),
  parts: {
    groups: (n, { axis }) => mirrorPairs(n, axis),
    part: ([a, b], { d }) => (a! + b!) / 4 - 2 * abs(a! - b! - d),
    anchors: () => allOfLength(2, () => true),
  },
});

// ------------------------------------------------------------------ 6. Power Diagonals: each diagonal near a power of b

export const powerDiagonals = dynamicGrid<{ b: number }>({
  id: "power-diagonals", title: "Power Diagonals", goal: "both diagonals big powers of b", rep: "cells",
  card: ({ b }) => `Read each diagonal as one number: from the top-left corner down to the bottom-right, and from the top-right corner down to the bottom-left. Each should be a power of ${b} (${b}, ${b * b}, ${b ** 3}, …), and a bigger power scores more (its number of binary digits). Being d away from the nearest power loses 4 × log2(1 + d).`,
  space: intSpace("b", 2, 30, "b, a whole number from 2 to 30") as unknown as ParamSpace<{ b: number }>,
  peers: [{ b: 3 }, { b: 7 }],
  focus: n => rows(n).flatMap((_, k) => [at(n, k, k), at(n, k, n - 1 - k)]),
  parts: {
    groups: n => [rows(n).map((_, k) => at(n, k, k)), rows(n).map((_, k) => at(n, k, n - 1 - k))],
    part: (ds, { b }) => {
      const D = numOf(ds);
      let P = b;
      for (let t = b; t <= 2 * D + b; t *= b) if (abs(t - D) < abs(P - D)) P = t;
      return log2(P) - 4 * log2(1 + abs(D - P));
    },
    anchors: (len, { b }) => { const out: number[][] = []; for (let t = b; t < 10 ** len; t *= b) out.push(digitsOf(t, len)); return out; },
  },
});

// ------------------------------------------------------------------ 7. Adding Rows: row a + row b = row c, row c big

export interface AddingParams { readonly a: number; readonly b: number; readonly c: number; readonly by: "rows" | "columns" }
const TRIPLES: readonly AddingParams[] = (["rows", "columns"] as const).flatMap(by => [0, 1, 2, 3].flatMap(c => {
  const rest = [0, 1, 2, 3].filter(x => x !== c);
  return [[rest[0]!, rest[1]!], [rest[0]!, rest[2]!], [rest[1]!, rest[2]!]].map(([a, b]) => ({ a: a!, b: b!, c, by }));
}));
const addingSpace: ParamSpace<AddingParams> = {
  size: TRIPLES.length, hint: "rows or columns, then three different numbers 1 to 4: a, b and c, e.g. rows 1 2 4 (row 1 + row 2 = row 4)",
  draw: r => TRIPLES[r.below(TRIPLES.length)]!,
  parse(text) {
    const m = /^\s*(rows|columns)[\s,]+([1-4])[\s,]+([1-4])[\s,]+([1-4])\s*$/.exec(text);
    if (!m) return { invalid: addingSpace.hint };
    const [a, b, c] = [Number(m[2]) - 1, Number(m[3]) - 1, Number(m[4]) - 1];
    const t = TRIPLES.find(x => x.by === m[1] && x.c === c && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    return t ?? { invalid: addingSpace.hint };
  },
  label: p => `${p.by} ${p.a + 1} ${p.b + 1} ${p.c + 1}`,
};
const LINES = new Map<string, number[][]>();
const linesBy = (n: number, by: "rows" | "columns") => { const k = `${n}${by}`; let l = LINES.get(k); if (!l) LINES.set(k, l = by === "rows" ? rows(n) : cols(n)); return l; };
const readLine = (cells: readonly number[], g: readonly number[]) => numOf(g.map(i => cells[i]!));
const withLine = (cells: readonly number[], g: readonly number[], v: number): number[] | null => {
  if (v < 0 || v >= 10 ** g.length || !Number.isInteger(v)) return null;
  const out = cells.slice(), ds = digitsOf(v, g.length);
  g.forEach((i, k) => { out[i] = ds[k]!; });
  return out;
};
export const addingRows = dynamicGrid<AddingParams>({
  id: "adding-rows", title: "Adding Rows", goal: "two rows (or columns) adding up to a third, the third big", rep: "tally",
  card: ({ a, b, c, by }) => {
    const w = by === "rows" ? ["row", "left to right"] : ["column", "top to bottom"];
    return `Read each ${w[0]} from ${w[1]} as one number. ${w[0]![0]!.toUpperCase()}${w[0]!.slice(1)} ${a + 1} plus ${w[0]} ${b + 1} should make ${w[0]} ${c + 1}, and the bigger ${w[0]} ${c + 1} the better (log2(1 + it)). Being d away from the sum loses 4 × log2(1 + d).`;
  },
  space: addingSpace,
  peers: [TRIPLES.find(t => t.by === "rows" && t.a === 0 && t.b === 1 && t.c === 3)!, TRIPLES.find(t => t.by === "columns" && t.a === 1 && t.b === 3 && t.c === 0)!],
  focus: (n, { a, b, c, by }) => [a, b, c].flatMap(i => linesBy(n, by)[i]!),
  u: (cells, { a, b, c, by }, n) => {
    const L = linesBy(n, by), A = readLine(cells, L[a]!), B = readLine(cells, L[b]!), C = readLine(cells, L[c]!);
    return log2(1 + C) - 4 * log2(1 + abs(A + B - C));
  },
  candidates: (st, _u, { a, b, c, by }) => {
    const n = sideOf(st.cells), L = linesBy(n, by), [ga, gb, gc] = [L[a]!, L[b]!, L[c]!], x = st.cells;
    const A = readLine(x, ga), B = readLine(x, gb), C = readLine(x, gc), top = 10 ** n - 1;
    // Targets for line c: its value now, the sum now, and each one-digit raise of either; then solve b (or a) for it.
    const Cs = new Set([C, A + B]);
    for (const base of [C, A + B]) for (let k = 0; k < n; k++) for (let dgt = 0; dgt < 10; dgt++) {
      const ds = digitsOf(Math.min(base, top), n); ds[k] = dgt; Cs.add(numOf(ds));
    }
    Cs.add(top);
    const out: GridState[] = [];
    for (const V of Cs) {
      if (V > top) continue;
      const withC = withLine(x, gc, V)!;
      for (const [g, other] of [[gb, A], [ga, B]] as const) { const t = withLine(withC, g, V - other); if (t) out.push({ cells: t }); }
      if (V === A + B) out.push({ cells: withC });
    }
    return out;
  },
});

// ------------------------------------------------------------------ 8. Census: exactly c_d copies of each digit d

const censusSpace: ParamSpace<{ counts: string }> = {
  size: 0, hint: "ten counts, one for each digit 0 to 9, each 0 to 3, adding up to 16, e.g. 2121212121 (two 0s, one 1, two 2s, …)",
  draw: r => {
    const c = Array(10).fill(1) as number[];
    for (let left = 6; left > 0;) { const d = r.below(10); if (c[d]! < 3) { c[d]!++; left--; } }
    return { counts: c.join("") };
  },
  parse(text) {
    const s = text.trim().replace(/^counts\s*=\s*/, "");
    return /^[0-3]{10}$/.test(s) && digitSum([...s].map(Number)) === 16 ? { counts: s } : { invalid: censusSpace.hint };
  },
  label: p => p.counts,
};
(censusSpace as { size: number }).size = (() => {   // vectors of ten counts 0–3 adding to 16 (a count, not computed at import: tiny)
  let ways = [1];
  for (let d = 0; d < 10; d++) { const next = Array(ways.length + 3).fill(0) as number[]; ways.forEach((w, s) => { for (let k = 0; k <= 3; k++) next[s + k]! += w; }); ways = next; }
  return ways[16]!;
})();
const countsOf = (cells: readonly number[]) => { const c = Array(10).fill(0) as number[]; for (const x of cells) c[x]!++; return c; };
const NAMES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
export const census = dynamicGrid<{ counts: string }>({
  id: "census", title: "Census", goal: "exactly the dealt number of each digit", rep: "cells",
  card: ({ counts }) => `The board should hold exactly ${[...counts].map((k, d) => `${k} × ${NAMES[d]}`).join(", ")} (where the numbers sit does not matter). Every number too many or too few loses 1, and the score is what is left (0 at best).`,
  space: censusSpace,
  peers: [{ counts: "2121212122" }, { counts: "3011302033" }],
  u: (cells, { counts }) => { const c = countsOf(cells); return -c.reduce((t, k, d) => t + abs(k - Number(counts[d])), 0); },
  // Fix the board one cell at a time: a surplus digit's cell becomes the nearest missing digit, cheapest first.
  candidates: (st, _u, { counts }) => {
    const cur = st.cells.slice(), want = [...counts].map(Number), out: GridState[] = [];
    for (let step = 0; step < 16; step++) {
      const have = countsOf(cur), missing = want.flatMap((w, d) => (have[d]! < w ? [d] : []));
      if (!missing.length) break;
      let best: [number, number] | null = null, bestCost = Infinity;
      cur.forEach((x, i) => { if (have[x]! > want[x]!) for (const d of missing) if (abs(d - x) < bestCost) { bestCost = abs(d - x); best = [i, d]; } });
      if (!best) break;
      cur[best[0]] = best[1];
      out.push({ cells: cur.slice() });
    }
    return out;
  },
});

// ------------------------------------------------------------------ 9. Snake: every step along the snake is s (round the clock)

export interface SnakeParams { readonly s: number; readonly start: "top-left" | "top-right" | "bottom-left" | "bottom-right"; readonly by: "rows" | "columns" }
const STARTS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
/** The snake path: along the first row (or column) from the start corner, back along the next, and so on. */
const PATHS = new Map<string, number[]>();
export function snakePath(n: number, p: Pick<SnakeParams, "start" | "by">): number[] {
  const k = `${n}:${p.start}:${p.by}`;
  let path = PATHS.get(k);
  if (!path) PATHS.set(k, path = layPath(n, p));
  return path;
}
function layPath(n: number, { start, by }: Pick<SnakeParams, "start" | "by">): number[] {
  const top = start.startsWith("top"), left = start.endsWith("left"), out: number[] = [];
  // by rows: lanes are rows from the start's row, the first run away from the start's side; by columns the same, turned.
  const [laneFirst, runFirst] = by === "rows" ? [top, left] : [left, top];
  for (let k = 0; k < n; k++) {
    const lane = laneFirst ? k : n - 1 - k, forward = (k % 2 === 0) === runFirst;
    for (let j = 0; j < n; j++) { const along = forward ? j : n - 1 - j; out.push(by === "rows" ? at(n, lane, along) : at(n, along, lane)); }
  }
  return out;
}
const clock = (x: number) => { const m = ((x % 10) + 10) % 10; return Math.min(m, 10 - m); };
const snakeSpace: ParamSpace<SnakeParams> = {
  size: 9 * 4 * 2, hint: "a step s from 1 to 9, a start corner and rows or columns, e.g. 3 top-left rows",
  draw: r => ({ s: 1 + r.below(9), start: STARTS[r.below(4)]!, by: r.below(2) ? "columns" : "rows" }),
  parse(text) {
    const m = /^\s*([1-9])[\s,]+(top-left|top-right|bottom-left|bottom-right)[\s,]+(rows|columns)\s*$/.exec(text);
    return m ? { s: Number(m[1]), start: m[2] as SnakeParams["start"], by: m[3] as SnakeParams["by"] } : { invalid: snakeSpace.hint };
  },
  label: p => `${p.s} ${p.start} ${p.by}`,
};
export const snake = dynamicGrid<SnakeParams>({
  id: "snake", title: "Snake", goal: "every step along the snake s more, round the clock", rep: "cells",
  card: ({ s, start, by }) => `Walk the board like a snake: from the ${start} corner along the first ${by === "rows" ? "row" : "column"}, back along the next, and so on through all sixteen cells. Each number should be ${s} more than the one before, counting round a clock face of 0 to 9 (after 9 comes 0). Every step loses how far it is from +${s} round that clock (at most 5).`,
  space: snakeSpace,
  peers: [{ s: 3, start: "top-left", by: "rows" }, { s: 7, start: "bottom-right", by: "columns" }],
  u: (cells, p, n) => { const path = snakePath(n, p); let t = 0; for (let i = 1; i < path.length; i++) t -= clock(cells[path[i]!]! - cells[path[i - 1]!]! - p.s); return t; },
  // The ten full snakes (one per first number), and each reached a cell at a time, cheapest first.
  candidates: (st, _u, p) => {
    const n = sideOf(st.cells), path = snakePath(n, p), out: GridState[] = [];
    for (let c0 = 0; c0 < 10; c0++) {
      const target = st.cells.slice();
      path.forEach((i, k) => { target[i] = (c0 + k * p.s) % 10; });
      const order = path.filter(i => target[i] !== st.cells[i]).sort((i, j) => abs(target[i]! - st.cells[i]!) - abs(target[j]! - st.cells[j]!));
      const cur = st.cells.slice();
      for (const i of order) { cur[i] = target[i]!; out.push({ cells: cur.slice() }); }
    }
    return out;
  },
});

/** The dealt grid rules (every grid setup deals these). */
export const dynamicGridFamilies = [rowMultiples, primeColumns, squareBoxes, lightRows, mirrorGap, powerDiagonals, addingRows, census, snake] as const;
export type DynamicGridFamily = (typeof dynamicGridFamilies)[number];
