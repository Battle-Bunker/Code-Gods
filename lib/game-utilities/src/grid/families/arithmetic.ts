import type { GridOrdinalFamily } from "./types.ts";

/** Ports of lib/grid-lab/gridlab/rules/arithmetic.py. */

/**
 * Grid Lab `ss_ord` (Straight Shooter): runs of 3+ cells along rows (L→R) and columns (T→B) whose
 * values step by p.step score length², doubled when p.flush and the run is one colour; aces
 * count 14 when p.ace_high. Ordinal [score, counting steps].
 */
const straightShooter: GridOrdinalFamily = {
  id: "straight_shooter",
  ordinal(g, p, env) {
    const N = env.N, st: number = p.step, flush = !!p.flush, aceHigh = !!p.ace_high;
    const { sym, col } = g, value = env.value, rank = env.rank;
    const v = new Int32Array(N * N);
    for (let i = 0; i < N * N; i++) v[i] = aceHigh && rank[sym[i]] === 0 ? 14 : value[sym[i]];
    let score = 0, pairs = 0;
    for (let ln = 0; ln < 2 * N; ln++) {
      // Lines 0..N-1 are rows, N..2N-1 are columns.
      const base = ln < N ? ln * N : ln - N, stride = ln < N ? 1 : N;
      let L = 1, mono = true;
      for (let i = 1; i <= N; i++) {
        const a = base + (i - 1) * stride, b = base + i * stride;
        if (i < N && v[b] === v[a] + st) {
          L++;
          pairs++;
          mono = mono && col[b] === col[a];
        } else {
          if (L >= 3) score += L * L * (flush && mono ? 2 : 1);
          L = 1;
          mono = true;
        }
      }
    }
    return [score, pairs];
  },
};

/**
 * Grid Lab `nb_ord` (Number Bonds): orthogonally adjacent pairs whose values sum to vmax + 1,
 * filtered by p.mode ("any", "same" colour, "different" colour).
 */
const numberBonds: GridOrdinalFamily = {
  id: "number_bonds",
  ordinal(g, p, env) {
    const N = env.N, value = env.value, { sym, col } = g;
    let vmax = value[0];
    for (let i = 1; i < value.length; i++) if (value[i] > vmax) vmax = value[i];
    const T = vmax + 1, mode: string = p.mode;
    let s = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c, vi = value[sym[i]];
        if (c + 1 < N && vi + value[sym[i + 1]] === T) {
          if (mode === "any" || (mode === "same") === (col[i] === col[i + 1])) s++;
        }
        if (r + 1 < N && vi + value[sym[i + N]] === T) {
          if (mode === "any" || (mode === "same") === (col[i] === col[i + N])) s++;
        }
      }
    }
    return s;
  },
};

/** Sum of values along each line of p.axis ("rows", "cols" or "both": rows then cols). */
function lineSums(g: { sym: Uint8Array }, N: number, value: Int16Array, axis: string): number[] {
  const out: number[] = [];
  if (axis !== "cols") {
    for (let r = 0; r < N; r++) {
      let s = 0;
      for (let c = 0; c < N; c++) s += value[g.sym[r * N + c]];
      out.push(s);
    }
  }
  if (axis !== "rows") {
    for (let c = 0; c < N; c++) {
      let s = 0;
      for (let r = 0; r < N; r++) s += value[g.sym[r * N + c]];
      out.push(s);
    }
  }
  return out;
}

/**
 * Grid Lab `ma_ord` (Magic Accountant): lines (p.axis) summing to exactly p.T, then minus the
 * total distance from p.T. Ordinal [hits, -distance].
 */
const magicAccountant: GridOrdinalFamily = {
  id: "magic_accountant",
  ordinal(g, p, env) {
    const T: number = p.T;
    let hits = 0, dist = 0;
    for (const s of lineSums(g, env.N, env.value, p.axis)) {
      if (s === T) hits++;
      dist += Math.abs(s - T);
    }
    return [hits, 0 - dist]; // 0 - 0 is +0, which deepStrictEqual distinguishes from -0
  },
};

/**
 * Grid Lab `kh_ord` (King of the Hill): cells of colour p.X whose value is strictly greater
 * (smaller when p.valley) than every 4-neighbour.
 */
const kingOfTheHill: GridOrdinalFamily = {
  id: "king_of_the_hill",
  ordinal(g, p, env) {
    const N = env.N, value = env.value, { sym, col } = g, X: number = p.X, valley = !!p.valley;
    let s = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (col[i] !== X) continue;
        const v = value[sym[i]];
        let ok = true;
        if (r > 0) { const x = value[sym[i - N]]; if (valley ? !(v < x) : !(v > x)) ok = false; }
        if (ok && r + 1 < N) { const x = value[sym[i + N]]; if (valley ? !(v < x) : !(v > x)) ok = false; }
        if (ok && c > 0) { const x = value[sym[i - 1]]; if (valley ? !(v < x) : !(v > x)) ok = false; }
        if (ok && c + 1 < N) { const x = value[sym[i + 1]]; if (valley ? !(v < x) : !(v > x)) ok = false; }
        if (ok) s++;
      }
    }
    return s;
  },
};

/**
 * Grid Lab `dd_ord` (Divisibility Detective): lines (p.scope "rows" or "both") read as base-b
 * numbers, most significant digit first, that p.m divides. Computed mod m, so no big integers.
 */
const divisibilityDetective: GridOrdinalFamily = {
  id: "divisibility_detective",
  ordinal(g, p, env) {
    const N = env.N, b = env.base ?? 0, m: number = p.m, value = env.value, sym = g.sym;
    const scope: string = p.scope;
    let s = 0;
    for (let ln = 0; ln < 2 * N; ln++) {
      const isRow = ln < N;
      if (isRow ? scope === "cols" : scope === "rows") continue;
      const base = isRow ? ln * N : ln - N, stride = isRow ? 1 : N;
      let x = 0;
      for (let i = 0; i < N; i++) x = (x * b + value[sym[base + i * stride]]) % m;
      if (x === 0) s++;
    }
    return s;
  },
};

export const FAMILIES: readonly GridOrdinalFamily[] = [
  straightShooter, numberBonds, magicAccountant, kingOfTheHill, divisibilityDetective,
];
