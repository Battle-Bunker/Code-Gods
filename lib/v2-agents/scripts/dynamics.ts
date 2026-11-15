/**
 * Starter dynamics on a setup (no change to game logic): three seats, each running a shipped starter for its rule,
 * play a table of unique lines, and the act log is cut into minutes. Per minute: committed moves, how many objects
 * changed, the share of acts that made no move (idle), and the energy spent on reads. The question it answers (owner
 * decision 34, the coordinator's check): with few objects, few opportunities and a long game, do the starters run dry
 * or sit idle, or do the objects keep moving?
 *
 *   node --experimental-strip-types scripts/dynamics.ts [--table mixed] [--kind simple|thorough|bold] [--variant line-q]
 *     [--seconds 600] [--objects 3] [--births 0.0041667] [--rate 3] [--noise 0] [--games 3]
 */
import { parseArgs } from "node:util";
import { readCharge } from "@workspace/v2-economy";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { lineQ, lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  table: { type: "string", default: "mixed" }, kind: { type: "string", default: "simple" }, variant: { type: "string", default: "line-q" },
  seconds: { type: "string", default: "600" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  rate: { type: "string", default: "3" }, noise: { type: "string", default: "0" }, games: { type: "string", default: "3" },
} });
const TABLES: Record<string, string[]> = {
  mixed: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  conflict: ["prime-landing/big-prime", "square-area/spf", "whole-crossing/k-spf"],
  compatible: ["prime-landing/m-spf", "treasure/m-spf", "prime-gradient/prime"],
  ruler: ["ruler/far", "same-on-both-rulers/steep", "prime-gradient/c-spf"],
};
const variant = o.variant === "line-z" ? lineZ : lineQ;
const pool = presets.find(p => p.variant === variant.id)!.rules;
const rules = TABLES[o.table!]!.map(id => {
  const [family, tieBreaker] = id.split("/") as [string, string];
  return { family, params: pool.find(r => r.family === family)!.params as Record<string, unknown>, tieBreaker };
});
const economy = { ...E, opportunitiesPerSecond: Number(o.rate) };
const seconds = Number(o.seconds), minutes = Math.ceil(seconds / 60);
const boxes = sandboxes();
const rows: string[] = [];
for (let g = 0; g < Number(o.games); g++) {
  const per = Array.from({ length: minutes }, () => ({ acts: 0, moves: 0, objects: new Set<number>(), reads: 0, live: 0 }));
  const seats = rules.map((rule, k) => {
    const a = startersFor(rule.family, "typescript").find(x => x.kind === o.kind)!;
    return { name: `P${k}`, kind: "starter" as const, rule, program: { language: a.language, source: a.source } };
  });
  const r = await runTable(boxes, {
    type: lineType, variant, lines: Number(o.objects), seed: `d${g}`, seconds, seats, unique: true, economy,
    birthsPerSecond: Number(o.births), noise: Number(o.noise), summonCap: E.startingEnergy,
    onAct: e => {
      const m = per[Math.min(minutes - 1, Math.floor(e.at / 60))]!;
      m.acts++; m.live = Math.max(m.live, e.objects);
      if (e.committed) { m.moves++; m.objects.add(e.object); }
    },
  });
  const spentActs = r.seats.reduce((t, s) => t + s.spent.acts, 0), acts = r.seats.reduce((t, s) => t + s.acts, 0);
  rows.push(`game ${g}: ${acts} acts, ${spentActs.toFixed(0)} energy on acts (${(spentActs / Math.max(1, acts)).toFixed(2)} per act), points gained ${r.seats.map(s => s.gained.toFixed(0)).join(" / ")}`);
  rows.push("| minute | live objects | acts | moves | objects changed | idle share |");
  rows.push("|---|---|---|---|---|---|");
  per.forEach((m, i) => rows.push(`| ${i + 1} | ${m.live} | ${m.acts} | ${m.moves} | ${m.objects.size} | ${m.acts ? ((m.acts - m.moves) / m.acts).toFixed(2) : "-"} |`));
}
await boxes.close();
console.log(`table ${o.table} (${TABLES[o.table!]!.join(", ")}), ${o.kind} starters, ${variant.id}, ${seconds} s, ${o.objects} objects + ${o.births}/s births, ${o.rate} opportunities/s, noise ${o.noise}; one look ≈ ${readCharge(20).toFixed(2)} energy at 20 bits`);
console.log(rows.join("\n"));
