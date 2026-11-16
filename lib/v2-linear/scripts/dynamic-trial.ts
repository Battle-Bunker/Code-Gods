/**
 * The DYNAMIC trial mode's report (docs/engine-v2/scoring-trial.md, "Dynamic energy"): (1) cost per (state, rule);
 * (2) energy along a climb at sizes 100, 1k, 10k, exact and near, with the sd across seeds; (3) non-monotonicity; (4) a
 * hunt for overvaluation (a deeper search against the reference, per neighbour); (5) sensitivity to walk length and K.
 *   node --experimental-strip-types scripts/dynamic-trial.ts
 */
import { q, Qn, rng, type Q } from "@workspace/v2-core";
import { anchorsOf, DEEP, dynamicEnergy, dynamicExamples, fromMC, isPrimeN, readings, REFERENCE, searchFrom, walkFrom, type DynamicUtility, type Line } from "../src/index.ts";

const TS = [100, 1000, 10000], SEEDS = ["0", "1", "2", "3", "4"];
const nearestOk = (T: number, ok: (n: number) => boolean) => { for (let d = 0; ; d++) { if (ok(T - d)) return T - d; if (ok(T + d)) return T + d; } };
const prime1 = (T: number) => nearestOk(T, n => n % 10 === 1 && isPrimeN(n));
const smooth37 = (T: number) => nearestOk(T, n => { let x = n; for (const p of [3, 7]) while (x % p === 0) x /= p; return x === 1 && n > 1; });
const pow3 = (T: number) => 3 ** Math.round(Math.log(T) / Math.log(3));
/** The climb's state at size T: exact (on the target) and near (a little off it). */
function climb(U: DynamicUtility, T: number): { exact: Line; near: Line } {
  const half = q(3, 2);
  switch (U.id) {
    case "bigger-c": return { exact: fromMC(half, q(T)), near: fromMC(half, q(T - 1)) };
    case "prime-gradient": { const p = prime1(T); return { exact: fromMC(q(p), q(5, 3)), near: fromMC(q(4 * p + 1, 4), q(5, 3)) }; }
    case "smooth-intercept": { const s = smooth37(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(4 * s + 1, 4)) }; }
    case "owner-k3": { const s = pow3(T); return { exact: fromMC(half, q(s)), near: fromMC(half, q(2 * s + 1, 2)) }; }
    default: { const p = prime1(T); return { exact: fromMC(q(p), q((p + 1) / 2)), near: fromMC(q(4 * p + 1, 4), q((p + 1) / 2)) }; }
  }
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length, sd = (xs: number[]) => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const f0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "—"), f2 = (x: number) => x.toFixed(2);

// (1) and (2)
const ms: number[] = [], evals: number[] = [];
console.log("### (2) Energy along a climb (K = 30, walk 3, reference search; mean over 5 seeds ± sd)\n");
console.log(`| utility | ${TS.map(T => `T ≈ ${T}: exact (u) | near (u)`).join(" | ")} |\n|---|${TS.map(() => "---|---").join("|")}|`);
for (const U of dynamicExamples) {
  const cells: string[] = [];
  for (const T of TS) for (const which of ["exact", "near"] as const) {
    const s = climb(U, T)[which], es = SEEDS.map(seed => { const t = performance.now(), e = dynamicEnergy(s, U, { seed }); const d = performance.now() - t; ms.push(d); evals.push(e.evals); if (d > 1000) console.error(`slow: ${U.id} ${T} ${which} ${seed} ${s.a},${s.b},${s.c} ${d.toFixed(0)}ms`); return e; });
    cells.push(`${f0(mean(es.map(e => e.energy)))} ± ${f0(sd(es.map(e => e.energy)))} (${f2(es[0]!.u)})`);
  }
  console.log(`| ${U.id} | ${cells.join(" | ")} |`);
}
console.log(`\n### (1) Cost: ${f0(mean(ms))} ms per (state, rule) on average (max ${f0(Math.max(...ms))}), ${f0(mean(evals))} utility evaluations (max ${Math.max(...evals)}), K = 30, Node ${process.version}\n`);

// (3) non-monotonicity: pairs (s, s') with s' one random move from s and u(s') ≠ u(s)
console.log("### (3) Non-monotonicity (pairs one move apart: share where the higher-utility state scores lower; and where it does so by more than 20, about twice the typical seed sd)\n\n| utility | pairs | higher u, lower energy | by more than 20 |\n|---|---|---|---|");
for (const U of dynamicExamples) {
  let pairs = 0, inverted = 0, clear = 0;
  for (const T of TS) {
    const s = climb(U, T).exact, es = dynamicEnergy(s, U).energy, r = rng("mono", U.id, T);
    for (let i = 0; i < 12; i++) {
      const t = walkFrom(s, 1, r).line, rt = readings(t);
      if (!rt) continue;
      const et = dynamicEnergy(t, U);
      if (Math.abs(et.u - U.u(readings(s)!)) < 1e-9) continue;
      pairs++;
      if ((et.u > U.u(readings(s)!)) !== (et.energy > es)) { inverted++; if (Math.abs(et.energy - es) > 20) clear++; }
    }
  }
  console.log(`| ${U.id} | ${pairs} | ${f0((100 * inverted) / Math.max(1, pairs))}% | ${f0((100 * clear) / Math.max(1, pairs))}% |`);
}

// (4) the hunt: per neighbour, the reference's price against a deeper search's
console.log("\n### (4) Hunt for overvaluation (per neighbour: min(cap, reference) / min(cap, deep); worst six, and energy ratios)\n");
type Case = { U: string; T: number; which: string; ratio: number; ref: number; deep: number; refRoute: string; deepRoute: string };
const cases: Case[] = [], eRatio: string[] = [];
for (const U of dynamicExamples) for (const T of TS) for (const which of ["exact", "near"] as const) {
  const s = climb(U, T)[which], e = dynamicEnergy(s, U), anchors = anchorsOf(s), r = rng("deep", U.id, T, which), stats = { evals: 0 };
  let sumDeep = 0;
  for (const smp of e.samples) {
    const d = searchFrom(smp.from, U, e.u, anchors, DEEP, r, stats), ref = Math.min(smp.cap, smp.found.cost), deep = Math.min(smp.cap, d.cost, smp.found.cost);
    sumDeep += deep;
    if (deep > 0) cases.push({ U: U.id, T, which, ratio: ref / deep, ref, deep, refRoute: smp.found.cost <= smp.cap ? smp.found.route.join(" → ") : "cap (walk back)", deepRoute: d.route.join(" → ") });
    else if (ref > 0) cases.push({ U: U.id, T, which, ratio: Infinity, ref, deep, refRoute: smp.found.route.join(" → "), deepRoute: "(already in)" });
  }
  eRatio.push(`${U.id} ${T} ${which}: ${f2(e.energy / Math.max(1e-9, sumDeep / e.samples.length))}`);
}
cases.sort((a, b) => b.ratio - a.ratio);
console.log("| utility, T, state | reference | deep | ratio | reference route | deep route |\n|---|---|---|---|---|---|");
for (const c of cases.slice(0, 6)) console.log(`| ${c.U}, ${c.T}, ${c.which} | ${f0(c.ref)} | ${f0(c.deep)} | ${f2(c.ratio)} | ${c.refRoute} | ${c.deepRoute} |`);
console.log(`\nNeighbours where deep is cheaper by more than 1.5×: ${cases.filter(c => c.ratio > 1.5).length} of ${cases.length}. Energy ratio reference / deep, per state: ${eRatio.join("; ")}.`);

// (5) sensitivity
console.log("\n### (5) Sensitivity at T ≈ 1000, exact (mean over 5 seeds ± sd)\n\n| utility | walk 1, K 30 | walk 3, K 30 | walk 6, K 30 | walk 3, K 10 | walk 3, K 60 |\n|---|---|---|---|---|---|");
for (const U of dynamicExamples.filter(u => u.id === "prime-gradient" || u.id === "owner-k3" || u.id === "smooth-intercept")) {
  const s = climb(U, 1000).exact;
  const cell = (walk: number, K: number) => { const es = SEEDS.map(seed => dynamicEnergy(s, U, { seed, walk, K }).energy); return `${f0(mean(es))} ± ${f0(sd(es))}`; };
  console.log(`| ${U.id} | ${cell(1, 30)} | ${cell(3, 30)} | ${cell(6, 30)} | ${cell(3, 10)} | ${cell(3, 60)} |`);
}
void Qn; void (null as unknown as Q); void REFERENCE;
