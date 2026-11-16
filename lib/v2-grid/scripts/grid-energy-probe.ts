// Probe: time per estimate and spread of energy (random boards vs boards climbed toward each rule). Not a test.
import { rng } from "@workspace/v2-core";
import { grid4 } from "../src/type.ts";
import { dynamicGridFamilies } from "../src/dynamic-families.ts";
import { estimateGrid, lawBoard } from "../src/energy.ts";
import type { GridDynamicRule } from "../src/dynamic-families.ts";
const r = rng("probe");
for (const f of dynamicGridFamilies) {
  const rule = f.dynamic as GridDynamicRule<any>, p = f.dealable(grid4)[0];
  // climb: greedy single-cell changes by utility, 40 steps
  let b = lawBoard(grid4, r);
  const rand = b;
  for (let i = 0; i < 40; i++) {
    let best = b, bu = rule.u(b, p);
    for (let c = 0; c < 16; c++) for (let x = 0; x < 10; x++) { const t = { cells: b.cells.map((y, j) => (j === c ? x : y)) }; const tu = rule.u(t, p); if (tu > bu) { best = t; bu = tu; } }
    if (best === b) break; b = best;
  }
  const t0 = performance.now();
  const e1 = estimateGrid(rand, rule, p, grid4), e2 = estimateGrid(b, rule, p, grid4), e3 = estimateGrid(b, rule, p, grid4);
  const ms = (performance.now() - t0) / 3;
  const binds = e2.samples.filter(s => s.direct <= Math.min(s.floor, s.heuristic)).length;
  console.log(f.id.padEnd(16), `ms ${ms.toFixed(1)}`, `rand u ${e1.u.toFixed(1)} E ${e1.energy.toFixed(0)}`, `| climbed u ${e2.u.toFixed(1)} E ${e2.energy.toFixed(0)}/${e3.energy.toFixed(0)} directBinds ${binds}/8`);
}
