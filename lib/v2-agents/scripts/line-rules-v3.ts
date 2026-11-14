/**
 * Line rules, third pass: candidate families measured against the collapse check of
 * docs/engine-v2/landscape-analysis.md §4. Analysis only: nothing here changes the dealt pool, prices or scoring.
 * The write-up is docs/engine-v2/line-rules-v3-proposals.md.
 *
 *   node --experimental-strip-types scripts/line-rules-v3.ts [--part all|rules|tables|twist|ident] [--n 1500000]
 *
 * Object: a fraction line a·x + b·y + c = 0 (primitive, b > 0, or b = 0 < a), drawn from the line-q law
 * (each of a, b, c from the mixed integer code, conditioned on canonical). A rule is a primary and one secondary, both
 * real-valued, compared lexicographically; its bits at a line are −log2 π{lines at least as good}, estimated from
 * tilted draws of the law (decision 22: an empirical ladder). Prices are path-consistent unit steps on a, b or c
 * (#580): one call of "which" + a one-step argument + max(0, Δφ), charged W + 0.05·W².
 */
import { parseArgs } from "node:util";
import { mixedIntBits, mixedIntLog2Norm, rng, sampleMixedInt, stepsNonzeroBits, type Rng } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";

const { values: o } = parseArgs({ options: { part: { type: "string", default: "all" }, n: { type: "string", default: "1500000" } } });
const want = (p: string) => o.part === "all" || o.part!.split(",").includes(p);
const say = (s = "") => console.log(s);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : String(x)), f2 = (x: number) => x.toFixed(2);

// ---------------------------------------------------------------- numbers

const LIM = 4_000_000;
const SPF = new Int32Array(LIM + 1);
for (let i = 2; i <= LIM; i++) if (!SPF[i]) for (let j = i; j <= LIM; j += i) if (!SPF[j]) SPF[j] = i;
function factor(n: number): number[] {
  n = Math.abs(n); const out: number[] = [];
  for (let d = 2; n > LIM && d * d <= n; d++) while (n % d === 0) { out.push(d); n /= d; }
  while (n > 1) { if (n <= LIM) { const p = SPF[n]!; out.push(p); n /= p; } else { out.push(n); n = 1; } }
  return out;
}
const LOG2Z = mixedIntBits(1n) - 2;
const phiInt = (n: number) => (n === 0 ? 1 : 2 + 0.5 * factor(n).reduce((s, p) => s + p, 0) + LOG2Z);
const gcd = (x: number, y: number): number => { x = Math.abs(x); y = Math.abs(y); while (y) [x, y] = [y, x % y]; return x; };
const spf = (n: number) => (Math.abs(n) <= 1 ? 0 : factor(n)[0]!);
const bigOmega = (n: number) => (Math.abs(n) <= 1 ? 0 : factor(n).length);
const mulmod = (x: number, y: number, m: number) => Number((BigInt(x) * BigInt(y)) % BigInt(m));
function powmod(b: number, e: number, m: number) { let r = 1 % m; b %= m; while (e > 0) { if (e & 1) r = mulmod(r, b, m); b = mulmod(b, b, m); e = Math.floor(e / 2); } return r; }
/** The share of 1/n's decimal period in its largest possible value n − 1 (1 at full-reptend primes). Bounded. */
function reptend(n: number): number {
  n = Math.abs(n);
  if (n <= 2 || gcd(n, 10) !== 1 || n > 1e9) return 0;
  // λ-free: the order divides φ(n); try its divisors in increasing order.
  const fs = factor(n); let tot = 1; const seen = new Map<number, number>();
  for (const p of fs) seen.set(p, (seen.get(p) ?? 0) + 1);
  for (const [p, e] of seen) tot *= (p - 1) * p ** (e - 1);
  let ord = tot;
  for (const p of new Set(factor(tot))) while (ord % p === 0 && powmod(10, ord / p, n) === 1) ord /= p;
  return ord / (n - 1);
}
const dZ = (x: number) => Math.abs(x - Math.round(x));
const qz = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e10) / 1e10 : x);

// ---------------------------------------------------------------- lines

type L = readonly [number, number, number];
function canon(a: number, b: number, c: number): L | null {
  if (a === 0 && b === 0) return null;
  const g = gcd(gcd(a, b), c);
  a /= g; b /= g; c /= g;
  if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b; c = -c; }
  return [a + 0, b + 0, c + 0];
}
const phiL = (l: L) => phiInt(l[0]) + phiInt(l[1]) + phiInt(l[2]);
const key = (l: L) => ((l[0] + 4096) * 8192 + l[1]) * 8192 + (l[2] + 4096);

/** The derived numbers a rule may read (every one a representation of the same line). */
interface D { a: number; b: number; c: number; m: number; k: number; X: number; A: number; dist: number; hyp: number }
function derive(l: L): D | null {
  const [a, b, c] = l;
  if (b === 0) return null;
  const hyp = Math.hypot(a, b);
  return { a, b, c, m: -a / b, k: -c / b, X: a !== 0 ? -c / a : NaN, A: a !== 0 && c !== 0 ? (c * c) / (2 * Math.abs(a) * b) : NaN, dist: Math.abs(c) / hyp, hyp };
}
const yAt = (d: D, x: number) => d.m * x + d.k;

// ---------------------------------------------------------------- rule families

type Sec = { id: string; text: string; f: (d: D) => number };
type Fam = { id: string; name: string; text: string; P: (d: D) => number; anchor: (d: D) => number; secs: Sec[] };
type Rule = { id: string; fam: string; P: (d: D) => number; S: (d: D) => number };

const W = -1e9;   // worst
/** Secondaries on the whole number n a primary snaps to. */
const onN = (anchor: (d: D) => number) => ({
  spf: { id: "spf", text: "that whole number's smallest prime factor is big", f: (d: D) => spf(Math.round(anchor(d))) },
  rep: { id: "rep", text: "1 ÷ that number has a long repeating decimal (its period over n − 1)", f: (d: D) => reptend(Math.round(anchor(d))) },
  sq: { id: "sq", text: "that whole number is nearly a perfect square", f: (d: D) => { const n = Math.abs(Math.round(anchor(d))); return n <= 1 ? -0.5 : -dZ(Math.sqrt(n)); } },
  omega: { id: "omega", text: "that whole number has many prime factors (counted with repeats)", f: (d: D) => bigOmega(Math.round(anchor(d))) },
});
const fin = (x: number) => (Number.isFinite(x) ? x : W);

function families(T6: number, T7: number): Fam[] {
  const fam = (id: string, name: string, text: string, P: (d: D) => number, anchor: (d: D) => number, secs: (n: ReturnType<typeof onN>) => Sec[]): Fam =>
    ({ id, name, text, P: d => fin(P(d)), anchor, secs: secs(onN(anchor)) });
  return [
    fam("whole-intercept", "Whole Intercept", "the y-intercept is as close to a whole number as possible", d => -dZ(d.k), d => d.k, n => [
      n.spf, n.rep,
      { id: "x-whole", text: "the x-intercept is nearly whole too", f: d => fin(-dZ(d.X)) },
    ]),
    fam("whole-crossing", "Whole Crossing", "the line crosses the x-axis as close to a whole number as possible", d => -dZ(d.X), d => d.X, n => [
      n.spf, n.sq,
      { id: "area-whole", text: "the triangle it makes with the axes has nearly whole area", f: d => fin(-dZ(d.A)) },
    ]),
    fam("whole-distance", "Whole Distance", "the line's distance from the centre (0, 0) is as close to a whole number as possible", d => (d.c === 0 ? W : -dZ(d.dist)), d => d.dist, n => [
      { id: "hyp-whole", text: "√(a² + b²) is nearly whole (a Pythagorean direction)", f: d => -dZ(d.hyp) },
      n.spf, n.rep,
    ]),
    fam("square-area", "Square Area", "the triangle the line makes with the axes has an area as close to a perfect square as possible", d => -dZ(Math.sqrt(d.A)), d => Math.sqrt(d.A), n => [
      n.omega, n.spf,
      { id: "k-whole", text: "the y-intercept is nearly whole", f: d => -dZ(d.k) },
    ]),
    fam("peg-line", "Peg Line", "the line passes as close as possible to a peg (a whole-number point) in columns x = 1 to 9", d => -Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => dZ(yAt(d, x)))), d => {
      let best = 1, bx = 1; for (let x = 1; x <= 9; x++) { const e = dZ(yAt(d, x)); if (e < best) { best = e; bx = x; } } return yAt(d, bx);
    }, n => [
      { id: "two-pegs", text: "the second-closest peg is close too", f: d => -[1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => dZ(yAt(d, x))).sort((p, q) => p - q)[1]! },
      n.spf, n.rep,
    ]),
    fam("target-gradient", "Target Gradient", `the gradient is as close as possible to the dealt target T (here ${f2(T6)})`, d => -Math.abs(d.m - T6), d => d.k, n => [
      { id: "k-whole", text: "the y-intercept is nearly whole", f: d => -dZ(d.k) },
      n.spf,
      { id: "dist-whole", text: "the distance from (0, 0) is nearly whole", f: d => (d.c === 0 ? -0.5 : -dZ(d.dist)) },
    ]),
    fam("whole-at-t", "Whole at x = T", `at the dealt x = ${T7}, y is as close to a whole number as possible`, d => -dZ(yAt(d, T7)), d => yAt(d, T7), n => [
      { id: "next-whole", text: `at x = ${T7 + 1} as well`, f: d => -dZ(yAt(d, T7 + 1)) },
      n.spf, n.rep,
    ]),
    fam("whole-product", "Whole Product", "gradient × y-intercept is as close to a whole number as possible", d => -dZ(d.m * d.k), d => d.m * d.k, n => [
      n.spf, n.rep,
      { id: "x-whole", text: "the x-intercept is nearly whole", f: d => fin(-dZ(d.X)) },
    ]),
  ];
}
const rulesOf = (fs: Fam[]): Rule[] => fs.flatMap(f => f.secs.map(s => ({ id: `${f.id}/${s.id}`, fam: f.id, P: f.P, S: (d: D) => fin(s.f(d)) })));

// ---------------------------------------------------------------- the law and the ladders

const TILT = 0.55;
interface Sample { ls: L[]; logw: Float64Array; total: number }
function drawLaw(n: number, seed: string): Sample {
  const r = rng("v3-law", seed), z = mixedIntLog2Norm(TILT);
  const ls: L[] = [], lw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Number(sampleMixedInt(r, TILT)), b = Number(sampleMixedInt(r, TILT)), c = Number(sampleMixedInt(r, TILT));
    const l = canon(a, b, c);
    if (!l || l[0] !== a || l[1] !== b || l[2] !== c || Math.max(Math.abs(a), b, Math.abs(c)) > 4000) continue;
    ls.push(l); lw.push(-(1 - TILT) * phiL(l) + 3 * z);
  }
  const mx = lw.reduce((m, x) => Math.max(m, x), -Infinity); const logw = Float64Array.from(lw, x => x - mx);
  return { ls, logw, total: logw.reduce((s, x) => s + 2 ** x, 0) };
}
interface Ladder { P: Float64Array; S: Float64Array; cum: Float64Array; cap: number }
const better = (p1: number, s1: number, p2: number, s2: number) => p1 > p2 || (p1 === p2 && s1 > s2);
function ladder(rule: Rule, smp: Sample): Ladder {
  const n = smp.ls.length, P = new Float64Array(n), S = new Float64Array(n);
  smp.ls.forEach((l, i) => { const d = derive(l); P[i] = d ? qz(rule.P(d)) : W; S[i] = d ? qz(rule.S(d)) : W; });
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => (P[j]! - P[i]!) || (S[j]! - S[i]!));
  const out = { P: new Float64Array(n), S: new Float64Array(n), cum: new Float64Array(n), cap: 0 };
  let acc = 0;
  idx.forEach((i, r) => { acc += 2 ** smp.logw[i]!; out.P[r] = P[i]!; out.S[r] = S[i]!; out.cum[r] = acc / smp.total; });
  out.cap = -Math.log2(out.cum[0]!);
  return out;
}
/** Bits of a line under a rule: −log2 of the estimated mass at least as good; past the sample's top, the cap + 1. */
function bitsOf(rule: Rule, lad: Ladder, l: L): number {
  const d = derive(l); if (!d) return 0;
  const p = qz(rule.P(d)), s = qz(rule.S(d));
  let lo = 0, hi = lad.P.length;   // first rank strictly worse than (p, s)
  while (lo < hi) { const mid = (lo + hi) >> 1; if (better(p, s, lad.P[mid]!, lad.S[mid]!)) hi = mid; else lo = mid + 1; }
  return lo === 0 ? lad.cap + 1 : -Math.log2(lad.cum[lo - 1]!);
}
type Valuer = { rule: Rule; bits: (l: L) => number; lad: Ladder };
const bitsRaw = (v: Valuer, l: L) => bitsOf(v.rule, v.lad, l);
function valuers(rules: Rule[], smp: Sample): Valuer[] {
  return rules.map(rule => { const lad = ladder(rule, smp); const cache = new Map<number, number>(); return { rule, lad, bits: (l: L) => { const k = key(l); let v = cache.get(k); if (v === undefined) { v = bitsOf(rule, lad, l); cache.set(k, v); } return v; } }; });
}
const tableF = (ns: number[]) => { const t = ns.reduce((a, b) => a + b, 0); return ns.reduce((a, x) => a + x * (t - x), 0); };

// ---------------------------------------------------------------- moves and reach (path-consistent unit steps)

const UNIT = Math.log2(9) + stepsNonzeroBits(1n);
const moveCost = (from: L, to: L) => changeCharge([UNIT + Math.max(0, phiL(to) - phiL(from))]);
function neighbours(l: L): L[] {
  const out: L[] = [];
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const v = [...l] as number[]; v[i]! += s; const c = canon(v[0]!, v[1]!, v[2]!); if (c && Math.max(Math.abs(c[0]), c[1], Math.abs(c[2])) < 4000) out.push(c); }
  return out;
}
function reach(start: L, budget: number, maxStates = 150_000): { states: L[]; capped: boolean; spent: number } {
  const dist = new Map<number, number>(), states: L[] = [];
  const heap: [number, L][] = [[0, start]]; dist.set(key(start), 0);
  const push = (x: [number, L]) => { heap.push(x); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p]![0] <= heap[j]![0]) break; [heap[p], heap[j]] = [heap[j]!, heap[p]!]; j = p; } };
  const pop = () => { const top = heap[0]!; const last = heap.pop()!; if (heap.length) { heap[0] = last; let j = 0; for (;;) { const a = 2 * j + 1, b = a + 1; let s = j; if (a < heap.length && heap[a]![0] < heap[s]![0]) s = a; if (b < heap.length && heap[b]![0] < heap[s]![0]) s = b; if (s === j) break; [heap[s], heap[j]] = [heap[j]!, heap[s]!]; j = s; } } return top; };
  const done = new Set<number>();
  while (heap.length) {
    const [d, l] = pop(); const k = key(l);
    if (done.has(k)) continue; done.add(k); states.push(l);
    if (states.length >= maxStates) return { states, capped: true, spent: d };
    for (const n of neighbours(l)) { const nd = d + moveCost(l, n); const nk = key(n); if (nd <= budget && nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); push([nd, n]); } }
  }
  return { states, capped: false, spent: budget };
}
function birth(r: Rng): L { for (;;) { const a = Number(sampleMixedInt(r)), b = Number(sampleMixedInt(r)), c = Number(sampleMixedInt(r)); const l = canon(a, b, c); if (l && l[0] === a && l[1] === b && l[2] === c && b > 0) return l; } }

const LINE_SHARE = 2475, SEAT_GAME = 19_800;

// ---------------------------------------------------------------- measures

function windowLines(H: number): L[] {
  const out: L[] = [];
  for (let a = -H; a <= H; a++) for (let b = 1; b <= H; b++) for (let c = -H; c <= H; c++) if (gcd(gcd(a, b), c) === 1) out.push([a, b, c]);
  return out;
}
const corr = (x: number[], y: number[]) => { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; syy += (y[i]! - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
const show = (l: L) => `(${l[0]},${l[1]},${l[2]})`;
const height = (l: L) => Math.max(Math.abs(l[0]), l[1], Math.abs(l[2]));
const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

/** Test 1 per rule: is its top at the window's edge, does it grow with the window, do tail bits track φ? */
function rampTest(v: Valuer, win1: L[], win2: L[], H1: number, H2: number) {
  // The top, and of the lines that reach it, the one of least height (a tied top reached near the centre is not an edge).
  const top = (ls: L[]) => { const tb = ls.reduce((m, l) => Math.max(m, v.bits(l)), 0); return ls.filter(l => v.bits(l) >= tb - 1e-9).reduce((a, l) => (height(l) < height(a) ? l : a)); };
  const t1 = top(win1), t2 = top(win2), b1 = v.bits(t1), b2 = v.bits(t2);
  const tail = win2.filter(l => v.bits(l) >= 10);
  const c = tail.length > 20 ? corr(tail.map(l => v.bits(l)), tail.map(phiL)) : NaN;
  const atCap = win2.filter(l => v.bits(l) > 900).length;
  const edge = height(t2) >= 0.85 * H2;
  return { t1, t2, b1, b2, c, edge, grows: b2 > 1.1 * b1, ramp: edge && b2 > 1.1 * b1 && c > 0.9, tail: tail.length, atCap, H1 };
}

/** Test 2 for a table, on one birth: the reachable set's exact best, and what a rule-knowing climber finds in B evaluations. */
function searchTest(vs: Valuer[], b0: L, budget: number, B: number, seed: string) {
  const { states, capped } = reach(b0, budget, 2_500_000);
  const index = new Map<number, number>(); states.forEach((l, i) => index.set(key(l), i));
  const raw = (l: L) => tableF(vs.map(v => bitsRaw(v, l)));
  const Fs = new Float64Array(states.length); let best = -1, bestL = b0;
  states.forEach((l, i) => { const f = raw(l); Fs[i] = f; if (f > best) { best = f; bestL = l; } });
  const near: L[] = []; states.forEach((l, i) => { if (Fs[i]! >= 0.9 * best) near.push(l); });
  // Rule-knowing searcher: steepest-ascent climbs with random restarts inside the reachable set, B evaluations in all.
  const r = rng("v3-search", seed); let evals = 0, found = -1, climbs = 0; const ends = new Set<number>();
  while (evals < B) {
    let cur = r.below(states.length); evals++; climbs++;
    for (;;) {
      let nb = -1, nf = Fs[cur]!;
      for (const n of neighbours(states[cur]!)) { const j = index.get(key(n)); if (j === undefined) continue; evals++; if (Fs[j]! > nf) { nf = Fs[j]!; nb = j; } }
      if (nb < 0 || evals >= B) break; cur = nb;
    }
    ends.add(cur); if (Fs[cur]! > found) found = Fs[cur]!;
  }
  return { size: states.length, capped, best, bestL, near: near.length, nearSlopes: new Set(near.map(l => `${l[0]}/${l[1]}`)).size, ratio: best > 0 ? found / best : 1, climbs, ends: ends.size };
}

/** Test 3: the best 24 distinct lines of a window, against 24 copies of the best; and how many slopes they use. */
function distinctTest(vs: Valuer[], win: L[]) {
  const sc = win.map(l => ({ l, f: tableF(vs.map(v => v.bits(l))) })).sort((x, y) => y.f - x.f);
  const top = sc.slice(0, 24); const keep = top.reduce((s, x) => s + x.f, 0) / (24 * top[0]!.f);
  return { keep, slopes: new Set(top.map(x => `${x.l[0]}/${x.l[1]}`)).size, intercepts: new Set(top.map(x => `${x.l[2]}/${x.l[1]}`)).size, top5: top.slice(0, 5).map(x => show(x.l)), best: top[0]!.f };
}

/** Test 4: scripted seats on 24 objects for 300 s. Each second each seat makes its best affordable unit move by
 * gain per ⚡ in its own points rate (n_i · Σ_{j≠i} n_j summed over objects), uniqueness enforced. */
function dynamicsTest(vs: Valuer[], seed: string) {
  const r = rng("v3-dyn", seed); const objs: L[] = []; const occ = new Set<number>();
  while (objs.length < 24) { const l = birth(r); if (!occ.has(key(l))) { occ.add(key(l)); objs.push(l); } }
  const rate = SEAT_GAME / 300; const energy = vs.map(() => 600);
  const own = (i: number, l: L) => { const ns = vs.map(v => v.bits(l)); return ns[i]! * (ns.reduce((a, b) => a + b, 0) - ns[i]!); };
  const changedLate = new Set<number>(); let movesLate = 0, idleLate = 0, moves = 0; const Ft: number[] = [];
  for (let t = 0; t < 300; t++) {
    let movedThisSecond = 0;
    for (let i = 0; i < vs.length; i++) {
      energy[i] = Math.min(1920, energy[i]! + rate);
      let pick: [number, number, L, number] | null = null;
      for (let o = 0; o < 24; o++) {
        const cur = objs[o]!, f0 = own(i, cur);
        for (const n of neighbours(cur)) {
          if (occ.has(key(n))) continue;
          const cost = moveCost(cur, n); if (cost > energy[i]!) continue;
          const g = (own(i, n) - f0) / cost;
          if (g > 0 && (!pick || g > pick[0])) pick = [g, o, n, cost];
        }
      }
      if (pick) {
        const [, o, n, cost] = pick; occ.delete(key(objs[o]!)); objs[o] = n; occ.add(key(n)); energy[i]! -= cost; moves++; movedThisSecond++;
        if (t >= 200) { changedLate.add(o); movesLate++; }
      }
    }
    if (t >= 200 && movedThisSecond === 0) idleLate++;
    if (t % 50 === 49) Ft.push(objs.reduce((s, l) => s + tableF(vs.map(v => v.bits(l))), 0));
  }
  return { moves, movesLate, changedLate: changedLate.size / 24, idleLate, Ft, slopes: new Set(objs.map(l => `${l[0]}/${l[1]}`)).size, maxH: Math.max(...objs.map(height)) };
}

/** Test 5: probes until a seat that knows its own rule identifies the others' rules from disclosed sums ± σ. */
function identTest(all: Valuer[], table: Valuer[], sigma: number, seed: string, cap = 3000) {
  const mine = table[0]!.rule.fam;
  const others = all.filter(v => v.rule.fam !== mine);
  const k = table.length - 1;
  const combos: Valuer[][] = [];
  const rec = (start: number, acc: Valuer[]) => { if (acc.length === k) { combos.push(acc); return; } for (let i = start; i < others.length; i++) if (!acc.some(a => a.rule.fam === others[i]!.rule.fam)) rec(i + 1, [...acc, others[i]!]); };
  rec(0, []);
  const truth = combos.findIndex(c => c.every(v => table.slice(1).some(t => t.rule.id === v.rule.id)));
  const r = rng("v3-ident", seed); const logp = new Float64Array(combos.length); const s = Math.max(sigma, 0.05);
  for (let probe = 1; probe <= cap; probe++) {
    const l = birth(r); const sumOf = (c: Valuer[]) => c.reduce((a, v) => a + Math.min(v.bits(l), 200), 0);
    const y = sumOf(combos[truth]!) + sigma * gauss(r);
    let mx = -Infinity;
    combos.forEach((c, i) => { logp[i]! += -((y - sumOf(c)) ** 2) / (2 * s * s); if (logp[i]! > mx) mx = logp[i]!; });
    let z = 0; for (const x of logp) z += Math.exp(x - mx);
    if (Math.exp(logp[truth]! - mx) / z >= 0.95) return { probes: probe, candidates: combos.length };
  }
  return { probes: Infinity, candidates: combos.length };
}
function gauss(r: Rng) { return Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit()); }

// ---------------------------------------------------------------- run

const N = Number(o.n);
const T6 = 5 / 3, T7 = 7;
const FAMS = families(T6, T7), RULES = rulesOf(FAMS);
let t0 = performance.now();
const smp = drawLaw(N, "a");
say(`Law: ${smp.ls.length.toLocaleString("en")} canonical tilted draws of ${N.toLocaleString("en")} (t = ${TILT}), ${((performance.now() - t0) / 1000).toFixed(0)} s`);
t0 = performance.now();
const VS = valuers(RULES, smp);
say(`Ladders for ${RULES.length} rules: ${((performance.now() - t0) / 1000).toFixed(0)} s`);
const byId = (id: string) => VS.find(v => v.rule.id === id)!;

const br = rng("v3-births");
const BIRTHS: L[] = Array.from({ length: 8 }, () => birth(br));

if (want("rules")) {
  say("\n## Rules: ramp test (windows |a|, |c| ≤ H, 1 ≤ b ≤ H), and bits within a line's share of a game\n");
  const w1 = windowLines(12), w2 = windowLines(24);
  const big = reach(BIRTHS[0]!, LINE_SHARE, 3_000_000);
  say(`Reachable lines from birth ${show(BIRTHS[0]!)} with ${LINE_SHARE} ⚡ (unit steps): ${big.states.length}${big.capped ? `+ (stopped at ${big.spent.toFixed(0)} ⚡)` : ""}`);
  const rs = BIRTHS.slice(0, 6).map(b => reach(b, LINE_SHARE));
  const reaches = rs.map(r => r.states);
  say(`The cheapest 150,000 lines from each of 6 births reach ${rs.map(r => r.spent.toFixed(0)).join(", ")} ⚡ (of ${LINE_SHARE}); 'best bits in reach' below is over these.`);
  say("| rule | top H=12 (bits @ line) | top H=24 | edge | grows | corr(bits, φ) tail | ramp | lines ≥ cap | median best bits in reach | median birth bits |");
  say("|---|---|---|---|---|---|---|---|---|---|");
  for (const v of VS) {
    const t = rampTest(v, w1, w2, 12, 24);
    const rb = reaches.map(s => s.reduce((m, l) => Math.max(m, v.bits(l)), 0));
    say(`| ${v.rule.id} | ${f1(t.b1)} @ ${show(t.t1)} | ${f1(t.b2)} @ ${show(t.t2)} | ${t.edge ? "yes" : "no"} | ${t.grows ? "yes" : "no"} | ${f2(t.c)} | ${t.ramp ? "**RAMP**" : "no"} | ${t.atCap} | ${f1(median(rb))} | ${f1(median(BIRTHS.map(l => v.bits(l))))} |`);
  }
}

const TABLES: string[][] = [
  ["whole-intercept/spf", "whole-crossing/spf", "whole-distance/spf"],                  // control: the owner's pattern, spf everywhere
  ["whole-intercept/rep", "whole-crossing/area-whole", "whole-distance/hyp-whole"],
  ["peg-line/two-pegs", "whole-at-t/next-whole", "whole-product/x-whole"],
  ["square-area/k-whole", "target-gradient/dist-whole", "whole-crossing/sq"],
  ["whole-intercept/x-whole", "peg-line/rep", "square-area/omega"],
  ["whole-distance/rep", "whole-at-t/spf", "target-gradient/k-whole"],
  ["whole-intercept/rep", "whole-crossing/area-whole", "whole-distance/hyp-whole", "peg-line/two-pegs"],
  ["whole-product/rep", "whole-at-t/next-whole", "square-area/k-whole", "target-gradient/dist-whole"],
  ["whole-intercept/spf", "whole-crossing/spf", "whole-distance/spf", "whole-at-t/spf"],  // control, 4 seats
];

if (want("tables")) {
  say("\n## Tables: tests 2–4\n");
  const win = windowLines(24);
  say("| table | reachable (3 births) | near-best (≥ 90%) states, slopes | climber in 10⁵ evals / exact (distinct climb ends) | best 24 distinct keep | slopes in top 24 | top 5 (a,b,c) | dynamics: moves, moves in last 100 s, objects moved late, idle s late, F at 50 s steps | final slopes, max height |");
  say("|---|---|---|---|---|---|---|---|---|");
  for (const ids of TABLES) {
    const vs = ids.map(byId);
    const st = BIRTHS.slice(0, 3).map((b, i) => searchTest(vs, b, LINE_SHARE, 100_000, `${ids.join()}-${i}`));
    const dt = distinctTest(vs, win);
    const dy = dynamicsTest(vs, ids.join());
    say(`| ${ids.join(" + ")} (best ${st.map(s => show(s.bestL)).join(" ")}) | ${st.map(s => s.size + (s.capped ? "+" : "")).join(", ")} | ${st.map(s => `${s.near} / ${s.nearSlopes}`).join(", ")} | ${st.map(s => `${f2(s.ratio)} (${s.ends}/${s.climbs})`).join(", ")} | ${f2(dt.keep)} | ${dt.slopes} | ${dt.top5.join(" ")} | ${dy.moves}, ${dy.movesLate}, ${f2(dy.changedLate)}, ${dy.idleLate}, ${dy.Ft.map(x => x.toFixed(0)).join("→")} | ${dy.slopes}, ${dy.maxH} |`);
  }
}

if (want("twist")) {
  say("\n## Twist: a per-object target slope (Target Gradient) against a per-game one\n");
  const win = windowLines(24);
  const Ts = [5 / 3, -2 / 7, 3 / 4, 7 / 2, -4 / 5, 1 / 6];
  for (const T of Ts) {
    const fs = families(T, T7); const rs = rulesOf(fs).filter(r => r.id === "target-gradient/k-whole" || r.id === "whole-intercept/rep" || r.id === "whole-distance/hyp-whole");
    const vs = valuers(rs, smp);
    const dt = distinctTest(vs, win);
    say(`T = ${f2(T)}: best line ${dt.top5[0]}, top 5 ${dt.top5.join(" ")}, best 24 keep ${f2(dt.keep)}, slopes ${dt.slopes}`);
  }
}

if (want("ident")) {
  say("\n## Identification under disclosed sums (σ = 0, 2, 8)\n");
  for (const ids of [TABLES[1]!, TABLES[2]!, TABLES[6]!]) {
    const vs = ids.map(byId);
    for (const sigma of [0, 2, 8]) {
      const runs = Array.from({ length: 5 }, (_, i) => identTest(VS, vs, sigma, `${ids.join()}-${sigma}-${i}`, 1500));
      say(`${ids.join(" + ")}, σ = ${sigma}: candidates ${runs[0]!.candidates}, probes ${runs.map(x => x.probes).join(", ")}`);
    }
  }
}
