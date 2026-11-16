/**
 * A fraction-native tuple family under the tree valuation (owner decision 45, lib/v2-valuation tree-value.ts), for its
 * walk-through (design-principles.md rows 8, 10 and 13): examples with every cheap move of row 10 (shifts, tilts,
 * a half shift, nudges of a, b and c, each mirror), the share of the top decile of law draws with a non-whole gradient
 * or intercept (row 13), the share kept by each cheap move from good states, and the greedy climber of the energy gate.
 *   node --experimental-strip-types scripts/frac-tree-check.ts --family plus-flip --tb close>y-near-n [--params 4] "--examples=m,c;…"
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, Qn, rng, scoreToWire, type Score } from "@workspace/v2-core";
import { fromMC, intercept, lineLaw, lineQ, lineType, slope, type LineState } from "@workspace/v2-linear";
import { buildTree, sampledDraws, treeLookup, VALUE_CONFIG } from "@workspace/v2-valuation";
import { callsUpTo } from "./climbers.ts";

const { values: o } = parseArgs({ options: { family: { type: "string" }, tb: { type: "string" }, examples: { type: "string" }, draws: { type: "string", default: "200000" }, income: { type: "string", default: "3115" }, params: { type: "string", default: "1" }, chains: { type: "string", default: "4" } }, args: process.argv.slice(2).filter(a => a !== "--") });
const fam = lineType.families.find(f => f.id === o.family)!;
const tb = o.tb ?? fam.tieBreakers.slice(0, 2).map(t => t.id).join(">");
const MOVES: [string, string, Record<string, string>][] = [
  ["shift +1", "si.shift", { k: "1" }], ["shift −1", "si.shift", { k: "-1" }], ["tilt +1", "si.tilt", { k: "1" }], ["tilt −1", "si.tilt", { k: "-1" }],
  ["shift +½", "si.shift", { k: "1/2" }], ["nudge a", "gen.nudge", { which: "a", k: "1" }], ["nudge b", "gen.nudge", { which: "b", k: "1" }], ["nudge c", "gen.nudge", { which: "c", k: "1" }],
  ...["x", "y", "origin", "diagonal"].map(axis => [`mirror ${axis}`, "cart.mirror", { axis }] as [string, string, Record<string, string>]),
];
const wide = callsUpTo(lineType, lineQ, 12);
const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : NaN; };
const fmt = (s: Score) => (s === null ? "worst" : `(${scoreToWire(s)!.map(x => (x === null ? "–" : Qn.toWire(Qn.abs(Qn.parse(x))))).join(", ")})`);
const move = (s: LineState, [, mu, a]: [string, string, Record<string, string>]) => { const x = applyCall(lineType, lineQ, s, { mutator: mu, site: 0, args: a }); return isInvalid(x) ? null : x.result as LineState; };
const whole = (s: LineState) => { const l = s.lines[0]!; return l.b === 0n || (Qn.isInteger(slope(l)) && Qn.isInteger(intercept(l))); };

for (const params of fam.dealable(lineQ).slice(0, Number(o.params))) {
  const { draws } = sampledDraws(lineType, lineLaw(lineQ), fam, params, lineQ, tb, { tilts: VALUE_CONFIG.tilts, drawsPerTilt: Number(o.draws) }, "tree");
  const look = treeLookup(buildTree(draws));
  const score = (s: LineState) => evaluateSite(lineType, fam, params, s, lineQ, 0, tb).score;
  const bits = (s: LineState) => look(score(s)).bits;
  const parts = (s: LineState) => { const l = look(score(s)); return `${l.bits.toFixed(1)} = ${l.parts.map(x => x.toFixed(1)).join(" + ")}`; };
  console.log(`\n## ${fam.id} ${JSON.stringify(params)} (${tb})\n\n${fam.card(params, tb)}`);
  if (o.examples) {
    console.log("\n| line | tuple | bits (level + closeness + third) |\n|---|---|---|");
    const rows: string[] = [];
    for (const ex of o.examples.split(";")) {
      const [m, c] = ex.split(","), s = { lines: [fromMC(Qn.parse(m!), Qn.parse(c!))] } as LineState;
      console.log(`| y = ${m}x + ${c} | ${fmt(score(s))} | ${parts(s)} |`);
      rows.push(`| y = ${m}x + ${c} | ${MOVES.map(mv => { const x = move(s, mv); return x ? `${fmt(score(x))} ${bits(x).toFixed(1)}` : "–"; }).join(" | ")} |`);
    }
    console.log(`\n| line | ${MOVES.map(m => m[0]).join(" | ")} |\n|---|${MOVES.map(() => "---").join("|")}|\n${rows.join("\n")}`);
  }
  // Row 13: the top decile of plain law draws.
  const law = lineLaw(lineQ), r = rng("frac-tree-check", fam.id, JSON.stringify(params));
  const sample: { s: LineState; b: number }[] = [];
  while (sample.length < 4000) { const d = law.draw(r, 1); if (d.state) sample.push({ s: d.state as LineState, b: bits(d.state as LineState) }); }
  sample.sort((a, b) => b.b - a.b);
  const top = sample.slice(0, 400);
  console.log(`\nrow 13: top decile of law draws (from ${top[top.length - 1]!.b.toFixed(1)} bits): ${(100 * top.filter(t => !whole(t.s)).length / top.length).toFixed(0)}% have a non-whole gradient or intercept`);
  // Climbs, then row 10 from their best states and from the top decile.
  const tops: string[] = [], goods: LineState[] = top.slice(0, 30).map(t => t.s);
  for (let n = 0; n < Number(o.chains); n++) {
    let s = sample[2000 + n]!.s, spent = 0, best = s, topb = bits(s);
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
      if (bits(s) > topb) { topb = bits(s); best = s; }
    }
    goods.push(best);
    tops.push(`${topb.toFixed(1)} bits for ${spent.toFixed(0)}⚡ at ${lineType.encode(best)} ${fmt(score(best))}`);
  }
  const per = MOVES.map(mv => med(goods.flatMap(g => { const b = bits(g); const x = move(g, mv); return b > 0 ? [x ? bits(x) / b : 0] : []; })));
  const all = goods.flatMap(g => { const b = bits(g); return b > 0 ? MOVES.map(mv => { const x = move(g, mv); return x ? bits(x) / b : 0; }) : []; });
  console.log(`row 10 (share kept, median over ${goods.length} good states): ${MOVES.map((m, i) => `${m[0]} ${(100 * per[i]!).toFixed(0)}%`).join(", ")}; all moves ${(100 * med(all)).toFixed(0)}%`);
  console.log(`gate (greedy climber, ${o.income}⚡):\n- ${tops.join("\n- ")}`);
}
