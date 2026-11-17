// Probe: time per estimate, repeat spread, and which route kind wins, on random and climbed boards. Not a test.
import { rng } from "@workspace/v2-core";
import { grid4 } from "../src/type.ts";
import { dynamicGridFamilies } from "../src/dynamic-families.ts";
import { estimateGrid, gridStarts } from "../src/energy.ts";
import type { GridDynamicRule, GridState } from "../src/index.ts";
const r = rng("probe"), K = Number(process.argv[2] ?? 10);
export function climbed(rule: GridDynamicRule<any>, p: unknown, b: GridState, steps = 40): GridState {
  for (let i = 0; i < steps; i++) {
    let best = b, bu = rule.u(b, p);
    for (let c = 0; c < 16; c++) for (let x = 0; x < 10; x++) { const t = { cells: b.cells.map((y, j) => (j === c ? x : y)) }; const tu = rule.u(t, p); if (tu > bu) { best = t; bu = tu; } }
    if (best === b) break; b = best;
  }
  return b;
}
for (const f of dynamicGridFamilies) {
  const rule = f.dynamic as GridDynamicRule<any>, p = f.dealable(grid4)[0];
  const rand = gridStarts(grid4, 1, String(r.unit()))[0]!, top = climbed(rule, p, rand);
  estimateGrid(top, rule, p, grid4, { K, seed: "warm" });
  const t0 = performance.now(), es = Array.from({ length: 6 }, (_, i) => estimateGrid(top, rule, p, grid4, { K, seed: `s${i}` }));
  const ms = (performance.now() - t0) / 6, m = es.reduce((t, e) => t + e.energy, 0) / 6, sd = Math.sqrt(es.reduce((t, e) => t + (e.energy - m) ** 2, 0) / 5);
  const by = new Map<string, number>(); for (const e of es) for (const s of e.samples) by.set(s.by, (by.get(s.by) ?? 0) + 1);
  const er = estimateGrid(rand, rule, p, grid4, { K, seed: "r" });
  console.log(f.id.padEnd(16), `ms ${ms.toFixed(1)}`, `rand u ${er.u.toFixed(1)} E ${er.energy.toFixed(1)}`, `| top u ${es[0]!.u.toFixed(1)} E ${m.toFixed(1)} sd ${(100 * sd / m).toFixed(1)}% se ${es[0]!.spread.toFixed(1)}`, [...by].map(([k, n]) => `${k}:${n}`).join(" "));
}
