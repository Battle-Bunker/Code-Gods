/**
 * Equal reach of the pair families' dealt numbers (owner decision 42: balance across a rule's dealt values; the
 * coordinator's call 18: only values within a band of par are dealt), as grid-params.md measured the grids'. For every
 * family, dealt number and tie-breaker with a value function: from `starts` births (π), a greedy climber takes the
 * call (arguments ≤ 8 bits) that most raises its own bits, `moves` times or until none does; the median bits reached.
 * A family's par is the median over its dealt numbers; a number is IN the band when its median is within `band` bits
 * of par for every tie-breaker.
 *
 *   node --experimental-strip-types scripts/pair-reach.ts [--starts 40] [--moves 30] [--band 1] [--json file]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { applyPriced, canonicalJson, rng, variantMutators } from "@workspace/v2-core";
import { pairLaw, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { callsUpTo } from "./climbers.ts";
import { poolOf } from "./landscape-lib.ts";

const { values: o } = parseArgs({
  options: { starts: { type: "string", default: "40" }, moves: { type: "string", default: "30" }, band: { type: "string", default: "1" }, json: { type: "string" } },
  args: process.argv.slice(2).filter(a => a !== "--"),
});
const STARTS = Number(o.starts), MOVES = Number(o.moves), BAND = Number(o.band);
const MS = variantMutators(pairType, pairQ);
const DIRS = callsUpTo(pairType, pairQ, 8).map(c => { const m = MS.find(x => x.id === c.mutator)!; return { m, args: m.args(pairQ).decode(c.args) }; });
const law = pairLaw(pairQ);
const r = rng("pair-reach", "births");
const births: PairState[] = [];
while (births.length < STARTS) { const d = law.draw(r, 1); if (d.state) births.push(d.state); }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2; };
function reach(bits: (s: PairState) => number): number {
  return median(births.map(s0 => {
    let s = s0, b = bits(s);
    for (let k = 0; k < MOVES; k++) {
      let best: { s: PairState; b: number } | null = null;
      for (const d of DIRS) {
        const x = applyPriced(pairType, pairQ, s, d.m, 0, d.args as never);
        if ("invalid" in x) continue;
        const v = bits(x.result);
        if (v > (best?.b ?? b) + 1e-9) best = { s: x.result, b: v };
      }
      if (!best) break;
      ({ s, b } = best);
    }
    return b;
  }));
}

const rows: { family: string; params: unknown; tieBreaker: string; median: number }[] = [];
for (const rule of poolOf("pair-q").rules) {
  rows.push({ family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker!, median: reach(valuer(pairType, pairQ, rule).bits) });
  console.error(`${rule.family} ${canonicalJson(rule.params)} ${rule.tieBreaker}: ${rows.at(-1)!.median.toFixed(2)}`);
}

console.log(`Greedy climber, ${STARTS} births, ${MOVES} moves, calls ≤ 8 bits; band ±${BAND} bit of the family's par (median over its dealt numbers).`);
console.log();
console.log("| family | par | in the band | out |");
console.log("|---|--:|---|---|");
const inBand: Record<string, unknown[]> = {};
for (const family of [...new Set(rows.map(x => x.family))]) {
  const mine = rows.filter(x => x.family === family);
  const keys = [...new Set(mine.map(x => canonicalJson(x.params)))];
  const tbs = [...new Set(mine.map(x => x.tieBreaker))];
  // Par per tie-breaker: the median over the dealt numbers.
  const par = Object.fromEntries(tbs.map(t => [t, median(mine.filter(x => x.tieBreaker === t).map(x => x.median))]));
  const show = (k: string) => `${k} (${tbs.map(t => mine.find(x => canonicalJson(x.params) === k && x.tieBreaker === t)!.median.toFixed(1)).join(" / ")})`;
  const ok = keys.filter(k => tbs.every(t => Math.abs(mine.find(x => canonicalJson(x.params) === k && x.tieBreaker === t)!.median - par[t]!) <= BAND));
  inBand[family] = ok.map(k => JSON.parse(k));
  console.log(`| ${family} | ${tbs.map(t => par[t]!.toFixed(1)).join(" / ")} | ${ok.map(show).join(", ")} | ${keys.filter(k => !ok.includes(k)).map(show).join(", ")} |`);
}
if (o.json) writeFileSync(o.json, JSON.stringify({ rows, inBand }, null, 1));
