/**
 * Line-for-line ports of every Grid Lab mutator's `apply_fn` (lib/grid-lab/gridlab/mutators.py).
 *
 * Calling convention: each function READS the source layers `s` (symbols) and `c` (colours) and
 * WRITES into `os` / `oc`, which the caller has pre-filled with copies of `s` / `c`. Sources are never
 * written, so numpy's "evaluate the right-hand side first" semantics hold for free. Grids are
 * row-major: cell (r, k) at r * N + k. Params are the canonical objects from the shipped tables
 * (already validated), so the functions trust their shape.
 *
 * `cache` is a per-(mutator, params) scratch object owned by the table entry: static region cell
 * lists and fold maps are computed once per entry and reused on every call.
 */
import type { GridEnv } from "./env.ts";

/** A Grid Lab parameter value: an int, a string, or a (nested) tuple as an array. */
export type ParamValue = number | string | readonly ParamValue[];
export type Params = Readonly<Record<string, ParamValue>>;
export type ApplyCache = Record<string, unknown>;
export type ApplyFn = (s: Uint8Array, c: Uint8Array, os: Uint8Array, oc: Uint8Array,
  p: any, env: GridEnv, cache: ApplyCache) => void;

const mod = (a: number, m: number) => ((a % m) + m) % m;

// --- regions ------------------------------------------------------------------------------------
const lineTables = new Map<number, Int16Array[]>();
/** Lines 0..N-1 are rows, N..2N-1 columns (mutators.line_mask / line_scores order). */
export function lineCells(idx: number, N: number): Int16Array {
  let t = lineTables.get(N);
  if (!t) {
    t = [];
    for (let i = 0; i < N; i++) t.push(Int16Array.from({ length: N }, (_, j) => i * N + j));
    for (let i = 0; i < N; i++) t.push(Int16Array.from({ length: N }, (_, j) => j * N + i));
    lineTables.set(N, t);
  }
  return t[idx];
}

const depth = (r: number, k: number, N: number) => Math.min(r, k, N - 1 - r, N - 1 - k);

/** mutators.region_mask as a row-major list of flat cell indices. */
export function regionCells(kind: string, val: ParamValue, N: number): Int16Array {
  const out: number[] = [];
  const v = val as readonly number[];
  switch (kind) {
    case "cell": out.push(v[0] * N + v[1]); break;
    case "line": return lineCells(v[0] === 0 ? v[1] : N + v[1], N);
    case "diag":
      for (let i = 0; i < N; i++) out.push(i * N + (val === 0 ? i : N - 1 - i));
      break;
    case "block": {
      const [r0, c0, k] = v;
      for (let r = r0; r < r0 + k; r++) for (let q = c0; q < c0 + k; q++) out.push(r * N + q);
      break;
    }
    case "ring": case "core":
      for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
        const d = depth(r, q, N);
        if (kind === "ring" ? d === val : d >= 1) out.push(r * N + q);
      }
      break;
    case "all": for (let i = 0; i < N * N; i++) out.push(i); break;
    default: throw new Error(`Unknown region kind ${kind}`);
  }
  return Int16Array.from(out);
}

/** The line with the highest score; np.argmax semantics (the lowest index wins ties). */
function argmaxLine(N: number, score: (cells: Int16Array) => number): Int16Array {
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < 2 * N; i++) {
    const v = score(lineCells(i, N));
    if (v > bestScore) { bestScore = v; best = i; }
  }
  return lineCells(best, N);
}

const countIn = (layer: Uint8Array, k: number) => (cells: Int16Array) => {
  let n = 0;
  for (let j = 0; j < cells.length; j++) if (layer[cells[j]] === k) n++;
  return n;
};

/** resolve_mask: static regions are cached per entry; line* is measured on the grid. */
function cellsOf(p: any, N: number, cache: ApplyCache, feature?: (cells: Int16Array) => number): Int16Array {
  if (p.kind === "line*") return argmaxLine(N, feature!);
  let m = cache.cells as Int16Array | undefined;
  if (!m) cache.cells = m = regionCells(p.kind, p.region, N);
  return m;
}

const hasSym = (layer: string) => layer !== "colour";
const hasCol = (layer: string) => layer !== "symbol";

// --- 1. positional bijections -------------------------------------------------------------------
const swapCells: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [[r1, c1], [r2, c2]] = p.pair, i = r1 * N + c1, j = r2 * N + c2;
  if (hasSym(p.layer)) { os[i] = s[j]; os[j] = s[i]; }
  if (hasCol(p.layer)) { oc[i] = c[j]; oc[j] = c[i]; }
};

const shiftLine: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [ax, i] = p.line, cells = lineCells(ax === 0 ? i : N + i, N), k = p.k;
  for (let j = 0; j < N; j++) {   // np.roll(v, k)[j] = v[j - k]
    const from = cells[mod(j - k, N)], to = cells[j];
    if (hasSym(p.layer)) os[to] = s[from];
    if (hasCol(p.layer)) oc[to] = c[from];
  }
};

const reverseLine: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [ax, i] = p.line, cells = lineCells(ax === 0 ? i : N + i, N);
  for (let j = 0; j < N; j++) {
    const from = cells[N - 1 - j], to = cells[j];
    if (hasSym(p.layer)) os[to] = s[from];
    if (hasCol(p.layer)) oc[to] = c[from];
  }
};

const swapLines: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [i, j] = p.pair, a = lineCells(p.axis === 0 ? i : N + i, N), b = lineCells(p.axis === 0 ? j : N + j, N);
  for (let t = 0; t < N; t++) {
    os[a[t]] = s[b[t]]; os[b[t]] = s[a[t]];
    oc[a[t]] = c[b[t]]; oc[b[t]] = c[a[t]];
  }
};

/** core.D4 on a k×k array: the source (row, col) of destination (i, j). */
function d4Source(move: string, i: number, j: number, k: number): [number, number] {
  switch (move) {
    case "rot90": return [j, k - 1 - i];            // np.rot90(a, 1)
    case "rot180": return [k - 1 - i, k - 1 - j];
    case "rot270": return [k - 1 - j, i];
    case "flipH": return [i, k - 1 - j];
    case "flipV": return [k - 1 - i, j];
    case "transpose": return [j, i];
    case "antitranspose": return [k - 1 - j, k - 1 - i];
    default: throw new Error(`Unknown move ${move}`);
  }
}

function turnSquare(s: Uint8Array, c: Uint8Array, os: Uint8Array, oc: Uint8Array, N: number,
  r0: number, c0: number, k: number, move: string) {
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const [si, sj] = d4Source(move, i, j, k), to = (r0 + i) * N + c0 + j, from = (r0 + si) * N + c0 + sj;
    os[to] = s[from]; oc[to] = c[from];
  }
}

const turnBlock: ApplyFn = (s, c, os, oc, p, env) => {
  const [r, q, k] = p.region;
  turnSquare(s, c, os, oc, env.N, r, q, k, p.move);
};

const turnGrid: ApplyFn = (s, c, os, oc, p, env) => turnSquare(s, c, os, oc, env.N, 0, 0, env.N, p.move);

// --- 2. positional overwrites -------------------------------------------------------------------
const sortLine: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [ax, i] = p.line, cells = lineCells(ax === 0 ? i : N + i, N);
  const key = (t: number) => (env.rank[s[cells[t]]] * env.S + s[cells[t]]) * env.C + c[cells[t]];
  const order = Array.from({ length: N }, (_, t) => t).sort((a, b) => key(a) - key(b));   // stable
  if (p.dir < 0) order.reverse();
  for (let t = 0; t < N; t++) { os[cells[t]] = s[cells[order[t]]]; oc[cells[t]] = c[cells[order[t]]]; }
};

export const FOLDS = ["left->right", "right->left", "top->bottom", "bottom->top",
  "below->above diagonal", "above->below diagonal", "below->above other diagonal", "above->below other diagonal"];

/** mutators._fold_map: (dest, src) flat indices. */
export function foldMap(N: number, kind: string, line: readonly number[] | undefined, side: number | string): [Int16Array, Int16Array] {
  const dest: number[] = [], src: number[] = [], h = (N - 1) / 2;
  if (kind === "line") {
    const [ax, i] = line!;
    for (let t = 0; t < N; t++) {
      if (side === 0 ? !(t > h) : !(t < h)) continue;
      const u = N - 1 - t;
      if (ax === 0) { dest.push(i * N + t); src.push(i * N + u); } else { dest.push(t * N + i); src.push(u * N + i); }
    }
  } else {
    const f = FOLDS.indexOf(side as string);
    if (f < 0) throw new Error(`Unknown fold ${side}`);
    for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
      let on: boolean, sr: number, sc: number;
      if (f <= 1) { on = f === 0 ? q > h : q < h; sr = r; sc = N - 1 - q; }
      else if (f <= 3) { on = f === 2 ? r > h : r < h; sr = N - 1 - r; sc = q; }
      else if (f <= 5) { on = f === 4 ? q > r : q < r; sr = q; sc = r; }
      else { on = f === 7 ? r + q > N - 1 : r + q < N - 1; sr = N - 1 - q; sc = N - 1 - r; }
      if (on) { dest.push(r * N + q); src.push(sr * N + sc); }
    }
  }
  return [Int16Array.from(dest), Int16Array.from(src)];
}

const mirrorFold: ApplyFn = (s, c, os, oc, p, env, cache) => {
  let fm = cache.fold as [Int16Array, Int16Array] | undefined;
  if (!fm) cache.fold = fm = foldMap(env.N, p.kind, p.line, p.side);
  const [dest, src] = fm;
  for (let t = 0; t < dest.length; t++) {
    if (hasSym(p.layer)) os[dest[t]] = s[src[t]];
    if (hasCol(p.layer)) oc[dest[t]] = c[src[t]];
  }
};

// --- 3. colour layer ----------------------------------------------------------------------------
const paint: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const k = p.colour, m = cellsOf(p, env.N, cache, countIn(c, k));
  for (let j = 0; j < m.length; j++) oc[m[j]] = k;
};

const recolour: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const [a, b] = p.pair, m = cellsOf(p, env.N, cache, countIn(c, b));
  for (let j = 0; j < m.length; j++) if (c[m[j]] === a) oc[m[j]] = b;
};

const swapColours: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const [a, b] = p.pair, m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) {
    const x = c[m[j]];
    if (x === a) oc[m[j]] = b; else if (x === b) oc[m[j]] = a;
  }
};

const hueTurn: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) oc[m[j]] = (c[m[j]] + p.k) % env.C;
};

const patternLine: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [ax, i] = p.line, cells = lineCells(ax === 0 ? i : N + i, N);
  for (let t = 0; t < N; t++) {
    oc[cells[t]] = p.pattern === "ramp" ? mod(p.start + p.dir * t, env.C) : (t % 2 === 0 ? p.pair[0] : p.pair[1]);
  }
};

const motif: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N;
  for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) {
    let v: number;
    if (p.style === "stripes") v = mod(p.start + p.dir * (p.axis === 0 ? r : q), env.C);
    else if (p.style === "checker") v = (r + q) % 2 === 0 ? p.pair[0] : p.pair[1];
    else v = mod(p.start + p.dir * (p.axis === 0 ? r + q : r - q), env.C);
    oc[r * N + q] = v;
  }
};

const majorityLine: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const C = env.C, counts = new Int32Array(C);
  const tally = (cells: Int16Array) => {
    counts.fill(0);
    for (let j = 0; j < cells.length; j++) counts[c[cells[j]]]++;
  };
  const m = cellsOf(p, env.N, cache, cells => {   // _majority_feature: the line's top colour count
    tally(cells);
    let mx = 0;
    for (let k = 0; k < C; k++) if (counts[k] > mx) mx = counts[k];
    return mx;
  });
  tally(m);
  let best = 0;   // _plurality: bincount argmax, lowest colour wins ties
  for (let k = 1; k < C; k++) if (counts[k] > counts[best]) best = k;
  for (let j = 0; j < m.length; j++) oc[m[j]] = best;
};

// --- 4. symbol layer ----------------------------------------------------------------------------
const write: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const k = p.symbol, m = cellsOf(p, env.N, cache, countIn(s, k));
  for (let j = 0; j < m.length; j++) os[m[j]] = k;
};

const flatten: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  if (m.length < 2) return;
  let hi = -Infinity, lo = Infinity;
  for (let j = 0; j < m.length; j++) { const r = env.rank[s[m[j]]]; if (r > hi) hi = r; if (r < lo) lo = r; }
  if (hi === lo) return;
  for (let j = 0; j < m.length; j++) {
    const x = s[m[j]], r = env.rank[x];
    if (r !== hi && r !== lo) os[m[j]] = env.cards ? Math.floor(x / 13) * 13 + lo : lo;
  }
};

const stepRank: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) os[m[j]] = env.step(s[m[j]], p.k);
};

const writeRamp: ApplyFn = (s, c, os, oc, p, env) => {
  const N = env.N, [ax, i] = p.line, cells = lineCells(ax === 0 ? i : N + i, N);
  for (let t = 0; t < N; t++) {
    const rk = mod(p.start + p.dir * t, env.ranks), x = s[cells[t]];
    os[cells[t]] = env.cards ? Math.floor(x / 13) * 13 + rk : rk;
  }
};

const swapSymbols: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const [a, b] = p.pair, m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) {
    const x = s[m[j]], r = env.rank[x];
    if (r === a) os[m[j]] = env.step(x, b - a); else if (r === b) os[m[j]] = env.step(x, a - b);
  }
};

// --- 5. couplers --------------------------------------------------------------------------------
const paintByKey: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) {
    const x = s[m[j]], v = env.value[x];
    if (p.key === "parity") oc[m[j]] = v % 2 === 0 ? p.pair[0] : p.pair[1];
    else if (p.key === "mod") oc[m[j]] = (v + p.shift) % env.C;
    else { const su = env.suit![x]; oc[m[j]] = su === 1 || su === 2 ? p.pair[0] : p.pair[1]; }
  }
};

const stamp: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) if (c[m[j]] === p.colour) os[m[j]] = p.symbol;
};

const tally: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const N = env.N, X = p.colour, m = cellsOf(p, N, cache);
  for (let j = 0; j < m.length; j++) {
    const i = m[j];
    if (c[i] === X) continue;
    const r = Math.floor(i / N), q = i % N;
    let n = 0;   // _mine_counts: the 8 neighbours
    for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
      if (dr === 0 && dq === 0) continue;
      const rr = r + dr, qq = q + dq;
      if (rr >= 0 && rr < N && qq >= 0 && qq < N && c[rr * N + qq] === X) n++;
    }
    os[i] = Math.min(n, env.S - 1);
  }
};

// --- 6. capability-specific ---------------------------------------------------------------------
function touches(c: Uint8Array, N: number, i: number, k: number): boolean {   // _neigh_has: 4 neighbours
  const r = Math.floor(i / N), q = i % N;
  return (r > 0 && c[i - N] === k) || (r < N - 1 && c[i + N] === k) || (q > 0 && c[i - 1] === k) || (q < N - 1 && c[i + 1] === k);
}

const blend: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const [a, b, ch] = p.recipe, N = env.N, m = cellsOf(p, N, cache);
  for (let j = 0; j < m.length; j++) {
    const i = m[j];
    if (c[i] !== a && c[i] !== b && touches(c, N, i, a) && touches(c, N, i, b)) oc[i] = ch;
  }
};

const suitSwap: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const [a, b] = p.pair, m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) {
    const x = s[m[j]], su = Math.floor(x / 13);
    if (su === a) os[m[j]] = x + (b - a) * 13; else if (su === b) os[m[j]] = x + (a - b) * 13;
  }
};

const suitSet: ApplyFn = (s, c, os, oc, p, env, cache) => {
  const m = cellsOf(p, env.N, cache);
  for (let j = 0; j < m.length; j++) os[m[j]] = p.suit * 13 + (s[m[j]] % 13);
};

/** Every mutator's apply function, by Grid Lab id. */
export const APPLY: Readonly<Record<string, ApplyFn>> = Object.freeze({
  swap_cells: swapCells, shift_line: shiftLine, reverse_line: reverseLine, swap_lines: swapLines,
  turn_block: turnBlock, turn_grid: turnGrid, sort_line: sortLine, mirror_fold: mirrorFold,
  paint, recolour, swap_colours: swapColours, hue_turn: hueTurn, pattern_line: patternLine, motif,
  majority_line: majorityLine, write, step_rank: stepRank, write_ramp: writeRamp, swap_symbols: swapSymbols,
  flatten, paint_by_key: paintByKey, stamp, tally, blend, suit_swap: suitSwap, suit_set: suitSet,
});
