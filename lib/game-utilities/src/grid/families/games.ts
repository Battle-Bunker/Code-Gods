import type { GridEnv, GridView } from "../env.ts";
import type { GridOrdinalFamily } from "./types.ts";

/** Ports of lib/grid-lab/gridlab/rules/games.py. */

/** Index of the i-th cell of line `ln` (row ln, or column ln when `cols`). */
function at(N: number, cols: boolean, ln: number, i: number): number {
  return cols ? i * N + ln : ln * N + i;
}

/** games.md `suits`: the printed suit for cards, the cell's colour otherwise. */
function suitOf(g: GridView, env: GridEnv, i: number): number {
  return env.suit ? env.suit[g.sym[i]] : g.col[i];
}

/**
 * Grid Lab `rm_ord` (Rummy Melder): along each line of p.dir, every cell in a 3-cell set (same
 * rank, three different suits) or run (values +1, +1 in one suit) scores its value. Tie-breaker:
 * adjacent half-melds. Ordinal [score, halves].
 */
const rummyMelder: GridOrdinalFamily = {
  id: "rummy_melder",
  ordinal(g, p, env) {
    const N = env.N, cols = p.dir !== "rows", rank = env.rank, value = env.value, sym = g.sym;
    const mel = new Uint8Array(N);
    let score = 0, half = 0;
    for (let r = 0; r < N; r++) {
      mel.fill(0);
      for (let i = 0; i + 2 < N; i++) {
        const a = at(N, cols, r, i), b = at(N, cols, r, i + 1), c = at(N, cols, r, i + 2);
        const ka = rank[sym[a]], kb = rank[sym[b]], kc = rank[sym[c]];
        const sa = suitOf(g, env, a), sb = suitOf(g, env, b), sc = suitOf(g, env, c);
        const va = value[sym[a]], vb = value[sym[b]], vc = value[sym[c]];
        const set = ka === kb && kb === kc && sa !== sb && sb !== sc && sa !== sc;
        const run = vb === va + 1 && vc === vb + 1 && sa === sb && sb === sc;
        if (set || run) mel[i] = mel[i + 1] = mel[i + 2] = 1;
      }
      for (let i = 0; i < N; i++) if (mel[i]) score += value[sym[at(N, cols, r, i)]];
      for (let i = 0; i + 1 < N; i++) {
        const a = at(N, cols, r, i), b = at(N, cols, r, i + 1);
        const sa = suitOf(g, env, a), sb = suitOf(g, env, b);
        if ((rank[sym[a]] === rank[sym[b]] && sa !== sb) || (value[sym[b]] === value[sym[a]] + 1 && sa === sb)) half++;
      }
    }
    return [score, half];
  },
};

const DIRS2: readonly (readonly [number, number])[] = [[0, 1], [1, 0]];
const DIRS4D: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [1, 1], [1, -1]];

/**
 * Grid Lab `os_ord` (Othello Sandwich): X, not-X, X triples across or down (and diagonally when
 * p.diag).
 */
const othelloSandwich: GridOrdinalFamily = {
  id: "othello_sandwich",
  ordinal(g, p, env) {
    const N = env.N, X: number = p.X, col = g.col;
    let s = 0;
    for (const [dr, dc] of p.diag ? DIRS4D : DIRS2) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const r2 = r + 2 * dr, c2 = c + 2 * dc;
          if (r2 < 0 || r2 >= N || c2 < 0 || c2 >= N) continue;
          if (col[r * N + c] === X && col[(r + dr) * N + c + dc] !== X && col[r2 * N + c2] === X) s++;
        }
      }
    }
    return s;
  },
};

/**
 * Grid Lab `ms_ord` (Honest Minesweeper): colour p.X cells are mines; every other cell whose
 * value equals its 8-neighbour mine count scores that value.
 */
const honestMinesweeper: GridOrdinalFamily = {
  id: "honest_minesweeper",
  ordinal(g, p, env) {
    const N = env.N, X: number = p.X, col = g.col, value = env.value;
    let s = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (col[r * N + c] === X) continue;
        let m = 0;
        for (let rr = r - 1; rr <= r + 1; rr++) {
          if (rr < 0 || rr >= N) continue;
          for (let cc = c - 1; cc <= c + 1; cc++) {
            if (cc < 0 || cc >= N || (rr === r && cc === c)) continue;
            if (col[rr * N + cc] === X) m++;
          }
        }
        const v = value[g.sym[r * N + c]];
        if (v === m) s += v;
      }
    }
    return s;
  },
};

/**
 * Grid Lab `bi_ord` (Bingo Caller): cells whose rank is in p.called are dabbed (odd N: centre is
 * free); one point per dab plus N per full row, column or long diagonal.
 */
const bingoCaller: GridOrdinalFamily = {
  id: "bingo_caller",
  ordinal(g, p, env) {
    const N = env.N, rank = env.rank, sym = g.sym;
    const called: number[] = p.called;
    const dab = new Uint8Array(N * N);
    let dabs = 0;
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i - r * N;
      if (called.includes(rank[sym[i]]) || (N % 2 === 1 && r === c && r === N >> 1)) { dab[i] = 1; dabs++; }
    }
    let lines = 0, d1 = 1, d2 = 1;
    for (let r = 0; r < N; r++) {
      let row = 1, colm = 1;
      for (let c = 0; c < N; c++) { row &= dab[r * N + c]; colm &= dab[c * N + r]; }
      lines += row + colm;
      d1 &= dab[r * N + r];
      d2 &= dab[r * N + N - 1 - r];
    }
    return dabs + N * (lines + d1 + d2);
  },
};

/** Number of distinct ranks along line `ln` (`kind` 0 row, 1 column, 2 diagonal, 3 anti-diagonal). */
function distinct(g: GridView, env: GridEnv, kind: number, ln: number, seen: Uint8Array): number {
  const N = env.N, rank = env.rank, sym = g.sym;
  seen.fill(0);
  let d = 0;
  for (let i = 0; i < N; i++) {
    const idx = kind === 0 ? ln * N + i : kind === 1 ? i * N + ln : kind === 2 ? i * N + i : i * N + N - 1 - i;
    const k = rank[sym[idx]];
    if (!seen[k]) { seen[k] = 1; d++; }
  }
  return d;
}

/**
 * Grid Lab `su_ord` (Sudoku Scholar). N ≤ 4: [1, 0] if every row, column and long diagonal has
 * N distinct ranks, else [0, 0]. N ≥ 5: [lines of p.dir with N distinct ranks, total distinct].
 */
const sudokuScholar: GridOrdinalFamily = {
  id: "sudoku_scholar",
  ordinal(g, p, env) {
    const N = env.N, seen = new Uint8Array(env.ranks);
    if (N <= 4) {
      let all = 1;
      for (let ln = 0; ln < N && all; ln++) {
        if (distinct(g, env, 0, ln, seen) !== N || distinct(g, env, 1, ln, seen) !== N) all = 0;
      }
      if (all && (distinct(g, env, 2, 0, seen) !== N || distinct(g, env, 3, 0, seen) !== N)) all = 0;
      return [all, 0];
    }
    const dir: string = p.dir;
    let ok = 0, tot = 0;
    for (let kind = 0; kind < 2; kind++) {
      if (kind === 0 ? dir === "cols" : dir === "rows") continue;
      for (let ln = 0; ln < N; ln++) {
        const d = distinct(g, env, kind, ln, seen);
        if (d === N) ok++;
        tot += d;
      }
    }
    return [ok, tot];
  },
};

/**
 * Grid Lab `fh_ord` (Full House): pairs of equal ranks within each line of p.dir
 * (n of a kind scores n(n-1)/2).
 */
const fullHouse: GridOrdinalFamily = {
  id: "full_house",
  ordinal(g, p, env) {
    const N = env.N, cols = p.dir !== "rows", rank = env.rank, sym = g.sym;
    let s = 0;
    for (let ln = 0; ln < N; ln++) {
      for (let i = 0; i < N; i++) {
        const k = rank[sym[at(N, cols, ln, i)]];
        for (let j = i + 1; j < N; j++) if (rank[sym[at(N, cols, ln, j)]] === k) s++;
      }
    }
    return s;
  },
};

export const FAMILIES: readonly GridOrdinalFamily[] = [
  rummyMelder, othelloSandwich, honestMinesweeper, bingoCaller, sudokuScholar, fullHouse,
];
