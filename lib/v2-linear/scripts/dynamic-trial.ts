/**
 * The DYNAMIC trial mode's report (docs/engine-v2/scoring-trial.md, "Dynamic energy"): (1) cost per estimate; (2) energy
 * along a climb at sizes 100, 1k, 10k, exact and near, with the jitter of one estimate and the generic floor's
 * overvaluation (floor alone against floor plus the family's heuristics); (3) non-monotonicity; (4) a hunt for
 * overvaluation (a deeper search, per start); (5) sensitivity to the size band and K; (6) whether sums over 20 objects
 * separate two standings. Fresh randomness throughout except where a comparison needs the same starts.
 *   node --experimental-strip-types scripts/dynamic-trial.ts
 */
import { q, Qn } from "@workspace/v2-core";
import { deepSearch, dynamicEnergy as rawEnergy, dynamicExamples, fromMC, isPrimeN, type DynamicFamily, type DynamicOpts, type Line, type SizeBy } from "../src/index.ts";
const dynamicEnergy = (s: Line, F: DynamicFamily, o: DynamicOpts = {}) => rawEnergy(s, F, { sizeBy: SIZE_BY, ...o });

const TS = [100, 1000, 10000], REPEATS = 5, SIZE_BY = (process.env.SIZE_BY ?? "magnitude") as SizeBy;
console.log(`Size matched by: ${SIZE_BY}\n`);
const nearestOk = (T: number, ok: (n: number) => boolean) => { for (let d = 0; ; d++) { if (ok(T - d)) return T - d; if (ok(T + d)) return T + d; } };
const prime1 = (T: number) => nearestOk(T, n => n % 10 === 1 && isPrimeN(n));
const smooth37 = (T: number) => nearestOk(T, n => { let x = n; for (const p of [3, 7]) while (x % p === 0) x /= p; return x === 1 && n > 1; });
const pow3 = (T: number) => 3 ** Math.round(Math.log(T) / Math.log(3));
/** A climb's state at size T: exact (on the target) and near (a little off it, so a little lower utility). */
function climb(F: DynamicFamily, T: number): { exact: Line; near: Line } {
  const half = q(3, 2);
  if (F.id === "bigger-c") return { exact: fromMC(half, q(T)), near: fromMC(half, q(T - 1)) };
  if (F.id.startsWith("prime-gradient")) { const p = prime1(T); return { exact: fromMC(q(p), q(5, 3)), near: fromMC(q(4 * p + 1, 4), q(5, 3)) }; }
  if (F.id.startsWith("smooth")) { const s = smooth37(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(4 * s + 1, 4)) }; }
  if (F.id.startsWith("owner")) { const s = pow3(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(2 * s + 1, 2)) }; }
  const p = prime1(T); return { exact: fromMC(q(p), q((p + 1) / 2)), near: fromMC(q(4 * p + 1, 4), q((p + 1) / 2)) };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length, sd = (xs: number[]) => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const f0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "—"), f2 = (x: number) => x.toFixed(2);

// (2) the climb, with (1) timings and the floor-only gap
const ms: number[] = [], evals: number[] = [];
console.log(`### (2) Energy along a climb (K = 30, band 0.5 bits; mean of ${REPEATS} fresh estimates ± the sd of one; [floor only, same starts])\n`);
console.log(`| family | ${TS.map(T => `T ≈ ${T}: exact (u) | near (u)`).join(" | ")} |\n|---|${TS.map(() => "---|---").join("|")}|`);
for (const F of dynamicExamples) {
  const cells: string[] = [];
  for (const T of TS) for (const which of ["exact", "near"] as const) {
    const s = climb(F, T)[which], es = Array.from({ length: REPEATS }, (_, i) => { const t = performance.now(), e = dynamicEnergy(s, F, { seed: `climb:${F.id}:${T}:${which}:${i}` }); ms.push(performance.now() - t); evals.push(e.evals); return e; });
    const bare = mean(Array.from({ length: REPEATS }, (_, i) => dynamicEnergy(s, F, { seed: `climb:${F.id}:${T}:${which}:${i}`, heuristics: false }).energy));
    cells.push(`${f0(mean(es.map(e => e.energy)))} ± ${f0(sd(es.map(e => e.energy)))} (${f2(es[0]!.u)}) [${f0(bare)}]`);
  }
  console.log(`| ${F.id} | ${cells.join(" | ")} |`);
}
console.log(`\n### (1) Cost: ${f0(mean(ms))} ms per estimate on average (max ${f0(Math.max(...ms))}), ${f0(mean(evals))} utility evaluations (max ${Math.max(...evals)}); K = 30, Node ${process.version}\n`);

// (3) non-monotonicity: a state and a small change of its read number (±1, ±1/4), fresh estimates
console.log("### (3) Non-monotonicity (a state and a small change of a read number: share where the higher-utility one scores lower; and by more than twice the jitter of one estimate)\n\n| family | pairs | higher u, lower energy | by more than 2 sd |\n|---|---|---|---|");
for (const F of dynamicExamples) {
  let pairs = 0, inverted = 0, clear = 0;
  for (const T of TS) {
    const s = climb(F, T).exact, on = F.reads[0]!, es = dynamicEnergy(s, F), jitter = sd(Array.from({ length: REPEATS }, () => dynamicEnergy(s, F).energy));
    const m = q(-s.a, s.b), c = q(-s.c, s.b);
    for (const d of [q(1), q(-1), q(1, 4), q(-1, 4), q(3), q(-3)]) {
      const t = on === "m" ? fromMC(Qn.add(m, d), c) : fromMC(m, Qn.add(c, d));
      const et = dynamicEnergy(t, F);
      if (!Number.isFinite(et.u) || Math.abs(et.u - es.u) < 1e-9) continue;
      pairs++;
      if ((et.u > es.u) !== (et.energy > es.energy)) { inverted++; if (Math.abs(et.energy - es.energy) > 2 * jitter) clear++; }
    }
  }
  console.log(`| ${F.id} | ${pairs} | ${f0((100 * inverted) / Math.max(1, pairs))}% | ${f0((100 * clear) / Math.max(1, pairs))}% |`);
}

// (4) the hunt: per start, the estimate's price against a deeper search
console.log("\n### (4) Hunt for overvaluation (per start: the estimate's price / a deeper search's (depth 4, beam 6); the worst six)\n");
type Case = { F: string; T: number; which: string; ratio: number; est: number; deep: number; route: string };
const cases: Case[] = [], eRatio: string[] = [];
for (const F of dynamicExamples) for (const T of TS) for (const which of ["exact", "near"] as const) {
  const s = climb(F, T)[which], e = dynamicEnergy(s, F, { K: 20, seed: `hunt:${F.id}:${T}:${which}` });
  let sumDeep = 0;
  for (const x of e.samples) {
    const d = x.cost === 0 ? { cost: 0, route: [] } : deepSearch(x.from, s, F), deep = Math.min(x.cost, d.cost);
    sumDeep += deep;
    if (deep > 0 && x.cost / deep > 1) cases.push({ F: F.id, T, which, ratio: x.cost / deep, est: x.cost, deep, route: d.route.join(" → ") });
  }
  eRatio.push(`${F.id} ${T} ${which} ${f2(e.energy / Math.max(1e-9, sumDeep / e.samples.length))}`);
}
cases.sort((a, b) => b.ratio - a.ratio);
console.log("| family, T, state | estimate | deep | ratio | deep route |\n|---|---|---|---|---|");
for (const c of cases.slice(0, 6)) console.log(`| ${c.F}, ${c.T}, ${c.which} | ${f0(c.est)} | ${f0(c.deep)} | ${f2(c.ratio)} | ${c.route} |`);
console.log(`\nStarts where the deeper search is cheaper by more than 1.5×: ${cases.filter(c => c.ratio > 1.5).length} of ${dynamicExamples.length * TS.length * 2 * 20}. Energy ratio estimate / deep: ${eRatio.join("; ")}.`);

// (5) sensitivity
console.log(`\n### (5) Sensitivity at T ≈ 1000, exact (mean of ${REPEATS} ± sd)\n\n| family | band 0.25, K 30 | band 0.5, K 30 | band 1, K 30 | band 0.5, K 10 | band 0.5, K 60 |\n|---|---|---|---|---|---|`);
for (const F of dynamicExamples.slice(1)) {
  const s = climb(F, 1000).exact;
  const cell = (band: number, K: number) => { const es = Array.from({ length: REPEATS }, () => dynamicEnergy(s, F, { band, K }).energy); return `${f0(mean(es))} ± ${f0(sd(es))}`; };
  console.log(`| ${F.id} | ${cell(0.25, 30)} | ${cell(0.5, 30)} | ${cell(1, 30)} | ${cell(0.5, 10)} | ${cell(0.5, 60)} |`);
}

// (6) sums over a game's worth of objects
console.log("\n### (6) Do sums over 20 objects separate two standings? (10 fresh sums each; z = difference of means / sd of one sum)\n");
const fams = dynamicExamples.slice(1);
const standing = (T: number, which: "exact" | "near") => Array.from({ length: 20 }, (_, i) => climb(fams[i % fams.length]!, T)[which]).map((s, i) => [s, fams[i % fams.length]!] as const);
const sums = (objs: readonly (readonly [Line, DynamicFamily])[]) => Array.from({ length: 10 }, () => objs.reduce((a, [s, F]) => a + dynamicEnergy(s, F).energy, 0));
const A = sums(standing(1000, "exact")), B = sums(standing(1000, "near")), C = sums(standing(500, "exact"));
const z = (x: number[], y: number[]) => (mean(x) - mean(y)) / Math.max(sd(x), sd(y), 1e-9);
console.log(`| standing | sum (mean ± sd) | z against A |\n|---|---|---|\n| A: 20 objects at T ≈ 1000, on target | ${f0(mean(A))} ± ${f0(sd(A))} | |\n| B: the same, a little off target | ${f0(mean(B))} ± ${f0(sd(B))} | ${f2(z(A, B))} |\n| C: on target at T ≈ 500 | ${f0(mean(C))} ± ${f0(sd(C))} | ${f2(z(A, C))} |`);
