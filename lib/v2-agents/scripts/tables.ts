/**
 * How many tables can win together: for 2, 3 and 4 players (distinct families, any dealt tie-breaker each), is there a
 * whole-number line on which every player keeps at least `--keep` (default 80%) of their best alone? Exact over the
 * game-scale grid of lines (|m| ≤ M, |c| ≤ C), values from the committed value functions.
 *
 *   node --experimental-strip-types scripts/tables.ts [--m 10] [--c 60] [--keep 0.8]
 *
 * Prints, per table size, how many tables exist and how many have such a line, and the families that appear most in
 * winnable tables (the "compatible deal" a server could make). JSON on stdout with --json.
 */
import { parseArgs } from "node:util";
import { evaluateSite, q } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";

const { values: o } = parseArgs({ options: { m: { type: "string", default: "10" }, c: { type: "string", default: "60" }, keep: { type: "string", default: "0.8" }, list: { type: "string" }, json: { type: "boolean", default: false } } });
const M = Number(o.m), C = Number(o.c), KEEP = Number(o.keep);
const pool = presets.find(p => p.id === "lines-beginner")!.rules;
const rules = pool.flatMap(r => (r.tieBreakers as string[]).map(tb => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: tb })));
const lines: LineState[] = [];
for (let m = -M; m <= M; m++) if (m !== 0) for (let c = -C; c <= C; c++) lines.push({ lines: [fromMC(q(m), q(c))] });

// Each rule's share of its best alone on every line (0..1).
const share = rules.map(rule => {
  const vf = findValues("line-z", rule);
  if (!vf) throw new Error(`no value function for ${rule.family}/${rule.tieBreaker}`);
  const look = valueLookup(vf), f = lineType.families.find(x => x.id === rule.family)!;
  const b = lines.map(s => { const e = evaluateSite(lineType, f, rule.params, s, lineZ, 0, rule.tieBreaker); return look(e.utility ?? e.score).bits; });
  const best = Math.max(...b);
  return Float64Array.from(b, x => (best > 0 ? x / best : 0));
});
const families = [...new Set(rules.map(r => r.family))];

const winnable = (set: number[]) => {
  for (let k = 0; k < lines.length; k++) if (set.every(i => share[i]![k]! >= KEEP)) return true;
  return false;
};
const out: Record<number, { tables: number; winnable: number; familySets: number; familySetsWinnable: number; byFamily: Record<string, number> }> = {};
for (const n of [2, 3, 4]) {
  let tables = 0, wins = 0, fsets = 0, fwins = 0;
  const byFamily: Record<string, number> = Object.fromEntries(families.map(f => [f, 0]));
  const choose = (from: number, acc: string[]) => {
    if (acc.length === n) {
      fsets++;
      let any = false;
      const tb = (k: number, picked: number[]) => {
        if (k === n) { tables++; if (winnable(picked)) { wins++; any = true; if (o.list === String(n)) console.log(`  winnable: ${picked.map(i => `${rules[i]!.family}/${rules[i]!.tieBreaker}`).join(" · ")}`); } return; }
        for (const [i, r] of rules.entries()) if (r.family === acc[k]) tb(k + 1, [...picked, i]);
      };
      tb(0, []);
      if (any) { fwins++; for (const f of acc) byFamily[f]!++; }
      return;
    }
    for (let i = from; i < families.length; i++) choose(i + 1, [...acc, families[i]!]);
  };
  choose(0, []);
  out[n] = { tables, winnable: wins, familySets: fsets, familySetsWinnable: fwins, byFamily };
}
if (o.json) console.log(JSON.stringify(out, null, 1));
else for (const [n, r] of Object.entries(out)) {
  console.log(`${n} players: ${r.winnable} of ${r.tables} tables (family + tie-breaker) have a line where every player keeps ≥ ${KEEP * 100}% of their best alone; ${r.familySetsWinnable} of ${r.familySets} family sets have at least one such deal.`);
  console.log(`   families in winnable sets: ${Object.entries(r.byFamily).sort((a, b) => b[1] - a[1]).map(([f, k]) => `${f} ${k}`).join(", ")}`);
}
