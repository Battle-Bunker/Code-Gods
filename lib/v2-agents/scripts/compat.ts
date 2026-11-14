/**
 * Rule compatibility on whole-number lines: for every pair of the beginner pool's rules, the best line for both players
 * at once (the line that maximises their shared points n_A · n_B) against what each reaches alone. Exact over a grid of
 * lines y = mx + c (|m| ≤ M, |c| ≤ C), values from the committed value functions; no play is simulated.
 *
 *   node --experimental-strip-types scripts/compat.ts [--m 40] [--c 400] [--out docs/engine-v2/rule-compatibility.md]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { evaluateSite } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { q } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";

const { values: o } = parseArgs({ options: { m: { type: "string", default: "40" }, c: { type: "string", default: "400" }, out: { type: "string" } } });
const M = Number(o.m), C = Number(o.c);
const pool = presets.find(p => p.id === "lines-beginner")!.rules;
// One rule per family: its first dealt tie-breaker (the pairing a beginner meets first).
const rules = pool.map(r => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: (r.tieBreakers as string[])[0]! }));
const lines: { m: number; c: number; s: LineState }[] = [];
for (let m = -M; m <= M; m++) if (m !== 0) for (let c = -C; c <= C; c++) lines.push({ m, c, s: { lines: [fromMC(q(m), q(c))] } });

const bits = rules.map(rule => {
  const vf = findValues("line-z", rule);
  if (!vf) throw new Error(`no value function for ${rule.family}/${rule.tieBreaker}`);
  const look = valueLookup(vf), f = lineType.families.find(x => x.id === rule.family)!;
  const out = new Float64Array(lines.length);
  lines.forEach((l, k) => { const e = evaluateSite(lineType, f, rule.params, l.s, lineZ, 0, rule.tieBreaker); out[k] = look(e.utility ?? e.score).bits; });
  return out;
});
const best = bits.map(b => Math.max(...b));
// Each rule's main part (its first utility) on every line, and its best on the grid: can both mains be at their best at once?
const mains = rules.map(rule => {
  const f = lineType.families.find(x => x.id === rule.family)!;
  return lines.map(l => { const e = evaluateSite(lineType, f, rule.params, l.s, lineZ, 0, rule.tieBreaker); const u = e.utility ?? e.score; return u === null || u[0] === null ? -Infinity : Number(u[0]!.n) / Number(u[0]!.d); });
});
const bestMain = mains.map(m => Math.max(...m));
const name = (i: number) => `${rules[i]!.family}/${rules[i]!.tieBreaker}`;
const depends = rules.map(r => lineType.families.find(x => x.id === r.family)!.depends.join("+"));

const rows: string[] = [];
let compatible = 0, partial = 0, conflict = 0, mainsOk = 0;
for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
  let k = 0, top = -1;
  for (let x = 0; x < lines.length; x++) { const p = bits[i]![x]! * bits[j]![x]!; if (p > top) { top = p; k = x; } }
  const a = bits[i]![k]! / best[i]!, b = bits[j]![k]! / best[j]!;
  const worst = Math.min(a, b);
  const verdict = worst >= 0.8 ? "compatible" : worst >= 0.5 ? "partial" : "conflict";
  if (verdict === "compatible") compatible++; else if (verdict === "partial") partial++; else conflict++;
  const both = lines.filter((_, x) => mains[i]![x] === bestMain[i] && mains[j]![x] === bestMain[j]!).length;
  if (both) mainsOk++;
  rows.push(`| ${name(i)} | ${name(j)} | y = ${lines[k]!.m}x + ${lines[k]!.c} | ${bits[i]![k]!.toFixed(1)} of ${best[i]!.toFixed(1)} (${(a * 100).toFixed(0)}%) | ${bits[j]![k]!.toFixed(1)} of ${best[j]!.toFixed(1)} (${(b * 100).toFixed(0)}%) | ${top.toFixed(0)} | ${verdict} | ${both ? `yes (${both} lines)` : "no"} |`);
}
const text = `# Rule compatibility on whole-number lines

Made by \`node --experimental-strip-types lib/v2-agents/scripts/compat.ts\`: every pair of the beginner pool's rules (each
family's first dealt tie-breaker), exact over the ${lines.length.toLocaleString("en")} lines y = mx + c with 1 ≤ |m| ≤ ${M}, |c| ≤ ${C}, values
from the committed value functions (line-z). For each pair, the line that maximises their shared points (n_A · n_B, what
each of the two earns on it) and how much of its best alone each rule keeps there. Compatible: both keep ≥ 80%;
partial: both keep ≥ 50%; conflict: one keeps less than half.

What each rule reads: ${rules.map((r, i) => `${r.family} (${depends[i]})`).join(", ")}.

| Rule A | Rule B | Best shared line | A's bits there | B's bits there | Shared points | Verdict | Both main parts at their best on one line |
|---|---|---|--:|--:|--:|---|---|
${rows.join("\n")}

${compatible} compatible, ${partial} partial and ${conflict} in conflict, of ${compatible + partial + conflict} pairs; in ${mainsOk} pairs both main parts can be at their best on the same line.
`;
if (o.out) writeFileSync(o.out, text); else console.log(text);
console.error(`${compatible} compatible, ${partial} partial, ${conflict} conflict; mains together in ${mainsOk}`);
