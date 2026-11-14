/**
 * pnpm --filter @workspace/v2-valuation grid-value-validate -- [--family id] [--draws n] [--json out.json]
 *
 * Calibrates the sampled survival intervals (value.ts sampledOracle, fed by grid-draws.ts) against the exact grid sums:
 * every grid rule with declared units is also valued from draws alone, and at every score the exact law reaches, the
 * sampled survival's error is measured in its own standard deviations (z), where the sampled oracle would certify a knot
 * (support ≥ minSupport). Prints z's spread per pairing and overall; a calibrated sampler has |z| > 2 about 4.6% of
 * the time.
 */
import { writeFileSync } from "node:fs";
import { compareScores, evaluateObject, scoreOf, tieBreakersOn, type Score } from "@workspace/v2-core";
import { gridSums, gridType, grid4 } from "@workspace/v2-grid";
import { gridJointLaw } from "./exact-grid.ts";
import { DRAW_CONFIG, GridMixture } from "./grid-draws.ts";
import { massOracle, sampledOracle, VALUE_CONFIG } from "./value.ts";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
const DRAWS = Number(opt("draws") ?? 400_000);
/** Scores need at least this many draws at or above them to be checked (and certified). */
const SUPPORT = Number(opt("min-support") ?? VALUE_CONFIG.minSupport);
const all: number[] = [];
const rows: Record<string, unknown>[] = [];
console.log("| Pairing | Scores checked | \\|z\\| > 2 | \\|z\\| > 3 | Worst \\|z\\| | RMS z |");
console.log("|---|--:|--:|--:|--:|--:|");
for (const f of gridType.families) {
  if (!gridSums[f.id] || (opt("family") && f.id !== opt("family"))) continue;
  for (const tb of tieBreakersOn(f, grid4)) {
    const p = f.dealable(grid4)[0];
    const { entries } = gridJointLaw(gridType, f, p, grid4, tb.id);
    const exact = massOracle("exact", entries.map(e => ({ u: scoreOf(f, p, grid4, tb.id, id => e.terms[id === f.main.id ? 0 : 1]!).utility, w: e.w })), 0);
    const utility = (cells: number[]): Score => { const e = evaluateObject(gridType, f, p, { cells }, grid4, tb.id); return e.utility === undefined ? e.score : e.utility; };
    const mixture = new GridMixture(grid4, f.id, ["grid-value-validate", f.id, tb.id]);
    mixture.adapt(utility, compareScores, DRAW_CONFIG);
    const draws = Array.from({ length: DRAWS }, () => { const d = mixture.draw(); return { u: utility(d.cells), w: d.w }; });
    const sampled = sampledOracle("draws", draws);
    const zs: number[] = [];
    for (const u of exact.candidates(VALUE_CONFIG.delta / 4)) {
      const s = sampled.survival(u), e = exact.survival(u);
      if (s.support < SUPPORT) continue;
      const sd = (s.hi - s.lo) / 4;   // the interval is ±2σ (clipped to [0, 1]: then σ is under-read and z conservative)
      if (!(sd > 0)) continue;
      zs.push((s.estimate - e.lo) / sd);
    }
    all.push(...zs);
    const a = zs.map(Math.abs), n = a.length;
    const row = { pairing: `${f.id} + ${tb.id}`, n, over2: a.filter(x => x > 2).length / n, over3: a.filter(x => x > 3).length / n, worst: Math.max(...a), rms: Math.sqrt(zs.reduce((t, z) => t + z * z, 0) / n), zs };
    rows.push(row);
    console.log(`| ${row.pairing} | ${n} | ${(100 * row.over2).toFixed(1)}% | ${(100 * row.over3).toFixed(1)}% | ${row.worst.toFixed(2)} | ${row.rms.toFixed(2)} |`);
  }
}
const a = all.map(Math.abs), n = a.length;
console.log(`\nAll: ${n} scores; |z| > 2: ${(100 * a.filter(x => x > 2).length / n).toFixed(1)}% (normal: 4.6%); |z| > 3: ${(100 * a.filter(x => x > 3).length / n).toFixed(2)}% (0.27%); RMS ${Math.sqrt(all.reduce((t, z) => t + z * z, 0) / n).toFixed(2)}`);
for (const k of [1, 1.25, 1.5, 2]) console.log(`  inflated ×${k}: |z| > 2 ${(100 * a.filter(x => x / k > 2).length / n).toFixed(1)}%, |z| > 3 ${(100 * a.filter(x => x / k > 3).length / n).toFixed(2)}%`);
if (opt("json")) writeFileSync(opt("json")!, JSON.stringify(rows));
