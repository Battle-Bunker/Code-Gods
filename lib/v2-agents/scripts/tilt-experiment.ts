/**
 * Principle 11 experiment (coordinator, 16 Nov): how much of Prime Landing's and Same on Both Rulers' value a cheap
 * move keeps from a rung, under the current grading (off a rung: below every rung) and a soft one (off a rung: the
 * rung's level less one, plus a little for being close). Bits from an importance-sampled law on the main part only.
 * Run: node --experimental-strip-types scripts/tilt-experiment.ts [variant] [draws]
 */
import { applyCall, isInvalid, Qn, q, rng, type Q } from "@workspace/v2-core";
import { findVariant } from "@workspace/v2-valuation";
import { lineLaw, xAt, slope, intercept, isVertical, digitLevel, nearestInteger, isPrimeEnding, nearestPrimeEnding, landingWitness, rulersWitness, type LineState } from "@workspace/v2-linear";
import { nearestPalindrome } from "../../v2-linear/src/beginner-rulers.ts";

const { type, variant } = findVariant(process.argv[2] ?? "line-q");
const law = lineLaw(variant);
const T = 0.6, N = Number(process.argv[3] ?? 150_000);
type Grade = "hard" | "soft" | "digit" | "log" | "both";
const num = (x: Q) => Number(x.n) / Number(x.d);
const lvl = (t: bigint) => num(digitLevel(t));
function graded(x: Q, t: bigint, onRung: boolean, g: Grade): number {
  const d = Math.max(0, Math.abs(num(x) - Number(t)) - 0.5);
  if (onRung) return lvl(t);
  if (g === "hard") return -d;
  // "digit": off a rung costs one digit's worth at the rung's level (digitLevel: a digit is 1/(level + 1) of a level).
  const L = lvl(t), step = g === "soft" ? 1 : 1 / (Math.floor(L) + 1);
  if (g === "log") { const r = Math.abs(Math.log(num(x) / Number(t))); return L - step + (0.5 * step) / (1 + 10 * r); }
  return L - step + (0.5 * step) / (d + 1);
}
// Prime Landing, ends k, side ±1: X = −c/m (where y = 0).
function plAt(x: Q, k: number, g: Grade): number {
  const n = nearestInteger(x);
  if (n > 0n && isPrimeEnding(n, k)) return graded(x, n, true, g);
  return graded(x, nearestPrimeEnding(x, k), false, g);
}
function pl(s: LineState, k: number, side: 1 | -1, g: Grade): number | null {
  const l = s.lines[0]!;
  if (g === "both") {
    // The better of two readings on the dealt side: where it crosses the x-axis, and minus where it crosses the y-axis.
    const ys = l.b === 0n ? null : (side === 1 ? Qn.neg(intercept(l)) : intercept(l));
    const xs = l.a === 0n ? null : (side === 1 ? xAt(l, q(0)) : Qn.neg(xAt(l, q(0))));
    const us = [xs, ys].filter((v): v is Q => v !== null).map(v => plAt(v, k, "digit"));
    return us.length ? Math.max(...us) : null;
  }
  if (l.a === 0n) return null;
  const x0 = xAt(l, q(0)), x = side === 1 ? x0 : Qn.neg(x0);
  const n = nearestInteger(x);
  if (n > 0n && isPrimeEnding(n, k)) return graded(x, n, true, g);
  return graded(x, nearestPrimeEnding(x, k), false, g);
}
// Same on Both Rulers: |c/(k − m)|.
function sobr(s: LineState, meets: 1 | -1, digits: "odd" | "even", g: Grade): number | null {
  const l = s.lines[0]!;
  let x: Q;
  if (isVertical(l)) x = Qn.abs(q(-l.c, l.a));
  else { const den = Qn.sub(q(meets), slope(l)); if (Qn.sign(den) === 0) return null; x = Qn.abs(Qn.div(intercept(l), den)); }
  let t = nearestPalindrome(x, digits);
  if (g === "log" && nearestInteger(x) !== t) {
    const D = Qn.floor(x).toString().length, par = digits === "odd" ? 1 : 0, cands = [t];
    for (const n of [D - 1, D, D + 1]) if (n >= 1 && n % 2 === par) { cands.push(10n ** BigInt(n) - 1n); if (n > 1) cands.push(10n ** BigInt(n - 1) + 1n); else cands.push(1n); }
    const lr = (c: bigint) => Math.abs(Math.log(Math.max(num(x), 1e-9) / Number(c)));
    t = cands.reduce((a, b) => (lr(b) < lr(a) ? b : a));
  }
  return graded(x, t, nearestInteger(x) === t, g);
}
const CHEAP = [
  ...["1", "-1"].flatMap(k => [{ mutator: "si.shift", args: { k } }, { mutator: "si.tilt", args: { k } }]),
  ...["a", "b", "c"].flatMap(which => ["1", "-1"].map(k => ({ mutator: "gen.nudge", args: { which, k } }))),
  ...["x", "y", "origin", "diagonal"].map(axis => ({ mutator: "cart.mirror", args: { axis } })),
];
function valueFn(score: (s: LineState) => number | null) {
  const r = rng("tilt-exp"), rows: [number, number][] = [], ln = law.log2Norm(T);
  let total = 0;
  for (let i = 0; i < N; i++) {
    const d = law.draw(r, T), w = 2 ** (-(1 - T) * d.bits + ln);
    total += w;
    if (!d.state) continue;
    const u = score(d.state);
    if (u !== null) rows.push([u, w]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  const us = rows.map(x => x[0]), cum: number[] = [];
  let acc = 0;
  for (const [, w] of rows) cum.push(acc += w);
  return (u: number | null) => {
    if (u === null) return 0;
    let lo = 0, hi = us.length;   // the first index with us[i] < u
    while (lo < hi) { const mid = (lo + hi) >> 1; if (us[mid]! >= u) lo = mid + 1; else hi = mid; }
    const mass = lo ? cum[lo - 1]! : 0;
    return mass > 0 ? Math.max(0, -Math.log2(mass / total)) : Math.log2(total / Math.min(...rows.map(x => x[1])));
  };
}
function report(name: string, score: (s: LineState, g: Grade) => number | null, witnesses: LineState[]) {
  for (const g of (name.startsWith("prime") ? ["digit", "both"] : ["log"]) as Grade[]) {
    const bits = valueFn(s => score(s, g)), kept: number[] = [];
    let worst = 1, worstMove = "", b0s: number[] = [], poles = 0, worstModest = 1, worstModestMove = "";
    for (const s of witnesses) {
      const b0 = bits(score(s, g));
      if (!(b0 > 0)) continue;
      b0s.push(b0);
      for (const c of CHEAP) {
        const a = applyCall(type as never, variant, s, { mutator: c.mutator, site: 0, args: c.args });
        if (isInvalid(a)) continue;
        const after = score(a.result as LineState, g);
        if (after === null) { poles++; continue; }   // onto the pole (flat, or parallel to the ruler): counted apart
        const k = bits(after) / b0;
        kept.push(k);
        if (k < worst) { worst = k; worstMove = `${c.mutator} ${JSON.stringify(c.args)}`; }
        if (c.mutator !== "cart.mirror" && k < worstModest) { worstModest = k; worstModestMove = `${c.mutator} ${JSON.stringify(c.args)}`; }
      }
    }
    kept.sort((x, y) => x - y);
    console.log(`${name} [${g}] rung bits ${b0s.map(b => b.toFixed(1)).join("/")}  median ${(100 * kept[kept.length >> 1]!).toFixed(0)}%  worst ${(100 * worst).toFixed(0)}% (${worstMove}), not a mirror ${(100 * worstModest).toFixed(0)}% (${worstModestMove})  n=${kept.length} poles=${poles}`);
  }
}
for (const ends of [1, 9]) for (const side of [1, -1] as const)
  report(`prime-landing ends ${ends} side ${side}`, (s, g) => pl(s, ends, side, g), [2, 3].flatMap(n => landingWitness({ ends, ...(side === -1 ? { side } : {}) } as never, n)));
for (const meets of [1, -1] as const) for (const digits of ["odd", "even"] as const)
  report(`same-on-both-rulers meets ${meets} ${digits}`, (s, g) => sobr(s, meets, digits, g), [2, 3].flatMap(n => rulersWitness({ meets, digits }, n)));
