/**
 * What makes a collapse-check test 2 table cheap (scripts/collapse-check.ts): for the same dealt tables, β and energy,
 * `runs` independent searches of B evaluations each (the test's searcher) against the best state any of them, or a long
 * reference, found. Per table: the best known, its seats' bits and energy cost, and how many searches reach 95% of it
 * (the share of a game's search that finds it). Analysis only.
 *
 *   node --experimental-strip-types scripts/cheap-optima.ts [--beta 0.05] [--tables 2,3,5,7] [--runs 12] [--evals 100000]
 */
import { parseArgs } from "node:util";
import { rng } from "@workspace/v2-core";
import { pairClashes, pairType } from "@workspace/v2-pair";
import { LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { births } from "../src/index.ts";
import { anneal, costAt, poolOf, reach, ruleName, spaceOf, total, type Rule, type Space } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  beta: { type: "string", default: "0.05" }, tables: { type: "string", default: "0,1,2,3,4,5,6,7" }, runs: { type: "string", default: "12" },
  evals: { type: "string", default: "100000" }, "ref-mult": { type: "string", default: "10" }, seconds: { type: "string", default: "600" },
} });
const v = "pair-q" as const, space = spaceOf(v) as Space<any>, rules = poolOf(v).rules;
const e = LINES_BEGINNER_ECONOMY, E = ((e.startingEnergy + e.powerPerSecond * Number(o.seconds)) * 3) / 24;
const beta = Number(o.beta), B = Number(o.evals), RUNS = Number(o.runs), REF = Number(o["ref-mult"]);

// The test's deal, draw for draw (collapse-check.ts deal()).
function deal(n: number): Rule[][] {
  const r = rng("collapse-tables", v), out: Rule[][] = [];
  const fams = [...new Set(rules.map(x => x.family))];
  while (out.length < n) {
    const f = fams.slice(), pick: Rule[] = [];
    for (let k = 0; k < 3; k++) { const fam = f.splice(r.below(f.length), 1)[0]!; const of = rules.filter(x => x.family === fam); pick.push(of[r.below(of.length)]!); }
    if (pairClashes(pick).length) continue;
    out.push(pick);
  }
  return out;
}
const tables = deal(8);
const birthXs = births(space.type, space.variant, "collapse", 2).map(s => space.coords(s));
const reaches = birthXs.map(x => reach(space, x, beta, E));
const show = (x: readonly number[]) => {
  const s = space.state(x as number[]);
  return s ? s.lines.map((l: { a: bigint; b: bigint; c: bigint }) => `${l.a}x + ${l.b}y + ${l.c} = 0`).join(", ") : "?";
};

console.log(`pair-q β ${beta}, E = ${E.toFixed(1)}, ${RUNS} searches of ${B} evaluations a table (the test's searcher), reference ${REF}×`);
for (const t of o.tables!.split(",").map(Number)) {
  const table = tables[t]!, r = reaches[t % reaches.length]!;
  const bs = table.map(rule => space.bits(rule));
  const F = (x: number[]) => { const s = space.state(x)!; return total(bs.map(b => b(s))); };
  const ref = anneal(space, r, F, REF * B, 10, `${v}:${beta}:${t}:ref`);
  const finds = Array.from({ length: RUNS }, (_, i) => anneal(space, r, F, B, 10, `${v}:${beta}:${t}:B:${i}`));
  const best = [ref, ...finds].reduce((a, b) => (b.best > a.best ? b : a));
  const hits = finds.filter(x => x.best >= 0.95 * best.best).length, ratios = finds.map(x => x.best / best.best).sort((a, b) => a - b);
  const seat = bs.map(b => b(space.state(best.at)!));
  console.log(`\ntable ${t} (${table.map(x => `${ruleName(x)} ${JSON.stringify(x.params)}`).join(", ")})`);
  console.log(`  birth (${r.x0.join(", ")}): ${show(r.x0)}`);
  console.log(`  best known F ${best.best.toFixed(1)} at (${best.at.join(", ")}): ${show(best.at)}; cost ${costAt(r, best.at).toFixed(1)} of ${E.toFixed(1)}; seats ${seat.map(b => b.toFixed(1)).join(" / ")} bits`);
  console.log(`  reference ${ref.best.toFixed(1)} (${Math.round(100 * ref.best / best.best)}%); searches reaching 95%: ${hits}/${RUNS}; their ratios ${ratios.map(x => Math.round(100 * x)).join(" ")}`);
  for (const [i, f] of finds.entries()) if (f.best >= 0.95 * best.best) console.log(`    search ${i}: ${f.best.toFixed(1)} at (${f.at.join(", ")}): ${show(f.at)}; seats ${bs.map(b => b(space.state(f.at)!).toFixed(1)).join(" / ")}`);
}
void pairType;
