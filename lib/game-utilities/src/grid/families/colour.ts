import type { GridOrdinalFamily } from "./types.ts";

// Per-colour counts for one line (at most 6 colours).
const counts = new Int32Array(16);

/**
 * Mirrors colour.py `sp_ord` (Stripe Painter): lines are rows or columns (p.axis); a solid line
 * scores when its colour differs from the previous line's solid colour. Returns (stripes, Σ per-line
 * plurality).
 */
const stripePainter: GridOrdinalFamily = {
  id: "stripe_painter",
  ordinal(g, p, env) {
    const N = g.size, C = env.C, col = g.col, rows = p.axis === "rows";
    const along = rows ? 1 : N, across = rows ? N : 1;
    let s = 0, prev = -1, plur = 0;
    for (let l = 0; l < N; l++) {
      counts.fill(0, 0, C);
      const base = l * across, first = col[base];
      let solid = true, best = 0;
      for (let k = 0; k < N; k++) {
        const x = col[base + k * along];
        if (x !== first) solid = false;
        const n = ++counts[x];
        if (n > best) best = n;
      }
      if (solid && first !== prev) s++;
      prev = solid ? first : -1;
      plur += best;
    }
    return [s, plur];
  },
};

/**
 * Mirrors colour.py `ff_ord` (Feuding Families): an X cell is safe when no 4-neighbour is Y (and vice
 * versa). Returns (min(safe X, safe Y), safe X + safe Y).
 */
const feudingFamilies: GridOrdinalFamily = {
  id: "feuding_families",
  ordinal(g, p) {
    const N = g.size, col = g.col, X = p.X, Y = p.Y;
    let sx = 0, sy = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c, x = col[i];
        if (x !== X && x !== Y) continue;
        const other = x === X ? Y : X;
        const touches = (r > 0 && col[i - N] === other) || (r < N - 1 && col[i + N] === other)
          || (c > 0 && col[i - 1] === other) || (c < N - 1 && col[i + 1] === other);
        if (!touches) { if (x === X) sx++; else sy++; }
      }
    }
    return [Math.min(sx, sy), sx + sy];
  },
};

/**
 * Mirrors colour.py `cm_ord` (Colour Mixer): an M cell is a mix when it touches both parents P1 and P2
 * (strict: has them on opposite sides, left/right or above/below). Returns (mixes, M cells touching a
 * parent).
 */
const colourMixer: GridOrdinalFamily = {
  id: "colour_mixer",
  ordinal(g, p) {
    const N = g.size, col = g.col, P1 = p.P1, M = p.M, P2 = p.P2, strict = !!p.strict;
    let s = 0, near = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (col[i] !== M) continue;
        const up = r > 0 ? col[i - N] : -1, down = r < N - 1 ? col[i + N] : -1;
        const left = c > 0 ? col[i - 1] : -1, right = c < N - 1 ? col[i + 1] : -1;
        const h1 = up === P1 || down === P1 || left === P1 || right === P1;
        const h2 = up === P2 || down === P2 || left === P2 || right === P2;
        if (h1 || h2) near++;
        if (strict) {
          // Out-of-grid sides are -1, which never equals a colour, matching the bounds checks.
          if ((left === P1 && right === P2) || (left === P2 && right === P1)
            || (up === P1 && down === P2) || (up === P2 && down === P1)) s++;
        } else if (h1 && h2) s++;
      }
    }
    return [s, near];
  },
};

/**
 * Mirrors colour.py `fw_ord` (Fair Weaver): per row and column, d = max - min colour count (over all
 * C colours). Returns (lines with d <= 1, -Σ d).
 */
const fairWeaver: GridOrdinalFamily = {
  id: "fair_weaver",
  ordinal(g, _p, env) {
    const N = g.size, C = env.C, col = g.col;
    let fair = 0, spread = 0;
    for (let axis = 0; axis < 2; axis++) {
      const along = axis === 0 ? 1 : N, across = axis === 0 ? N : 1;
      for (let l = 0; l < N; l++) {
        counts.fill(0, 0, C);
        for (let k = 0; k < N; k++) counts[col[l * across + k * along]]++;
        let mx = counts[0], mn = counts[0];
        for (let k = 1; k < C; k++) { const n = counts[k]; if (n > mx) mx = n; if (n < mn) mn = n; }
        const d = mx - mn;
        if (d <= 1) fair++;
        spread += d;
      }
    }
    return [fair, 0 - spread]; // 0 - x, not -x, so a zero spread is +0 rather than -0
  },
};

/**
 * Mirrors colour.py `ll_ord` (Lantern Lighter): X cells that are the only X in their row and in their
 * column.
 */
const lanternLighter: GridOrdinalFamily = {
  id: "lantern_lighter",
  ordinal(g, p) {
    const N = g.size, col = g.col, X = p.X;
    let rowMask = 0, rowMulti = 0, colMask = 0, colMulti = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (col[r * N + c] !== X) continue;
        if (rowMask & (1 << r)) rowMulti |= 1 << r; else rowMask |= 1 << r;
        if (colMask & (1 << c)) colMulti |= 1 << c; else colMask |= 1 << c;
      }
    }
    let n = 0;
    for (let r = 0; r < N; r++) {
      if (rowMulti & (1 << r) || !(rowMask & (1 << r))) continue;
      for (let c = 0; c < N; c++) {
        if (col[r * N + c] === X && !(colMulti & (1 << c))) n++;
      }
    }
    return n;
  },
};

/** Ports of lib/grid-lab/gridlab/rules/colour.py. */
export const FAMILIES: readonly GridOrdinalFamily[] = [
  stripePainter, feudingFamilies, colourMixer, fairWeaver, lanternLighter,
];
