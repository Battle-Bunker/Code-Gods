import type { GridOrdinalFamily } from "./types.ts";

// Scratch buffers for flood fills, grown on demand (grids are at most 7×7).
let seen = new Uint8Array(64);
let queue = new Int32Array(64);
function scratch(NN: number): void {
  if (seen.length < NN) { seen = new Uint8Array(NN); queue = new Int32Array(NN); }
  seen.fill(0, 0, NN);
}

/** Unordered pair {x, y} equals {A, B} (Python set equality on two-element sets). */
function pairIs(x: number, y: number, A: number, B: number): boolean {
  return (x === A && y === B) || (x === B && y === A);
}

/**
 * Mirrors geometry.py `ck_ord` (Castle Keeper): 4-connected components of non-wall cells that never
 * touch the rim are enclosed; score by mode (plain: cells, treasure: cells of colour T, eyes: cells
 * + 3 per region). Returns (score, wall cells on the rim).
 */
const castleKeeper: GridOrdinalFamily = {
  id: "castle_keeper",
  ordinal(g, p) {
    const N = g.size, NN = N * N, W = p.W, col = g.col, mode = p.mode, T = p.T;
    scratch(NN);
    let encCells = 0, encT = 0, regions = 0;
    for (let s = 0; s < NN; s++) {
      if (col[s] === W || seen[s]) continue;
      seen[s] = 1;
      let head = 0, tail = 0, rim = false, cells = 0, tCells = 0;
      queue[tail++] = s;
      while (head < tail) {
        const i = queue[head++], r = (i / N) | 0, c = i - r * N;
        cells++;
        if (col[i] === T) tCells++;
        if (r === 0 || c === 0 || r === N - 1 || c === N - 1) rim = true;
        if (r > 0 && !seen[i - N] && col[i - N] !== W) { seen[i - N] = 1; queue[tail++] = i - N; }
        if (r < N - 1 && !seen[i + N] && col[i + N] !== W) { seen[i + N] = 1; queue[tail++] = i + N; }
        if (c > 0 && !seen[i - 1] && col[i - 1] !== W) { seen[i - 1] = 1; queue[tail++] = i - 1; }
        if (c < N - 1 && !seen[i + 1] && col[i + 1] !== W) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      }
      if (!rim) { encCells += cells; encT += tCells; regions++; }
    }
    let rimw = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if ((r === 0 || c === 0 || r === N - 1 || c === N - 1) && col[r * N + c] === W) rimw++;
      }
    }
    const score = mode === "treasure" ? encT : mode === "eyes" ? encCells + 3 * regions : encCells;
    return [score, rimw];
  },
};

/**
 * Mirrors geometry.py `ch_ord` (Chessmaster): (2×2 windows forming an A/B chessboard, A–B seams
 * between orthogonal neighbours).
 */
const chessmaster: GridOrdinalFamily = {
  id: "chessmaster",
  ordinal(g, p) {
    const N = g.size, col = g.col, A = p.A, B = p.B;
    let w = 0, seams = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c, a = col[i];
        if (c + 1 < N && pairIs(a, col[i + 1], A, B)) seams++;
        if (r + 1 < N && pairIs(a, col[i + N], A, B)) seams++;
        if (r < N - 1 && c < N - 1) {
          const b = col[i + 1];
          if (pairIs(a, b, A, B) && col[i + N + 1] === a && col[i + N] === b) w++;
        }
      }
    }
    return [w, seams];
  },
};

/**
 * Mirrors geometry.py `br_ord` (Bridge Builder): the most columns (D "LR") or rows (D "TB") spanned
 * by one 4-connected component of colour C; 0 when there is none.
 */
const bridgeBuilder: GridOrdinalFamily = {
  id: "bridge_builder",
  ordinal(g, p) {
    const N = g.size, NN = N * N, col = g.col, C = p.C, lr = p.D === "LR";
    scratch(NN);
    let best = 0;
    for (let s = 0; s < NN; s++) {
      if (col[s] !== C || seen[s]) continue;
      seen[s] = 1;
      let head = 0, tail = 0, span = 0;
      queue[tail++] = s;
      while (head < tail) {
        const i = queue[head++], r = (i / N) | 0, c = i - r * N;
        span |= 1 << (lr ? c : r);
        if (r > 0 && !seen[i - N] && col[i - N] === C) { seen[i - N] = 1; queue[tail++] = i - N; }
        if (r < N - 1 && !seen[i + N] && col[i + N] === C) { seen[i + N] = 1; queue[tail++] = i + N; }
        if (c > 0 && !seen[i - 1] && col[i - 1] === C) { seen[i - 1] = 1; queue[tail++] = i - 1; }
        if (c < N - 1 && !seen[i + 1] && col[i + 1] === C) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      }
      let n = 0;
      for (; span; span &= span - 1) n++;
      if (n > best) best = n;
    }
    return best;
  },
};

/**
 * Mirrors geometry.py `cw_ord` (Card Windmill): over each 90° orbit of 4 cells (geometry.py
 * `orbits`), count suit steps v[i+1] == (v[i] + 1) % 4 (wrapping round the orbit). Returns
 * (orbits with all 4 steps, total steps).
 */
const cardWindmill: GridOrdinalFamily = {
  id: "card_windmill",
  ordinal(g, _p, env) {
    const N = g.size, sym = g.sym, suit = env.suit!;
    let full = 0, steps = 0;
    for (let r = 0; r < N >> 1; r++) {
      for (let c = 0; c < (N + 1) >> 1; c++) {
        const v0 = suit[sym[r * N + c]], v1 = suit[sym[c * N + N - 1 - r]];
        const v2 = suit[sym[(N - 1 - r) * N + N - 1 - c]], v3 = suit[sym[(N - 1 - c) * N + r]];
        const n = +(v1 === (v0 + 1) % 4) + +(v2 === (v1 + 1) % 4) + +(v3 === (v2 + 1) % 4) + +(v0 === (v3 + 1) % 4);
        steps += n;
        if (n === 4) full++;
      }
    }
    return [full, steps];
  },
};

/** Ports of lib/grid-lab/gridlab/rules/geometry.py. */
export const FAMILIES: readonly GridOrdinalFamily[] = [castleKeeper, chessmaster, bridgeBuilder, cardWindmill];
