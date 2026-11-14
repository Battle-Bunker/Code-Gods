/**
 * The price of anarchy on lines: per table, the coordinated optimum (the line maximising the table's total points
 * Σ_i n_i · Σ_{j≠i} n_j, exact over the game-scale grid of whole-number lines) against what naive play reaches per line
 * at the end of a 300 s game on the server's economy (runTable, naive starters), and what moving every line straight
 * to the optimum would cost in energy against what the players have.
 *
 *   node --experimental-strip-types scripts/anarchy.ts [--seeds 2]
 */
import { parseArgs } from "node:util";
import { evaluateSite, q } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { fromMC, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { births, changeCharge, EngineHost, sandboxes, startersFor } from "../src/index.ts";
import { findValues } from "../src/harness.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: { seeds: { type: "string", default: "2" }, seconds: { type: "string", default: "300" } } });
const SEEDS = Array.from({ length: Number(o.seeds) }, (_, k) => `g${k}`), SECONDS = Number(o.seconds);
const beginner = presets.find(p => p.id === "lines-whole")!.rules;
const ruleOf = (id: string) => { const [family, tieBreaker] = id.split("/") as [string, string]; return { family, params: beginner.find(r => r.family === family)!.params as Record<string, unknown>, tieBreaker }; };
const TABLES: Record<string, string[]> = {
  "2 · compatible": ["prime-landing/big-prime", "prime-gradient/prime"],
  "2 · conflict": ["prime-landing/big-prime", "square-area/spf"],
  "3 · compatible": ["prime-landing/m-spf", "treasure/m-spf", "prime-gradient/prime"],
  "3 · mixed": ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  "4 · mixed": ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf", "prime-gradient/prime"],
};
const grid: { m: number; c: number; s: LineState }[] = [];
for (let m = -10; m <= 10; m++) if (m !== 0) for (let c = -60; c <= 60; c++) grid.push({ m, c, s: { lines: [fromMC(q(m), q(c))] } });
const total = (n: number[]) => { const t = n.reduce((a, b) => a + b, 0); return n.reduce((a, x) => a + x * (t - x), 0); };

const boxes = sandboxes();
console.log("| Table | Coordinated optimum per line (players' bits there) | Naive per line at the end | Price of anarchy | Energy to move every line there / players' energy |");
console.log("|---|---|--:|--:|---|");
for (const [name, ids] of Object.entries(TABLES)) {
  const rules = ids.map(ruleOf);
  const bitsOf = rules.map(rule => {
    const look = valueLookup(findValues(lineZ.id, rule)!), f = lineType.families.find(x => x.id === rule.family)!;
    return (s: LineState) => look(evaluateSite(lineType, f, rule.params, s, lineZ, 0, rule.tieBreaker).score).bits;
  });
  // 1. The coordinated optimum per line.
  let best = { k: 0, t: -1, n: [] as number[] };
  for (const [k, l] of grid.entries()) { const n = bitsOf.map(b => b(l.s)); const t = total(n); if (t > best.t) best = { k, t, n }; }
  const target = grid[best.k]!;
  // 2. What naive play reaches, per line at the end.
  let naive = 0, lines = 0, cost = 0, budget = 0;
  for (const seed of SEEDS) {
    const seats = rules.map((rule, k) => { const a = startersFor(rule.family, "typescript").find(x => x.kind === "naive")!; return { name: `P${k}`, kind: "naive" as const, rule, program: { language: a.language, source: a.source } }; });
    const r = await runTable(boxes, { type: lineType, variant: lineZ, lines: 24, seed, seconds: SECONDS, seats });
    naive += r.seats.reduce((t, s) => t + s.end, 0); lines += r.objects;
    // 4. Energy: each starting line moved straight to the target (one shift and one tilt, priced by v2-core), against the
    //    players' starting energy plus their power over the game.
    for (const s of births(lineType, lineZ, seed, 24)) {
      const l = s.lines[0]!, m = Number(-l.a / l.b), c = Number(-l.c / l.b);
      const calls = [
        ...(target.c !== c ? [{ mutator: "si.shift", site: 0, args: { k: String(target.c - c) } }] : []),
        ...(target.m !== m ? [{ mutator: "si.tilt", site: 0, args: { k: String(target.m - m) } }] : []),
      ];
      if (!calls.length) continue;
      const priced = new EngineHost({ type: lineType, variant: lineZ, state: s, rule: rules[0]!, energy: 0 }).price(calls);
      if (priced.valid) cost += changeCharge(priced.total);
    }
    budget += rules.length * (E.startingEnergy + E.powerPerSecond * SECONDS);
  }
  const perLine = naive / lines;
  console.log(`| ${name}: ${ids.join(", ")} | ${best.t.toFixed(0)} on y = ${target.m}x + ${target.c} (${best.n.map(x => x.toFixed(1)).join(", ")}) | ${perLine.toFixed(0)} | ${(best.t / perLine).toFixed(1)}× | ${cost.toFixed(0)} / ${budget.toFixed(0)} ⚡ |`);
}
await boxes.close();
