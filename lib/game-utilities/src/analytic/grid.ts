/**
 * Exact survival functions for Grid families (derivations: docs/analytic-calibration/solutions.md).
 *
 * The uniform spawn prior makes every cell an independent uniform letter (symbol s, colour c) with value
 * g.value[s] (digits: s; cards: rank 1..13, uniform over 13 ranks) and suit ⌊s/13⌋. Each solution below names
 * the decomposition it uses: independent cells, independent disjoint blocks (rows, mirror pairs, quarter-turn
 * orbits, columns), or a Markov chain along a line / across columns.
 */
import { objectType, type GridValue, type Instantiation } from "@workspace/game-types";
import { evaluator } from "../catalog.ts";
import { gridSpec, type GridSpec } from "../families/grid/_util.ts";
import type { FamilyContext, Ordinal, Params } from "../types.ts";
import {
  add, binomial, chain, combine, levels, longestRun, map, maxOccupancy, occupancy, point, power, sum, sumAll, uniform,
  type Dist, type Levels, type Vec,
} from "./kit.ts";

/** Thrown by a solver when this draw has no exact solution here (the caller falls back to the estimator). */
export class NoSolution extends Error {}

// ------------------------------------------------------------------------------------------------
// letters
// ------------------------------------------------------------------------------------------------

/** Law of one cell's colour index. */
const colourLaw = (g: GridSpec): Dist => uniform(Array.from({ length: g.C }, (_, c) => [c]));
/** Law of one cell's value (digits: uniform 0..S−1; cards: uniform rank 1..13). */
const valueLaw = (g: GridSpec): Dist => uniform(g.value.map(v => [v]));
/** Probability two independent cells agree on the layer ("colour": 1/C; "symbol" compares values: 1/#values). */
const matchProb = (g: GridSpec, layer: string): number => (layer === "colour" ? 1 / g.C : 1 / new Set(g.value).size);
/** Number of distinct equally likely keys on a layer. */
const keyCount = (g: GridSpec, layer: string): number => (layer === "colour" ? g.C : new Set(g.value).size);

// ------------------------------------------------------------------------------------------------
// evaluator-derived: cell-additive rules
// ------------------------------------------------------------------------------------------------

/**
 * For rules whose ordinal is a SUM over cells of a per-cell, per-position contribution (scalar or tuple), the
 * contributions are read off the family's own card with the host evaluator: h_i(letter) = u(base with cell i set to
 * letter) − u(base). Additivity is then checked on random grids (throws if the rule is not cell-additive). The
 * survival function is the convolution of the per-cell laws. Cost: N²·S·C + checks evaluations (≤ 16k).
 */
export function cellAdditive(familyId: string, params: Params, inst: Instantiation): Dist {
  const ctx = { inst } as FamilyContext;
  const g = gridSpec(ctx), n = g.N * g.N, T = objectType("Grid"), codec = T.codec(inst);
  const ev = evaluator({ familyId, params }, inst);
  const vec = (o: Ordinal): number[] => (typeof o === "number" ? [o] : [...o]);
  const score = (v: GridValue) => vec(ev(codec.encode(v)));
  const base: GridValue = { size: g.N, sym: new Uint8Array(n), col: new Uint8Array(n) };
  const u0 = score(base);
  const h: number[][][] = []; // h[i][letter] = contribution vector minus base contribution
  for (let i = 0; i < n; i++) {
    const row: number[][] = [];
    for (let s = 0; s < g.S; s++) for (let c = 0; c < g.C; c++) {
      const v: GridValue = { size: g.N, sym: base.sym.slice(), col: base.col.slice() };
      v.sym[i] = s; v.col[i] = c;
      row.push(score(v).map((x, k) => x - u0[k]));
    }
    h.push(row);
  }
  // Additivity check on pseudo-random grids: u(x) = u0 + Σ_i h_i(x_i).
  let seed = 0x9e3779b9;
  const rnd = (m: number) => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return seed % m; };
  for (let t = 0; t < 64; t++) {
    const v: GridValue = { size: g.N, sym: new Uint8Array(n), col: new Uint8Array(n) };
    const pred = u0.slice();
    for (let i = 0; i < n; i++) {
      v.sym[i] = rnd(g.S); v.col[i] = rnd(g.C);
      h[i][v.sym[i] * g.C + v.col[i]].forEach((x, k) => { pred[k] += x; });
    }
    const got = score(v);
    if (got.some((x, k) => x !== pred[k])) throw new NoSolution(`${familyId} is not cell-additive`);
  }
  const pieces = h.map(row => uniform(row));
  return sumAll(pieces.concat([point(u0)]), u0.map(() => 0));
}

// ------------------------------------------------------------------------------------------------
// hand-derived solutions
// ------------------------------------------------------------------------------------------------

type Solver = (p: any, g: GridSpec) => Dist;

/** Joint (whole, parts) over iid rows, where each row has law `row` over [parts] and whole = [parts == full]. */
const wholeAndParts = (row: Dist, full: number, rows: number) =>
  power(map(row, ([k]) => [k === full ? 1 : 0, k]), rows);

const SOLVERS: Readonly<Record<string, Solver>> = {
  /** Mirror pairs are disjoint: pairs ~ Binomial(#pairs, q). */
  looking_glass: (p, g) => {
    const N = g.N, pairs = p.axis === "V" ? N * Math.floor(N / 2) : p.axis === "D" ? N * (N - 1) / 2 : Math.floor(N * N / 2);
    return binomial(pairs, matchProb(g, p.layer));
  },
  /** Pairs (c, c+p) in a row form chains (a forest): equality indicators on a forest are independent. */
  wallpaper_weaver: (p, g) => binomial(g.N * Math.max(0, g.N - p.p), 1 / g.C),
  /** Each row: matches ~ Binomial(⌊N/2⌋, q); (mirrors, pairs) summed over iid rows. */
  mirrormancer: (p, g) => wholeAndParts(binomial(Math.floor(g.N / 2), matchProb(g, p.layer)), Math.floor(g.N / 2), g.N),
  /** ⌊N²/4⌋ disjoint quarter-turn orbits of 4 iid keys (colour; symbol, or suit for cards): (full, most) = Σ ([max mult = 4], max mult). */
  pinwheel: (p, g) => power(map(maxOccupancy(4, p.attr === "colour" ? g.C : g.cards ? 4 : g.S), ([m]) => [m === 4 ? 1 : 0, m]), Math.floor(g.N * g.N / 4)),
  /** Next colour is cyclic, so each step indicator is Bernoulli(1/C), independent along and across rows. */
  rainbow_steps: (_p, g) => binomial(g.N * (g.N - 1), 1 / g.C),
  rainbow_road: (_p, g) => wholeAndParts(binomial(g.N - 1, 1 / g.C), g.N - 1, g.N),
  /** Column c's bottom run h_c is truncated geometric: P(h ≥ k) = C^−k; columns independent. */
  gravity: (_p, g) => power(bottomRun(g), g.N),
  /** Corner colours and corner values are independent: product of two max-multiplicity laws. */
  hate_same_corners: (_p, g) => combine(maxOccupancy(4, g.C), maxOccupancy(4, keyCount(g, "symbol")), ([a], [b]) => [a, b]),
  /** One row: DP over (seen-colour mask, last colour, repeats). */
  hate_repeat_row: (_p, g) => {
    let d: Dist = point([0, 0, -1]); // [mask, repeats, last]
    d = chain(d, colourLaw(g), g.N, ([mask, rep, last], [c]) => [mask | (1 << c), rep + (c === last ? 1 : 0), c]);
    return map(d, ([mask, rep]) => [g.N - popcount(mask), rep]);
  },
  /** Rows only: distinct values per row (occupancy over the value keys); (perfect, variety). */
  sudoku_scholar: (p, g) => {
    if (p.dir !== "rows") throw new NoSolution("rows and columns share cells");
    return power(map(occupancy(g.N, keyCount(g, "symbol")), ([d]) => [d === g.N ? 1 : 0, d]), g.N);
  },
  /** Pairs of equal values within a row: Σ_v C(n_v, 2) (DP over the value keys); rows iid. */
  full_house: (_p, g) => power(pairsInRow(g.N, keyCount(g, "symbol")), g.N),
  /** Rows only: row total = N-fold convolution of the value law; (exact, −Σ|total − T|). */
  magic_accountant: (p, g) => {
    if (p.axis !== "rows") throw new NoSolution("rows and columns share cells");
    const total = power(valueLaw(g), g.N);
    return power(map(total, ([t]) => [t === p.T ? 1 : 0, -Math.abs(t - p.T)]), g.N);
  },
  /** Rows only: lean = |left − right| with independent halves (or signed colour-weighted cells). */
  seesaw: (p, g) => {
    if (p.scope !== "rows") throw new NoSolution("rows and columns share cells");
    const h = Math.floor(g.N / 2), V = valueLaw(g);
    const diff = p.mode === "halves"
      ? combine(power(V, h), power(V, h), ([a], [b]) => [a - b])
      : power(combine(V, colourLaw(g), ([v], [c]) => [c === p.X ? v : c === p.Y ? -v : 0]), g.N);
    return power(map(diff, ([d]) => [d === 0 ? 1 : 0, -Math.abs(d)]), g.N);
  },
  /**
   * Along the boustrophedon path, a step matches (same colour or same value) with probability
   * q = 1 − (1 − 1/C)(1 − 1/#values) whatever the previous cell is, so the N²−1 step indicators are iid:
   * longest run of matches + 1.
   */
  uno_snake: (_p, g) => {
    const q = 1 - (1 - 1 / g.C) * (1 - 1 / keyCount(g, "symbol"));
    return map(longestRun(g.N * g.N - 1, q), ([r]) => [r + 1]);
  },
  /** Each row is a Markov chain on the value: steps where value = previous + 1; rows iid. */
  staircase_climber: (_p, g) => {
    const V = valueLaw(g);
    const row = chain(map(V, ([v]) => [0, v]), V, g.N - 1, ([k, prev], [v]) => [k + (v === prev + 1 ? 1 : 0), v]);
    return power(map(row, ([k]) => [k]), g.N);
  },
  /**
   * Heights h_c (bottom runs of my colour) are iid truncated geometric; counters = Σ h_c; vertical fours in a column
   * = max(0, h − 3); horizontal and diagonal fours depend on 4 consecutive heights, so a chain over columns with the
   * last three heights as state gives the exact joint (rowsOfFour, counters).
   */
  connect_four: (_p, g) => {
    const N = g.N, H = bottomRun(g);
    if (N < 4) return map(power(H, N), ([s]) => [0, s]);
    const fours = (a: Vec): number => { // a = heights of 4 consecutive columns
      let n = Math.min(...a);
      let lo1 = 0, lo2 = 0;
      for (let i = 0; i < 4; i++) { lo1 = Math.max(lo1, N - a[i] - i); lo2 = Math.max(lo2, N - a[3 - i] - i); }
      n += Math.max(0, N - 4 - lo1 + 1) + Math.max(0, N - 4 - lo2 + 1);
      return n;
    };
    // state: [fours, counters, h_{c-2}, h_{c-1}, h_c]
    let d = map(H, ([h]) => [Math.max(0, h - 3), h, -1, -1, h]);
    d = combine(d, H, ([f, s, , b, c], [h]) => [f + Math.max(0, h - 3), s + h, b, c, h]);
    d = combine(d, H, ([f, s, , b, c], [h]) => [f + Math.max(0, h - 3), s + h, b, c, h]);
    for (let col = 3; col < N; col++) {
      d = combine(d, H, ([f, s, a, b, c], [h]) => [f + Math.max(0, h - 3) + fours([a, b, c, h]), s + h, b, c, h]);
    }
    return map(d, ([f, s]) => [f, s]);
  },
  /** Anti-diagonals are disjoint: diagonal k (m_k cells) has good ~ Binomial(m_k, 1/C); score += m_k when all good. */
  rainbow_bands: (_p, g) => {
    const N = g.N, pieces: Dist[] = [];
    for (let k = 0; k < 2 * N - 1; k++) {
      const m = Math.min(k, 2 * N - 2 - k) + 1;
      pieces.push(map(binomial(m, 1 / g.C), ([j]) => [j === m ? m : 0, j]));
    }
    return sumAll(pieces, [0, 0]);
  },
  /**
   * Quarter-turn orbits are disjoint: within an orbit the good-turn indicators [suit(next) = suit + 1] are read off
   * the 4^4 suit patterns; a full orbit gives 4 windmill cards. The centre (odd N) is never a good turn.
   */
  card_windmill: (_p, g) => {
    const orbit: Dist = new Map();
    for (let x = 0; x < 256; x++) {
      const s = [x & 3, (x >> 2) & 3, (x >> 4) & 3, (x >> 6) & 3];
      let good = 0;
      for (let i = 0; i < 4; i++) if (s[(i + 1) % 4] === (s[i] + 1) % 4) good++;
      add(orbit, [good === 4 ? 4 : 0, good], 1 / 256);
    }
    return power(orbit, Math.floor(g.N * g.N / 4));
  },
  /**
   * Rings are disjoint. Ring k (m cells): one colour w.p. C^(1−m); its most common colour count ~ max occupancy.
   * Alive while every ring so far is one colour and differs from the ring outside it (probability (C−1)/C given
   * both are one colour, independent of everything else).
   */
  bullseye: (_p, g) => {
    const N = g.N, C = g.C;
    let d: Dist = point([0, 0, 1]); // [score, nearly, alive]
    for (let k = 0; k < Math.floor((N + 1) / 2); k++) {
      const side = N - 2 * k, m = side === 1 ? 1 : side * side - (side - 2) * (side - 2);
      const ring: Dist = new Map();
      for (const e of maxOccupancy(m, C).values()) {
        if (e.v[0] < m) add(ring, [e.v[0], 0], e.p);
        else if (k === 0) add(ring, [m, 1], e.p);
        else { add(ring, [m, 1], e.p * (C - 1) / C); add(ring, [m, 0], e.p / C); }
      }
      d = combine(d, ring, ([sc, ne, al], [mx, ok]) => { const a = al && ok ? 1 : 0; return [sc + a, ne + mx, a]; });
    }
    return map(d, ([sc, ne]) => [sc, ne]);
  },
  /** Columns are iid; each a chain over the colour index (smooth steps +0/+1; sunset: all smooth and ≥ 3 colours). */
  sunset_sky: (_p, g) => {
    const col = chain(map(colourLaw(g), ([c]) => [0, 1, 0, c]), colourLaw(g), g.N - 1, ([sm, all, ups, last], [c]) => {
      const st = c - last, ok = st === 0 || st === 1;
      return [sm + (ok ? 1 : 0), all && ok ? 1 : 0, all && ok ? ups + st : 0, c];
    });
    return power(map(col, ([sm, all, ups]) => [all && ups + 1 >= 3 ? 1 : 0, sm]), g.N);
  },
  /** Rows: nearly += most common count; a one-colour row is a new stripe unless the row above is one colour and the same. */
  stripe_painter: (_p, g) => {
    const N = g.N, C = g.C, row = maxOccupancy(N, C);
    let d: Dist = point([0, 0, 0]); // [stripes, nearly, previous row one-colour]
    for (let r = 0; r < N; r++) {
      d = combine(d, row, ([st, ne, prev], [m]) => [st, ne + m, prev * 2 + (m === N ? 1 : 0)]);
      const nd: Dist = new Map();
      for (const e of d.values()) {
        const [st, ne, code] = e.v, prev = code >> 1, mono = code & 1;
        if (!mono) add(nd, [st, ne, 0], e.p);
        else if (!prev) add(nd, [st + 1, ne, 1], e.p);
        else { add(nd, [st + 1, ne, 1], e.p * (C - 1) / C); add(nd, [st, ne, 1], e.p / C); }
      }
      d = nd;
    }
    return map(d, ([st, ne]) => [st, ne]);
  },
  /** Rows: mine = count of my colour; rival = the largest of the other C − 1 counts (max occupancy); rows iid. */
  flag_bearer: (p, g) => {
    if (p.axis !== "rows") throw new NoSolution("rows and columns share cells");
    const N = g.N, C = g.C, row: Dist = new Map();
    for (const e of binomial(N, 1 / C).values()) {
      const mine = e.v[0];
      for (const f of maxOccupancy(N - mine, C - 1).values()) add(row, [mine > f.v[0] ? 1 : 0, mine - f.v[0] + N], e.p * f.p);
    }
    return power(row, N);
  },
  /** Rows only: line total mod base; (round lines, Σ closeness to a multiple of the base). */
  round_numbers: (p, g) => {
    if (p.axis !== "rows") throw new NoSolution("rows and columns share cells");
    const B = g.base!, total = power(valueLaw(g), g.N);
    return power(map(total, ([t]) => { const left = t % B; return [left === 0 ? 1 : 0, Math.floor(B / 2) - Math.min(left, B - left)]; }), g.N);
  },
  /** Rows only: the row's base-B number mod m is a chain over digits; found ~ Binomial(N, P(≡ 0)). */
  divisibility_detective: (p, g) => {
    if (p.scope !== "rows") throw new NoSolution("rows and columns share cells");
    const B = g.base!, res = chain(point([0]), valueLaw(g), g.N, ([r], [v]) => [(r * B + v) % p.m]);
    return binomial(g.N, res.get("0")?.p ?? 0);
  },
  /**
   * Written addition, right to left: a chain over columns with state (carry, still right, top row nonzero so far);
   * a top row of zeros scores [0, 0].
   */
  column_addition: (p, g) => {
    const B = g.base!, V = valueLaw(g), triple = combine(combine(V, V, ([a], [b]) => [a, b]), V, ([a, b], [c]) => [a, b, c]);
    let d: Dist = point([0, 0, 0, 1, 0]); // [fromRight, right, carry, stillRight, aNonzero]
    d = chain(d, triple, g.N, ([fr, rt, carry, still, nz], [a, b, ans]) => {
      const tot = a + b + carry, ok = tot % B === ans ? 1 : 0, st = still && ok ? 1 : 0;
      return [fr + st, rt + ok, Math.floor(tot / B), st, nz || (a !== 0 ? 1 : 0)];
    });
    void p;
    return map(d, ([fr, rt, , , nz]) => (nz ? [fr, rt] : [0, 0]));
  },
  /**
   * The border is a cycle of 4N − 4 cells: fix the first colour (next-colour is cyclic, so every start is alike), chain
   * along the ring with (last colour, moves, fine), then close the last edge back to the start.
   */
  colour_carousel: (_p, g) => {
    const C = g.C, n = 4 * g.N - 4;
    const edge = (a: number, b: number) => (b === (a + 1) % C ? [1, 1] : b === a ? [0, 1] : [0, 0]);
    const d = chain(point([0, 0, 0]), colourLaw(g), n - 1, ([mv, fi, last], [c]) => { const [m, f] = edge(last, c); return [mv + m, fi + f, c]; });
    return map(d, ([mv, fi, last]) => {
      const [m, f] = edge(last, 0), moves = mv + m, fine = fi + f;
      return [fine === n && moves >= C ? 1 : 0, moves, fine];
    });
  },
  /** Bingo: rows scanned with state (columns still fully dabbed, both diagonals alive); dab probability q per cell. */
  bingo_caller: (p, g) => bingo(g, p.called.length / g.ranks),
  /** Largest colour count: max occupancy of N² balls in C boxes. */
  hate_takeover: (_p, g) => maxOccupancy(g.N * g.N, g.C),
  /** Largest value count: max occupancy over the (equally likely) value keys. */
  hate_symbol_takeover: (_p, g) => maxOccupancy(g.N * g.N, keyCount(g, "symbol")),
};

/** Cell-additive families solved by `cellAdditive` (the evaluator supplies the per-cell contributions). */
export const CELL_ADDITIVE: readonly string[] = [
  "conqueror", "parity_painter", "homebody", "number_painter", "colour_by_number", "treasure_map",
  "lucky_token", "seed3_green_ones", "hate_colour", "hate_value",
];

function popcount(x: number): number { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; }

/** Law of a column's bottom run of colour 0: P(h = k) = C^−k (1 − 1/C) for k < N, P(h = N) = C^−N. */
function bottomRun(g: GridSpec): Dist {
  const q = 1 / g.C, out: Dist = new Map();
  for (let k = 0; k < g.N; k++) add(out, [k], q ** k * (1 - q));
  add(out, [g.N], q ** g.N);
  return out;
}

/** Law of Σ_v C(n_v, 2) for n iid uniform keys out of K: DP over keys with multinomial weights. */
function pairsInRow(n: number, K: number): Dist {
  const lf = [0];
  for (let i = 1; i <= n; i++) lf.push(lf[i - 1] + Math.log(i));
  // state [used, pairs] with weight Π 1/n_v!; finish × n!/K^n.
  let d: Dist = point([0, 0]);
  for (let k = 0; k < K; k++) {
    const nd: Dist = new Map();
    for (const e of d.values()) for (let c = 0; e.v[0] + c <= n; c++) add(nd, [e.v[0] + c, e.v[1] + c * (c - 1) / 2], e.p * Math.exp(-lf[c]));
    d = nd;
  }
  const out: Dist = new Map(), scale = Math.exp(lf[n] - n * Math.log(K));
  for (const e of d.values()) if (e.v[0] === n) add(out, [e.v[1]], e.p * scale);
  return out;
}

/** Bingo Caller: numeric DP over rows; state = (column mask still full, diagonal flags), value = points so far. */
function bingo(g: GridSpec, q: number): Dist {
  const N = g.N, mid = N % 2 === 1 ? (N - 1) / 2 : -1, S = 1 << N, maxPts = N * N + N * (2 * N + 2) + 1;
  let cur = new Map<number, Float64Array>(); // key = mask * 4 + diags
  cur.set((S - 1) * 4 + 3, (() => { const a = new Float64Array(maxPts); a[0] = 1; return a; })());
  for (let r = 0; r < N; r++) {
    const nx = new Map<number, Float64Array>();
    for (let pat = 0; pat < S; pat++) {
      let pr = 1, k = 0, pt = pat;
      for (let c = 0; c < N; c++) {
        const on = (pt >> c) & 1;
        if (r === mid && c === mid) { if (!((pat >> c) & 1)) { pr = 0; break; } k++; continue; }
        pr *= on ? q : 1 - q;
        k += on;
      }
      if (pr === 0) continue;
      const gain = k + (pt === S - 1 ? N : 0);
      const d1 = (pt >> r) & 1, d2 = (pt >> (N - 1 - r)) & 1;
      for (const [key, arr] of cur) {
        const mask = Math.floor(key / 4) & pt, dg = (key & 3) & (d1 | (d2 << 1));
        const nk = mask * 4 + dg;
        let out = nx.get(nk);
        if (!out) nx.set(nk, out = new Float64Array(maxPts));
        for (let v = 0; v + gain < maxPts; v++) if (arr[v]) out[v + gain] += arr[v] * pr;
      }
    }
    cur = nx;
  }
  const res: Dist = new Map();
  for (const [key, arr] of cur) {
    const bonus = N * (popcount(Math.floor(key / 4)) + popcount(key & 3));
    arr.forEach((p, v) => add(res, [v + bonus], p));
  }
  return res;
}

// ------------------------------------------------------------------------------------------------
// approximations (NOT exact; documented with their measured error in docs/analytic-calibration/solutions.md)
// ------------------------------------------------------------------------------------------------

/**
 * Rows + columns rules treated as 2N INDEPENDENT lines: the row law convolved with itself 2N times. Exact for the
 * marginal of each line, wrong only through the shared cells. Used to measure how far this nearest approximation is.
 */
const lineApprox = (solver: Solver, rowParams: (p: any) => any): Solver => (p, g) => {
  const q = rowParams(p);
  if (JSON.stringify(q) === JSON.stringify(p)) throw new NoSolution("already the exact rows variant");
  const rowsOnly = solver(q, g); // law of the sum over N independent rows
  return sum(rowsOnly, rowsOnly); // columns: the same law, assumed independent of the rows
};
const APPROX: Readonly<Record<string, Solver>> = {
  magic_accountant: lineApprox(SOLVERS.magic_accountant, p => ({ ...p, axis: "rows" })),
  seesaw: lineApprox(SOLVERS.seesaw, p => ({ ...p, scope: "rows" })),
  sudoku_scholar: (p, g) => {
    if (g.N <= 4) throw new NoSolution("N ≤ 4 is a different, all-or-nothing rule");
    return lineApprox(SOLVERS.sudoku_scholar, q => ({ ...q, dir: "rows" }))(p, g);
  },
  round_numbers: lineApprox(SOLVERS.round_numbers, p => ({ ...p, axis: "rows" })),
  divisibility_detective: lineApprox(SOLVERS.divisibility_detective, p => ({ ...p, scope: "rows" })),
  /** Knight-move twins: Binomial(#knight edges, p) as if the knight graph were a forest (it has cycles). */
  knight_riders: (p, g) => binomial(4 * (g.N - 1) * (g.N - 2), p.X === null ? 1 / (g.S * g.C) : 1 / (g.S * g.C * g.C)),
};

/** Approximate levels for the "both"-axis variants and rare-pattern families (null when none). Not exact. */
export function gridApproxLevels(familyId: string, params: Params, inst: Instantiation): Levels | null {
  const a = APPROX[familyId];
  if (!a) return null;
  try {
    return levels(a(params, gridSpec({ inst } as FamilyContext)));
  } catch (e) {
    if (e instanceof NoSolution) return null;
    throw e;
  }
}

/** Exact levels for a Grid draw, or null when this module has no solution for it. */
export function gridLevels(familyId: string, params: Params, inst: Instantiation): Levels | null {
  const g = gridSpec({ inst } as FamilyContext);
  try {
    if (CELL_ADDITIVE.includes(familyId)) return levels(cellAdditive(familyId, params, inst));
    const s = SOLVERS[familyId];
    return s ? levels(s(params, g)) : null;
  } catch (e) {
    if (e instanceof NoSolution) return null;
    throw e;
  }
}

export const GRID_SOLVED: readonly string[] = [...CELL_ADDITIVE, ...Object.keys(SOLVERS)];
