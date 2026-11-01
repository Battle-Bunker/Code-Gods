/**
 * Proven maxima for families whose exemplar must be the true top of the ordinal (docs/analytic-calibration/
 * playbook.md §5 "exemplars"). Each constant was produced by the exact search beside it (rerun for small N by
 * test/analytic-solutions.test.ts; for every N by `node --experimental-strip-types scripts/exact-maxima.ts`).
 *
 * - Snake Charmer: the longest snake is the longest INDUCED path of the N×N grid graph (a my-colour component that is
 *   a path, so no two non-consecutive cells touch). Branch and bound over paths grown from one endpoint, with the
 *   endpoint in one eighth of the board (every path has an endpoint there up to symmetry) and the bound "cells still
 *   reachable through cells touching the path at most once". 7, 11, 17, 24, 33 for N = 3..7.
 * - Colour Mixer: only the letters P1, P2 and M matter (any other colour can be repainted P1 without lowering either
 *   count), so a max-plus transfer matrix over rows is exact: the state is each cell's letter plus, for an M cell, the
 *   letter above it (5^N states); the value is the best (mixes, near) so far, compared lexicographically.
 */

/** Longest induced path in the N×N grid, as row-major cell indices in path order (index N). */
export const LONGEST_SNAKES: Readonly<Record<number, readonly number[]>> = {
  3: [0, 3, 6, 7, 8, 5, 2],
  4: [0, 4, 8, 12, 13, 14, 10, 11, 7, 3, 2],
  5: [0, 5, 10, 15, 20, 21, 22, 17, 12, 7, 2, 3, 4, 9, 14, 19, 24],
  6: [0, 6, 12, 18, 24, 30, 31, 32, 26, 27, 21, 15, 14, 8, 2, 3, 4, 10, 11, 17, 23, 29, 35, 34],
  7: [1, 0, 7, 14, 15, 16, 9, 10, 3, 4, 5, 6, 13, 20, 19, 18, 25, 32, 33, 34, 41, 48, 47, 46, 45, 38, 37, 30, 29, 28, 35, 42, 43],
};

/** Colour Mixer optima: rows over A = P1, B = P2, M = the mixed colour, by N and strictness. */
export const MIXER_OPTIMA: Readonly<Record<number, { readonly loose: readonly string[]; readonly strict: readonly string[] }>> = {
  3: { loose: ["MBM", "AMA", "MBM"], strict: ["AMB", "MAM", "BMA"] },
  4: { loose: ["MBAM", "AMMB", "MBMM", "AMAA"], strict: ["BMAM", "MAMB", "AMAM", "MBMA"] },
  5: { loose: ["MBMAM", "AAMMB", "MMBMM", "BMMAA", "MAMBM"], strict: ["AMBMA", "MAMAM", "BMAMB", "MAMAM", "AMBMA"] },
  6: {
    loose: ["AMAMBM", "MBMMAA", "AMMBMM", "MMAMMB", "BBMMAM", "MAMBMA"],
    strict: ["AMBMAM", "MAMBMA", "BMAMAM", "MBMAMB", "AMAMAM", "MAMBMA"],
  },
  7: {
    loose: ["MBMBMAM", "AMAMMBB", "MBMMAMM", "AMMBMMA", "MMAMMBM", "BBMMABM", "MAMBMMA"],
    strict: ["AMBMAMB", "MAMAMAM", "BMAMBMA", "MAMAMAM", "AMBMAMB", "MAMAMAM", "BMAMBMA"],
  },
};

/** Length and one longest induced path of the N×N grid graph (exact; seconds at N = 7). */
export function longestSnake(N: number): readonly number[] {
  const nb = Array.from({ length: N * N }, (_, i) => {
    const r = Math.floor(i / N), c = i % N, o: number[] = [];
    if (r) o.push(i - N); if (r < N - 1) o.push(i + N); if (c) o.push(i - 1); if (c < N - 1) o.push(i + 1);
    return o;
  });
  const inPath = new Uint8Array(N * N), touch = new Uint8Array(N * N), path: number[] = [];
  let best: number[] = [];
  const bound = (head: number) => {
    const seen = new Uint8Array(N * N), st = [head];
    let n = 0;
    seen[head] = 1;
    while (st.length) for (const w of nb[st.pop()!]) if (!seen[w] && !inPath[w] && touch[w] <= 1) { seen[w] = 1; n++; st.push(w); }
    return n;
  };
  const place = (v: number, d: 1 | -1) => { inPath[v] = d > 0 ? 1 : 0; for (const x of nb[v]) touch[x] += d; if (d > 0) path.push(v); else path.pop(); };
  const dfs = (head: number) => {
    if (path.length > best.length) best = path.slice();
    if (path.length + bound(head) <= best.length) return;
    for (const w of nb[head]) if (!inPath[w] && touch[w] === 1) { place(w, 1); dfs(w); place(w, -1); }
  };
  for (let r = 0; r < Math.ceil(N / 2); r++) for (let c = r; c < Math.ceil(N / 2); c++) { place(r * N + c, 1); dfs(r * N + c); place(r * N + c, -1); }
  return best;
}

/** Colour Mixer's (mixes, near) for a letter grid (rows over "A", "B", "M"). */
export function mixerScore(rows: readonly string[], strict: boolean): [number, number] {
  const N = rows.length, at = (r: number, c: number) => (r >= 0 && r < N && c >= 0 && c < N ? rows[r][c] : "");
  const pair = (a: string, b: string) => (a === "A" && b === "B") || (a === "B" && b === "A");
  let mixes = 0, near = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (rows[r][c] !== "M") continue;
    const L = at(r, c - 1), R = at(r, c + 1), U = at(r - 1, c), D = at(r + 1, c), n = [L, R, U, D];
    const a = n.includes("A"), b = n.includes("B");
    if (a || b) near++;
    if (strict ? pair(L, R) || pair(U, D) : a && b) mixes++;
  }
  return [mixes, near];
}

/** The best (mixes, near) over all A/B/M grids by the max-plus row transfer matrix, with one optimal grid. */
export function mixerOptimum(N: number, strict: boolean): { score: [number, number]; rows: string[] } {
  const P3 = 3 ** N, P5 = 5 ** N, L = "ABM";
  const rowOf = (x: number) => { let s = ""; for (let i = 0; i < N; i++) { s += L[x % 3]; x = Math.floor(x / 3); } return s; };
  const rowsAll = Array.from({ length: P3 }, (_, x) => rowOf(x));
  // state digit per cell: 0 A, 1 B, 2 M under A, 3 M under B, 4 M under M or nothing
  const enc = (row: string, above: string | null) => { let s = 0; for (let c = N - 1; c >= 0; c--) s = s * 5 + (row[c] === "A" ? 0 : row[c] === "B" ? 1 : above?.[c] === "A" ? 2 : above?.[c] === "B" ? 3 : 4); return s; };
  const dec = (s: number) => { let row = "", up = ""; for (let i = 0; i < N; i++) { const d = s % 5; row += d < 2 ? L[d] : "M"; up += d === 2 ? "A" : d === 3 ? "B" : "-"; s = Math.floor(s / 5); } return { row, up }; };
  // the (mixes, near) of a row's M cells, given the letters above them and the row below (null: the bottom edge)
  const score = (row: string, up: string, down: string | null) => {
    let mixes = 0, near = 0;
    for (let c = 0; c < N; c++) {
      if (row[c] !== "M") continue;
      const Lc = c ? row[c - 1] : "", R = c < N - 1 ? row[c + 1] : "", U = up[c], D = down?.[c] ?? "", nb = [Lc, R, U, D];
      const a = nb.includes("A"), b = nb.includes("B"), pr = (x: string, y: string) => (x === "A" && y === "B") || (x === "B" && y === "A");
      if (a || b) near++;
      if (strict ? pr(Lc, R) || pr(U, D) : a && b) mixes++;
    }
    return mixes * 64 + near; // lexicographic (mixes, near): near ≤ 49 < 64
  };
  let val = new Int32Array(P5).fill(-1);
  for (const row of rowsAll) val[enc(row, null)] = 0;
  const back: { s: Int32Array; x: Int32Array }[] = [];
  for (let r = 1; r < N; r++) {
    const nv = new Int32Array(P5).fill(-1), bs = new Int32Array(P5), bx = new Int32Array(P5);
    for (let s = 0; s < P5; s++) {
      if (val[s] < 0) continue;
      const { row, up } = dec(s);
      for (let x = 0; x < P3; x++) {
        const nxt = rowsAll[x], v = val[s] + score(row, up, nxt), t = enc(nxt, row);
        if (v > nv[t]) { nv[t] = v; bs[t] = s; bx[t] = x; }
      }
    }
    val = nv;
    back.push({ s: bs, x: bx });
  }
  let best = -1, bestS = -1;
  for (let s = 0; s < P5; s++) {
    if (val[s] < 0) continue;
    const { row, up } = dec(s), v = val[s] + score(row, up, null);
    if (v > best) { best = v; bestS = s; }
  }
  const rows: string[] = [];
  for (let r = N - 1, s = bestS; r >= 0; r--) { rows.unshift(dec(s).row); if (r > 0) s = back[r - 1].s[s]; }
  return { score: [best >> 6, best & 63], rows };
}
