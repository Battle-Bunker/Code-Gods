/**
 * Tuple rules valued as a tree (the owner's choice (b), lib/v2-valuation tree-value.ts), for the cards (pool-plan.md):
 * examples with their tuples and bits by part, what each cheap move does, the median share kept after a cheap move from
 * climbed states (row 10), and a greedy climber with one seat's whole-game income (the energy gate).
 *   node --experimental-strip-types scripts/tuples-tree.ts --family prime-intercept [--tb a>b] [--draws 400000] "--examples=m,c;…"
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, Qn, rng, scoreToWire, type Score } from "@workspace/v2-core";
import { fromMC, lineLaw, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import { buildTree, sampledDraws, treeLookup, VALUE_CONFIG } from "@workspace/v2-valuation";
import { callsUpTo } from "./climbers.ts";

const { values: o } = parseArgs({ options: { family: { type: "string" }, tb: { type: "string" }, examples: { type: "string" }, draws: { type: "string", default: "400000" }, income: { type: "string", default: "3115" }, params: { type: "string", default: "1" } }, args: process.argv.slice(2).filter(a => a !== "--") });
const fam = lineType.families.find(f => f.id === o.family)!;
const tb = o.tb ?? fam.tieBreakers.slice(0, 2).map(t => t.id).join(">");
const CHEAP = [["shift +1", "si.shift", { k: "1" }], ["shift −1", "si.shift", { k: "-1" }], ["tilt +1", "si.tilt", { k: "1" }], ["tilt −1", "si.tilt", { k: "-1" }], ["nudge c", "gen.nudge", { which: "c", k: "1" }], ["mirror x", "cart.mirror", { axis: "x" }]] as const;
const wide = callsUpTo(lineType, lineQ, 12);
const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : NaN; };
const fmt = (s: Score) => (s === null ? "worst" : `(${scoreToWire(s)!.map(x => (x === null ? "–" : Qn.toNumber(Qn.parse(x)).toPrecision(4).replace(/\.?0+$/, ""))).join(", ")})`);

for (const params of fam.dealable(lineQ).slice(0, Number(o.params))) {
  const t0 = Date.now();
  const { draws } = sampledDraws(lineType, lineLaw(lineQ), fam, params, lineQ, tb, { tilts: VALUE_CONFIG.tilts, drawsPerTilt: Number(o.draws) }, "tree");
  const tree = buildTree(draws), look = treeLookup(tree);
  const score = (s: LineState) => evaluateSite(lineType, fam, params, s, lineQ, 0, tb).score;
  const bits = (s: LineState) => look(score(s)).bits;
  const parts = (s: LineState) => { const l = look(score(s)); return `${l.bits.toFixed(1)} = ${l.parts.map(x => x.toFixed(1)).join(" + ")}${l.borrowed ? " (cell borrowed)" : ""}`; };
  console.log(`\n## ${fam.id} ${JSON.stringify(params)} (${tb}): ${draws.length} draws, ${tree.cells.length} measured targets, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  console.log(fam.card(params, tb));
  if (o.examples) {
    console.log("\n| line | tuple | bits (level + closeness + third) | a cheap move: bits after |\n|---|---|---|---|");
    for (const ex of o.examples.split(";")) {
      const [m, c] = ex.split(","), s = { lines: [fromMC(Qn.parse(m!), Qn.parse(c!))] } as LineState;
      const after = CHEAP.map(([n, mu, a]) => { const x = applyCall(lineType, lineQ, s, { mutator: mu, site: 0, args: a as Record<string, string> }); return `${n} ${isInvalid(x) ? "–" : bits(x.result as LineState).toFixed(1)}`; });
      console.log(`| y = ${m}x + ${c} | ${fmt(score(s))} | ${parts(s)} | ${after.join(", ")} |`);
    }
  }
  const law = lineLaw(lineQ), r = rng("tuples-tree", fam.id, JSON.stringify(params));
  const kept: number[] = [], tops: string[] = [];
  for (let n = 0; n < 4; n++) {
    let s: LineState | null = null;
    while (!s) s = law.draw(r, 1).state as LineState | null;
    let spent = 0, top = bits(s), best = s;
    const seen = new Set([lineType.encode(s)]);
    for (let i = 0; i < 60; i++) {
      const b0 = bits(s);
      let pick: { s: LineState; fee: number; g: number } | null = null;
      for (const c of wide) {
        const a = applyCall(lineType, lineQ, s, c);
        if (isInvalid(a) || spent + a.price.total > Number(o.income) || seen.has(lineType.encode(a.result as LineState))) continue;
        const g = (bits(a.result as LineState) - b0) / Math.max(a.price.total, 1e-9);
        if (g > 0 && (!pick || g > pick.g)) pick = { s: a.result as LineState, fee: a.price.total, g };
      }
      if (!pick) break;
      s = pick.s; spent += pick.fee; seen.add(lineType.encode(s));
      if (bits(s) > top) { top = bits(s); best = s; }
    }
    const b = bits(best);
    for (const [, mu, a] of CHEAP) { const x = applyCall(lineType, lineQ, best, { mutator: mu, site: 0, args: a as Record<string, string> }); if (!isInvalid(x) && b > 0) kept.push(bits(x.result as LineState) / b); }
    tops.push(`${top.toFixed(1)} bits for ${spent.toFixed(0)}⚡ at ${lineType.encode(best)} ${fmt(score(best))}`);
  }
  console.log(`\nrow 10: from each climb's best line, a cheap move keeps ${(100 * med(kept)).toFixed(0)}% of the bits (median; worst ${(100 * Math.min(...kept)).toFixed(0)}%)`);
  console.log(`gate (greedy climber, ${o.income}⚡):\n- ${tops.join("\n- ")}`);
}
