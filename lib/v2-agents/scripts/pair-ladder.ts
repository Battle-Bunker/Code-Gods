/**
 * Design-principles row 2 on the two-line pool (docs/engine-v2/design-principles.md: "How long is the ladder? Number of
 * distinct main-part levels a starter reaches in a game, and the bits of the level it stops at"). For every dealt family
 * and up to `params` of its dealt numbers, the Simple starter (TypeScript, told its own values) acts `acts` times in a
 * row on each of `births` newborn pairs, unopposed, with a full store each act. A level is the ladder's: L in the main
 * part's score base^L × (1 + 1/(1 + d)), base the dealt q or k.
 *
 *   node --experimental-strip-types scripts/pair-ladder.ts [--acts 40] [--births 3] [--params 2]
 */
import { parseArgs } from "node:util";
import { evaluateSite, Qn } from "@workspace/v2-core";
import { pairPresets, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { births, runAct, sandboxes, startersFor } from "../src/index.ts";
import { valuer } from "../src/harness.ts";

const { values: o } = parseArgs({
  options: { acts: { type: "string", default: "40" }, births: { type: "string", default: "3" }, params: { type: "string", default: "2" } },
  args: process.argv.slice(2).filter(a => a !== "--"),
});
const ACTS = Number(o.acts);
const boxes = sandboxes();
const starts = births(pairType, pairQ, "pair-ladder", Number(o.births));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : NaN; };

console.log(`Simple starter (TypeScript), ${ACTS} acts unopposed on each of ${starts.length} births, per dealt family and number.`);
console.log();
console.log("| family | numbers | levels reached (distinct, per run) | top level | bits where it stops (median) |");
console.log("|---|---|---|--:|--:|");
for (const pool of pairPresets[0].rules) {
  const family = pairType.families.find(f => f.id === pool.family)!;
  const tieBreaker = pool.tieBreakers[0]!;
  const all = family.dealable(pairQ);
  for (const params of all.slice(0, Number(o.params))) {
    const rule = { family: family.id, params: params as Record<string, unknown>, tieBreaker };
    const v = valuer(pairType, pairQ, rule);
    const base = Number((params as { q?: number; k?: number }).q ?? (params as { k?: number }).k ?? 0);
    const level = (s: PairState) => {
      const sc = evaluateSite(pairType, family, params, s, pairQ, 0, tieBreaker).score;
      if (!sc || !sc[0] || !base) return -1;
      return Math.max(0, Math.ceil(Math.log(Qn.toNumber(sc[0])) / Math.log(base) - 1e-12) - 1);
    };
    const program = startersFor(family.id, "typescript").find(a => a.kind === "simple")!;
    const counts: number[] = [], tops: number[] = [], ends: number[] = [];
    for (const [i, s0] of starts.entries()) {
      let s = s0;
      const seen = new Set<number>([level(s)]);
      for (let k = 0; k < ACTS; k++) {
        const value = { mine: v.bits(s), others: 1, points: v.bits(s) };
        const { record, state } = await runAct(await boxes.get("typescript"), { type: pairType, variant: pairQ, state: s, rule, program: { language: "typescript", source: program.source }, seed: `${i}:${k}`, energy: 600, values: v.values, value });
        if (record.outcome !== "committed") break;
        s = state;
        seen.add(level(s));
      }
      counts.push(seen.size); tops.push(Math.max(...seen)); ends.push(v.bits(s));
    }
    console.log(`| ${family.id} | ${JSON.stringify(params)} | ${counts.join(", ")} | ${Math.max(...tops)} | ${median(ends).toFixed(1)} |`);
  }
}
await boxes.close();
