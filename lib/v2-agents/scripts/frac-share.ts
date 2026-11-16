/**
 * Row 13 for a tuple family valued as a tree (lib/v2-valuation tree-value.ts): of the top decile of law draws by tree
 * bits, the share whose gradient or y-intercept is not a whole number (vertical lines count as whole).
 *   node --experimental-strip-types scripts/frac-share.ts --family fraction-pair --tb "near>top-gap"
 */
import { parseArgs } from "node:util";
import { evaluateSite, Qn, rng } from "@workspace/v2-core";
import { intercept, lineLaw, lineQ, lineType, slope, type LineState } from "@workspace/v2-linear";
import { buildTree, sampledDraws, treeLookup, VALUE_CONFIG } from "@workspace/v2-valuation";

const { values: o } = parseArgs({ options: { family: { type: "string" }, tb: { type: "string" }, draws: { type: "string", default: "200000" }, n: { type: "string", default: "20000" } } });
const fam = lineType.families.find(f => f.id === o.family)!;
for (const params of fam.dealable(lineQ)) {
  const { draws } = sampledDraws(lineType, lineLaw(lineQ), fam, params, lineQ, o.tb!, { tilts: VALUE_CONFIG.tilts, drawsPerTilt: Number(o.draws) }, "tree");
  const look = treeLookup(buildTree(draws)), law = lineLaw(lineQ), r = rng("frac-share", fam.id, JSON.stringify(params));
  const xs: { b: number; frac: boolean }[] = [];
  while (xs.length < Number(o.n)) {
    const d = law.draw(r, 1); if (!d.state) continue;
    const s = d.state as LineState, l = s.lines[0]!;
    const frac = l.b !== 0n && !(Qn.isInteger(slope(l)) && Qn.isInteger(intercept(l)));
    xs.push({ b: look(evaluateSite(lineType, fam, params, s, lineQ, 0, o.tb!).score).bits, frac });
  }
  xs.sort((a, b) => b.b - a.b);
  const top = xs.slice(0, xs.length / 10), all = xs.filter(x => x.frac).length / xs.length;
  console.log(`${fam.id} ${JSON.stringify(params)} ${o.tb}: top decile (from ${top[top.length - 1]!.b.toFixed(1)} bits) non-whole ${(top.filter(x => x.frac).length / top.length).toFixed(2)}; all draws ${all.toFixed(2)}`);
}
