/**
 * pnpm --filter @workspace/v2-valuation grid-validate -- [--family id] [--json out.json]
 *
 * Decision 22's validation table: every grid rule with an exact value is also sampled (sample-grid.ts), and each rung's
 * sampled value is compared with the exact one in units of the sampler's own standard error. Prints a Markdown table
 * (grids.md §5 holds the committed one).
 */
import { writeFileSync } from "node:fs";
import { tieBreakersOn } from "@workspace/v2-core";
import { gridType, grid4, gridSums } from "@workspace/v2-grid";
import { exactGridLadder } from "./exact-grid.ts";
import { sampleGridLadder } from "./sample-grid.ts";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
const seed = opt("seed") ?? "validate";
const rows: Record<string, unknown>[] = [];
console.log("| Pairing | Rungs | Converged through (bits there) | Worst \\|z\\|, converged rungs | Worst \\|z\\|, all rungs | Exact top | Sampled top | Boards |");
console.log("|---|--:|--:|--:|--:|--:|--:|--:|");
for (const f of gridType.families) {
  if (!gridSums[f.id] || (opt("family") && f.id !== opt("family"))) continue;
  for (const tb of tieBreakersOn(f, grid4)) {
    const p = f.dealable(grid4)[0];
    const ex = exactGridLadder(gridType, f, p, grid4, tb.id);
    const s = sampleGridLadder(gridType, f, p, grid4, tb.id, seed);
    const top = ex.lo.length - 1;
    let worstZ = 0, worstAll = 0;
    const zs: number[] = [];
    for (let k = 1; k <= top; k++) {
      const r = s.rungs[k]!, z = Number.isFinite(r.bits) ? Math.abs(r.bits - ex.lo[k]!) / r.error : NaN;
      if (k <= s.convergedThrough) { worstZ = Math.max(worstZ, z); zs.push(Math.sign(r.bits - ex.lo[k]!) * z); }
      if (Number.isFinite(z)) worstAll = Math.max(worstAll, z);
    }
    const row = { pairing: `${f.id} + ${tb.id}`, rungs: top, through: s.convergedThrough, throughBits: ex.lo[s.convergedThrough]!, worstZ, worstAll, exactTop: ex.lo[top]!, sampledTop: s.rungs[top]!.bits, sampledError: s.rungs[top]!.error, boards: s.evaluations, zs };
    rows.push(row);
    console.log(`| ${row.pairing} | ${top} | ${s.convergedThrough} (${row.throughBits.toFixed(1)}) | ${worstZ.toFixed(2)} | ${worstAll.toFixed(2)} | ${row.exactTop.toFixed(2)} | ${row.sampledTop.toFixed(2)} ± ${row.sampledError.toFixed(2)} | ${(s.evaluations / 1e6).toFixed(1)}M |`);
  }
}
if (opt("json")) writeFileSync(opt("json")!, JSON.stringify(rows, null, 1));
