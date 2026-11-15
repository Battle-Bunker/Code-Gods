/**
 * Line rules, third pass: candidate families measured against the collapse check of
 * docs/engine-v2/landscape-analysis.md §4. Analysis only: nothing here changes the dealt pool, prices or scoring.
 * The write-up is docs/engine-v2/line-rules-v3-proposals.md.
 *
 *   node --experimental-strip-types scripts/line-rules-v3.ts [--part all|rules|tables|twist|ident|entangle] [--n 1500000]
 *     [--pool v3|rational] [--moves unit|mutators]
 *
 * Object: a fraction line a·x + b·y + c = 0 (primitive, b > 0, or b = 0 < a), drawn from the line-q law
 * (each of a, b, c from its code in LINE_Q_CODES, conditioned on canonical). A rule is a primary and one secondary, both
 * real-valued, compared lexicographically; its bits at a line are −log2 π{lines at least as good}, estimated from
 * tilted draws of the law (decision 22: an empirical ladder). Prices are path-consistent unit steps on a, b or c
 * (#580): one call of "which" + a one-step argument + max(0, Δφ), charged W + 0.05·W².
 */
import { parseArgs } from "node:util";
import { rng, stepsNonzeroBits, type Rng } from "@workspace/v2-core";
import { LINE_Q_CODES } from "@workspace/v2-linear";
import { changeCharge } from "@workspace/v2-economy";

const { values: o } = parseArgs({ options: {
  part: { type: "string", default: "all" }, n: { type: "string", default: "1500000" },
  /** v3: the first pass (whole-number features); rational: the rational-native pool with tied secondaries. */
  pool: { type: "string", default: "v3" },
  /** unit: ±1 on a, b or c; mutators: the line's mutators, representation shortcuts included (decision 25). */
  moves: { type: "string", default: "unit" },
  /** pmi only: "channels" measures the perpendicular channel rules instead of the pools. */
  set: { type: "string", default: "pools" },
} });
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
// φ on line-q: LINE_Q_CODES on (a, b, c).
const { a: CA, b: CB, c: CC } = LINE_Q_CODES;
const phiL = (l: L) => CA.bits(BigInt(l[0])) + CB.bits(BigInt(l[1])) + CC.bits(BigInt(l[2]));
const key = (l: L) => ((l[0] + 4096) * 8192 + l[1]) * 8192 + (l[2] + 4096);

/** The derived numbers a rule may read (every one a representation of the same line). */
interface D {
  a: number; b: number; c: number; m: number; k: number; X: number; A: number; dist: number; hyp: number;
  /** m = p/q and c = r/s in lowest terms (q, s > 0). */
  p: number; q: number; r: number; s: number;
}
function derive(l: L): D | null {
  const [a, b, c] = l;
  if (b === 0) return null;
  const hyp = Math.hypot(a, b);
  const g1 = gcd(a, b) || 1, g2 = gcd(c, b) || 1;
  return {
    a, b, c, m: -a / b, k: -c / b, X: a !== 0 ? -c / a : NaN, A: a !== 0 && c !== 0 ? (c * c) / (2 * Math.abs(a) * b) : NaN, dist: Math.abs(c) / hyp, hyp,
    p: -a / g1 + 0, q: b / g1, r: -c / g2 + 0, s: b / g2,
  };
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
/** gcd for relation secondaries: a 0 on either side counts as no shared factor (else gcd(0, n) = n is a free ramp). */
const rgcd = (x: number, y: number) => (Math.round(x) === 0 || Math.round(y) === 0 ? 0 : gcd(Math.round(x), Math.round(y)));
const denOf = (x: number) => { for (let d = 1; d <= 100_000; d++) if (Math.abs(x * d - Math.round(x * d)) < 1e-9 * Math.max(1, Math.abs(x * d))) return d; return 100_000; };

/** The rational-native pool: every primary graded on fractions; every secondary a relation between the primary's
 * anchor and another aspect of the line (the owner's design rule, 14 November). */
function rationalFamilies(T: number, TX: number, PT: [number, number], D2: number): Fam[] {
  const fam = (id: string, name: string, text: string, P: (d: D) => number, anchor: (d: D) => number, secs: Sec[]): Fam => ({ id, name, text, P: d => fin(P(d)), anchor, secs });
  const n = (d: D) => Math.round(d.k), N = (d: D) => Math.round(d.X);
  const mediant = (d: D) => (d.p + d.r) / (d.q + d.s);
  return [
    fam("whole-intercept", "Whole Intercept", "the y-intercept is as close to a whole number as possible", d => -dZ(d.k), d => d.k, [
      { id: "gcd-floor-m", text: "that whole number and the whole part of the gradient share a big common factor (the owner's example)", f: d => rgcd(n(d), Math.floor(d.m)) },
      { id: "gcd-den-m", text: "that whole number shares a big factor with the gradient's bottom number", f: d => rgcd(n(d), d.q) },
      { id: "whole-at-n", text: "at x = that whole number, y is nearly whole too", f: d => -dZ(yAt(d, n(d))) },
    ]),
    fam("whole-crossing", "Whole Crossing", "the line crosses the x-axis as close to a whole number as possible", d => -dZ(d.X), d => d.X, [
      { id: "gcd-c", text: "that whole number shares a big factor with the nearest whole number to the y-intercept", f: d => rgcd(N(d), Math.round(d.k)) },
      { id: "gcd-num-m", text: "that whole number shares a big factor with the gradient's top number", f: d => rgcd(N(d), d.p) },
    ]),
    fam("farey-pair", "Farey Pair", "write the gradient and the y-intercept as fractions p/q and r/s: p × s and q × r differ by as close to 1 as possible", d => (d.p === 0 && d.r === 0 ? W : -Math.abs(Math.abs(d.p * d.s - d.q * d.r) - 1)), d => mediant(d), [
      { id: "mediant-mid", text: "their in-between fraction (p + r)/(q + s) is close to the average of the two", f: d => -Math.abs(mediant(d) - (d.m + d.k) / 2) },
      { id: "mediant-x", text: "their in-between fraction's bottom number shares a big factor with the x-intercept's bottom number", f: d => (Number.isFinite(d.X) ? rgcd(d.q + d.s, denOf(d.X)) : 0) },
    ]),
    fam("pell-gradient", "Root Hunter", `the gradient is as close as possible to √${D2}`, d => -Math.abs(d.m - Math.sqrt(D2)), d => d.m, [
      { id: "pell-c", text: `the gradient's leftover p² − ${D2}q² equals the y-intercept's top number`, f: d => -Math.abs(d.p * d.p - D2 * d.q * d.q - d.r) },
      { id: "share-den", text: "the y-intercept is a fraction with the gradient's bottom number (a multiple of 1/q)", f: d => -dZ(d.k * d.q) },
    ]),
    fam("whole-area", "Whole Area", "the triangle the line makes with the axes has an area as close to a whole number as possible", d => -dZ(d.A), d => d.A, [
      { id: "gcd-x", text: "that whole number shares a big factor with the nearest whole number to the x-intercept", f: d => rgcd(Math.round(d.A), Math.round(d.X)) },
      { id: "gcd-den-m", text: "that whole number shares a big factor with the gradient's bottom number", f: d => rgcd(Math.round(d.A), d.q) },
    ]),
    fam("whole-at-t", "Whole at x = T", `at the dealt x = ${f2(TX)}, y is as close to a whole number as possible`, d => -dZ(yAt(d, TX)), d => yAt(d, TX), [
      { id: "gcd-c", text: "that whole number shares a big factor with the nearest whole number to the y-intercept", f: d => rgcd(Math.round(yAt(d, TX)), Math.round(d.k)) },
      { id: "gcd-den-m", text: "that whole number shares a big factor with the gradient's bottom number", f: d => rgcd(Math.round(yAt(d, TX)), d.q) },
    ]),
    fam("target-gradient", "Target Gradient", `the gradient is as close as possible to the dealt T = ${f2(T)}`, d => -Math.abs(d.m - T), d => d.m, [
      { id: "gcd-tops", text: "the gradient's and the y-intercept's top numbers share a big factor", f: d => rgcd(d.p, d.r) },
      { id: "same-den", text: "the y-intercept's bottom number shares a big factor with the gradient's", f: d => rgcd(d.q, d.s) },
    ]),
    fam("near-point", "Near the Point", `the line passes as close as possible to the dealt point (${f2(PT[0])}, ${f2(PT[1])})`, d => -Math.abs(yAt(d, PT[0]) - PT[1]), d => yAt(d, PT[0]), [
      { id: "lattice", text: "the line's whole-number point nearest the dealt point is close to it", f: d => {
        let best = 50;
        for (let x = Math.floor(PT[0]) - 40; x <= Math.ceil(PT[0]) + 40; x++) { const y = yAt(d, x); if (Math.abs(y - Math.round(y)) < 1e-9) best = Math.min(best, Math.hypot(x - PT[0], y - PT[1])); }
        return -best;
      } },
      { id: "gcd-x", text: "the nearest whole numbers to the x-intercept and to y at the point share a big factor", f: d => rgcd(Math.round(d.X), Math.round(yAt(d, PT[0]))) },
    ]),
  ];
}
/** 7-smooth numbers (only 2, 3, 5 and 7 as prime factors), sorted, and the nearest one (sign kept) to x. */
const SMOOTH: number[] = (() => { const out: number[] = []; for (let a = 1; a <= 1e12; a *= 2) for (let b = a; b <= 1e12; b *= 3) for (let c = b; c <= 1e12; c *= 5) for (let d = c; d <= 1e12; d *= 7) out.push(d); return out.sort((x, y) => x - y); })();
function nearestSmooth(x: number): number {
  const ax = Math.abs(x); let lo = 0, hi = SMOOTH.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (SMOOTH[mid]! < ax) lo = mid + 1; else hi = mid; }
  const cands = [SMOOTH[lo]!, SMOOTH[Math.max(0, lo - 1)]!];
  const best = cands.reduce((a, b) => (Math.abs(b - ax) < Math.abs(a - ax) ? b : a));
  return x < 0 ? -best : best;
}
const omegaOfGcd = (x: number, y: number) => { const g = rgcd(x, y); return g <= 1 ? 0 : bigOmega(g); };

/** Adversaries for the beginner pool's big-prime hills (owner decision 30): same anchors, opposite pulls. */
function adversaryFamilies(): Fam[] {
  const fam = (id: string, name: string, text: string, P: (d: D) => number, anchor: (d: D) => number, secs: Sec[]): Fam => ({ id, name, text, P: d => fin(P(d)), anchor, secs });
  return [
    fam("smooth-intercept", "Smooth Intercept", "the y-intercept as close as possible to a number made only from 2s, 3s, 5s and 7s", d => -Math.abs(d.k - nearestSmooth(d.k)), d => nearestSmooth(d.k), [
      { id: "shares-x", text: "that number and the whole number nearest the x-intercept share as many prime factors as possible (with repeats)", f: d => (Number.isFinite(d.X) ? omegaOfGcd(nearestSmooth(d.k), Math.round(d.X)) : 0) },
      { id: "omega", text: "that number has as many prime factors as possible (anchor only; for comparison)", f: d => bigOmega(nearestSmooth(d.k)) },
    ]),
    fam("smooth-crossing", "Smooth Crossing", "the x-axis crossing as close as possible to a number made only from 2s, 3s, 5s and 7s", d => -Math.abs(d.X - nearestSmooth(d.X)), d => nearestSmooth(d.X), [
      { id: "shared-factors", text: "that number and the whole number nearest the y-intercept share as many prime factors as possible (with repeats)", f: d => (Number.isFinite(d.X) ? omegaOfGcd(nearestSmooth(d.X), Math.round(d.k)) : W) },
    ]),
    fam("close-crossing", "Close Crossing", "the line crosses the x-axis as close as possible to 0, but not at 0", d => (d.c === 0 || !Number.isFinite(d.X) ? W : -Math.abs(d.X)), d => d.X, [
      { id: "steep-shared", text: "the gradient's top number and the y-intercept's top number share as many prime factors as possible (with repeats)", f: d => omegaOfGcd(d.p, d.r) },
    ]),
    fam("smooth-gradient", "Smooth Gradient", "the gradient as close as possible to a number made only from 2s, 3s, 5s and 7s", d => -Math.abs(d.m - nearestSmooth(d.m)), d => nearestSmooth(d.m), [
      { id: "shares-c", text: "that number and the whole number nearest the y-intercept share as many prime factors as possible (with repeats)", f: d => omegaOfGcd(nearestSmooth(d.m), Math.round(d.k)) },
    ]),
    fam("steep-and-tall", "Steep and Tall", "the gradient and the y-intercept both positive and both as big as possible: the smaller of the two counts", d => Math.min(d.m, d.k), d => Math.min(d.m, d.k), [
      { id: "shared", text: "the whole parts of the gradient and the y-intercept share as many prime factors as possible (with repeats)", f: d => omegaOfGcd(Math.floor(d.m), Math.floor(d.k)) },
    ]),
    fam("sunken-intercept", "Sunken Intercept", "the y-intercept below zero, as far below as possible", d => -d.k, d => d.k, [
      { id: "shares-p", text: "the whole number nearest the y-intercept and the gradient's top number share as many prime factors as possible (with repeats)", f: d => omegaOfGcd(Math.round(d.k), d.p) },
    ]),
    fam("smooth-root", "Smooth Square", "the triangle with the axes has an area as close as possible to a square number", d => -dZ(Math.sqrt(d.A)), d => Math.sqrt(d.A), [
      { id: "root-shares-x", text: "that square's root and the whole number nearest the x-intercept share as many prime factors as possible (with repeats)", f: d => (Number.isFinite(d.X) ? omegaOfGcd(Math.round(Math.sqrt(d.A)), Math.round(d.X)) : W) },
    ]),
  ];
}
const rulesOf = (fs: Fam[]): Rule[] => fs.flatMap(f => f.secs.map(s => ({ id: `${f.id}/${s.id}`, fam: f.id, P: f.P, S: (d: D) => fin(s.f(d)) })));

// ---------------------------------------------------------------- the law and the ladders

const TILT = 0.55;
interface Sample { ls: L[]; logw: Float64Array; total: number }
function drawLaw(n: number, seed: string): Sample {
  const r = rng("v3-law", seed), z = CA.log2Norm(TILT) + CB.log2Norm(TILT) + CC.log2Norm(TILT);
  const ls: L[] = [], lw: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Number(CA.sample(r, TILT)), b = Number(CB.sample(r, TILT)), c = Number(CC.sample(r, TILT));
    const l = canon(a, b, c);
    if (!l || l[0] !== a || l[1] !== b || l[2] !== c || Math.max(Math.abs(a), b, Math.abs(c)) > 4000) continue;
    ls.push(l); lw.push(-(1 - TILT) * phiL(l) + z);
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

const WHICH = Math.log2(9);
const UNIT = WHICH + stepsNonzeroBits(1n);
/** The price of a move: its call bits w plus the surcharge max(0, Δφ), charged W + 0.05·W². */
const chargeOf = (from: L, to: L, w: number) => changeCharge([w + Math.max(0, phiL(to) - phiL(from))]);
type Move = { l: L; w: number; kind: string };
const ok = (c: L | null): c is L => !!c && Math.max(Math.abs(c[0]), c[1], Math.abs(c[2])) < 4000;
/** Size σ of an amount p/q: |p| + q − 1, priced by steps (v2-core amountSize). */
const amountBits = (kn: number, kd: number) => stepsNonzeroBits(BigInt(Math.abs(kn) + kd - 1));
/** y = mx + c from m = mn/md and c = cn/cd, as a canonical triple. */
const fromMC = (mn: number, md: number, cn: number, cd: number) => canon(-mn * cd, md * cd, -cn * md);
function moves(l: L): Move[] {
  const out: Move[] = [];
  const add = (c: L | null, w: number, kind: string) => { if (ok(c) && key(c) !== key(l)) out.push({ l: c, w, kind }); };
  if (o.moves !== "mutators") {
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const v = [...l] as number[]; v[i]! += s; add(canon(v[0]!, v[1]!, v[2]!), UNIT, "unit"); }
    return out;
  }
  const [a, b, c] = l;
  // nudge one of a, b, c by ±1 (refused when the result has a common factor or turns over)
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const v = [a, b, c]; v[i]! += s; if (gcd(gcd(v[0]!, v[1]!), v[2]!) === 1 && v[1]! >= 0 && !(v[1] === 0 && v[0]! <= 0)) add(canon(v[0]!, v[1]!, v[2]!), WHICH + Math.log2(3) + amountBits(1, 1), "nudge"); }
  // mirror in x, y, the origin, y = x: a choice of four, no size
  for (const t of [[a, -b, c], [-a, b, c], [-a, -b, c], [b, a, c]] as const) add(canon(t[0], t[1], t[2]), WHICH + 2, "mirror");
  if (b === 0) return out;
  // m = mn/md, c = cn/cd with md = cd = b
  const mn = -a, cn = -c, den = b;
  for (const [kn, kd] of [[1, 1], [-1, 1], [1, 2], [-1, 2]] as const) {
    add(fromMC(mn, den, cn * kd + kn * den, den * kd), WHICH + amountBits(kn, kd), "shift");
    add(fromMC(mn * kd + kn * den, den * kd, cn, den), WHICH + amountBits(kn, kd), "tilt");
  }
  for (const x0 of [-1, 1, 2]) for (const kn of [1, -1]) add(fromMC(mn + kn * den, den, cn - kn * x0 * den, den), WHICH + Math.log2(5) + amountBits(kn, 1), "pivot");
  // stretch every output by a factor (priced by digits, about the factor's code length)
  for (const [fn, fd] of [[2, 1], [1, 2], [3, 1], [1, 3]] as const) add(fromMC(mn * fn, den * fd, cn * fn, den * fd), WHICH + 2 + Math.log2(fn + fd), "stretch");
  // move one intercept by ±1, keeping the other
  if (a !== 0 && c !== 0) for (const s of [1, -1]) {
    // x/P + y/R = 1 with P = −c/a, R = −c/b
    const Pn = -c, Pd = a, Rn = -c, Rd = b;
    const viaPR = (pn: number, pd: number, rn: number, rd: number) => (pn === 0 || rn === 0 ? null : canon(pd * rn, rd * pn, -pn * rn));
    add(viaPR(Pn + s * Pd, Pd, Rn, Rd), WHICH + 1 + amountBits(1, 1), "move");
    add(viaPR(Pn, Pd, Rn + s * Rd, Rd), WHICH + 1 + amountBits(1, 1), "move");
  }
  return out;
}
const neighbours = (l: L): L[] => moves(l).map(m => m.l);
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
    for (const mv of moves(l)) { const n = mv.l; const nd = d + chargeOf(l, n, mv.w); const nk = key(n); if (nd <= budget && nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); push([nd, n]); } }
  }
  return { states, capped: false, spent: budget };
}
function birth(r: Rng): L { for (;;) { const a = Number(CA.sample(r)), b = Number(CB.sample(r)), c = Number(CC.sample(r)); const l = canon(a, b, c); if (l && l[0] === a && l[1] === b && l[2] === c && b > 0) return l; } }

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
  const { states, capped } = reach(b0, budget, o.moves === "mutators" ? 1_000_000 : 2_500_000);
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
 * gain per energy in its own points rate (n_i · Σ_{j≠i} n_j summed over objects), uniqueness enforced. */
function dynamicsTest(vs0: Valuer[], seed: string, opt: { phase?: (t: number) => Valuer[]; rebirthEvery?: number } = {}) {
  let vs = vs0;
  const r = rng("v3-dyn", seed); const objs: L[] = []; const occ = new Set<number>();
  while (objs.length < 24) { const l = birth(r); if (!occ.has(key(l))) { occ.add(key(l)); objs.push(l); } }
  const rate = SEAT_GAME / 300; const energy = vs.map(() => 600);
  const own = (i: number, l: L) => { const ns = vs.map(v => v.bits(l)); return ns[i]! * (ns.reduce((a, b) => a + b, 0) - ns[i]!); };
  const changedLate = new Set<number>(); let movesLate = 0, idleLate = 0, nMoves = 0; const Ft: number[] = [];
  /** destroyed[i][j]: bits seat i's moves took from seat j (summed over moves that lowered j). */
  const destroyed = vs.map(() => vs.map(() => 0)); const movesBy = vs.map(() => 0);
  const movedAt = new Map<number, number>();
  for (let t = 0; t < 300; t++) {
    if (opt.phase) vs = opt.phase(t);
    if (opt.rebirthEvery && t > 0 && t % opt.rebirthEvery === 0) {
      // A death and a birth: the object worth least to the table is replaced by a newborn.
      let worst = 0, wf = Infinity; objs.forEach((l, o) => { const f = tableF(vs.map(v => v.bits(l))); if (f < wf) { wf = f; worst = o; } });
      let nb = birth(r); while (occ.has(key(nb))) nb = birth(r);
      occ.delete(key(objs[worst]!)); objs[worst] = nb; occ.add(key(nb));
    }
    let movedThisSecond = 0;
    for (let i = 0; i < vs.length; i++) {
      energy[i] = Math.min(1920, energy[i]! + rate);
      let pick: [number, number, L, number] | null = null;
      for (let o = 0; o < 24; o++) {
        const cur = objs[o]!, f0 = own(i, cur);
        for (const mv of moves(cur)) {
          const n = mv.l;
          if (occ.has(key(n))) continue;
          const cost = chargeOf(cur, n, mv.w); if (cost > energy[i]!) continue;
          const g = (own(i, n) - f0) / cost;
          if (g > 0 && (!pick || g > pick[0])) pick = [g, o, n, cost];
        }
      }
      if (pick) {
        const [, o, n, cost] = pick;
        vs.forEach((v, j) => { const d = v.bits(n) - v.bits(objs[o]!); if (j !== i && d < 0) destroyed[i]![j]! -= d; });
        movesBy[i]!++;
        occ.delete(key(objs[o]!)); objs[o] = n; occ.add(key(n)); energy[i]! -= cost; nMoves++; movedThisSecond++;
        if (t >= 200) { changedLate.add(o); movesLate++; }
        movedAt.set(o, (movedAt.get(o) ?? 0) + 1);
      }
    }
    if (t >= 200 && movedThisSecond === 0) idleLate++;
    if (t % 50 === 49) Ft.push(objs.reduce((s, l) => s + tableF(vs.map(v => v.bits(l))), 0));
  }
  const seatBits = vs.map(v => objs.reduce((a, l) => a + v.bits(l), 0));
  const maxX = Math.max(...objs.map(l => { const d = derive(l); return d && Number.isFinite(d.X) ? Math.abs(d.X) : 0; }));
  return { touched: movedAt.size, destroyed, movesBy, seatBits, maxX, moves: nMoves, movesLate, changedLate: changedLate.size / 24, idleLate, Ft, slopes: new Set(objs.map(l => `${l[0]}/${l[1]}`)).size, maxH: Math.max(...objs.map(height)) };
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
const RATIONAL = o.pool === "rational";
const RT = 5 / 3, RTX = 3 / 2, RPT: [number, number] = [2, 7 / 3], RD = 2;
const FAMS = RATIONAL ? rationalFamilies(RT, RTX, RPT, RD) : families(T6, T7), RULES = rulesOf(FAMS);
say(`Pool: ${o.pool}; moves: ${o.moves}`);
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
  const big = reach(BIRTHS[0]!, LINE_SHARE, o.moves === "mutators" ? 1_000_000 : 3_000_000);
  say(`Reachable lines from birth ${show(BIRTHS[0]!)} with ${LINE_SHARE} energy (unit steps): ${big.states.length}${big.capped ? `+ (stopped at ${big.spent.toFixed(0)} energy)` : ""}`);
  const rs = BIRTHS.slice(0, 6).map(b => reach(b, LINE_SHARE));
  const reaches = rs.map(r => r.states);
  say(`The cheapest 150,000 lines from each of 6 births reach ${rs.map(r => r.spent.toFixed(0)).join(", ")} energy (of ${LINE_SHARE}); 'best bits in reach' below is over these.`);
  say("| rule | top H=12 (bits @ line) | top H=24 | edge | grows | corr(bits, φ) tail | ramp | lines ≥ cap | median best bits in reach | median birth bits |");
  say("|---|---|---|---|---|---|---|---|---|---|");
  for (const v of VS) {
    const t = rampTest(v, w1, w2, 12, 24);
    const rb = reaches.map(s => s.reduce((m, l) => Math.max(m, v.bits(l)), 0));
    say(`| ${v.rule.id} | ${f1(t.b1)} @ ${show(t.t1)} | ${f1(t.b2)} @ ${show(t.t2)} | ${t.edge ? "yes" : "no"} | ${t.grows ? "yes" : "no"} | ${f2(t.c)} | ${t.ramp ? "**RAMP**" : "no"} | ${t.atCap} | ${f1(median(rb))} | ${f1(median(BIRTHS.map(l => v.bits(l))))} |`);
  }
}

const TABLES: string[][] = RATIONAL ? [
  ["whole-intercept/gcd-floor-m", "whole-crossing/gcd-c", "target-gradient/gcd-tops"],   // the owner's example in a table
  ["whole-intercept/gcd-den-m", "farey-pair/mediant-mid", "pell-gradient/share-den"],
  ["whole-area/gcd-x", "whole-at-t/gcd-c", "near-point/lattice"],
  ["farey-pair/mediant-x", "near-point/gcd-x", "whole-crossing/gcd-num-m"],
  ["pell-gradient/pell-c", "whole-intercept/whole-at-n", "whole-area/gcd-den-m"],
  ["target-gradient/same-den", "whole-at-t/gcd-den-m", "farey-pair/mediant-mid"],
  ["whole-intercept/gcd-floor-m", "whole-crossing/gcd-c", "target-gradient/gcd-tops", "near-point/lattice"],
  ["farey-pair/mediant-mid", "pell-gradient/share-den", "whole-area/gcd-x", "whole-at-t/gcd-c"],
] : [
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

if (want("twist") && !RATIONAL) {
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
  for (const ids of [TABLES[1]!, TABLES[2]!, TABLES[RATIONAL ? 7 : 6]!]) {
    const vs = ids.map(byId);
    for (const sigma of [0, 2, 8]) {
      const runs = Array.from({ length: 5 }, (_, i) => identTest(VS, vs, sigma, `${ids.join()}-${sigma}-${i}`, 1500));
      say(`${ids.join(" + ")}, σ = ${sigma}: candidates ${runs[0]!.candidates}, probes ${runs.map(x => x.probes).join(", ")}`);
    }
  }
}

if (want("entangle")) {
  // Entanglement: random moves from states along random walks from births; for each pair of rules, how their bits
  // change together. fight = P(B falls | A rises), coexist = P(B rises | A rises); and for each mutator, the mean |Δbits|
  // it does to each rule (where collateral damage flows).
  say("\n## Entanglement (random moves from states along short random walks from births)\n");
  const r = rng("v3-entangle"); const reps = FAMS.map(f => byId(`${f.id}/${f.secs[0]!.id}`));
  const dels: number[][] = []; const kinds: string[] = [];
  for (let walk = 0; walk < 300; walk++) {
    let l = birth(r);
    for (let step = 0; step < 30; step++) {
      const ms = moves(l); if (!ms.length) break;
      const mv = ms[r.below(ms.length)]!;
      dels.push(reps.map(v => v.bits(mv.l) - v.bits(l))); kinds.push(mv.kind);
      l = mv.l;
    }
  }
  say(`${dels.length} moves. Cell (A row, B column): fight % / coexist % (of the moves that raise A, the share that lower / raise B).\n`);
  say(`| A \\ B | ${reps.map(v => v.rule.fam).join(" | ")} |`); say(`|---|${reps.map(() => "---").join("|")}|`);
  reps.forEach((_, i) => {
    const up = dels.filter(d => d[i]! > 1e-9);
    say(`| ${reps[i]!.rule.id} (${up.length}) | ${reps.map((_, j) => i === j ? "–" : `${Math.round(100 * up.filter(d => d[j]! < -1e-9).length / Math.max(1, up.length))} / ${Math.round(100 * up.filter(d => d[j]! > 1e-9).length / Math.max(1, up.length))}`).join(" | ")} |`);
  });
  say("\nMean |Δbits| a move of each kind does to each rule:\n");
  const ks = [...new Set(kinds)];
  say(`| mutator (moves) | ${reps.map(v => v.rule.fam).join(" | ")} |`); say(`|---|${reps.map(() => "---").join("|")}|`);
  for (const k of ks) { const ds = dels.filter((_, i) => kinds[i] === k); say(`| ${k} (${ds.length}) | ${reps.map((_, j) => f1(ds.reduce((s, d) => s + Math.abs(d[j]!), 0) / ds.length)).join(" | ")} |`); }
}

if (want("adversary")) {
  // Bits along the climbs the big-prime rules make, for the climbers and the proposed adversaries.
  say("\n## Adversaries: bits along big-prime climbs\n");
  const climbers = rulesOf(families(T6, T7)).filter(r => ["whole-crossing/spf", "square-area/spf", "whole-intercept/spf"].includes(r.id));
  const vs = valuers([...climbers, ...rulesOf(adversaryFamilies())], smp);
  const primes = [11, 23, 47, 97, 191, 367, 733, 1471];
  const paths: [string, (p: number) => L][] = [
    ["stretch case y = −2x + 2p (crossing p, area root p)", p => canon(2, 1, -2 * p)!],
    ["y = −x + p (c = p, crossing p)", p => canon(1, 1, -p)!],
    ["smooth path y = −2x + 2·2^k (crossing 2^k)", p => canon(2, 1, -2 * 2 ** Math.round(Math.log2(p)))!],
    ["steep path y = 2^k·x + 2^k", p => canon(-(2 ** Math.round(Math.log2(p))), 1, -(2 ** Math.round(Math.log2(p))))!],
  ];
  for (const [name, f] of paths) {
    say(`### ${name}\n`);
    say(`| rule | ${primes.map(p => `p≈${p}`).join(" | ")} | bits per doubling |`); say(`|---|${primes.map(() => "---").join("|")}|---|`);
    for (const v of vs) {
      const b = primes.map(p => v.bits(f(p)));
      say(`| ${v.rule.id} | ${b.map(f1).join(" | ")} | ${f1((b[b.length - 1]! - b[0]!) / Math.log2(primes[primes.length - 1]! / primes[0]!))} |`);
    }
    say();
  }
  say(`Median bits of each rule at 200 births: ${vs.map(v => `${v.rule.id} ${f1(median(Array.from({ length: 200 }, (_, i) => v.bits(birth(rng("adv-birth", i))))))}`).join("; ")}`);
}

if (want("contest")) {
  // The stretch-case climbers with and without an adversary seated (owner decision 30: adversaries to expensive climbs).
  say("\n## Contest: the big-prime climbers with and without an adversary\n");
  const climberIds = ["whole-crossing/spf", "square-area/spf", "whole-intercept/spf"];
  const all = valuers([...rulesOf(families(T6, T7)).filter(r => climberIds.includes(r.id)), ...rulesOf(adversaryFamilies())], smp);
  const get = (id: string) => all.find(v => v.rule.id === id)!;
  const configs: [string, string[]][] = [
    ["climbers alone", climberIds],
    ["+ Smooth Crossing", [...climberIds, "smooth-crossing/shared-factors"]],
    ["+ Steep and Tall", [...climberIds, "steep-and-tall/shared"]],
    ["+ Smooth Square", [...climberIds, "smooth-root/root-shares-x"]],
    ["two climbers + Smooth Crossing + Steep and Tall", ["whole-crossing/spf", "square-area/spf", "smooth-crossing/shared-factors", "steep-and-tall/shared"]],
  ];
  for (const [name, ids] of configs) {
    for (const seed of ["s1", "s2"]) {
      const vs = ids.map(get); const dy = dynamicsTest(vs, `contest-${seed}`);
      say(`**${name}** (${seed}): seat bits at the end ${ids.map((id, i) => `${id} ${f1(dy.seatBits[i]!)}`).join(", ")}; moves by seat ${dy.movesBy.join(", ")}; largest |crossing| ${f1(dy.maxX)}; F ${dy.Ft.map(x => x.toFixed(0)).join("→")}; objects moved in the last 100 s ${f2(dy.changedLate)}`);
      say(`  bits destroyed (row seat's moves → column seat): ${dy.destroyed.map((row, i) => `${ids[i]} → [${row.map(f1).join(", ")}]`).join("; ")}`);
    }
  }
}

if (want("flatlaw")) {
  // A flatter law near 0 and ±1 (proposal only): each coordinate with |n| ≤ 1 costs δ more bits, the rest renormalised.
  // Measured by reweighting the same draws: tops of the bounded rules, where they sit, and the share of vertical lines.
  say("\n## A flatter law at 0 and ±1 (reweighted draws)\n");
  const ids = ["whole-intercept/rep", "whole-intercept/x-whole", "whole-crossing/sq", "whole-crossing/area-whole", "whole-distance/hyp-whole", "square-area/k-whole", "peg-line/two-pegs", "whole-at-t/next-whole", "whole-product/x-whole", "whole-intercept/spf"];
  const rules = rulesOf(families(T6, T7)).filter(r => ids.includes(r.id));
  const win = windowLines(24);
  for (const delta of [0, 2, 4, 6]) {
    const lw = Float64Array.from(smp.logw, (w, i) => w - delta * smp.ls[i]!.filter(x => Math.abs(x) <= 1).length);
    const s2: Sample = { ls: smp.ls, logw: lw, total: lw.reduce((a, x) => a + 2 ** x, 0) };
    const vertical = smp.ls.reduce((a, l, i) => a + (l[1] === 0 ? 2 ** lw[i]! : 0), 0) / s2.total;
    const vs = valuers(rules, s2);
    say(`δ = ${delta}: vertical share ${f2(100 * vertical)}%; tops (window 24): ${vs.map(v => { const tb = win.reduce((m, l) => Math.max(m, v.bits(l)), 0); const t = win.filter(l => v.bits(l) >= tb - 1e-9).reduce((a, l) => (height(l) < height(a) ? l : a)); return `${v.rule.id} ${f1(tb)} @ ${show(t)}`; }).join("; ")}`);
  }
}

if (want("unfreeze")) {
  // What unfreezes play: opposing seats, a drifting dealt target, births and deaths. Rational pool, mutator moves.
  say("\n## Unfreezing play\n");
  const base = ["whole-intercept/gcd-den-m", "farey-pair/mediant-x", "target-gradient/gcd-tops"];
  const drift = [5 / 3, 3 / 4, -2 / 5, 7 / 2, 1 / 3, -3 / 2];
  const phases = drift.map(T => valuers(rulesOf(rationalFamilies(T, RTX, RPT, RD)).filter(r => base.includes(r.id)), smp));
  const fixed = phases[0]!;
  const report = (name: string, dy: ReturnType<typeof dynamicsTest>) => say(`**${name}**: F ${dy.Ft.map(x => x.toFixed(0)).join("→")}; objects moved in the last 100 s ${f2(dy.changedLate)}; objects ever moved ${dy.touched}/24; moves ${dy.moves}`);
  for (const seed of ["u1", "u2"]) {
    report(`fixed (${seed})`, dynamicsTest(fixed, seed));
    report(`target T redrawn every 50 s (${seed})`, dynamicsTest(fixed, seed, { phase: t => phases[Math.floor(t / 50) % phases.length]! }));
    report(`a death and a birth every 10 s (${seed})`, dynamicsTest(fixed, seed, { rebirthEvery: 10 }));
  }
}

if (want("pmi")) {
  // Owner decision 39: seated rules should be near-perpendicular value vectors, so that joint rarity ≈ the sum of bits.
  // For each pair and depth d, PMI = log2 π(U_A ∩ U_B) / (π(U_A) π(U_B)), U_r = the lines worth ≥ d bits to r.
  // 0 = independent; > 0 = aligned (one structure paid twice); < 0 = in tension (hard to hold both).
  say("\n## PMI of upper sets (owner decision 39)\n");
  const ids = [
    "whole-crossing/spf", "square-area/spf", "whole-intercept/spf", "whole-intercept/rep", "target-gradient/k-whole",
  ];
  const base = rulesOf(families(T6, T7)).filter(r => ids.includes(r.id));
  const ratIds = ["whole-intercept/gcd-den-m", "whole-crossing/gcd-num-m", "farey-pair/mediant-x", "pell-gradient/pell-c", "whole-area/gcd-den-m", "whole-at-t/gcd-den-m", "target-gradient/gcd-tops", "near-point/lattice"];
  const rat = rulesOf(rationalFamilies(RT, RTX, RPT, RD)).filter(r => ratIds.includes(r.id)).map(r => ({ ...r, id: `q:${r.id}` }));
  const adv = rulesOf(adversaryFamilies()).filter(r => !r.id.endsWith("/omega"));
  // Channel rules: each reads one coordinate of ax + by + c = 0 and one prime's exponent, which the mixed code draws
  // independently (owner decision 39's "perpendicular value vectors").
  const vp = (n: number, p: number) => { n = Math.abs(Math.round(n)); if (n === 0) return 0; let k = 0; while (n % p === 0) { n /= p; k++; } return k; };
  const ch = (id: string, P: (d: D) => number, S: (d: D) => number): Rule => ({ id, fam: id.split("/")[0]!, P, S });
  const channels: Rule[] = [
    ch("twos-in-a/rest", d => vp(d.a, 2), d => -Math.abs(d.a) / 2 ** vp(d.a, 2)),
    ch("threes-in-b/rest", d => vp(d.b, 3), d => -d.b / 3 ** vp(d.b, 3)),
    ch("fives-in-c/rest", d => vp(d.c, 5), d => -Math.abs(d.c) / 5 ** vp(d.c, 5)),
    ch("twos-in-c/rest", d => vp(d.c, 2), d => -Math.abs(d.c) / 2 ** vp(d.c, 2)),
    ch("big-prime-c/size", d => -dZ(0) + (spf(d.c) === Math.abs(d.c) && Math.abs(d.c) > 1 ? 1 : 0), d => spf(d.c)),
  ];
  const vs = valuers(o.set === "channels" ? channels : [...base, ...rat, ...adv], smp);
  const n = smp.ls.length; const w = Float64Array.from(smp.logw, x => 2 ** x); const tot = smp.total;
  const B = vs.map(v => Float64Array.from(smp.ls, l => v.bits(l)));
  for (const depth of [4, 8]) {
    say(`### depth ${depth} bits (cells: PMI in bits; blank where the joint set has under 30 draws)\n`);
    const inU = B.map(b => { const u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = b[i]! >= depth ? 1 : 0; return u; });
    const mass = inU.map(u => { let m = 0; for (let i = 0; i < n; i++) if (u[i]) m += w[i]!; return m / tot; });
    const short = (id: string) => id.replace("q:", "").replace(/\/.*$/, "").split("-").map(x => x[0]).join("") + "/" + id.split("/")[1]!.slice(0, 6);
    say(`| A \\ B (mass bits) | ${vs.map(v => short(v.rule.id)).join(" | ")} |`); say(`|---|${vs.map(() => "---").join("|")}|`);
    const strong: string[] = [];
    vs.forEach((a, i) => {
      const cells = vs.map((b, j) => {
        if (i === j) return "–";
        let m = 0, cnt = 0; for (let k = 0; k < n; k++) if (inU[i]![k] && inU[j]![k]) { m += w[k]!; cnt++; }
        if (cnt < 30) return "";
        const pmi = Math.log2((m / tot) / (mass[i]! * mass[j]!));
        if (j > i && Math.abs(pmi) >= 2) strong.push(`${a.rule.id} × ${b.rule.id}: ${f1(pmi)}`);
        return f1(pmi);
      });
      say(`| ${a.rule.id} (${f1(-Math.log2(mass[i]!))}) | ${cells.join(" | ")} |`);
    });
    say(`\n|PMI| ≥ 2 at depth ${depth}: ${strong.join("; ") || "none"}\n`);
  }
}

// ---------------------------------------------------------------- parameterised families (owner decisions 40, 41)
//
// A rule = a lens (a way to turn the line into a number) × a qualifier (a dealt property of whole numbers) for the
// primary, and a tied secondary: the qualifying whole number the primary snaps to, against the whole number nearest
// another lens, compared by how many trailing digits (in a dealt base) they share. Every part carries named parameters.

type Lens = { id: string; text: string; f: (d: D) => number };
type Qual = { id: string; text: string; test: (n: number) => boolean };
const isPrimeN = (n: number) => { n = Math.abs(n); return n >= 2 && spf(n) === n; };
const LENSES: Lens[] = [
  { id: "c", text: "the y-intercept", f: d => d.k },
  { id: "X", text: "where the line crosses the x-axis", f: d => d.X },
  { id: "m", text: "the gradient", f: d => d.m },
  ...[2, 3, 5, 7].map(t => ({ id: `y@${t}`, text: `the height of the line at x = ${t}`, f: (d: D) => yAt(d, t) })),
  ...[1, 2, 5].map(h => ({ id: `x@${h}`, text: `where the line reaches height ${h}`, f: (d: D) => (d.m === 0 ? NaN : (h - d.k) / d.m) })),
  { id: "A", text: "the area of the triangle the line makes with the axes", f: d => d.A },
];
const QUALS: Qual[] = [
  ...[1, 3, 7, 9].map(k => ({ id: `prime-ending-${k}`, text: `a prime ending in ${k}`, test: (n: number) => isPrimeN(n) && Math.abs(n) % 10 === k })),
  ...([[4, 3], [5, 2], [7, 3], [8, 5], [9, 4], [11, 6], [12, 7]] as const).map(([q, r]) => ({ id: `prime-${r}-mod-${q}`, text: `a prime that leaves ${r} when divided by ${q}`, test: (n: number) => isPrimeN(n) && Math.abs(n) % q === r })),
  ...[2, 3, 4].map(k => ({ id: `${k}-primes`, text: `a number made of exactly ${k} primes multiplied together (repeats count)`, test: (n: number) => Math.abs(n) >= 2 && bigOmega(n) === k })),
  ...[2, 3].map(e => ({ id: `power-${e}`, text: e === 2 ? "a square number (not 0 or 1)" : "a cube number (not 0 or 1)", test: (n: number) => { const a = Math.abs(n); const r = Math.round(a ** (1 / e)); return a >= 2 && r ** e === a; } })),
  ...([[3, 2], [7, 2], [5, 2], [2, 4]] as const).map(([p, e]) => ({ id: `multiple-of-${p ** e}`, text: `a multiple of ${p ** e} (not 0)`, test: (n: number) => n !== 0 && n % p ** e === 0 })),
  ...[2, 3, 4].map(B => ({ id: `repdigit-base-${B + 1}`, text: `a number whose digits are all the same when written in base ${B + 1} (at least two digits)`, test: (n: number) => { let a = Math.abs(n); if (a < B + 1) return false; const d0 = a % (B + 1); while (a > 0) { if (a % (B + 1) !== d0) return false; a = Math.floor(a / (B + 1)); } return true; } })),
  ...[5, 7].map(P => ({ id: `smooth-${P}`, text: `a number whose prime factors are all ${P} or less (not 0 or 1)`, test: (n: number) => { const a = Math.abs(n); return a >= 2 && factor(a).every(p => p <= P); } })),
];
const BASES = [10, 2, 3];
function nearestQual(v: number, q: Qual, R = 3000): number {
  if (!Number.isFinite(v)) return NaN;
  const r0 = Math.round(v);
  for (let k = 0; k <= R; k++) {
    const lo = r0 - k, hi = r0 + k;
    const a = q.test(lo), b = k > 0 && q.test(hi);
    if (a && b) return Math.abs(v - lo) <= Math.abs(v - hi) ? lo : hi;
    if (a) return lo; if (b) return hi;
  }
  return NaN;
}
const trailingMatch = (x: number, y: number, B: number) => { x = Math.abs(Math.round(x)); y = Math.abs(Math.round(y)); if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return 0; let k = 0; while ((x > 0 || y > 0) && x % B === y % B && k < 60) { k++; x = Math.floor(x / B); y = Math.floor(y / B); if (x === 0 && y === 0) break; } return k; };
type PRule = Rule & { lens: Lens; qual: Qual; lens2: Lens; base: number; card: string };
function paramRule(lens: Lens, qual: Qual, lens2: Lens, base: number): PRule {
  const anchor = (d: D) => nearestQual(lens.f(d), qual);
  const P = (d: D) => { const v = lens.f(d), n = anchor(d); return Number.isFinite(n) ? -Math.abs(v - n) : W; };
  const S = (d: D) => { const n = anchor(d), o = lens2.f(d); return Number.isFinite(n) && Number.isFinite(o) ? trailingMatch(n, o, base) : 0; };
  const id = `${lens.id}|${qual.id}|${lens2.id}|b${base}`;
  const card = `${lens.text[0]!.toUpperCase()}${lens.text.slice(1)} should be as close as possible to ${qual.text}. Tie-breaker: that number and the whole number nearest ${lens2.text} should end in as many of the same digits as possible${base === 10 ? "" : ` when written in base ${base}`}.`;
  return { id, fam: lens.id, P, S, lens, qual, lens2, base, card };
}
const POOL_SIZE = LENSES.length * QUALS.length * (LENSES.length - 1) * BASES.length;

if (want("params")) {
  say(`\n## Parameterised families: ${LENSES.length} lenses × ${QUALS.length} qualifiers × ${LENSES.length - 1} second lenses × ${BASES.length} bases = ${POOL_SIZE} rules\n`);
  const r = rng("params-pairs");
  const draw = (): PRule => { const l = LENSES[r.below(LENSES.length)]!; let l2 = l; while (l2.id === l.id) l2 = LENSES[r.below(LENSES.length)]!; return paramRule(l, QUALS[r.below(QUALS.length)]!, l2, BASES[r.below(BASES.length)]!); };
  const NP = Number(process.env.PAIRS ?? 40);
  const pairs: [PRule, PRule][] = Array.from({ length: NP }, () => { const a = draw(); let b = draw(); while (b.lens.id === a.lens.id && b.qual.id === a.qual.id) b = draw(); return [a, b]; });
  const win = windowLines(Number(process.env.WIN ?? 30));
  const n = smp.ls.length; const w = Float64Array.from(smp.logw, x => 2 ** x);
  const rows: { pmi4: number; pmi8: number; one: number; both: number; nOne: number; nBoth: number; phiOne: number; phiBoth: number; a: PRule; b: PRule }[] = [];
  const T = Number(process.env.T ?? 20);
  for (const [a, b] of pairs) {
    const [va, vb] = valuers([a, b], smp);
    const Ba = Float64Array.from(smp.ls, l => va!.bits(l)), Bb = Float64Array.from(smp.ls, l => vb!.bits(l));
    const pmi = (dep: number) => { let ma = 0, mb = 0, mab = 0, cnt = 0; for (let i = 0; i < n; i++) { const ia = Ba[i]! >= dep, ib = Bb[i]! >= dep; if (ia) ma += w[i]!; if (ib) mb += w[i]!; if (ia && ib) { mab += w[i]!; cnt++; } } return cnt < 20 ? NaN : Math.log2(mab * smp.total / (ma * mb)); };
    // In the window: lines worth ≥ T bits to one rule, to both; and the cheapest (least φ) of each kind.
    let nOne = 0, nBoth = 0, phiOne = Infinity, phiBoth = Infinity, one = 0, both = 0;
    for (const l of win) {
      const x = va!.bits(l), y = vb!.bits(l); const ph = phiL(l);
      if (x >= T || y >= T) { nOne++; if (ph < phiOne) phiOne = ph; }
      if (x >= T && y >= T) { nBoth++; if (ph < phiBoth) phiBoth = ph; }
      one = Math.max(one, x, y); both = Math.max(both, Math.min(x, y));
    }
    rows.push({ pmi4: pmi(4), pmi8: pmi(8), one, both, nOne, nBoth, phiOne, phiBoth, a, b });
  }
  say(`| pair | PMI d=4 | PMI d=8 | lines ≥ ${T} bits to one / to both (window) | cheapest φ: one / both | best min(bits) both |`); say("|---|---|---|---|---|---|");
  for (const x of rows) say(`| ${x.a.id} × ${x.b.id} | ${f1(x.pmi4)} | ${f1(x.pmi8)} | ${x.nOne} / ${x.nBoth} | ${f1(x.phiOne)} / ${f1(x.phiBoth)} | ${f1(x.both)} |`);
  const fin2 = (xs: number[]) => xs.filter(Number.isFinite).sort((p, q) => p - q);
  const q = (xs: number[], p: number) => { const s = fin2(xs); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : NaN; };
  say(`\nDistribution over ${rows.length} random pairs (10th / 50th / 90th percentile):`);
  say(`- PMI at depth 4: ${f1(q(rows.map(x => x.pmi4), 0.1))} / ${f1(q(rows.map(x => x.pmi4), 0.5))} / ${f1(q(rows.map(x => x.pmi4), 0.9))}; at depth 8: ${f1(q(rows.map(x => x.pmi8), 0.1))} / ${f1(q(rows.map(x => x.pmi8), 0.5))} / ${f1(q(rows.map(x => x.pmi8), 0.9))} (${rows.filter(x => !Number.isFinite(x.pmi8)).length} pairs too rare to estimate at 8)`);
  say(`- lines ≥ ${T} bits to one rule: ${q(rows.map(x => x.nOne), 0.1)} / ${q(rows.map(x => x.nOne), 0.5)} / ${q(rows.map(x => x.nOne), 0.9)}; to both: ${q(rows.map(x => x.nBoth), 0.1)} / ${q(rows.map(x => x.nBoth), 0.5)} / ${q(rows.map(x => x.nBoth), 0.9)}; pairs with none for both: ${rows.filter(x => x.nBoth === 0).length}`);
  say(`- cheapest φ for one: ${f1(q(rows.map(x => x.phiOne), 0.5))}; for both: ${f1(q(rows.map(x => x.phiBoth), 0.5))} (median, where found)`);
  // Equal opportunity: best bits in the window per qualifier, across lenses.
  say(`\n### Equal opportunity: best bits in the window by qualifier (median over lenses, second lens c→X/base 10)\n`);
  for (const qu of QUALS) {
    const bests = LENSES.map(l => { const v = valuers([paramRule(l, qu, l.id === "c" ? LENSES[1]! : LENSES[0]!, 10)], smp)[0]!; return win.reduce((m2, li) => Math.max(m2, v.bits(li)), 0); });
    say(`- ${qu.id}: median ${f1(median(bests))}, range ${f1(Math.min(...bests))}–${f1(Math.max(...bests))}`);
  }
  say(`\nExample cards: ${rows.slice(0, 4).map(x => `"${x.a.card}"`).join(" ")}`);
}

if (want("parambalance")) {
  // Balance (v1's equal opportunity): best bits a rule reaches from births within its share of the cheapest reach,
  // by lens and by qualifier. Mutator moves recommended (--moves mutators).
  say("\n## Balance of the parameterised pool: best bits in reach, by lens and by qualifier\n");
  const r = rng("param-balance");
  const reaches = BIRTHS.slice(0, 3).map(b => reach(b, LINE_SHARE, Number(process.env.REACH ?? 60_000)));
  say(`Reach from 3 births: ${reaches.map(x => `${x.states.length} lines up to ${x.spent.toFixed(0)} ⚡`).join(", ")}`);
  const best = (pr: PRule) => { const v = valuers([pr], smp)[0]!; return median(reaches.map(x => x.states.reduce((m, l) => Math.max(m, v.bits(l)), 0))); };
  const other = (l: Lens) => (l.id === "c" ? LENSES[1]! : LENSES[0]!);
  say("| lens | median best bits over 6 random qualifiers | range |"); say("|---|---|---|");
  for (const l of LENSES) {
    const bs = Array.from({ length: 6 }, () => best(paramRule(l, QUALS[r.below(QUALS.length)]!, other(l), 10)));
    say(`| ${l.id} | ${f1(median(bs))} | ${f1(Math.min(...bs))}–${f1(Math.max(...bs))} |`);
  }
  say("\n| qualifier | median best bits over 4 random lenses | range |"); say("|---|---|---|");
  for (const q of QUALS) {
    const bs = Array.from({ length: 4 }, () => { const l = LENSES[r.below(LENSES.length)]!; return best(paramRule(l, q, other(l), 10)); });
    say(`| ${q.id} | ${f1(median(bs))} | ${f1(Math.min(...bs))}–${f1(Math.max(...bs))} |`);
  }
}

if (want("paramdyn")) {
  // Dynamism: random tables of 3 and 4 parameterised rules, scripted seats, mutator moves (--moves mutators).
  say("\n## Dynamism: random tables of parameterised rules\n");
  const r = rng("param-dyn", process.env.SEED ?? "1");
  const draw = (): PRule => { const l = LENSES[r.below(LENSES.length)]!; let l2 = l; while (l2.id === l.id) l2 = LENSES[r.below(LENSES.length)]!; return paramRule(l, QUALS[r.below(QUALS.length)]!, l2, BASES[r.below(BASES.length)]!); };
  for (const seats of [3, 4]) for (let t = 0; t < Number(process.env.TABLES ?? 4); t++) {
    const rules: PRule[] = []; while (rules.length < seats) { const x = draw(); if (!rules.some(y => y.lens.id === x.lens.id && y.qual.id === x.qual.id)) rules.push(x); }
    const vs = valuers(rules, smp); const dy = dynamicsTest(vs, `pd-${seats}-${t}`);
    const sb = dy.seatBits; const spread = Math.max(...sb) / Math.max(1e-9, Math.min(...sb));
    say(`**${seats} seats, table ${t + 1}**: ${rules.map(x => x.id).join(" + ")}`);
    say(`  F ${dy.Ft.map(x => x.toFixed(0)).join("→")}; objects moved in the last 100 s ${f2(dy.changedLate)}; ever moved ${dy.touched}/24; moves ${dy.moves} (by seat ${dy.movesBy.join(", ")}); seat bits at the end ${sb.map(f1).join(", ")} (max/min ${f1(spread)}); largest coefficient ${dy.maxH}`);
  }
}

if (want("paramdrift")) {
  // The same random tables, but each seat's dealt qualifier value is redrawn within its family every 50 s
  // (e.g. "a prime ending in 7" becomes "a prime ending in 3"): the §A8 drifting target, built from decision 41's params.
  say("\n## Dynamism with drifting parameters (each qualifier redrawn within its family every 50 s)\n");
  const r = rng("param-dyn", process.env.SEED ?? "1");
  const draw = (): PRule => { const l = LENSES[r.below(LENSES.length)]!; let l2 = l; while (l2.id === l.id) l2 = LENSES[r.below(LENSES.length)]!; return paramRule(l, QUALS[r.below(QUALS.length)]!, l2, BASES[r.below(BASES.length)]!); };
  const familyOf = (q: Qual) => q.id.replace(/[0-9]+/g, "#");
  for (const seats of [3, 4]) for (let t = 0; t < Number(process.env.TABLES ?? 4); t++) {
    const rules: PRule[] = []; while (rules.length < seats) { const x = draw(); if (!rules.some(y => y.lens.id === x.lens.id && y.qual.id === x.qual.id)) rules.push(x); }
    const rr = rng("drift", seats, t);
    const phases = Array.from({ length: 6 }, (_, k) => valuers(rules.map(x => {
      if (k === 0) return x;
      const fam = QUALS.filter(q => familyOf(q) === familyOf(x.qual));
      return paramRule(x.lens, fam[rr.below(fam.length)]!, x.lens2, x.base);
    }), smp));
    const dy = dynamicsTest(phases[0]!, `pd-${seats}-${t}`, { phase: s => phases[Math.min(5, Math.floor(s / 50))]! });
    say(`**${seats} seats, table ${t + 1}** (same tables as --part paramdyn): F ${dy.Ft.map(x => x.toFixed(0)).join("→")}; objects moved in the last 100 s ${f2(dy.changedLate)}; ever moved ${dy.touched}/24; seat bits at the end ${dy.seatBits.map(f1).join(", ")}`);
  }
}
