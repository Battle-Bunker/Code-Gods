/**
 * Why is the product of utility functions over lines easy to optimise? Measurements behind
 * docs/engine-v2/landscape-analysis.md. Analysis only: nothing here changes game behaviour.
 *
 *   node --experimental-strip-types scripts/landscape.ts [--part all|law|reach|rules|table|ident|grid|lineq]
 *
 * Parts:
 *   law   concentration of each variant's stationary law (Σπ², collision entropy)
 *   reach H1/H5: states within an energy budget from a birth, at today's prices and at path-consistent prices
 *   rules H2/H3: per beginner rule on line-z, which degrees of freedom it reads, how much of its bits magnitude explains,
 *         where its top lies, how rugged it is (strict local maxima)
 *   table the mixed 3-seat table: optimum by window, best under an energy budget, greedy climbers, top N distinct (H6)
 *   ident H4: probes until the others' rules are identified from disclosed sums, exact and with 8-bit noise
 *   grid  the same search measures on 4×4 digit boards
 *   lineq the table optimum and ruggedness on fraction lines
 */
import { parseArgs } from "node:util";
import { applyPriced, evaluateSite, mixedIntBits, q, rng, stepsNonzeroBits } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { fromMC, lineQ, lineType, lineZ, mutators, normalise, presets, type LineState } from "@workspace/v2-linear";
import { cellProbability, gridPresets, gridType, grid4, type GridState } from "@workspace/v2-grid";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues, valuer } from "../src/harness.ts";
import { births } from "../src/index.ts";
import { gauss, median, MinHeap, total } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: { part: { type: "string", default: "all" } } });
const want = (p: string) => o.part === "all" || o.part!.split(",").includes(p);
const say = (s = "") => console.log(s);
const f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2);
const fmt = (x: number) => (Math.abs(x) >= 1e5 ? x.toExponential(2) : Math.round(x).toLocaleString("en"));
const time = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, (performance.now() - t) / 1000]; };

type Rule = { family: string; params: Record<string, unknown>; tieBreaker: string };
const pool = presets.find(p => p.variant === "line-z")!.rules;   // by variant: a preset's id may move between variants
const ruleOf = (id: string): Rule => { const [family, tieBreaker] = id.split("/") as [string, string]; return { family, params: pool.find(r => r.family === family)!.params as Record<string, unknown>, tieBreaker }; };
const ALL_RULES: Rule[] = pool.flatMap(r => (r.tieBreakers as string[]).map(t => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: t })));
const name = (r: Rule) => `${r.family}/${r.tieBreaker}`;
const MIXED3 = ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"].map(ruleOf);

/** Table total on one object: Σ_i n_i · Σ_{j≠i} n_j. */

// ---------------------------------------------------------------- line-z helpers

const phi = (n: number) => mixedIntBits(BigInt(n));
const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
function zBits(rule: Rule) {
  const v = valuer(lineType, lineZ, rule);
  const cache = new Map<number, number>();
  return (m: number, c: number) => {
    const key = m * 1_000_003 + c;
    let b = cache.get(key);
    if (b === undefined) { b = v.bits(mc(m, c)); cache.set(key, b); }
    return b;
  };
}

// Prices (spec §5.2, v2-core walk.ts): which = log2 9, where = 0 (one line), arg by steps, surcharge = max(0, Δφ);
// the act charge is W + β·W² (v2-economy). One call per act.
const WHICH = Math.log2(mutators.length);
const jumpCharge = (k: number, dphi: number) => changeCharge([WHICH + stepsNonzeroBits(BigInt(k)) + Math.max(0, dphi)]);
const flipCharge = () => changeCharge([WHICH + 2]);   // a mirror: one of four axes, no surcharge (φ is even)

/** Cheapest energy from x0 to every x in [−X, X] on one coordinate (shift on c, tilt on m), jumps up to K, plus sign flips. */
function dijkstra1D(x0: number, X: number, K: number): Float64Array {
  const N = 2 * X + 1, cost = new Float64Array(N).fill(Infinity), done = new Uint8Array(N);
  const ph = new Float64Array(N); for (let i = 0; i < N; i++) ph[i] = phi(i - X);
  const heap = new MinHeap<number>();
  const push = (d: number, i: number) => heap.push(d, i), pop = () => heap.pop();
  const jc = new Float64Array(K + 1); for (let k = 1; k <= K; k++) jc[k] = WHICH + stepsNonzeroBits(BigInt(k));
  cost[x0 + X] = 0; push(0, x0 + X);
  while (heap.size) {
    const [d, i] = pop();
    if (done[i]) continue;
    done[i] = 1;
    const relax = (j: number, c: number) => { if (j >= 0 && j < N && !done[j] && d + c < cost[j]!) { cost[j] = d + c; push(d + c, j); } };
    for (let k = 1; k <= K; k++) for (const j of [i + k, i - k]) if (j >= 0 && j < N) { const w = jc[k]! + Math.max(0, ph[j]! - ph[i]!); relax(j, w + 0.05 * w * w); }
    relax(N - 1 - i, flipCharge());
  }
  return cost;
}
/** How many (m, c) with costM + costC ≤ E. */
function countWithin(cm: Float64Array, cc: Float64Array, E: number): number {
  const s = Float64Array.from(cc).sort();
  let n = 0;
  for (const a of cm) { if (a > E) continue; let lo = 0, hi = s.length; while (lo < hi) { const h = (lo + hi) >> 1; if (s[h]! <= E - a) lo = h + 1; else hi = h; } n += lo; }
  return n;
}
const birthMC = (seed: string, n: number) => births(lineType, lineZ, seed, n).map(s => { const l = s.lines[0]!; return { m: Number(-l.a / l.b), c: Number(-l.c / l.b) }; });

// ---------------------------------------------------------------- law: concentration

if (want("law")) {
  say("## Law concentration");
  let s2 = 0, s1 = 0;
  for (let n = -200_000; n <= 200_000; n++) { const p = 2 ** -phi(n); s1 += p; s2 += p * p; }
  const z2 = s2 * s2;
  say(`line-z: per coordinate Σp = ${f2(s1)}, Σp² = ${s2.toFixed(4)} (p(0) = ${2 ** -phi(0)}); Σπ² over (m, c) = ${z2.toFixed(4)}, collision entropy ${f2(-Math.log2(z2))} bits`);
  // Fraction lines: triples (a, b, c), canonical only, renormalised.
  let m1 = 0, m2 = 0; const L = 60;
  for (let a = -L; a <= L; a++) for (let b = 0; b <= L; b++) for (let c = -L; c <= L; c++) {
    const n = normalise(BigInt(a), BigInt(b), BigInt(c));
    if ("invalid" in n || Number(n.a) !== a || Number(n.b) !== b || Number(n.c) !== c) continue;
    const p = 2 ** -(phi(a) + phi(b) + phi(c)); m1 += p; m2 += p * p;
  }
  say(`line-q: Σπ² = ${(m2 / m1 / m1).toFixed(4)}, collision entropy ${f2(-Math.log2(m2 / m1 / m1))} bits (window |a|, b, |c| ≤ ${L})`);
  let g = 0; for (let x = 0; x <= 9; x++) g += cellProbability(x, grid4) ** 2;
  say(`grid 4×4 digits: per cell Σp² = ${g.toFixed(4)}; Σπ² = ${(g ** 16).toExponential(2)}, collision entropy ${f1(-16 * Math.log2(g))} bits`);
  say();
}

// ---------------------------------------------------------------- reach (H1, H5)

if (want("reach")) {
  say("## H1 / H5: states within an energy budget");
  // Check the hand-rolled prices against v2-core's own pricing.
  const s0 = mc(3, 10);
  for (const k of [1, 7, 49]) {
    const r = applyPriced(lineType, lineZ, s0, mutators.find(m => m.id === "si.shift")!, 0, { k: q(k) });
    if ("invalid" in r) throw new Error("price check");
    const mine = jumpCharge(k, phi(10 + k) - phi(10));
    if (Math.abs(changeCharge([r.price.total]) - mine) > 1e-9) throw new Error(`price mismatch at k=${k}: ${changeCharge([r.price.total])} vs ${mine}`);
  }
  const unit = jumpCharge(1, 0);
  say(`A unit step (no surcharge) costs ${f2(unit)} energy. One jump of k against k unit steps (surcharge left out):`);
  for (const k of [5, 10, 20, 58, 100, 400]) say(`  k = ${k}: one jump ${f1(jumpCharge(k, 0))} energy, k steps ${f1(k * unit)} energy, ratio ${f1(k * unit / jumpCharge(k, 0))}×`);
  const bs = birthMC("g0", 24).concat(birthMC("g1", 24));
  say(`Births (48): median |m| ${median(bs.map(b => Math.abs(b.m)))}, median |c| ${median(bs.map(b => Math.abs(b.c)))}; ${bs.filter(b => b.m === 0).length} of 48 are flat (m = 0)`);
  const X = 20_000;
  const budgets = [["a full charge", 1920], ["a line's share of a 3-seat table's game", 3 * 19_800 / 24], ["one seat's whole game on one line", 19_800]] as const;
  for (const [label, K] of [["today's prices (jumps up to 64)", 64], ["path-consistent (unit steps only)", 1]] as const) {
    say(`${label}:`);
    const rows = bs.slice(0, 8).map(b => ({ cm: dijkstra1D(b.m, X, K), cc: dijkstra1D(b.c, X, K), b }));
    for (const [bl, E] of budgets) {
      const counts = rows.map(r => countWithin(r.cm, r.cc, E));
      const reachC = rows.map(r => { let far = 0; r.cc.forEach((v, i) => { if (v <= E) far = Math.max(far, Math.abs(i - X)); }); return far; });
      say(`  ${bl} (${fmt(E)} energy): median ${fmt(median(counts))} states (range ${fmt(Math.min(...counts))}–${fmt(Math.max(...counts))}), |c| reaches ${fmt(median(reachC))}; evaluating 3 rules on all of them ≈ ${f1(median(counts) * 3 * 6.5e-6)} s`);
    }
    const toTarget = rows.map(r => r.cm[-1 + X]! + r.cc[59 + X]!);
    say(`  moving a birth to y = −x + 59: median ${fmt(median(toTarget))} energy (24 lines: ${fmt(24 * median(toTarget))} energy)`);
    const big = rows.map(r => r.cm[-1 + X]! + r.cc[397 + X]!);
    say(`  moving a birth to y = −x + 397: median ${fmt(median(big))} energy`);
  }
  say();
}

// ---------------------------------------------------------------- rules (H2, H3)

const WM = 60, WC = 600;
function stats(xs: Float64Array, groups: Int32Array, G: number): number {
  // R² of a group-means model.
  const sum = new Float64Array(G), cnt = new Float64Array(G);
  let mean = 0; for (let i = 0; i < xs.length; i++) { sum[groups[i]!] += xs[i]!; cnt[groups[i]!]++; mean += xs[i]!; }
  mean /= xs.length;
  let tot = 0, res = 0;
  for (let i = 0; i < xs.length; i++) { tot += (xs[i]! - mean) ** 2; res += (xs[i]! - sum[groups[i]!]! / cnt[groups[i]!]!) ** 2; }
  return tot ? 1 - res / tot : 0;
}
function additiveR2(xs: Float64Array, nm: number, nc: number): number {
  // Two-way main effects (m-only + c-only), fitted by backfitting.
  const am = new Float64Array(nm), ac = new Float64Array(nc);
  let mean = 0; for (const x of xs) mean += x; mean /= xs.length;
  for (let it = 0; it < 20; it++) {
    am.fill(0); for (let i = 0; i < nm; i++) { let s = 0; for (let j = 0; j < nc; j++) s += xs[i * nc + j]! - mean - ac[j]!; am[i] = s / nc; }
    ac.fill(0); for (let j = 0; j < nc; j++) { let s = 0; for (let i = 0; i < nm; i++) s += xs[i * nc + j]! - mean - am[i]!; ac[j] = s / nm; }
  }
  let tot = 0, res = 0;
  for (let i = 0; i < nm; i++) for (let j = 0; j < nc; j++) { const x = xs[i * nc + j]!; tot += (x - mean) ** 2; res += (x - mean - am[i]! - ac[j]!) ** 2; }
  return tot ? 1 - res / tot : 0;
}
const lg = (x: number) => Math.floor(Math.log2(Math.abs(x) + 1));
const NEIGH: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];   // tilt, shift, step by ±1

if (want("rules")) {
  say(`## H2 / H3: each beginner rule on line-z over |m| ≤ ${WM}, |c| ≤ ${WC} (${fmt((2 * WM + 1) * (2 * WC + 1))} lines)`);
  say("| Rule | Reads | Top in window (bits, at) | Top at |c| ≤ 60, |m| ≤ 10 | R² m only | R² c only | R² m + c additive | R² magnitude bins | R² magnitude, tail ≥ 10 bits | Corr(bits, φ) tail | Strict local maxima (of states ≥ 10 bits) |");
  say("|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|");
  const nm = 2 * WM + 1, nc = 2 * WC + 1, N = nm * nc;
  const gm = new Int32Array(N), gc = new Int32Array(N), gmag = new Int32Array(N), ph = new Float64Array(N);
  for (let i = 0; i < nm; i++) for (let j = 0; j < nc; j++) { const k = i * nc + j, m = i - WM, c = j - WC; gm[k] = i; gc[k] = j; gmag[k] = lg(m) * 32 + lg(c); ph[k] = phi(m) + phi(c); }
  for (const rule of ALL_RULES) {
    const b = zBits(rule), xs = new Float64Array(N);
    let top = -1, at = [0, 0], topS = -1, atS = [0, 0];
    for (let i = 0; i < nm; i++) for (let j = 0; j < nc; j++) {
      const m = i - WM, c = j - WC, v = b(m, c); xs[i * nc + j] = v;
      if (v > top) { top = v; at = [m, c]; }
      if (Math.abs(m) <= 10 && Math.abs(c) <= 60 && v > topS) { topS = v; atS = [m, c]; }
    }
    // Tail: states ≥ 10 bits.
    const tail = [...xs.keys()].filter(k => xs[k]! >= 10);
    const tx = Float64Array.from(tail, k => xs[k]!), tg = Int32Array.from(tail, k => gmag[k]!);
    let corr = 0;
    if (tail.length > 2) { const tp = tail.map(k => ph[k]!); const mx = tx.reduce((a, b) => a + b) / tx.length, mp = tp.reduce((a, b) => a + b) / tp.length; let sxy = 0, sxx = 0, syy = 0; tail.forEach((_, i) => { sxy += (tx[i]! - mx) * (tp[i]! - mp); sxx += (tx[i]! - mx) ** 2; syy += (tp[i]! - mp) ** 2; }); corr = sxy / Math.sqrt(sxx * syy); }
    let lmax = 0;
    for (const k of tail) { const i = gm[k]!, j = gc[k]!; let ok = true; for (const [dm, dc] of NEIGH) { const ii = i + dm, jj = j + dc; if (ii < 0 || jj < 0 || ii >= nm || jj >= nc) continue; if (xs[ii * nc + jj]! >= xs[k]!) { ok = false; break; } } if (ok) lmax++; }
    const reads = lineType.families.find(f => f.id === rule.family)!.depends.join("+");
    say(`| ${name(rule)} | ${reads} | ${f1(top)} at (${at[0]}, ${at[1]}) | ${f1(topS)} at (${atS[0]}, ${atS[1]}) | ${f2(stats(xs, gm, nm))} | ${f2(stats(xs, gc, nc))} | ${f2(additiveR2(xs, nm, nc))} | ${f2(stats(xs, gmag, 32 * 32))} | ${tail.length ? f2(stats(tx, tg, 32 * 32)) : "–"} | ${f2(corr)} | ${lmax} of ${tail.length} |`);
  }
  say();
}

// ---------------------------------------------------------------- table (window optimum, energy optimum, greedy, H6)

if (want("table")) {
  say("## The mixed table (Prime Landing/big-prime, Treasure/prime-terms, Whole Crossing/k-spf) on line-z");
  const bit = MIXED3.map(zBits);
  const F = (m: number, c: number) => total(bit.map(b => b(m, c)));
  const ref = F(-1, 59);
  say(`F(y = −x + 59) = ${f1(ref)} (bits ${bit.map(b => f1(b(-1, 59))).join(", ")})`);
  for (const [M, C] of [[10, 60], [40, 400], [60, 1000], [60, 3000]] as const) {
    const [r, secs] = time(() => {
      const all: { m: number; c: number; v: number }[] = [];
      for (let m = -M; m <= M; m++) for (let c = -C; c <= C; c++) all.push({ m, c, v: F(m, c) });
      all.sort((a, b) => b.v - a.v);
      return all;
    });
    const best = r[0]!, top24 = r.slice(0, 24);
    const edge = Math.abs(best.c) > 0.9 * C || Math.abs(best.m) > 0.9 * M;
    say(`- |m| ≤ ${M}, |c| ≤ ${C} (${fmt(r.length)} lines, enumerated and sorted in ${f1(secs)} s): best y = ${best.m}x + ${best.c}, F = ${f1(best.v)} (${f1(best.v / ref)}× the y = −x + 59 state)${edge ? ", at the window's edge" : ""}; 24 best distinct lines keep ${(100 * top24.reduce((a, x) => a + x.v, 0) / (24 * best.v)).toFixed(0)}% of 24 × best; the 24th is y = ${top24[23]!.m}x + ${top24[23]!.c} (${f1(top24[23]!.v)}); top 5: ${r.slice(0, 5).map(x => `(${x.m}, ${x.c})`).join(" ")}`);
  }
  // Ruggedness of F: strict local maxima under unit tilt/shift/step, among lines with F above the median.
  {
    const M = 40, C = 400, nc = 2 * C + 1;
    const xs = new Float64Array((2 * M + 1) * nc);
    for (let m = -M; m <= M; m++) for (let c = -C; c <= C; c++) xs[(m + M) * nc + c + C] = F(m, c);
    const sorted = Float64Array.from(xs).sort(), med = sorted[Math.floor(sorted.length / 2)]!, p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    let lmax = 0, lmax99 = 0;
    for (let i = 1; i < 2 * M; i++) for (let j = 1; j < 2 * C; j++) {
      const v = xs[i * nc + j]!; if (v <= med) continue;
      if (NEIGH.every(([dm, dc]) => xs[(i + dm) * nc + j + dc]! < v)) { lmax++; if (v >= p99) lmax99++; }
    }
    say(`- Ruggedness of F over |m| ≤ ${M}, |c| ≤ ${C}: ${lmax} strict local maxima above the median (${(100 * lmax / xs.length).toFixed(1)}% of lines), ${lmax99} in the top 1%`);
  }
  // Best line reachable on an energy budget, from each birth, at today's and at path-consistent prices.
  const X = 3000, bs = birthMC("g0", 24);
  for (const [label, K] of [["today's prices", 64], ["path-consistent prices", 1]] as const) {
    for (const E of [3 * 19_800 / 24, 19_800]) {
      const res = bs.slice(0, 12).map(b => {
        const cm = dijkstra1D(b.m, X, K), cc = dijkstra1D(b.c, X, K);
        let best = { v: -1, m: 0, c: 0, cost: 0 };
        for (let m = -60; m <= 60; m++) { const a = cm[m + X]!; if (a > E) continue; for (let c = -X; c <= X; c++) { const t = a + cc[c + X]!; if (t > E) continue; const v = F(m, c); if (v > best.v) best = { v, m, c, cost: t }; } }
        return best;
      });
      const v = res.map(r => r.v);
      say(`- ${label}, ${fmt(E)} energy for the line: best reachable F median ${f1(median(v))} (${f1(median(v) / ref)}× the −x + 59 state); targets ${[...new Set(res.map(r => `(${r.m}, ${r.c})`))].slice(0, 6).join(" ")}`);
    }
  }
  // Greedy climbers on F (steepest ascent over shift/tilt/step by up to 5 and the two sign flips), from births.
  {
    const moves: [number, number][] = [];
    for (let k = 1; k <= 5; k++) for (const s of [k, -k]) moves.push([s, 0], [0, s], [s, -s]);
    const ends = new Map<string, number>(); const vals: number[] = []; let steps = 0;
    for (const b of birthMC("g0", 24).concat(birthMC("g1", 24))) {
      let m = b.m, c = b.c, v = F(m, c);
      for (;;) {
        let nb = { m, c, v };
        for (const [dm, dc] of moves) { const x = F(m + dm, c + dc); if (x > nb.v) nb = { m: m + dm, c: c + dc, v: x }; }
        for (const [mm, cc] of [[-m, c], [m, -c]] as const) { const x = F(mm, cc); if (x > nb.v) nb = { m: mm, c: cc, v: x }; }
        if (nb.v <= v) break;
        ({ m, c, v } = nb); steps++;
        if (steps > 1e6) break;
      }
      ends.set(`(${m}, ${c})`, v); vals.push(v);
    }
    say(`- Greedy steepest ascent on F from 48 births (moves of up to 5): ${ends.size} distinct endpoints, median F ${f1(median(vals))} (${f1(median(vals) / ref)}× the −x + 59 state), best ${f1(Math.max(...vals))}; mean ${f1(steps / 48)} moves; endpoints ${[...ends.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${f1(v)}`).join(" ")}`);
  }
  say();
}

// ---------------------------------------------------------------- ident (H4)

if (want("ident")) {
  say("## H4: probes until the other two players' rules are identified");
  const value = new Map(ALL_RULES.map(r => [name(r), zBits(r)] as const));
  const probes = births(lineType, lineZ, "probe", 4000).map(s => { const l = s.lines[0]!; return [Number(-l.a / l.b), Number(-l.c / l.b)] as [number, number]; }).filter(([m, c]) => Number.isFinite(m) && Number.isFinite(c));
  const r = rng("ident");
  for (const sigma of [0, 2, 8, 16]) {
    const need: number[] = []; let ambiguous = 0;
    for (let trial = 0; trial < 60; trial++) {
      // Own rule and two others from three distinct families.
      const fams = [...new Set(ALL_RULES.map(x => x.family))];
      const pick = () => fams.splice(r.below(fams.length), 1)[0]!;
      const own = pick(); void own;
      const candidates: [string, string][] = [];
      for (let i = 0; i < ALL_RULES.length; i++) for (let j = i + 1; j < ALL_RULES.length; j++) {
        const a = ALL_RULES[i]!, b = ALL_RULES[j]!; if (a.family === b.family || a.family === own || b.family === own) continue;
        candidates.push([name(a), name(b)]);
      }
      const truth = candidates[r.below(candidates.length)]!;
      const logp = new Float64Array(candidates.length);
      const order = probes.slice().sort(() => r.unit() - 0.5);
      let n = 0;
      for (const [m, c] of order) {
        n++;
        const obs = value.get(truth[0])!(m, c) + value.get(truth[1])!(m, c) + (sigma ? sigma * gauss(r) : 0);
        candidates.forEach(([a, b], k) => { const pred = value.get(a)!(m, c) + value.get(b)!(m, c); logp[k] += sigma ? -((obs - pred) ** 2) / (2 * sigma * sigma) : (Math.abs(obs - pred) < 1e-9 ? 0 : -Infinity); });
        const mx = Math.max(...logp); let z = 0; for (const x of logp) z += 2 ** ((x - mx) / Math.LN2);
        const kt = candidates.indexOf(truth); const post = 2 ** ((logp[kt]! - mx) / Math.LN2) / z;
        if (post >= 0.95) break;
        if (n >= 3000) { ambiguous++; break; }
      }
      need.push(n);
    }
    need.sort((a, b) => a - b);
    say(`- noise σ = ${sigma} bits: median ${need[30]} probes, 90th percentile ${need[54]}, ${ambiguous} of 60 not identified in 3,000 (candidates per seat ≈ ${fmt(candidatesCount())})`);
  }
  say();
}
function candidatesCount(): number { let n = 0; for (let i = 0; i < ALL_RULES.length; i++) for (let j = i + 1; j < ALL_RULES.length; j++) if (ALL_RULES[i]!.family !== ALL_RULES[j]!.family) n++; return n; }

// ---------------------------------------------------------------- grid

if (want("grid")) {
  say("## Grids (4×4 digits): the mixed table (Magic Eighteen, Opposite Nines, Mirrormancer)");
  const gpool = gridPresets.find(p => p.id === "grids-beginner")!.rules;
  const grule = (fam: string) => { const r = gpool.find(x => x.family === fam)!; return { family: fam, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreakers[0]! }; };
  const value = ["magic-eighteen", "opposite-nines", "mirrormancer"].map(grule).map(rule => {
    const look = valueLookup(findValues(grid4.id, rule)!), f = gridType.families.find(x => x.id === rule.family)!;
    const cache = new Map<string, number>();
    return (s: GridState) => { const k = s.cells.join(""); let b = cache.get(k); if (b === undefined) { b = look(evaluateSite(gridType, f, rule.params, s, grid4, 0, rule.tieBreaker).score).bits; cache.set(k, b); } return b; };
  });
  const F = (s: GridState) => total(value.map(v => v(s)));
  const r = rng("grid-landscape");
  const rand = (): GridState => ({ cells: Array.from({ length: 16 }, () => r.below(10)) });
  const climb = (s: GridState) => {
    let v = F(s), evals = 1;
    for (;;) {
      let best: GridState | null = null, bv = v;
      for (let i = 0; i < 16; i++) for (let d = 0; d <= 9; d++) { if (d === s.cells[i]) continue; const t = { cells: s.cells.slice() }; t.cells[i] = d; const x = F(t); evals++; if (x > bv) { bv = x; best = t; } }
      if (!best) return { s, v, evals };
      s = best; v = bv;
    }
  };
  const [runs, secs] = time(() => Array.from({ length: 60 }, () => climb(rand())));
  const vals = runs.map(x => x.v).sort((a, b) => b - a);
  const distinct = new Set(runs.map(x => x.s.cells.join(""))).size;
  say(`- 60 greedy climbs (single-cell changes) from random boards, ${f1(secs)} s: ${distinct} distinct endpoints; F best ${f1(vals[0]!)}, median ${f1(median(vals))}, worst ${f1(vals.at(-1)!)}; ${runs.filter(x => x.v >= vals[0]! - 1e-9).length} of 60 reach the best`);
  // Simulated annealing.
  const anneal = (iters: number) => {
    let s = rand(), v = F(s), best = v;
    for (let t = 0; t < iters; t++) {
      const T = 2000 * (1 - t / iters) + 1;
      const n = { cells: s.cells.slice() }; n.cells[r.below(16)] = r.below(10);
      const x = F(n);
      if (x >= v || r.unit() < Math.exp((x - v) / T)) { s = n; v = x; if (v > best) best = v; }
    }
    return best;
  };
  const [ann, secA] = time(() => Array.from({ length: 10 }, () => anneal(200_000)));
  ann.sort((a, b) => b - a);
  say(`- 10 annealing runs of 200,000 evaluations, ${f1(secA)} s: best ${f1(ann[0]!)}, median ${f1(median(ann))}, worst ${f1(ann.at(-1)!)}`);
  say();
}

// ---------------------------------------------------------------- line-q

if (want("lineq")) {
  say("## Fraction lines (line-q): the mixed table");
  const vs = MIXED3.map(rule => valuer(lineType, lineQ, rule));
  const cache = new Map<string, number>();
  const F = (a: number, b: number, c: number) => { const k = `${a},${b},${c}`; let v = cache.get(k); if (v === undefined) { const s = { lines: [{ a: BigInt(a), b: BigInt(b), c: BigInt(c) }] }; v = total(vs.map(x => x.bits(s))); cache.set(k, v); } return v; };
  const canon = (a: number, b: number, c: number) => { const n = normalise(BigInt(a), BigInt(b), BigInt(c)); return !("invalid" in n) && Number(n.a) === a && Number(n.b) === b && Number(n.c) === c; };
  const refQ = F(1, 1, -59);
  for (const [A, B, C] of [[12, 12, 60], [30, 30, 400]] as const) {
    const [r, secs] = time(() => {
      const all: { a: number; b: number; c: number; v: number }[] = [];
      for (let a = -A; a <= A; a++) for (let b = 0; b <= B; b++) for (let c = -C; c <= C; c++) if (canon(a, b, c)) all.push({ a, b, c, v: F(a, b, c) });
      return all.sort((x, y) => y.v - x.v);
    });
    const best = r[0]!, top24 = r.slice(0, 24);
    say(`- |a| ≤ ${A}, b ≤ ${B}, |c| ≤ ${C} (${fmt(r.length)} lines, ${f1(secs)} s): best ${best.a}x + ${best.b}y + ${best.c} = 0, F = ${f1(best.v)} (${f1(best.v / refQ)}× y = −x + 59); 24 best keep ${(100 * top24.reduce((s, x) => s + x.v, 0) / (24 * best.v)).toFixed(0)}%; top 5: ${r.slice(0, 5).map(x => `(${x.a}, ${x.b}, ${x.c})`).join(" ")}`);
    if (A === 12) {
      // Ruggedness under gen.nudge by ±1 on one coefficient.
      let lmax = 0, above = 0; const med = r[Math.floor(r.length / 2)]!.v;
      for (const s of r) { if (s.v <= med) continue; above++; let ok = true; for (const [da, db, dc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const a = s.a + da!, b = s.b + db!, c = s.c + dc!; if (!canon(a, b, c)) continue; if (F(a, b, c) >= s.v) { ok = false; break; } } if (ok) lmax++; }
      say(`  strict local maxima under nudges of ±1: ${lmax} of ${above} lines above the median (${(100 * lmax / above).toFixed(1)}%)`);
    }
  }
  say();
}
