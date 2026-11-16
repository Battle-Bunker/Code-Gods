/**
 * The DYNAMIC trial on grids (docs/engine-v2/scoring-trial.md, "Dynamic energy on grids"): energies of a random board,
 * a good board (four greedy steps from it) and a top board (greedy until no single move improves), for three dealt
 * beginner families with their first dealt tie-breaker; ms per estimate; how often the rewrite ceiling binds.
 *   node --experimental-strip-types scripts/dynamic-grid.ts
 */
import { rng } from "@workspace/v2-core";
import { grid4, gridType, BEGINNER_DEALT } from "../src/index.ts";
import { gridEnergy, gridScore, greedyClimb, lawBoard } from "../src/trial-dynamic.ts";
console.log("| family | board | score | energy | ceiling binds | already as good | ms |\n|---|---|---|---|---|---|---|");
for (const id of ["magic-eighteen", "opposite-nines", "strangers"]) {
  const f = gridType.families.find(x => x.id === id)!, rule = { family: f as never, params: f.dealable(grid4)[0], tieBreaker: BEGINNER_DEALT[id]![0]! };
  const r = rng("g", id), s0 = lawBoard(grid4, r);
  let t = performance.now(); const good = greedyClimb(s0, rule, grid4, 4); const exact = greedyClimb(s0, rule, grid4, 40);
  for (const [name, s] of [["random", s0], ["good", good], ["top", exact]] as const) { t = performance.now(); const e = gridEnergy(s, rule, grid4); console.log(`| ${id} | ${name} | ${JSON.stringify(gridScore(rule, s, grid4)?.map(x => x && Number(x.n) / Number(x.d)))} | ${e.energy.toFixed(0)} | ${(100 * e.ceilingBinds).toFixed(0)}% | ${(100 * e.zeroShare).toFixed(0)}% | ${(performance.now() - t).toFixed(0)} |`); }
}
