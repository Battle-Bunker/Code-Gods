/**
 * Why fraction lines play as whole numbers (playtest round 10, lines-beginner on line-q). Analysis only: nothing here
 * changes game logic, the law, the codes or any value. docs/engine-v2/fractions.md reads its output.
 *
 *   node --experimental-strip-types scripts/fractions.ts [--parts law,births,prices,rules,play] [--seeds 3] [--seconds 300]
 *     [--objects 10] [--births 0.05] [--agents plain,shortcut,fractional] [--draws 400000] [--table mixed]
 *
 * Parts:
 *   law     the law π on line-q under the current code and candidate codes (Monte Carlo from exact per-coordinate
 *           draws, kept when canonical): shares of vertical, horizontal, through-origin lines, the denominator b
 *           (b = 1 whole, 2..4, ≥ 5), and Σπ² (the collision probability; −log2 Σπ² in bits)
 *   prices  real prices (applyPriced: which + where + arg + surcharge) of whole and fractional steps on a few lines,
 *           the charge W + βW² (β = 0.05), and the cheapest calls that tip a vertical line into a sloped one
 *   rules   per dealable rule: does it score a vertical line (main and each tie-breaker defined or not), and of its top
 *           states (enumerated |a|, |b| ≤ 12, |c| ≤ 30) what share is whole (b = 1) against the enumeration's share
 *   births  the newborns of the walk (births.ts) on line-q: the same shares as law, from 200 seeds (--draws/10 lines)
 *   play    runTable with three scripted seats (the mixed table of scripts/freeze.ts and collapse-check test 4) under
 *           unique objects: the share of objects whole / fractional / vertical at 0, 60, 120 and the end, per agent
 *           kind, and the committed acts that change a line's class, by mutator
 */
import { parseArgs } from "node:util";
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { applyCall, evaluateSite, isInvalid, rng, STEP, variantMutators, type Rng } from "@workspace/v2-core";
import { describeLine, lineLaw, lineQ, lineType, type Line, type LineState } from "@workspace/v2-linear";
import { births as born, changeCharge, sandboxes, startersFor } from "../src/index.ts";
import { valuer } from "../src/harness.ts";
import { summonBits } from "../src/summon.ts";
import { runTable } from "../src/table.ts";
import { poolOf, ruleName, type Rule } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  parts: { type: "string", default: "law,prices,rules,play" }, seeds: { type: "string", default: "3" }, seconds: { type: "string", default: "300" },
  objects: { type: "string", default: "10" }, births: { type: "string", default: "0.05" }, agents: { type: "string", default: "plain,shortcut,fractional" },
  draws: { type: "string", default: "400000" }, table: { type: "string", default: "mixed" },
} });
const parts = new Set(o.parts!.split(","));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(2);
const row = (cells: readonly (string | number)[]) => console.log(`| ${cells.join(" | ")} |`);
const head = (cells: readonly string[]) => { row(cells); row(cells.map(() => "---")); };

// ================================================================ law

/** The factor weight Σ e·p of every n ≤ N (a smallest-prime-factor sieve); the code prices n at STEP·W(n) + log2 Z. */
const N = 1 << 18;
const W = (() => {
  const spf = new Uint32Array(N + 1), w = new Float64Array(N + 1);
  for (let i = 2; i <= N; i++) if (!spf[i]) for (let j = i; j <= N; j += i) if (!spf[j]) spf[j] = i;
  for (let i = 2; i <= N; i++) w[i] = w[i / spf[i]!]! + spf[i]!;
  return w;
})();
const LOG2_Z = (() => { let t = 0; for (let p = 2; p <= 10_000; p++) { let prime = true; for (let d = 2; d * d <= p; d++) if (p % d === 0) { prime = false; break; } if (prime) t -= Math.log2(1 - 2 ** (-STEP * p)); } return t; })();

/** A symmetric code on the integers, tabulated for |n| ≤ N: mass[k] is P(n = k) + P(n = −k) (normalised over the table). */
interface Code { readonly mass: Float64Array; readonly cum: Float64Array; readonly name: string }
function code(name: string, weight: (k: number) => number): Code {
  const mass = new Float64Array(N + 1);
  let t = 0;
  for (let k = 0; k <= N; k++) { mass[k] = weight(k); t += mass[k]!; }
  const cum = new Float64Array(N + 1);
  let c = 0;
  for (let k = 0; k <= N; k++) { mass[k]! /= t; c += mass[k]!; cum[k] = c; }
  return { mass, cum, name };
}
/** The mixed integer code with P(0) = z: ±n share 1 − z by 2^−(STEP·W(n) + log2 Z) (the current code is z = ½). */
const mixed = (z: number) => code(`mixed, p(0) = ${z}`, k => (k === 0 ? z : (1 - z) * 2 ** -(STEP * W[k]! + LOG2_Z)));
/** A positive code (a denominator): P(1) = h, k ≥ 2 share 1 − h by 2^−STEP·W(k); P(0) = z0. */
const denominator = (h: number, z0 = 0) => code(`den, p(1) = ${h}`, k => (k === 0 ? z0 : k === 1 ? (1 - z0) * h : (1 - z0) * (1 - h) * 2 ** -(STEP * W[k]!) / (2 ** LOG2_Z - 1)));
/** A denominator by steps: P(1) = h, then q ≥ 2 geometric with ratio ½ (halves, thirds, quarters cheap; big ones dear). */
const denominatorSteps = (h: number) => code(`den steps, p(1) = ${h}`, k => (k === 0 ? 0 : k === 1 ? h : (1 - h) * 2 ** -(k - 1)));
/** By steps: P(0) = z, ±n share 1 − z geometric with ratio 2^−STEP. */
const steps = (z: number) => code(`steps, p(0) = ${z}`, k => (k === 0 ? z : (1 - z) * (1 - 2 ** -STEP) * 2 ** (-STEP * (k - 1))));

function draw(c: Code, r: Rng): { n: number; p: number } {
  const u = r.unit() * c.cum[N]!;
  let lo = 0, hi = N;
  while (lo < hi) { const h = (lo + hi) >> 1; if (c.cum[h]! < u) lo = h + 1; else hi = h; }
  const k = lo;
  if (k === 0) return { n: 0, p: c.mass[0]! };
  return { n: r.unit() < 0.5 ? -k : k, p: c.mass[k]! / 2 };
}
const gcdN = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

interface LawRow { name: string; vertical: number; horizontal: number; origin: number; b1: number; b24: number; b5: number; sumPi2: number; accept: number }
/**
 * triple: a, b, c each from its own code (today's shape). mc: m and c each a numerator and a denominator drawn
 * independently, kept in lowest terms. mixed: m and c each a mixed number w + r/q (5½ = 5 + 1/2): the whole part
 * w = ⌊x⌋ from `num`, the denominator q from `den`, the numerator r uniform over the φ(q) residues coprime to q (complete:
 * no draw is wasted). In mc and mixed a vertical line x = k comes with chance v, k drawn like m.
 */
type Shape = { kind: "triple"; a: Code; b: Code; c: Code } | { kind: "mc" | "mixed"; v: number; num: Code; den: Code };
const totient = (q: number) => { let t = 0; for (let r = 1; r <= q; r++) if (gcdN(r, q) === 1) t++; return t; };

/** Monte Carlo of π for a code; each draw kept only when canonical (the law conditioned on lines, as law.ts does). */
function lawOf(name: string, s: Shape, draws: number): LawRow {
  const r = rng("fractions-law", name);
  let kept = 0, vertical = 0, horizontal = 0, origin = 0, b1 = 0, b24 = 0, b5 = 0, piSum = 0, tries = 0;
  const tally = (b: number, a0: boolean, c0: boolean, weight: number) => {
    kept++; piSum += weight;
    if (b === 0) vertical++; else if (b === 1) b1++; else if (b <= 4) b24++; else b5++;
    if (a0) horizontal++;
    if (c0) origin++;
  };
  if (s.kind === "triple") {
    // π(line) = p_a·p_b·p_c / A, A the chance a raw draw is canonical (primitive, b > 0 or b = 0 < a).
    const raw: { b: number; a0: boolean; c0: boolean; p: number }[] = [];
    while (tries < draws) {
      tries++;
      const a = draw(s.a, r), b = draw(s.b, r), c = draw(s.c, r);
      if (a.n === 0 && b.n === 0) continue;
      if (gcdN(gcdN(a.n, b.n), c.n) !== 1) continue;
      if (b.n < 0 || (b.n === 0 && a.n < 0)) continue;
      raw.push({ b: b.n, a0: a.n === 0, c0: c.n === 0, p: a.p * b.p * c.p });
    }
    const A = raw.length / tries;
    for (const x of raw) tally(x.b, x.a0, x.c0, x.p / A);
  } else {
    // y = mx + c with m and c rationals in lowest terms (numerator and denominator drawn independently), or with
    // chance v a vertical line x = k (k likewise). π = (1 − v)·p(m)·p(c) / A or v·p(k) / A, A the chance a draw is kept.
    const rat = () => {
      if (s.kind === "mc") { const n = draw(s.num, r), d = draw(s.den, r); return { n: n.n, d: d.n, p: n.p * d.p, ok: d.n >= 1 && gcdN(n.n, d.n) === 1 }; }
      const w = draw(s.num, r), dd = draw(s.den, r), d = { n: Math.abs(dd.n), p: 2 * dd.p };   // a denominator has no sign
      let rr = 0;
      if (d.n > 1) do rr = 1 + r.below(d.n - 1); while (gcdN(rr, d.n) !== 1);
      return { n: w.n * d.n + rr, d: d.n, p: w.p * d.p / totient(d.n), ok: true };
    };
    const raw: { b: number; a0: boolean; c0: boolean; p: number; vert: boolean }[] = [];
    while (tries < draws) {
      tries++;
      if (r.unit() < s.v) {
        const k = rat(); if (!k.ok) continue;
        raw.push({ b: 0, a0: false, c0: k.n === 0, p: s.v * k.p, vert: true });
      } else {
        const m = rat(), c = rat();
        if (!m.ok || !c.ok) continue;
        raw.push({ b: m.d * c.d / gcdN(m.d, c.d), a0: m.n === 0, c0: c.n === 0, p: (1 - s.v) * m.p * c.p, vert: false });
      }
    }
    const A = raw.length / tries;   // conditioning on lowest terms renormalises by the total kept mass
    for (const x of raw) tally(x.b, x.a0, x.c0, x.p / A);
  }
  return { name, vertical: vertical / kept, horizontal: horizontal / kept, origin: origin / kept, b1: b1 / kept, b24: b24 / kept, b5: b5 / kept, sumPi2: piSum / kept, accept: kept / tries };
}

/** n lines drawn from a code's law (exact per-coordinate draws, kept when canonical: draws from π itself). */
function drawLines(s: Shape, n: number, seed: string): LineState[] {
  const r = rng("fractions-lines", seed), out: LineState[] = [];
  const B = (x: number) => BigInt(x);
  while (out.length < n) {
    if (s.kind === "triple") {
      const a = draw(s.a, r).n, b = draw(s.b, r).n, c = draw(s.c, r).n;
      if ((a === 0 && b === 0) || gcdN(gcdN(a, b), c) !== 1 || b < 0 || (b === 0 && a < 0)) continue;
      out.push({ lines: [{ a: B(a), b: B(b), c: B(c) }] });
      continue;
    }
    const rat = (): [number, number] | null => {
      if (s.kind === "mc") { const p = draw(s.num, r).n, d = draw(s.den, r).n; return d >= 1 && gcdN(p, d) === 1 ? [p, d] : null; }
      const w = draw(s.num, r).n, d = Math.abs(draw(s.den, r).n);
      let rr = 0;
      if (d > 1) do rr = 1 + r.below(d - 1); while (gcdN(rr, d) !== 1);
      return [w * d + rr, d];
    };
    if (r.unit() < s.v) { const k = rat(); if (k) out.push({ lines: [{ a: B(k[1]), b: 0n, c: B(-k[0]) }] }); continue; }
    const m = rat(), c = rat();
    if (!m || !c) continue;
    const L = m[1] * c[1] / gcdN(m[1], c[1]);
    const t = [-m[0] * (L / m[1]), L, -c[0] * (L / c[1])], g = gcdN(gcdN(t[0]!, t[1]!), t[2]!);
    out.push({ lines: [{ a: B(t[0]! / g), b: B(t[1]! / g), c: B(t[2]! / g) }] });
  }
  return out;
}

const SHAPES = (): [string, Shape][] => {
  const cur = mixed(0.5);
  return [
    ["C0 before the trial: mixed(a), mixed(b), mixed(c), p(0) = ½", { kind: "triple", a: cur, b: cur, c: cur }],
    ["C1 p(0) = 1/16 for b only (fewer vertical lines)", { kind: "triple", a: cur, b: mixed(1 / 16), c: cur }],
    ["C2 p(0) = 1/8 for a, b and c", { kind: "triple", a: mixed(1 / 8), b: mixed(1 / 8), c: mixed(1 / 8) }],
    ["C3 C2 with b by steps (2^−½ per unit; line-q today, a trial)", { kind: "triple", a: mixed(1 / 8), b: steps(1 / 16), c: mixed(1 / 8) }],
    ["C4 (m, c) as rationals: vertical 1/16, p(0) = ¼, P(den 1) = ½", { kind: "mc", v: 1 / 16, num: mixed(1 / 4), den: denominator(1 / 2) }],
    ["C5 as C4 with P(den 1) = ⅓", { kind: "mc", v: 1 / 16, num: mixed(1 / 4), den: denominator(1 / 3) }],
    ["C6 (m, c): vertical 1/64, p(0) = ¼, den 1 ½ then ¼, ⅛, … (by steps)", { kind: "mc", v: 1 / 64, num: mixed(1 / 4), den: denominatorSteps(1 / 2) }],
    ["C7 as C6 with P(den 1) = ⅔", { kind: "mc", v: 1 / 64, num: mixed(1 / 4), den: denominatorSteps(2 / 3) }],
    ["C8 (m, c) as mixed numbers w + r/q: vertical 1/64, w mixed p(0) = ¼, den 1 ½ then ¼, ⅛, …", { kind: "mixed", v: 1 / 64, num: mixed(1 / 4), den: denominatorSteps(1 / 2) }],
    ["C9 as C8 with P(den 1) = ⅔", { kind: "mixed", v: 1 / 64, num: mixed(1 / 4), den: denominatorSteps(2 / 3) }],
  ];
};

function lawPart() {
  const draws = Number(o.draws);
  const shapes = SHAPES();
  console.log(`\n## law: π on line-q (Monte Carlo, ${draws} raw draws per code; |n| ≤ 2^18)\n`);
  head(["code", "vertical", "horizontal", "through origin", "b = 1 (whole)", "b 2..4", "b ≥ 5", "Σπ²", "−log2 Σπ²"]);
  for (const [name, s] of shapes) {
    const x = lawOf(name, s, draws);
    row([x.name, pct(x.vertical), pct(x.horizontal), pct(x.origin), pct(x.b1), pct(x.b24), pct(x.b5), x.sumPi2.toExponential(2), f2(-Math.log2(x.sumPi2))]);
  }
  // φ under each code (−log2 of the per-coordinate probabilities; the conditioning constant cancels in a difference):
  // the surcharge a move pays is the rise in φ, so this is what a denominator costs on top of the move's own fee.
  const bitsOf = (c: Code, n: number) => -Math.log2(n === 0 ? c.mass[0]! : c.mass[Math.abs(n)]! / 2);
  const phiOf = (s: Shape, m: [number, number], c: [number, number]): number => {
    if (s.kind === "mc") return bitsOf(s.num, m[0]) + bitsOf(s.den, m[1]) + bitsOf(s.num, c[0]) + bitsOf(s.den, c[1]) - 2 * Math.log2(1 - s.v);
    if (s.kind !== "triple") return [m, c].reduce((t, [n, d]) => t + bitsOf(s.num, Math.floor(n / d)) + bitsOf(s.den, d) + Math.log2(totient(d)), -Math.log2(1 - s.v));
    const b = m[1] * c[1] / gcdN(m[1], c[1]);
    return bitsOf(s.a, -m[0] * (b / m[1])) + bitsOf(s.b, b) + bitsOf(s.c, -c[0] * (b / c[1]));
  };
  const moves: [string, [number, number], [number, number]][] = [["y = 3x + 6 (whole step)", [3, 1], [6, 1]], ["y = 3x + 11/2", [3, 1], [11, 2]], ["y = 7/2x + 5", [7, 2], [5, 1]], ["y = 3/2x + 5/2", [3, 2], [5, 2]], ["y = 10/3x + 5", [10, 3], [5, 1]], ["y = 13/4x + 5", [13, 4], [5, 1]], ["y = 3x + 37/7", [3, 1], [37, 7]]];
  console.log("\nThe rise in φ (bits) from y = 3x + 5 to a neighbour, under each code (the surcharge a move there pays):\n");
  head(["code", ...moves.map(m => m[0])]);
  for (const [name, s] of shapes) {
    const base = phiOf(s, [3, 1], [5, 1]);
    row([name.split(" ")[0]!, ...moves.map(([, m, c]) => f2(phiOf(s, m, c) - base))]);
  }
  // The price of a denominator under line-q's code (C3 since the trial): φ(y = (p/d)x + c) − φ(y = px + c) on a few lines.
  const phi = (l: Line) => lineType.readLength({ lines: [l] }, lineQ);
  const L = (a: bigint, b: bigint, c: bigint): Line => ({ a, b, c });
  console.log("\nφ (bits) under line-q's code (C3), whole against fractional neighbours:\n");
  head(["line", "triple (a, b, c)", "φ"]);
  for (const l of [L(-3n, 1n, -5n), L(-3n, 2n, -10n), L(-6n, 2n, -5n), L(-3n, 2n, -5n), L(-1n, 3n, -15n), L(-3n, 4n, -20n), L(-7n, 3n, -2n), L(0n, 1n, -5n), L(1n, 0n, -3n), L(-3n, 1n, 0n)]) {
    row([describeLine(l), `(${l.a}, ${l.b}, ${l.c})`, f2(phi(l))]);
  }
}

// ================================================================ prices

const LQ = (s: string): LineState => lineType.decode(s);
function pricesPart() {
  console.log("\n## prices: applyPriced on line-q (W = which + where + arg + surcharge; charge W + 0.05·W²)\n");
  const lines: [string, string][] = [["y = 3x + 5", "-3,1,-5"], ["y = 3/2x + 5", "-3,2,-10"], ["y = 3x + 5/2", "-6,2,-5"], ["y = 7/3x + 2/3", "-7,3,-2"]];
  const calls: [string, Record<string, string>][] = [
    ["si.shift", { k: "1" }], ["si.shift", { k: "2" }], ["si.shift", { k: "1/2" }], ["si.shift", { k: "-1/2" }], ["si.shift", { k: "1/3" }],
    ["si.tilt", { k: "1" }], ["si.tilt", { k: "1/2" }], ["si.tilt", { k: "1/3" }], ["seq.step", { k: "1/2" }],
    ["mach.stretch", { f: "2" }], ["mach.stretch", { f: "3" }], ["mach.stretch", { f: "1/2" }], ["mach.stretch", { f: "3/2" }], ["mach.stretch", { f: "2/3" }],
    ["cart.pivot", { x0: "1", k: "1" }], ["cart.pivot", { x0: "1/2", k: "1" }], ["cart.pivot", { x0: "1/3", k: "1" }],
    ["cart.slide", { u: "1/2", v: "0" }], ["cart.slide", { u: "1", v: "0" }], ["int.move", { axis: "x", k: "1/2" }], ["gen.nudge", { which: "b", k: "1" }],
  ];
  for (const [title, enc] of lines) {
    const s = LQ(enc);
    console.log(`\n${title}  (φ ${f2(lineType.readLength(s, lineQ))})\n`);
    head(["call", "result", "which+where", "arg", "surcharge", "W", "charge"]);
    for (const [mutator, args] of calls) {
      const a = applyCall(lineType, lineQ, s, { mutator, site: 0, args });
      const label = `${mutator} ${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(" ")}`;
      if (isInvalid(a)) { row([label, `invalid: ${a.invalid}`, "", "", "", "", ""]); continue; }
      const p = a.price;
      row([label, describeLine(a.result.lines[0]!), f2(p.which + p.where), f2(p.arg), f2(p.surcharge), f2(p.total), f2(changeCharge(p.total))]);
    }
  }
  // Tipping a vertical line: every call priced at most 14 bits of arguments, the cheapest results that have a gradient.
  console.log("\nTipping a vertical line (every call with arguments ≤ 14 bits; the five cheapest with a gradient):\n");
  head(["from", "call", "result", "W", "surcharge", "charge"]);
  for (const enc of ["1,0,-3", "2,0,-1", "1,0,0", "1,0,-17"]) {
    const s = LQ(enc);
    const found: { label: string; result: string; W: number; sur: number }[] = [];
    for (const m of variantMutators(lineType, lineQ)) {
      const code = m.args(lineQ);
      for (const a of code.enumerate!(14)) {
        const r = applyCall(lineType, lineQ, s, { mutator: m.id, site: 0, args: code.encode(a) as Record<string, string> });
        if (isInvalid(r) || r.result.lines[0]!.b === 0n) continue;
        found.push({ label: `${m.id} ${Object.entries(code.encode(a) as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(" ")}`, result: describeLine(r.result.lines[0]!), W: r.price.total, sur: r.price.surcharge });
      }
    }
    found.sort((x, y) => x.W - y.W);
    for (const f of found.slice(0, 5)) row([describeLine(s.lines[0]!), f.label, f.result, f2(f.W), f2(f.sur), f2(changeCharge(f.W))]);
  }
}

// ================================================================ rules

function rulesPart() {
  const rules = poolOf("line-q").rules;
  console.log(`\n## rules: ${rules.length} dealable rules on line-q (lines-beginner)\n`);
  // Vertical lines: which layers are defined.
  const verticals = ["1,0,-3", "1,0,-7", "2,0,-1", "1,0,0", "1,0,4"].map(LQ);
  const fams = [...new Set(rules.map(r => r.family))];
  console.log("Vertical lines (x = 3, 7, 1/2, 0, −4): per family, the main layer and each tie-breaker, defined on how many of the five\n");
  head(["family", "main defined", "tie-breakers defined (of 5)", "score (main) null"]);
  for (const fam of fams) {
    const f = lineType.families.find(x => x.id === fam)!;
    const params = rules.find(r => r.family === fam)!.params;
    const ev = verticals.map(s => evaluateSite(lineType, f, params, s, lineQ, 0));
    const defined = (id: string) => ev.filter(e => { const t = e.terms.find(x => x.id === id)!; return !("undefined" in t.value); }).length;
    row([fam, `${defined(f.main.id)}/5`, f.tieBreakers.map(t => `${t.id} ${defined(t.id)}`).join(", "), `${ev.filter(e => e.score === null).length}/5`]);
  }
  // Top states: enumerate |a|, |b| ≤ 12, |c| ≤ 30 (canonical), the rule's bits; the top 100 (and ties at the cut).
  const states: LineState[] = [];
  for (const s of lineType.enumerate!(lineQ)) if (Math.abs(Number(s.lines[0]!.c)) <= 30) states.push(s);
  const whole = (s: LineState) => s.lines[0]!.b === 1n;
  const base = states.filter(whole).length / states.length;
  const vert = states.filter(s => s.lines[0]!.b === 0n).length / states.length;
  // Lines drawn from π itself (law.ts: C3 since the trial), and from two other codes (C0, the code before it; C9):
  // the share each rule scores null, weighted as births are.
  const law = lineLaw(lineQ), lr = rng("fractions-rules");
  const drawn: LineState[] = [];
  while (drawn.length < 4000) { const d = law.draw(lr, 1); if (d.state) drawn.push(d.state); }
  const shapes = SHAPES(), cand = ["C0", "C9"].map(id => drawLines(shapes.find(([n]) => n.startsWith(id))![1], 4000, id));
  console.log(`\nTop states (enumeration: ${states.length} lines, ${pct(base)} whole, ${pct(vert)} vertical). Per rule, the top 100 by its bits (ties at the cut kept): share whole, share vertical; the share of lines scoring null over the enumeration, over 4000 draws from π (law.ts, ${pct(drawn.filter(s => s.lines[0]!.b === 0n).length / drawn.length)} vertical) and over 4000 draws from the codes C0 (before the trial) and C9.\n`);
  head(["rule", "top states", "top whole", "top vertical", "null (enumeration)", "null (π, C3)", "null (C0)", "null (C9)", "best bits"]);
  const nullForAll = [drawn, ...cand].map(xs => xs.map(() => true));
  const nullShare = (xs: LineState[], k: number, v: ReturnType<typeof valuer<LineState>>, counts: boolean) => {
    let n = 0;
    xs.forEach((s, i) => { if (v.scoreOf(s) === null) n++; else if (counts) nullForAll[k]![i] = false; });
    return pct(n / xs.length);
  };
  for (const rule of rules) {
    const v = valuer(lineType, lineQ, rule);
    const scored = states.map(s => ({ s, bits: v.bits(s), nul: v.scoreOf(s) === null }));
    const sorted = scored.slice().sort((a, b) => b.bits - a.bits);
    const cut = sorted[Math.min(99, sorted.length - 1)]!.bits;
    const top = sorted.filter(x => x.bits >= cut - 1e-9);
    row([ruleName(rule), top.length, pct(top.filter(x => whole(x.s)).length / top.length), pct(top.filter(x => x.s.lines[0]!.b === 0n).length / top.length), pct(scored.filter(x => x.nul).length / scored.length),
      ...[drawn, ...cand].map((xs, k) => nullShare(xs, k, v, rule.family !== "whole-crossing")), f2(sorted[0]!.bits)]);
  }
  console.log(`\nNull for every rule but Whole Crossing (10 of the 11 families): ${nullForAll.map((xs, k) => `${["π (C3)", "C0", "C9"][k]} ${pct(xs.filter(Boolean).length / xs.length)}`).join(", ")}`);
}

// ================================================================ play

const TABLES: Record<string, string[]> = {
  mixed: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  compatible: ["prime-landing/m-spf", "treasure/m-spf", "prime-gradient/prime"],
};
const RETURN = "  return climb(offer, options, score(m, c, p, tie), QUOTES);";
// shortcut (scripts/freeze.ts): when stuck, stretch, pivot and mirror as ways across a valley.
const SHORTCUT = `  const now = score(m, c, p, tie), step = climb(offer, options, now, QUOTES);
  if (step) return step;
  const sc = [];
  for (const f of [2, 3, -1, Q.of(1, 2), Q.of(1, 3)]) sc.push([move("mach.stretch", { f }), Q.mul(m, Q.from(f)), Q.mul(c, Q.from(f))]);
  for (const x0 of [-1, 1, 2]) for (const k of [-2, -1, 1, 2]) sc.push([move("cart.pivot", { x0, k }), Q.add(m, Q.from(k)), Q.sub(c, Q.mul(Q.from(k), Q.from(x0)))]);
  sc.push([move("cart.mirror", { axis: "y" }), Q.neg(m), c], [move("cart.mirror", { axis: "x" }), Q.neg(m), Q.neg(c)], [move("cart.mirror", { axis: "origin" }), m, Q.neg(c)]);
  if (!Q.eq(m, Q.of(0))) sc.push([move("cart.mirror", { axis: "diagonal" }), Q.div(Q.of(1), m), Q.neg(Q.div(c, m))]);
  return climb(offer, sc.map(([pl, m2, c2]) => [pl, score(m2, c2, p, tie)]), now, QUOTES);`;
// fractional (proposal c): the Simple starter plus steps of ±1/2, ±1/3, ±2/3 and stretches by 1/2, 3/2, 2/3.
const FRACTIONAL = `  for (const f of [Q.of(1, 2), Q.of(-1, 2), Q.of(1, 3), Q.of(-1, 3), Q.of(2, 3), Q.of(-2, 3)]) {
    options.push([move("si.shift", { k: f }), score(m, Q.add(c, f), p, tie)]);
    options.push([move("si.tilt", { k: f }), score(Q.add(m, f), c, p, tie)]);
  }
  for (const f of [Q.of(1, 2), Q.of(3, 2), Q.of(2, 3)]) options.push([move("mach.stretch", { f }), score(Q.mul(m, f), Q.mul(c, f), p, tie)]);
${RETURN}`;
function program(family: string, kind: string) {
  const a = startersFor(family, "typescript").find(x => x.kind === "simple")!;
  if (kind === "plain") return { language: a.language, source: a.source };
  const source = a.source.replace(RETURN, kind === "shortcut" ? SHORTCUT : FRACTIONAL);
  if (source === a.source) throw new Error("the starter's last line moved");
  return { language: a.language, source };
}

type Klass = "whole" | "fraction" | "vertical";
const klass = (s: LineState): Klass => (s.lines[0]!.b === 0n ? "vertical" : s.lines[0]!.b === 1n ? "whole" : "fraction");

async function playPart() {
  const ids = TABLES[o.table!]!;
  const beginner = poolOf("line-q").rules;
  const rules: Rule[] = ids.map(id => beginner.find(r => ruleName(r) === id)!);
  const seconds = Number(o.seconds), seeds = Number(o.seeds), objects = Number(o.objects), births = Number(o.births);
  const marks = [0, 60, 120, seconds];
  const boxes = sandboxes();
  console.log(`\n## play: ${ids.join(", ")}; ${objects} objects, ${births} births/s, ${seconds} s, ${seeds} seeds, unique objects\n`);
  const transitions: Record<string, Record<string, number>> = {};
  for (const kind of o.agents!.split(",")) {
    const shares = marks.map(() => ({ whole: 0, fraction: 0, vertical: 0, n: 0 }));
    const tr: Record<string, number> = {};
    let committed = 0, inClass = { fraction: 0, whole: 0 };
    for (let g = 0; g < seeds; g++) {
      const seed = `fractions-g${g}`;
      const states: LineState[] = born(lineType, lineQ, seed, objects);
      const grow = (n: number) => { while (states.length < n) states.push(born(lineType, lineQ, `${seed}:${states.length + 1}`, 1)[0]!); };
      let next = 0;
      const snap = () => { const sh = shares[next]!; for (const s of states) { sh[klass(s)]++; sh.n++; } next++; };
      const seats = rules.map((rule, k) => ({ name: `P${k}`, kind: "starter" as const, rule, program: program(rule.family, kind) }));
      const report = await runTable(boxes, {
        type: lineType, variant: lineQ, lines: objects, seed, seconds, seats, unique: true, birthsPerSecond: births,
        // The longer programs cost more to summon than a player's 600 energy (printed below): capped, as scripts/freeze.ts does.
        summonCap: LINES_BEGINNER_ECONOMY.startingEnergy,
        onAct: e => {
          grow(e.objects);
          while (next < marks.length - 1 && e.at >= marks[next]!) snap();
          if (!e.committed) return;
          committed++;
          const before = klass(states[e.object]!), after = klass(e.state);
          if (before === "fraction" || before === "whole") inClass[before]++;
          if (before !== after) {
            const c = e.calls[0]!;
            const arg = Object.values(c.args).some(v => v.includes("/")) ? "fractional arg" : "whole arg";
            const key = `${before} → ${after}: ${c.mutator} (${arg})`;
            tr[key] = (tr[key] ?? 0) + 1;
          }
          states[e.object] = e.state;
        },
      });
      grow(report.objects);
      while (next < marks.length - 1) snap();
      const final = report.final as LineState[], sh = shares[marks.length - 1]!;
      for (const s of final) { sh[klass(s)]++; sh.n++; }
      next = 0;
    }
    console.log(`### agents: ${kind} (summon price ${rules.map(r => Math.round(summonBits("typescript", program(r.family, kind).source).energy)).join(" / ")} energy)\n`);
    head(["t (s)", "objects (all seeds)", "whole", "fractional", "vertical"]);
    marks.forEach((t, i) => { const s = shares[i]!; row([t, s.n, pct(s.whole / s.n), pct(s.fraction / s.n), pct(s.vertical / s.n)]); });
    console.log(`\ncommitted moves: ${committed} (from a fractional line ${inClass.fraction}, from a whole line ${inClass.whole})\n`);
    head(["class change: first call", "moves"]);
    for (const [k, v] of Object.entries(tr).sort((a, b) => b[1] - a[1])) row([k, v]);
    console.log("");
    transitions[kind] = tr;
  }
  await boxes.close();
}

/** Newborns from the seeded walk (births.ts) on line-q: 200 seeds, `--draws`/10 lines in all. */
function birthsPart() {
  const total = Math.max(200, Math.round(Number(o.draws) / 10)), xs: Line[] = [];
  for (let s = 0; s < 200; s++) for (const st of born(lineType, lineQ, `fractions-births-${s}`, Math.ceil(total / 200))) xs.push(st.lines[0]!);
  const share = (f: (l: Line) => boolean) => pct(xs.filter(f).length / xs.length);
  console.log(`\n## births: ${xs.length} newborns of the walk on line-q (200 seeds)\n`);
  head(["vertical", "horizontal", "through origin", "b = 1 (whole)", "b 2..4", "b ≥ 5"]);
  row([share(l => l.b === 0n), share(l => l.a === 0n), share(l => l.c === 0n), share(l => l.b === 1n), share(l => l.b >= 2n && l.b <= 4n), share(l => l.b >= 5n)]);
}

if (parts.has("law")) lawPart();
if (parts.has("births")) birthsPart();
if (parts.has("prices")) pricesPart();
if (parts.has("rules")) rulesPart();
if (parts.has("play")) await playPart();
