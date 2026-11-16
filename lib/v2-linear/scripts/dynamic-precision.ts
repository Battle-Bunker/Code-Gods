/**
 * DYNAMIC trial, precision (docs/engine-v2/scoring-trial.md, "Dynamic energy: precision"): the K at which 20-object
 * sums separate on target from a little off target (z ≥ 3), with fresh starts and with the same starts shared between
 * the two states compared; ms per estimate at each K. Then probes of inflating size while holding utility.
 *   node --experimental-strip-types scripts/dynamic-precision.ts
 */
import { q } from "@workspace/v2-core";
import { dynamicEnergy, dynamicExamples, fromMC, isPrimeN, type DynamicFamily, type Line } from "../src/index.ts";

const nearestOk = (T: number, ok: (n: number) => boolean) => { for (let d = 0; ; d++) { if (ok(T - d)) return T - d; if (ok(T + d)) return T + d; } };
const prime1 = (T: number) => nearestOk(T, n => n % 10 === 1 && isPrimeN(n));
const smooth37 = (T: number) => nearestOk(T, n => { let x = n; for (const p of [3, 7]) while (x % p === 0) x /= p; return x === 1 && n > 1; });
const pow3 = (T: number) => 3 ** Math.round(Math.log(T) / Math.log(3));
function climb(F: DynamicFamily, T: number): { exact: Line; near: Line } {
  const half = q(3, 2);
  if (F.id.startsWith("prime-gradient")) { const p = prime1(T); return { exact: fromMC(q(p), q(5, 3)), near: fromMC(q(4 * p + 1, 4), q(5, 3)) }; }
  if (F.id.startsWith("smooth")) { const s = smooth37(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(4 * s + 1, 4)) }; }
  if (F.id.startsWith("owner")) { const s = pow3(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(2 * s + 1, 2)) }; }
  const p = prime1(T); return { exact: fromMC(q(p), q((p + 1) / 2)), near: fromMC(q(4 * p + 1, 4), q((p + 1) / 2)) };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length, sd = (xs: number[]) => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const f0 = (x: number) => x.toFixed(0), f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2);

const fams = dynamicExamples.slice(1), objs = Array.from({ length: 20 }, (_, i) => fams[i % fams.length]!), SUMS = 10;
console.log("### On target against a little off, 20-object sums at T ≈ 1000 (10 sums each)\n\n| K | ms per estimate | fresh: A − B (sd of one sum) | z fresh | same starts: mean of A − B (sd) | z same starts |\n|---|---|---|---|---|---|");
for (const K of [30, 100, 300, 600]) {
  let ms = 0, n = 0;
  const est = (s: Line, F: DynamicFamily, seed?: string) => { const t = performance.now(), e = dynamicEnergy(s, F, { K, ...(seed ? { seed } : {}) }).energy; ms += performance.now() - t; n++; return e; };
  const A = Array.from({ length: SUMS }, () => objs.reduce((a, F) => a + est(climb(F, 1000).exact, F), 0));
  const B = Array.from({ length: SUMS }, () => objs.reduce((a, F) => a + est(climb(F, 1000).near, F), 0));
  // Same starts: one seed per object and sum, used for both states (their read numbers have the same magnitude).
  const D = Array.from({ length: SUMS }, (_, j) => objs.reduce((a, F, i) => a + est(climb(F, 1000).exact, F, `pair:${K}:${j}:${i}`) - est(climb(F, 1000).near, F, `pair:${K}:${j}:${i}`), 0));
  const zFresh = (mean(A) - mean(B)) / Math.max(sd(A), sd(B)), zPaired = mean(D) / sd(D);
  console.log(`| ${K} | ${f1(ms / n)} | ${f0(mean(A) - mean(B))} (${f0(Math.max(sd(A), sd(B)))}) | ${f2(zFresh)} | ${f0(mean(D))} (${f0(sd(D))}) | ${f2(zPaired)} |`);
}

// Inflating size while holding utility (magnitude): a bigger read number with the same utility, or a bigger unread one.
console.log("\n### Inflating size while holding utility (K = 100, mean of 5 fresh estimates)\n\n| family | state | u | energy | inflated state | u | energy |\n|---|---|---|---|---|---|---|");
const probe = (F: DynamicFamily, a: Line, b: Line, la: string, lb: string) => {
  const ea = dynamicEnergy(a, F, { K: 100 }), eb = dynamicEnergy(b, F, { K: 100 });
  const ma = mean(Array.from({ length: 5 }, () => dynamicEnergy(a, F, { K: 100 }).energy)), mb = mean(Array.from({ length: 5 }, () => dynamicEnergy(b, F, { K: 100 }).energy));
  console.log(`| ${F.id} | ${la} | ${f2(ea.u)} | ${f0(ma)} | ${lb} | ${f2(eb.u)} | ${f0(mb)} |`);
};
const [, pg, sm, , tied] = dynamicExamples as readonly DynamicFamily[];
probe(sm!, fromMC(q(3, 2), q(81)), fromMC(q(3, 2), q(2401)), "c = 81 = 3⁴", "c = 2401 = 7⁴ (same Ω)");
probe(tied!, fromMC(q(1031), q(516)), fromMC(q(1031), q(516 * 1001)), "m = 1031, c = 516", "c = 516 × 1001 (same gcd)");
probe(pg!, fromMC(q(1031), q(5, 3)), fromMC(q(1031), q(1000003, 3)), "m = 1031, c = 5/3", "c = 1000003/3 (unread)");
