import type { GridOrdinalFamily } from "./types.ts";
import { components4 } from "./seeds-strategy-util.ts";

const DIRS_STRAIGHT: readonly (readonly [number, number])[] = [[0, 1], [1, 0]];
const DIRS_DIAG: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [1, 1], [1, -1]];

/**
 * Mirrors seeds.py `s1_ord` (Line Painter): for each direction, every cell of colour X that has an
 * X neighbour forwards or backwards along that direction lies in a run of length >= 2, and scores its value.
 */
const SEED1: GridOrdinalFamily = {
  id: "seed1_line_painter",
  ordinal(g, p, env) {
    const N = env.N, X = p.colour, col = g.col, sym = g.sym, value = env.value;
    let tot = 0;
    for (const [dr, dc] of p.diag ? DIRS_DIAG : DIRS_STRAIGHT) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (col[r * N + c] !== X) continue;
          const r1 = r + dr, c1 = c + dc, r0 = r - dr, c0 = c - dc;
          const fwd = r1 >= 0 && r1 < N && c1 >= 0 && c1 < N && col[r1 * N + c1] === X;
          const bwd = r0 >= 0 && r0 < N && c0 >= 0 && c0 < N && col[r0 * N + c0] === X;
          if (fwd || bwd) tot += value[sym[r * N + c]];
        }
      }
    }
    return tot;
  },
};

/**
 * Mirrors seeds.py `s2_ord` (Patchwork): 4-connected same-rank patches of size >= 2 with no two
 * touching cells sharing a colour score size × value.
 */
const SEED2: GridOrdinalFamily = {
  id: "seed2_patchwork",
  ordinal(g, _p, env) {
    const N = env.N, NN = N * N, sym = g.sym, col = g.col, rank = env.rank, value = env.value;
    const key = new Int16Array(NN);
    for (let i = 0; i < NN; i++) key[i] = rank[sym[i]];
    const { id, size } = components4(N, key, null);
    const bad = new Uint8Array(size.length);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (c + 1 < N && key[i] === key[i + 1] && col[i] === col[i + 1]) bad[id[i]] = 1;
        if (r + 1 < N && key[i] === key[i + N] && col[i] === col[i + N]) bad[id[i]] = 1;
      }
    }
    let tot = 0;
    for (let i = 0; i < NN; i++) {
      const k = id[i];
      if (size[k] >= 2 && !bad[k]) tot += value[sym[i]];
    }
    return tot;
  },
};

/** Mirrors seeds.py `s3_ord` (Green Ones): (cells with the value and colour, cells with exactly one of them). */
const SEED3: GridOrdinalFamily = {
  id: "seed3_green_ones",
  ordinal(g, p, env) {
    const NN = env.N * env.N, sym = g.sym, col = g.col, value = env.value, V = p.value, X = p.colour;
    let tok = 0, half = 0;
    for (let i = 0; i < NN; i++) {
      const a = value[sym[i]] === V, b = col[i] === X;
      if (a && b) tok++;
      else if (a !== b) half++;
    }
    return [tok, half];
  },
};

/** Ports of lib/grid-lab/gridlab/rules/seeds.py. */
export const FAMILIES: readonly GridOrdinalFamily[] = [SEED1, SEED2, SEED3];
