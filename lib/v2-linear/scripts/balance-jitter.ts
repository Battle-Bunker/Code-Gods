// Jitter probe (not a test; docs/engine-v2/balance.md): plays a few Lines · beginner games with balance-sim, then
// re-estimates each end standing many times with fresh seeds at several start counts K. Reports, per K: how often two
// independent readings order a pair of seats differently (a swap from estimate noise alone), the relative sd of a
// seat's total points, and the Node time of one estimate.
//   node --experimental-strip-types scripts/balance-jitter.ts
import { withPhysics } from "@workspace/v2-core";
import { LINES_BEGINNER_PHYSICS } from "@workspace/v2-economy";
import { lineQ } from "../src/type.ts";
import { dynamicFamilies } from "../src/dealt.ts";
import { estimateLine, lineRule } from "../src/energy.ts";
import { simulate } from "./balance-sim.ts";

const V = withPhysics(lineQ, LINES_BEGINNER_PHYSICS);
const Ks = [4, 8, 12, 16, 24], READS = 12;
const rows: Record<number, { pairs: number; swaps: number; closePairs: number; closeSwaps: number; relSd: number[]; ms: number[] }> = {};
for (const K of Ks) rows[K] = { pairs: 0, swaps: 0, closePairs: 0, closeSwaps: 0, relSd: [], ms: [] };
for (const seed of ["j0", "j1", "j2", "j3"]) {
  const g = simulate({ seed, rot: Number(seed[1]), worldSeconds: Number(process.env.JITTER_SECONDS ?? 600) });
  const rules = g.seats.map(s => lineRule((dynamicFamilies.find(f => f.id === s.fam) as any).dynamic, s.params));
  const standing = (K: number, r: number) => {
    const E = g.lineStates.map((l, li) => rules.map((rule, i) => {
      const t0 = performance.now();
      const e = estimateLine(l, rule, V, { K, seed: `${seed}:${K}:${r}:${li}:${i}` }).energy;
      rows[K]?.ms.push(performance.now() - t0);
      return e;
    }));
    return rules.map((_, i) => E.reduce((t, e) => { const sum = e.reduce((a, b) => a + b, 0); return t + e[i]! * Math.max(0, sum - e[i]!); }, 0));
  };
  // The reference order: K = 48, averaged over 4 readings.
  const ref = [0, 1, 2, 3].map(r => standing(48, 100 + r)).reduce((a, b) => a.map((x, i) => x + b[i]! / 4), [0, 0, 0, 0]);
  for (const K of Ks) {
    const reads = Array.from({ length: READS }, (_, r) => standing(K, r));
    const n = ref.length;
    for (let i = 0; i < n; i++) {
      const xs = reads.map(p => p[i]!), m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
      if (m > 0) rows[K]!.relSd.push(sd / m);
      for (let j = i + 1; j < n; j++) {
        const close = Math.abs(ref[i]! - ref[j]!) <= 0.2 * Math.max(ref[i]!, ref[j]!);
        for (let a = 0; a < READS; a++) for (let b = a + 1; b < READS; b++) {
          const swap = Math.sign(reads[a]![i]! - reads[a]![j]!) !== Math.sign(reads[b]![i]! - reads[b]![j]!);
          rows[K]!.pairs++; if (swap) rows[K]!.swaps++;
          if (close) { rows[K]!.closePairs++; if (swap) rows[K]!.closeSwaps++; }
        }
      }
    }
  }
  console.error(`game ${seed} done: ref ${ref.map(x => x.toFixed(0)).join(", ")}`);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;
console.log("| K | swap rate, all pairs | swap rate, pairs within 20% | median relative sd of a seat's points | estimate ms (median, p95; Node) |");
console.log("|---|---|---|---|---|");
for (const K of Ks) {
  const r = rows[K]!;
  console.log(`| ${K} | ${(r.swaps / r.pairs * 100).toFixed(1)}% | ${r.closePairs ? (r.closeSwaps / r.closePairs * 100).toFixed(1) + "%" : "–"} (${r.closePairs / ((READS * (READS - 1)) / 2)} pairs) | ${(med(r.relSd) * 100).toFixed(1)}% | ${med(r.ms).toFixed(1)}, ${p95(r.ms).toFixed(1)} |`);
}
