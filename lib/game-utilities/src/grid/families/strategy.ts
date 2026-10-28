import type { GridOrdinalFamily } from "./types.ts";
import { components4, fmod } from "./seeds-strategy-util.ts";

/** Flat index of position i on line L read in direction d (Grid Lab `orient`). */
function oriented(N: number, d: string, L: number, i: number): number {
  switch (d) {
    case "→": return L * N + i;
    case "←": return L * N + (N - 1 - i);
    case "↓": return i * N + L;
    case "↑": return (N - 1 - i) * N + L;
    default: throw new Error(`rainbow_road: unknown dir ${d}`);
  }
}

/** Mirrors strategy.py `rr_ord` (Rainbow Road): (lines that step +1 round the colours throughout, such steps). */
const RAINBOW_ROAD: GridOrdinalFamily = {
  id: "rainbow_road",
  ordinal(g, p, env) {
    const N = env.N, C = env.C, col = g.col, d: string = p.dir;
    let lines = 0, pairs = 0;
    for (let L = 0; L < N; L++) {
      let all = true;
      for (let i = 0; i < N - 1; i++) {
        const good = fmod(col[oriented(N, d, L, i + 1)] - col[oriented(N, d, L, i)], C) === 1;
        if (good) pairs++;
        else all = false;
      }
      if (all) lines++;
    }
    return [lines, pairs];
  },
};

/**
 * Mirrors strategy.py `bb_ord` (Border Baron): over edges between different one-colour countries,
 * (edges where both are >= K cells, Σ min(size_a, size_b, K)).
 */
const BORDER_BARON: GridOrdinalFamily = {
  id: "border_baron",
  ordinal(g, p, env) {
    const N = env.N, K: number = p.K;
    const { id, size } = components4(N, g.col, null);
    let score = 0, tb = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        for (let k = 0; k < 2; k++) {
          if (k === 0 ? c + 1 >= N : r + 1 >= N) continue;
          const j = k === 0 ? i + 1 : i + N;
          if (id[i] === id[j]) continue;
          const sa = size[id[i]], sb = size[id[j]];
          if (sa >= K && sb >= K) score++;
          tb += Math.min(sa, sb, K);
        }
      }
    }
    return [score, tb];
  },
};

/** Mirrors strategy.py `cq_ord` (Conqueror): Σ weight × ([colour A] − [colour B]), weight 1 or the value. */
const CONQUEROR: GridOrdinalFamily = {
  id: "conqueror",
  ordinal(g, p, env) {
    const NN = env.N * env.N, sym = g.sym, col = g.col, value = env.value, A = p.A, B = p.B;
    const byValue = p.weight === "value";
    let tot = 0;
    for (let i = 0; i < NN; i++) {
      const s = (col[i] === A ? 1 : 0) - (col[i] === B ? 1 : 0);
      if (s) tot += (byValue ? value[sym[i]] : 1) * s;
    }
    return tot;
  },
};

/**
 * Mirrors strategy.py `pp_ord` (Parity Painter): +1 per cell in its class's colour (P for even
 * values or red suits, Q otherwise), −1 per cell in the other class's colour.
 */
const PARITY_PAINTER: GridOrdinalFamily = {
  id: "parity_painter",
  ordinal(g, p, env) {
    const NN = env.N * env.N, sym = g.sym, col = g.col, P = p.P, Q = p.Q;
    const bySuit = p.key === "suit";
    const suit = env.suit, value = env.value;
    if (bySuit && !suit) throw new Error("parity_painter: key=suit needs a Suited grid type");
    let tot = 0;
    for (let i = 0; i < NN; i++) {
      let k: boolean;
      if (bySuit) { const s = suit![sym[i]]; k = s === 1 || s === 2; }
      else k = fmod(value[sym[i]], 2) === 0;
      const want = k ? P : Q, other = k ? Q : P;
      tot += col[i] === want ? 1 : col[i] === other ? -1 : 0;
    }
    return tot;
  },
};

/** Mirrors strategy.py `mm_ord` (Mirrormancer): (palindromic rows/columns, matching mirror pairs) on colour or rank. */
const MIRRORMANCER: GridOrdinalFamily = {
  id: "mirrormancer",
  ordinal(g, p, env) {
    const N = env.N, half = N >> 1, sym = g.sym, col = g.col, rank = env.rank;
    const byColour = p.layer === "colour", lr = p.axis === "LR";
    let lines = 0, pairs = 0;
    for (let L = 0; L < N; L++) {
      let all = true;
      for (let i = 0; i < half; i++) {
        const a = lr ? L * N + i : i * N + L;
        const b = lr ? L * N + (N - 1 - i) : (N - 1 - i) * N + L;
        const eq = byColour ? col[a] === col[b] : rank[sym[a]] === rank[sym[b]];
        if (eq) pairs++;
        else all = false;
      }
      if (all) lines++;
    }
    return [lines, pairs];
  },
};

/** Mirrors strategy.py `hb_ord` (Homebody): +1 per colour-X cell in the zone (rim or core), −1 per one outside it. */
const HOMEBODY: GridOrdinalFamily = {
  id: "homebody",
  ordinal(g, p, env) {
    const N = env.N, col = g.col, X = p.X, rimHome = p.zone === "rim";
    let tot = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (col[r * N + c] !== X) continue;
        const rim = r === 0 || c === 0 || r === N - 1 || c === N - 1;
        tot += rim === rimHome ? 1 : -1;
      }
    }
    return tot;
  },
};

/**
 * Mirrors strategy.py `lp_ord` (Lone Peak): (gap from a unique colour-X maximum to the next value,
 * else 0; whether some maximal cell is colour X).
 */
const LONE_PEAK: GridOrdinalFamily = {
  id: "lone_peak",
  ordinal(g, p, env) {
    const NN = env.N * env.N, sym = g.sym, col = g.col, value = env.value, X = p.X;
    let m1 = -Infinity, nTop = 0, top = -1, has = 0;
    for (let i = 0; i < NN; i++) {
      const v = value[sym[i]];
      if (v > m1) { m1 = v; nTop = 1; top = i; }
      else if (v === m1) nTop++;
    }
    let m2 = -Infinity;
    for (let i = 0; i < NN; i++) {
      const v = value[sym[i]];
      if (v === m1 && col[i] === X) has = 1;
      if (i !== top && v > m2) m2 = v;
    }
    const score = nTop === 1 && col[top] === X ? m1 - m2 : 0;
    return [score, has];
  },
};

/** Ports of lib/grid-lab/gridlab/rules/strategy.py. */
export const FAMILIES: readonly GridOrdinalFamily[] = [
  RAINBOW_ROAD, BORDER_BARON, CONQUEROR, PARITY_PAINTER, MIRRORMANCER, HOMEBODY, LONE_PEAK,
];
