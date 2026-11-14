/**
 * Shared wins on grids (4×4, sixteen digit cells): for 2, 3 and 4 players (distinct families, each family's first dealt
 * tie-breaker), is there a board on which every player keeps at least `--keep` (default 80%) of their best alone?
 * Boards are far too many to enumerate (10^16), so this searches: hill-climbing over single-cell changes from random
 * boards, with restarts, first for each rule's best alone, then for each table's best worst-kept share. A table found
 * winnable is winnable; one not found may still be (the count is a lower bound).
 *
 *   node --experimental-strip-types scripts/grid-tables.ts [--restarts 6] [--keep 0.8] [--sizes 2,3,4]
 */
import { parseArgs } from "node:util";
import { evaluateSite, rng } from "@workspace/v2-core";
import { gridPresets, gridType, grid4, type GridState } from "@workspace/v2-grid";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";

const { values: o } = parseArgs({ options: { restarts: { type: "string", default: "6" }, keep: { type: "string", default: "0.8" }, sizes: { type: "string", default: "2,3,4" } } });
const RESTARTS = Number(o.restarts), KEEP = Number(o.keep);
const pool = gridPresets.find(p => p.id === "grids-beginner")!.rules;
const rules = pool.map(r => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreakers[0]! }));
const value = rules.map(rule => {
  const vf = findValues(grid4.id, rule);
  if (!vf) throw new Error(`no value function for ${rule.family}/${rule.tieBreaker}`);
  const look = valueLookup(vf), f = gridType.families.find(x => x.id === rule.family)!;
  const cache = new Map<string, number>();
  return (s: GridState) => {
    const key = s.cells.join("");
    let b = cache.get(key);
    if (b === undefined) { const e = evaluateSite(gridType, f, rule.params, s, grid4, 0, rule.tieBreaker); b = look(e.score).bits; cache.set(key, b); }
    return b;
  };
});
const r = rng("grid-tables");
const randomBoard = (): GridState => ({ cells: Array.from({ length: 16 }, () => r.below(10)) });

/** Hill-climb `score` over single-cell changes from `restarts` random boards; the best board and score found. */
function climb(score: (s: GridState) => number, restarts = RESTARTS): { s: GridState; v: number } {
  let best = { s: randomBoard(), v: -Infinity };
  for (let k = 0; k < restarts; k++) {
    let s = randomBoard(), v = score(s);
    for (;;) {
      let next = s, nv = v;
      for (let i = 0; i < 16; i++) for (let d = 0; d < 10; d++) {
        if (d === s.cells[i]) continue;
        const t = { cells: s.cells.map((x, j) => (j === i ? d : x)) }, tv = score(t);
        if (tv > nv) { next = t; nv = tv; }
      }
      if (next === s) break;
      s = next; v = nv;
    }
    if (v > best.v) best = { s, v };
  }
  return best;
}

const alone = rules.map((_, i) => climb(value[i]!, RESTARTS * 2).v);
console.log(`best alone (search): ${rules.map((x, i) => `${x.family} ${alone[i]!.toFixed(1)}`).join(", ")}`);
for (const n of o.sizes.split(",").map(Number)) {
  let tables = 0, wins = 0;
  const examples: string[] = [];
  const choose = (from: number, acc: number[]) => {
    if (acc.length === n) {
      tables++;
      const found = climb(s => Math.min(...acc.map(i => value[i]!(s) / alone[i]!)));
      if (found.v >= KEEP) { wins++; if (examples.length < 3) examples.push(`${acc.map(i => rules[i]!.family).join(" · ")} on ${found.s.cells.join("")}`); }
      return;
    }
    for (let i = from; i < rules.length; i++) choose(i + 1, [...acc, i]);
  };
  choose(0, []);
  console.log(`${n} players: ${wins} of ${tables} tables have a board found where every player keeps ≥ ${KEEP * 100}% of their best alone${examples.length ? `; e.g. ${examples.join("; ")}` : ""}`);
}
