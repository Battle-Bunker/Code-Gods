/**
 * Exact rung values for the beginner pool's pairings on line-z, by tractability class
 * (docs/engine-v2/layered-line-rules.md §10). No simulation.
 *
 *   node --experimental-strip-types docs/engine-v2/scripts/analytic-classes.ts [--budget 26] [--only id,id] [--markdown out.md]
 *
 * The law is the potential of owner decision 19: π(m, c) = p(m)·p(c), p(n) = 2^−mixedInt(n) = f(|n|)/(4Z) for n ≠ 0,
 * p(0) = ½, where f(n) = 2^−sopfr(n)/2 is completely multiplicative and Z = Σ f = Π_p (1 − 2^−p/2)^−1.
 *
 * Every rule is evaluated by lib/v2-linear's own code (evaluateObject); no rule logic is copied here. A rung's value is
 * certified as an interval [lo, hi] = [−log2 (M + outside), −log2 M]:
 * - low rungs: lib/v2-valuation's generic exactRungs (every line within a bit budget; the outside is 1 − Σ inside);
 * - class A pairings and the new families: closed forms (Euler products and 1D lists), at the end;
 * - the upper rungs of every other pairing: a SUPPORT, a set of lines that contains every level set from the main
 *   layer's top up, which this script enumerates and whose skipped mass it bounds rigorously:
 *     B   (fibre)  one line per m: c fixed by the top's equation (c = T − k·m; c = T(1 − m)); the skipped mass is at most
 *                  T1(budget) · max p(c) over the c the equation can give, T1 being the 1D mass outside the list;
 *     B·thin       c forced into a fast-decaying set (a prime), m enumerated: skipped ≤ Σ_c p(c)·T1(B_c) + Σ_{p > P} p(p);
 *     C   (product) the top set is parametrised multiplicatively (area a square ⇔ m = ±2t², c = 2tk), so its total mass
 *                  is an Euler product in closed form, and skipped = total − enumerated.
 * Each support is checked: every line of the generic enumeration that reaches the main top must lie in it.
 */
import { writeFileSync } from "node:fs";
import { evaluateObject, levelOf, mixedIntBits, objectLadder, q, toWireQ, type RuleFamily, type TieBreaker } from "../../../lib/v2-core/src/index.ts";
import { beginnerFamilies, fromMC, isPrime, largestPrimeFactor, lineType, mMeetsC, smallestPrimeFactor, type LineState } from "../../../lib/v2-linear/src/index.ts";
import { exactRungs, integersWithin } from "../../../lib/v2-valuation/src/exact.ts";
import { findVariant } from "../../../lib/v2-valuation/src/registry.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const BUDGET = Number(opt("budget") ?? "26");
const only = opt("only")?.split(",");
const { variant } = findVariant("line-z");

// ---------------------------------------------------------------- the law and its closed forms

const bits = (n: bigint) => mixedIntBits(n);
const p = (n: bigint) => 2 ** -bits(n);
/** Z from the code itself: mixedInt(±1) = 2 + log2 Z. */
const Z = 2 ** (bits(1n) - 2);
const PRIMES: number[] = [];
for (let k = 2; k < 6000; k++) if (PRIMES.every(x => x * x > k || k % x)) PRIMES.push(k);
/** Π_{p ≥ from} (1 − 2^−s·p/2)^−1: the sum of f^s over integers whose prime factors are all ≥ from (1 included). */
const euler = (s: number, from = 2) => PRIMES.filter(x => x >= from).reduce((a, x) => a / (1 - 2 ** (-s * x / 2)), 1);
const Z2 = euler(2), Z3 = euler(3);
/** Σ_{p ≥ lo} f(p)^s (primes to 6000; the rest is below 2^−3000). */
const primeSum = (s: number, lo = 2) => PRIMES.filter(x => x >= lo).reduce((a, x) => a + 2 ** (-s * x / 2), 0);

/** Integers within a budget, cached, with the 1D mass outside the list. */
const listCache = new Map<number, { n: bigint; bits: number }[]>();
const list = (b: number) => { if (!listCache.has(b)) listCache.set(b, integersWithin(b)); return listCache.get(b)!; };
const T1 = (b: number) => Math.max(0, 1 - list(b).reduce((a, x) => a + 2 ** -x.bits, 0));

// ---------------------------------------------------------------- rungs

type Fam = RuleFamily<LineState, any>;
type Interval = { lo: number; hi: number };
const ladderOf = (f: Fam, prm: unknown, tb: TieBreaker) => objectLadder(lineType, f, prm as never, variant, tb);
const levelAt = (f: Fam, prm: unknown, tb: TieBreaker, ladder: ReturnType<typeof ladderOf>, m: bigint, c: bigint) =>
  levelOf(evaluateObject(lineType, f, prm as never, { lines: [fromMC(q(m), q(c))] }, variant, tb).score, ladder);
const label = (r: { score: readonly unknown[] | null }) => (r.score ? r.score.map(x => (x === null ? "–" : toWireQ(x as never))).join(" / ") : "anything");
/** The first rung whose main component is the main layer's top. */
function mainTop(ladder: ReturnType<typeof ladderOf>): number {
  const top = ladder[ladder.length - 1]!.score![0];
  return ladder.findIndex(r => r.score !== null && r.score[0] !== null && top !== null && toWireQ(r.score[0]!) === toWireQ(top!));
}

/** Masses per level over a list of weighted lines, turned into intervals with the skipped mass. */
function intervals(mass: number[], outside: number): Interval[] {
  const out: Interval[] = [];
  let acc = 0;
  for (let k = mass.length - 1; k >= 0; k--) {
    acc += mass[k]!;
    out[k] = k === 0 ? { lo: 0, hi: 0 } : { lo: -Math.log2(Math.min(1, acc + outside)), hi: acc > 0 ? -Math.log2(acc) : Infinity };
  }
  return out;
}

// ---------------------------------------------------------------- supports

type Support = {
  cls: string;
  /** Membership: every line at or above the main top must satisfy it (checked). */
  has(m: bigint, c: bigint): boolean;
  /** The enumerated lines, and a rigorous bound on the support's mass they skip. */
  lines(): { lines: [bigint, bigint][]; skipped: number; how: string };
};

const sqrtInt = (n: bigint): bigint | null => { if (n < 0n) return null; let r = BigInt(Math.floor(Math.sqrt(Number(n)))); while (r * r > n) r--; while ((r + 1n) * (r + 1n) <= n) r++; return r * r === n ? r : null; };
const abs = (n: bigint) => (n < 0n ? -n : n);

/** c a prime: primes up to P, each with m over a list whose budget grows as p(c) shrinks less. */
function thinPrimeC(cls: string, budgetFor: (c: number) => number, P = 150): Support {
  return {
    cls,
    has: (_m, c) => c > 1n && isPrime(c),
    lines() {
      const lines: [bigint, bigint][] = [];
      let skipped = 0;
      for (const c of PRIMES.filter(x => x <= P)) {
        const b = budgetFor(c);
        for (const m of list(b)) lines.push([m.n, BigInt(c)]);
        skipped += p(BigInt(c)) * T1(b);
      }
      skipped += primeSum(1, P + 1) / (4 * Z);
      return { lines, skipped, how: `c prime ≤ ${P}, m within ${budgetFor(2)}–${budgetFor(P)} bits` };
    },
  };
}

/** One line per m: c = g(m). Skipped ≤ T1(b) · cap, cap ≥ p(g(m)) for every m outside the list. */
function fibre(cls: string, g: (m: bigint) => bigint | null, has: (m: bigint, c: bigint) => boolean, cap: number, b: number, how: string): Support {
  return {
    cls, has,
    lines() {
      const lines: [bigint, bigint][] = [];
      for (const m of list(b)) { const c = g(m.n); if (c !== null) lines.push([m.n, c]); }
      return { lines, skipped: T1(b) * cap, how: `${how}; m within ${b} bits` };
    },
  };
}

/** Lines (s_m·M(u), s_c·C(u)) over u ≥ 1 from a list; the total mass is known in closed form. */
function product(cls: string, M: (u: bigint) => bigint, C: (u: bigint) => bigint, has: (m: bigint, c: bigint) => boolean, total: number, b: number, how: string): Support {
  return {
    cls, has,
    lines() {
      const lines: [bigint, bigint][] = [];
      let inside = 0;
      for (const u of list(b)) {
        if (u.n <= 0n) continue;
        for (const sm of [1n, -1n]) for (const sc of [1n, -1n]) {
          const m = sm * M(u.n), c = sc * C(u.n);
          lines.push([m, c]);
          inside += p(m) * p(c);
        }
      }
      return { lines, skipped: Math.max(0, total - inside), how: `${how}; total ${(-Math.log2(total)).toFixed(3)} bits in closed form, u within ${b} bits` };
    },
  };
}

/** Square Area's top: area c²/(2|m|) a square ⇔ m = ±2t², c = 2tk, root |k|. Pairs (t, k) within a joint budget. */
function squareAreaSupport(b: number): Support {
  const total = Z3 / (16 * Z);
  return {
    cls: "C",
    has(m, c) {
      if (m === 0n || c === 0n || abs(m) % 2n) return false;
      const t = sqrtInt(abs(m) / 2n);
      return t !== null && c % (2n * t) === 0n;
    },
    lines() {
      const lines: [bigint, bigint][] = [];
      let inside = 0;
      const ks = list(b).filter(x => x.n !== 0n);
      for (const t of list(b)) {
        if (t.n <= 0n) continue;
        const bm = bits(2n * t.n * t.n);
        if (bm + bits(1n) > b + 12) continue;
        const shift = bits(2n * t.n) - bits(1n); // bits(2tk) = bits(k) + ½ sopfr(2t)
        for (const k of ks) {
          if (bm + k.bits + shift > b + 12) break;
          for (const sm of [1n, -1n]) {
            const m = sm * 2n * t.n * t.n, c = 2n * t.n * k.n;
            lines.push([m, c]);
            inside += p(m) * p(c);
          }
        }
      }
      return { lines, skipped: Math.max(0, total - inside), how: `m = ±2t², c = 2tk, φ ≤ ${b + 12} bits; total Z₃/(16Z) = ${(-Math.log2(total)).toFixed(3)} bits` };
    },
  };
}

// ---------------------------------------------------------------- the pool's pairings

type Pairing = { fam: Fam; prm: unknown; tbs: readonly string[]; cls: string; support?: Support };
const byId = (id: string) => beginnerFamilies.find(f => f.id === id)! as Fam;
const odd = p(1n), six = p(6n);
const POOL: Pairing[] = [
  { fam: byId("prime-landing"), prm: {}, tbs: ["next-prime"], cls: "A (closed forms below; next-prime: B·thin)", support: thinPrimeC("B·thin", c => (c <= 5 ? 36 : c <= 13 ? 32 : 30)) },
  { fam: byId("square-area"), prm: {}, tbs: ["spf", "lpf", "omega"], cls: "C", support: squareAreaSupport(26) },
  { fam: byId("treasure"), prm: { k: 2, T: 37 }, tbs: ["prime-terms", "prime-gradient", "square-start"], cls: "B",
    support: fibre("B", m => 37n - 2n * m, (m, c) => 2n * m + c === 37n, odd, 40, "c = 37 − 2m (odd, so p(c) ≤ p(1))") },
  { fam: byId("same-on-both-rulers"), prm: { T: 6 }, tbs: ["steep", "prime-start", "whole-lamp"], cls: "B",
    support: fibre("B", m => (m === 1n ? null : 6n - 6n * m), (m, c) => m !== 1n && c === 6n - 6n * m, six, 40, "c = 6(1 − m) (a nonzero multiple of 6, so p(c) ≤ p(6))") },
  { fam: byId("pythagorean-area"), prm: { A: 6 }, tbs: ["slanted-square", "prime-height", "whole-legs"], cls: "C",
    support: product("C", u => 3n * u * u, u => 6n * u, (m, c) => { if (m === 0n || c % 6n) return false; const u = abs(c) / 6n; return abs(m) === 3n * u * u && u > 0n; },
      4 * (p(3n) * 4 * Z) * (p(6n) * 4 * Z) * Z3 / (16 * Z * Z), 36, "m = ±3u², c = ±6u") },
  { fam: byId("prime-staircase"), prm: {}, tbs: ["first-prime", "last-prime", "near-miss", "step-back"], cls: "B·thin",
    support: thinPrimeC("B·thin", c => (c <= 5 ? 36 : c <= 13 ? 32 : 30)) },
  { fam: mMeetsC as Fam, prm: {}, tbs: ["size", "meetPrime"], cls: "B",
    support: fibre("B", m => m, (m, c) => m === c, 0.5, 40, "c = m (cap p(0) = ½)") },
  { fam: byId("ruler"), prm: {}, tbs: ["prime-gradient", "square-area"], cls: "degenerate on line-z" },
  { fam: byId("exact-change"), prm: { ways: 6 }, tbs: ["big-bill", "prime-coins"], cls: "B (degenerate story on line-z)" },
];

// ---------------------------------------------------------------- run

const fmt = (x: Interval | undefined) => (!x ? "—" : !Number.isFinite(x.hi) ? "unreached" : x.hi - x.lo <= Math.log2(1.02) ? x.hi.toFixed(2) : `${x.lo.toFixed(2)}–${Number.isFinite(x.hi) ? x.hi.toFixed(2) : "∞"}`);
const certified = (x: Interval) => Number.isFinite(x.hi) && x.hi - x.lo <= Math.log2(1.02);
const md: string[] = ["# Exact rung values of the beginner pool on line-z", "",
  `Generated by \`node --experimental-strip-types docs/engine-v2/scripts/analytic-classes.ts --budget ${BUDGET}\`; see [../layered-line-rules.md](../layered-line-rules.md) §10.`,
  "A value is certified when its interval is narrower than 2% (log2 1.02 bits); otherwise the interval is shown.", ""];

for (const P of POOL.filter(x => !only || only.includes(x.fam.id))) {
  const t0 = Date.now();
  md.push(`## ${P.fam.title} — class ${P.cls}`, "");
  // The main layer, once, from the generic sum.
  const L0 = ladderOf(P.fam, P.prm, P.tbs[0]!);
  const top = mainTop(L0);
  const gen = exactRungs(P.fam, P.prm as never, variant, P.tbs[0]!, BUDGET);
  const mainRungs = L0.map((r, k) => ({ r, k })).filter(({ r }) => r.score !== null && r.score.length === 1);
  md.push(`Main layer (generic exact sum, ${gen.lines} lines within ${BUDGET} bits, outside ${gen.tail.toExponential(2)}):`, "",
    "| main rung | bits |", "|---|--:|", ...mainRungs.map(({ r, k }) => `| ${label(r)} | ${fmt({ lo: gen.lo[k]!, hi: gen.hi[k]! })} |`), "");
  // Support check: every generic line at the main top lies in the support.
  if (P.support) {
    let checked = 0;
    const small = list(20);
    for (const m of small) for (const c of small) {
      if (m.bits + c.bits > 20) break;
      if (levelAt(P.fam, P.prm, P.tbs[0]!, L0, m.n, c.n) >= top) {
        checked++;
        if (!P.support.has(m.n, c.n)) throw new Error(`${P.fam.id}: line m=${m.n}, c=${c.n} reaches the main top outside the support`);
      }
    }
    md.push(`Support (${P.support.cls}) checked on ${checked} generic lines at the main top.`, "");
  }
  const sup = P.support?.lines();
  if (sup) md.push(`Support: ${sup.how}; ${sup.lines.length} lines, skipped mass ≤ ${sup.skipped.toExponential(2)} (${(-Math.log2(sup.skipped || 1e-300)).toFixed(1)} bits).`, "");
  md.push("| tie-breaker | class | rungs at the main top (bits) | joint top certified | steps (bits) |", "|---|---|---|--:|---|");
  for (const tb of P.tbs) {
    const L = ladderOf(P.fam, P.prm, tb);
    const k0 = mainTop(L);
    let iv: Interval[];
    let cls: string;
    if (sup) {
      const mass = new Array<number>(L.length).fill(0);
      for (const [m, c] of sup.lines) mass[levelAt(P.fam, P.prm, tb, L, m, c)]! += p(m) * p(c);
      iv = intervals(mass, sup.skipped);
      cls = P.support!.cls;
    } else {
      const r = exactRungs(P.fam, P.prm as never, variant, tb, BUDGET);
      iv = r.lo.map((lo, k) => ({ lo, hi: r.hi[k]! }));
      cls = "generic only";
    }
    const at = L.map((r, k) => ({ r, k, v: iv[k]! })).filter(x => x.k >= k0);
    const cert = at.filter(x => certified(x.v));
    const last = cert[cert.length - 1];
    const steps = cert.slice(1).map((x, i) => (x.v.hi - cert[i]!.v.hi).toFixed(1));
    md.push(`| ${tb} | ${cls} | ${at.map(x => `${label(x.r)}: ${fmt(x.v)}`).join("; ")} | ${last ? `${last.v.hi.toFixed(2)} (${label(last.r)})` : "none"} | ${steps.join(" ")} |`);
  }
  md.push("", `(${((Date.now() - t0) / 1000).toFixed(0)} s)`, "");
  console.log(md.slice(md.lastIndexOf(`## ${P.fam.title} — class ${P.cls}`)).join("\n"));
}

// ---------------------------------------------------------------- closed forms (§10.4, §10.5)
// Two pool families the library does not have yet, valued from the law's Euler products and one 1D list (positive n
// within 44 bits; the f-mass of the positive integers outside it is 2Z·T1). Both are exact; no rule code is needed.
{
  // Prime-distance conditions use a 32-bit list (the library's primality test is trial division); sums of f use 44.
  const lists = new Map<number, { pos: { n: bigint; bits: number }[]; tail: number }>();
  const at = (b: number) => { if (!lists.has(b)) lists.set(b, { pos: list(b).filter(x => x.n > 0n), tail: 2 * Z * T1(b) }); return lists.get(b)!; };
  const pos = at(44).pos;
  const fOf = (n: bigint) => p(n) * 4 * Z;
  const nearPrime = (n: bigint) => { for (let d = 0n; ; d++) if (isPrime(n - d) || isPrime(n + d)) return Number(d); };
  /** Σ_{n ≥ 1, cond} f(n)^s over the list: [lo, hi] with the outside's f-mass (≤ tailF, and f^s ≤ f) added to hi. */
  const F = (cond: (n: bigint) => boolean, s = 1, b = 32): [number, number] => { const L = at(b); const v = L.pos.reduce((a, x) => a + (cond(x.n) ? fOf(x.n) ** s : 0), 0); return [v, v + L.tail]; };
  const bitsOf = (v: [number, number]) => { const hi = -Math.log2(v[0]), lo = -Math.log2(v[1]); return hi - lo <= Math.log2(1.02) ? hi.toFixed(2) : `${lo.toFixed(2)}–${hi.toFixed(2)}`; };
  const row = (name: string, vs: [string, [number, number]][]) => {
    const vals = vs.map(([l, v]) => `${l}: ${bitsOf(v)}`);
    const steps = vs.slice(1).map(([, v], i) => (-Math.log2(v[0]) + Math.log2(vs[i]![1][0])).toFixed(1));
    return `| ${name} | ${vals.join("; ")} | ${(-Math.log2(vs[vs.length - 1]![1][0])).toFixed(2)} | ${steps.join(" ")} |`;
  };
  const ex = (x: number): [number, number] => [x, x];
  /** Σ_{n ≥ 1} f(n)^s over n with every prime factor < q (1 included), and over n with smallest prime factor ≥ q (1 excluded). */
  const smooth = (s: number, q0: number) => PRIMES.filter(x => x < q0).reduce((a, x) => a / (1 - 2 ** (-s * x / 2)), 1);
  const spfS = (s: number, q0: number) => euler(s, q0) - 1, gpfS = (s: number, q0: number) => euler(s) - smooth(s, q0);
  const PR = PRIMES.filter(x => x <= 47);
  const SIZES = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128];
  const head = ["| tie-breaker at the main top | rungs (bits) | joint top | steps |", "|---|---|--:|---|"];

  // Whole Crossing (Empty Tank): −c/m whole ⇔ c = −m·k. p(m)·p(mk) = f(m)²·f(k)/(16Z²), so over the signs of m and k
  // the mass is G·F/(4Z²) with G = Σ_{m ≥ 1} f(m)² over the m allowed, F = Σ_{k ≥ 1} f(k) over the k allowed.
  const wc = (G: number, Fk: number) => G * Fk / (4 * Z * Z);
  const wcTop = 0.25 + wc(Z2, Z); // the lines through the origin (k = 0) cross at 0
  md.push("## Whole Crossing (Empty Tank) — class C (closed form; not in the library yet)", "",
    `Main top (the crossing −c/m is whole, through the origin included): ${(-Math.log2(wcTop)).toFixed(2)} bits. Z = ${Z.toFixed(6)}, Z₂ = ${Z2.toFixed(6)}, Z₃ = ${Z3.toFixed(6)}.`, "", ...head,
    row("spf(k): that whole number's smallest prime factor ≥ q", PR.map(q0 => [`≥ ${q0}`, ex(wc(Z2, euler(1, q0) - 1))])),
    row("gpf(k): that whole number's largest prime factor ≥ q", PR.map(q0 => [`≥ ${q0}`, ex(wc(Z2, gpfS(1, q0)))])),
    row("spf(|m|): the gradient's smallest prime factor ≥ q", PR.slice(0, 9).map(q0 => [`≥ ${q0}`, ex(wc(spfS(2, q0), Z))])),
    row("|k|: that whole number as far from 0 as possible (ignoring sign)", SIZES.map(R => [`≥ ${R}`, ex(wc(Z2, Z - pos.reduce((a, x) => a + (x.n < BigInt(R) ? fOf(x.n) : 0), 0)))])),
    row("|k| close to a prime (distance ≤ d)", [4, 2, 1, 0].map(d => { const v = F(n => nearPrime(n) <= d); return [`≤ ${d}`, [wc(Z2, v[0]), wc(Z2, v[1])] as [number, number]]; })),
    row("|m|: the gradient close to a prime, ignoring sign (distance ≤ d)", [4, 2, 1, 0].map(d => { const v = F(n => nearPrime(n) <= d, 2); return [`≤ ${d}`, [wc(v[0], Z), wc(v[1], Z)] as [number, number]]; })),
    "");

  // Divisibility Ladder (D §11): y(n) = mn + c, n | y(n) ⇔ n | c, so the run from n = 1 is ≥ k ⇔ lcm(1..k) | c (c ≠ 0).
  // Its mass is Σ_{j ≠ 0} p(L·j) = f(L)/2, and an m tie-breaker multiplies it by a 1D law of m (class A).
  const lcm = (k: number) => { let L = 1n; const g = (a: bigint, b: bigint): bigint => (b ? g(b, a % b) : a); for (let n = 1n; n <= BigInt(k); n++) L = L * n / g(L, n); return L; };
  const ks = [2, 3, 4, 5, 7, 8, 9, 11, 13, 16, 17, 19];
  const run = (k: number) => fOf(lcm(k)) / 2;
  md.push("## Divisibility Ladder — class A (closed form; not in the library yet)", "",
    "| main rung (run of multiples ≥ k: lcm(1..k) divides c) | " + ks.map(k => `≥ ${k}`).join(" | ") + " |", "|---|" + ks.map(() => "--:").join("|") + "|",
    "| bits | " + ks.map(k => (-Math.log2(run(k))).toFixed(2)).join(" | ") + " |", "");
  const pm = (cond: (n: bigint) => boolean, s: 1 = 1, b = 32): [number, number] => { const v = F(cond, s, b); return [2 * v[0] / (4 * Z), 2 * v[1] / (4 * Z)]; };
  for (const k of [11, 13]) {
    const M = run(k);
    const times = (v: [number, number]): [number, number] => [M * v[0], M * v[1]];
    md.push(`With the main layer at its rung ≥ ${k} (${(-Math.log2(M)).toFixed(2)} bits):`, "", ...head,
      row("|m|: the gradient as steep as possible", SIZES.map(R => [`≥ ${R}`, times(pm(n => n >= BigInt(R), 1, 44))])),
      row("spf(|m|): the gradient's smallest prime factor ≥ q", PR.slice(0, 11).map(q0 => [`≥ ${q0}`, times(ex(2 * (euler(1, q0) - 1) / (4 * Z)))])),
      row("gpf(|m|): the gradient's largest prime factor ≥ q", PR.slice(0, 11).map(q0 => [`≥ ${q0}`, times(ex(2 * gpfS(1, q0) / (4 * Z)))])),
      row("|m| close to a prime, ignoring sign (distance ≤ d)", [4, 2, 1, 0].map(d => [`≤ ${d}`, times(pm(n => nearPrime(n) <= d, 1))])),
      "");
  }
  // Square Area (class C): area a square ⇔ m = ±2t², c = 2tk, root |k|. Σ_t Σ_{k ≠ 0, cond} p(±2t²)·p(2tk) = Z₃·F/(16Z²),
  // F = Σ_{k ≥ 1, cond} f(k): every tie-breaker on the root is an Euler product (Ω through its generating function).
  {
    const sq = (Fk: number) => Z3 * Fk / (16 * Z * Z);
    const J = 12, h = new Array<number>(J + 1).fill(0); h[0] = 1; // h[j] = Σ_{Ω(k) = j} f(k)
    for (const x of PRIMES) { const w = 2 ** (-x / 2); for (let j = 1; j <= J; j++) h[j]! += w * h[j - 1]!; }
    const omegaAtLeast = (j: number) => Z - h.slice(0, j).reduce((a, b) => a + b, 0);
    md.push("## Square Area — class C (closed form)", "", `Main top (the area is a square): ${(-Math.log2(sq(Z))).toFixed(2)} bits = −log2 Z₃/(16Z).`, "", ...head,
      row("spf(root) ≥ q", PR.map(q0 => [`≥ ${q0}`, ex(sq(spfS(1, q0)))])),
      row("gpf(root) ≥ q", PR.map(q0 => [`≥ ${q0}`, ex(sq(gpfS(1, q0)))])),
      row("Ω(root) ≥ j (prime factors, counting repeats)", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(j => [`≥ ${j}`, ex(sq(omegaAtLeast(j)))])),
      row("the root a prime ≥ t", PR.map(t => [`≥ ${t}`, ex(sq(primeSum(1, t)))])),
      "");
  }
  // Proposed prime-climbing tie-breakers on the one-parameter tops of class B (not in the library yet): the top is
  // the explicit line set c = g(m), so a tie-breaker's rung is a 1D sum over m; skipped ≤ T1(b)·cap as for fibre().
  const oneParam = (title: string, g: (m: bigint) => bigint | null, cap: number, b: number, ties: [string, (m: bigint, c: bigint) => bigint][]) => {
    const pts = list(b).flatMap(x => { const c = g(x.n); return c === null ? [] : [{ m: x.n, c, w: p(x.n) * p(c) }]; });
    const skip = T1(b) * cap, top = pts.reduce((a, x) => a + x.w, 0);
    md.push(`## ${title}: proposed tie-breakers on the main top (own sums)`, "", `Main top: ${(-Math.log2(top)).toFixed(2)} bits (skipped ≤ ${skip.toExponential(1)}).`, "", ...head,
      ...ties.map(([name, val]) => row(name, PR.slice(0, 11).map(q0 => { const v = pts.reduce((a, x) => a + (val(x.m, x.c) >= BigInt(q0) ? x.w : 0), 0); return [`≥ ${q0}`, [v, v + skip] as [number, number]]; }))), "");
  };
  const spfAbs = (n: bigint) => smallestPrimeFactor(n), gpfAbs = (n: bigint) => largestPrimeFactor(n);
  oneParam("Treasure (k = 2, T = 37)", m => 37n - 2n * m, p(1n), 40, [["spf(|m|): the gradient's smallest prime factor ≥ q", m => spfAbs(m)], ["gpf(|m|): the gradient's largest prime factor ≥ q", m => gpfAbs(m)]]);
  oneParam("Same on Both Rulers (T = 6)", m => (m === 1n ? null : 6n - 6n * m), p(6n), 40, [["spf(|m|): the gradient's smallest prime factor ≥ q", m => spfAbs(m)], ["gpf(|m|): the gradient's largest prime factor ≥ q", m => gpfAbs(m)]]);
  oneParam("m Meets c", m => m, 2 ** -30, 30, [["spf(|c|): the shared number's smallest prime factor ≥ q", (_m, c) => spfAbs(c)], ["gpf(|c|): the shared number's largest prime factor ≥ q", (_m, c) => gpfAbs(c)]]);
  // Prime Landing and Prime Gradient (class A): main top "c (or m) is a prime"; a tie on the same coefficient is a
  // prime sum, a tie on the other coefficient multiplies by its 1D law.
  const primeMass = (lo: number) => primeSum(1, lo) / (4 * Z);
  const P1 = primeMass(2);
  const other = (d: number) => pm(n => nearPrime(n) <= d, 1); // the other coefficient, ignoring sign, within d of a prime
  for (const [fam, coef, oth] of [["Prime Landing", "c", "m"], ["Prime Gradient", "m", "c"]]) {
    md.push(`## ${fam} — class A (closed form)`, "", `Main top (${coef} a prime): ${(-Math.log2(P1)).toFixed(2)} bits.`, "", ...head,
      row(`${coef}: that prime ≥ t`, PR.map(t => [`≥ ${t}`, ex(primeMass(t))])),
      row(`spf(|${oth}|): the other coefficient's smallest prime factor ≥ q`, PR.slice(0, 12).map(q0 => [`≥ ${q0}`, ex(P1 * 2 * spfS(1, q0) / (4 * Z))])),
      row(`gpf(|${oth}|): the other coefficient's largest prime factor ≥ q`, PR.slice(0, 12).map(q0 => [`≥ ${q0}`, ex(P1 * 2 * gpfS(1, q0) / (4 * Z))])),
      row(`${oth}, ignoring sign, close to a prime (distance ≤ d)`, [4, 2, 1, 0].map(d => [`≤ ${d}`, [P1 * other(d)[0], P1 * other(d)[1]] as [number, number]])),
      "");
  }
  console.log(md.slice(md.indexOf("## Whole Crossing (Empty Tank) — class C (closed form; not in the library yet)")).join("\n"));
}
if (opt("markdown")) writeFileSync(opt("markdown")!, md.join("\n") + "\n");
