/**
 * The worst cases behind the no-straight-hill gate (test/unit/v2-no-straight-hill.test.ts), per family and shortcut kind,
 * on every line preset: (1) the gate's own chains (one shortcut with fixed arguments, 30 times, from law draws), the
 * largest gain and the second-half slope; (2) a greedy chain that takes, each step, the shortcut of that kind (any of the
 * gate's arguments) that raises the rule most, as a climber would. Analysis only.
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/straight-hill-worst.ts [--starts 8]
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, rng, variantMutators, type ObjectType } from "@workspace/v2-core";
import { lineLaw, type LineState } from "@workspace/v2-linear";
import { findVariant, valueLookup } from "@workspace/v2-valuation";
import { dealablePool, familyOf } from "../convex/v2/deal.ts";
import { PRESETS } from "../convex/v2/presets.ts";
import { valueRecord } from "../convex/v2/values.ts";

const { values: o } = parseArgs({ options: { starts: { type: "string", default: "8" } } });
const FACTORS = ["2", "3", "5", "7", "11", "13", "17", "1/2", "1/3", "1/5"];
const KINDS: Record<string, readonly { mutator: string; args: Record<string, string> }[]> = {
  stretch: FACTORS.map(f => ({ mutator: "mach.stretch", args: { f } })),
  zoom: FACTORS.map(f => ({ mutator: "basis.zoom", args: { f } })),
  turn: [{ centre: "origin", turn: "left" }, { centre: "origin", turn: "3/4" }, { centre: "origin", turn: "-4/3" },
    ...["0", "1", "-1"].flatMap(centre => ["1", "-1", "1/2", "-1/2", "left"].map(turn => ({ centre, turn })))].map(args => ({ mutator: "rot.turn", args })),
};
const CHAIN = 30, STARTS = Number(o.starts);
type Worst = { fixed: number; fixedWhat: string; greedy: number; greedyPerFee: number; greedyWhat: string };
const out = new Map<string, Worst>();
for (const preset of PRESETS) {
  const { type, variant } = findVariant(preset.variant);
  if (type.id !== "line") continue;
  const offered = new Set(variantMutators(type, variant).map(m => m.id));
  const law = lineLaw(variant), r = rng("straight-hill-worst", preset.id);
  const starts: LineState[] = [];
  while (starts.length < STARTS) { const d = law.draw(r, 1); if (d.state) starts.push(d.state as LineState); }
  for (const rule of dealablePool(preset)) {
    const rec = valueRecord(rule.ruleKey);
    if (!rec) continue;
    const look = valueLookup(rec), fam = familyOf(rule.family);
    const bitsOf = (s: LineState) => { const e = evaluateSite(type as ObjectType<LineState>, fam as never, rule.params, s, variant, 0, rule.tieBreaker); return e.score === null ? 0 : look(e.score).bits; };
    const step = (s: LineState, c: { mutator: string; args: Record<string, string> }) => { const a = applyCall(type as ObjectType<LineState>, variant, s, { ...c, site: 0 }); return isInvalid(a) ? null : a; };
    for (const [kind, calls] of Object.entries(KINDS)) {
      const mine = calls.filter(c => offered.has(c.mutator));
      if (!mine.length) continue;
      const key = `${preset.id} | ${rule.family} | ${kind}`;
      const w = out.get(key) ?? { fixed: 0, fixedWhat: "", greedy: 0, greedyPerFee: 0, greedyWhat: "" };
      for (const [k, start] of starts.entries()) {
        const b0 = bitsOf(start);
        for (const c of mine) {   // (1) the gate's chain
          let s = start, best = b0; const seen = new Set([type.encode(s)]);
          for (let i = 0; i < CHAIN; i++) { const a = step(s, c); if (!a || seen.has(type.encode(a.result))) break; seen.add(type.encode(a.result)); s = a.result; best = Math.max(best, bitsOf(s)); }
          if (best - b0 > w.fixed) { w.fixed = best - b0; w.fixedWhat = `${rule.tieBreaker} ${JSON.stringify(c.args)} from ${k}`; }
        }
        // (2) greedy: each step, the call of this kind that raises the rule most (stop when none does)
        let s = start, b = b0, paid = 0; const seen = new Set([type.encode(s)]);
        for (let i = 0; i < CHAIN; i++) {
          let pick: { s: LineState; b: number; fee: number } | null = null;
          for (const c of mine) { const a = step(s, c); if (!a || seen.has(type.encode(a.result))) continue; const nb = bitsOf(a.result); if (nb > b + 1e-9 && (!pick || nb > pick.b)) pick = { s: a.result, b: nb, fee: a.price.total }; }
          if (!pick) break;
          seen.add(type.encode(pick.s)); s = pick.s; b = pick.b; paid += pick.fee;
        }
        if (b - b0 > w.greedy) { w.greedy = b - b0; w.greedyPerFee = paid ? (b - b0) / paid : 0; w.greedyWhat = `${rule.tieBreaker} from ${k}`; }
      }
      out.set(key, w);
    }
  }
}
console.log("| preset | family | kind | gate chain: most bits gained in 30 (which) | greedy chain: bits gained in 30, per fee bit (which) |");
console.log("|---|---|---|--:|--:|");
for (const [k, w] of [...out.entries()].sort((a, b) => Math.max(b[1].fixed, b[1].greedy) - Math.max(a[1].fixed, a[1].greedy)))
  console.log(`| ${k} | ${w.fixed.toFixed(1)} (${w.fixedWhat}) | ${w.greedy.toFixed(1)}, ${w.greedyPerFee.toFixed(3)} (${w.greedyWhat}) |`);
