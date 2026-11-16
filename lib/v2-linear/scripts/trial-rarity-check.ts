// Formula against direct samples of the law, for five readings and three target sets (scoring-trial.md, rarity mode).
import { rng } from "@workspace/v2-core";
import { closeness, drawLine, fitReading, targetsPowersOf2, targetsPrimesEnding, READINGS, RARITY, targetsSmooth, survivalOf, type Targets } from "../src/index.ts";
const N = Number(process.argv[2] ?? 2_000_000);
const r = rng("rarity-check", 7);
const lines = Array.from({ length: N }, () => drawLine(r));
const sets: Targets[] = [targetsPrimesEnding("13"), targetsPowersOf2, targetsSmooth([3, 17])];
for (const id of ["c", "area", "crossing", "y3", "dist2"]) {
  const R = READINGS[id]!, S = survivalOf(R), vals = lines.map(l => R.read(l)).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const ge = (x: number) => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m]! < x) lo = m + 1; else hi = m; } return (vals.length - lo) / N; };
  const fit = id === "c" ? fitReading(R) : (S as ReturnType<typeof fitReading>);
  console.log(`\n${id}: ${S.how}; power-law fit of the same reading: slope ${fit.slope.toFixed(3)}, fit error ≤ ${fit.maxErr.toFixed(2)} bits`);
  for (const T of sets) {
    const rows: string[] = [];
    let worst = 0;
    for (const x of [3, 20, 100, 800, 5000]) {
      const t = T.around(x), lo = t.prev === 0 ? 0 : (t.prev + t.T) / 2, hi = (t.T + t.next) / 2;
      const emp = ge(lo); if (emp * N < 50) continue;
      const lv = -Math.log2(S(lo)), le = -Math.log2(emp);
      // closeness of an exact hit and of one unit off, against the samples in the cell
      const inCell = vals.filter(v => v >= lo && v < hi), pc = (dd: number) => inCell.filter(v => Math.abs(v - t.T) <= dd + RARITY.res / 2).length / Math.max(1, inCell.length);
      const ex = pc(0), one = pc(1);
      const cf0 = closeness(t.T, t, S), cf1 = closeness(t.T + 1, t, S);
      const ce0 = ex > 0 ? -Math.log2(ex) : NaN, ce1 = one > 0 ? -Math.log2(one) : NaN;
      worst = Math.max(worst, Math.abs(lv - le));
      rows.push(`T=${t.T}: level ${lv.toFixed(2)} vs ${le.toFixed(2)}; exact ${cf0.toFixed(1)} vs ${ce0.toFixed(1)}; ±1 ${cf1.toFixed(1)} vs ${ce1.toFixed(1)} (${inCell.length} in cell)`);
    }
    console.log(`  ${T.label}: worst level error ${worst.toFixed(2)} bits\n    ${rows.join("\n    ")}`);
  }
}
console.log(`\nN = ${N}, g = ${RARITY.g}, res = ${RARITY.res}`);
