/**
 * The design-principles rows a fraction-native family must show before it is dealt (docs/engine-v2/fraction-families.md),
 * measured on its stored value functions (lib/v2-valuation/values/line-q/<family>):
 *
 *   node --experimental-strip-types scripts/frac-check.ts --family twin-fractions [--chains 6]
 *
 * - energy: the energy gate's greedy climber (artifacts/engine test/unit/v2-no-straight-hill.test.ts, the same moves and
 *   the beginner preset's income) from law draws: the best bits it reaches (the gate fails a dealt rule past 35);
 * - bump (row 10): from the good states (each climb's best, and the top decile of law draws), every cheap move of the
 *   preset (unit shift, unit tilt, a nudge of a, b or c by 1, a half-unit shift, each reflection): the share of the
 *   seat's bits kept, per move and over all;
 * - rationals (row 13): the share of good states (top decile of law draws) with a non-whole gradient or intercept;
 * - levels: the climbs' main-part values over the game (how far each climb gets, and its bits per step).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { applyCall, canonicalJson, evaluateSite, hashHex, isInvalid, rng, Qn, variantMutators } from "@workspace/v2-core";
import { lineLaw, lineType, slope, intercept, type LineState } from "@workspace/v2-linear";
import { findVariant, valueLookup } from "@workspace/v2-valuation";

const { values: o } = parseArgs({ options: { family: { type: "string" }, chains: { type: "string", default: "6" }, draws: { type: "string", default: "4000" }, income: { type: "string", default: "3000" }, only: { type: "string" } } });
const { variant } = findVariant("line-q");
const fam = lineType.families.find(f => f.id === o.family);
if (!fam) throw new Error(`no family ${o.family}`);
const DIR = join(import.meta.dirname, "../../v2-valuation/values/line-q", fam.id);
const INCOME = Number(o.income);
const say = (s = "") => console.log(s);
const f2 = (x: number) => x.toFixed(2), f1 = (x: number) => x.toFixed(1);
const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };

const FACTORS = ["2", "3", "5", "7", "11", "13", "17", "10", "1/2", "1/3", "1/5", "1/10"];
const AMOUNTS = ["1", "-1", "2", "-2", "10", "-10", "100", "-100", "1000", "-1000", "1/2", "-1/2"];
const CALLS: Record<string, readonly Record<string, string>[]> = {
  "mach.stretch": FACTORS.map(f => ({ f })), "basis.zoom": FACTORS.map(f => ({ f })),
  "si.shift": AMOUNTS.map(k => ({ k })), "si.tilt": AMOUNTS.map(k => ({ k })),
  "cart.mirror": ["x", "y", "origin", "diagonal"].map(axis => ({ axis })),
  "cart.slide": [["1", "0"], ["-1", "0"], ["0", "1"], ["0", "-1"]].map(([u, v]) => ({ u: u!, v: v! })),
  "cart.pivot": ["-2", "-1", "1", "2"].flatMap(x0 => ["1", "-1"].map(k => ({ x0, k }))),
  "int.move": ["x", "y"].flatMap(axis => ["1", "-1"].map(k => ({ axis, k }))),
  "seq.step": ["1", "-1", "2", "-2"].map(k => ({ k })),
  "gen.nudge": ["a", "b", "c"].flatMap(which => ["1", "-1"].map(k => ({ which, k }))),
};
const offered = new Set(variantMutators(lineType, variant).map(m => m.id));
const calls = Object.entries(CALLS).filter(([m]) => offered.has(m)).flatMap(([mutator, list]) => list.map(args => ({ mutator, args })));
/** The cheap moves of row 10. */
const BUMPS: { name: string; mutator: string; args: Record<string, string> }[] = [
  { name: "unit shift up", mutator: "si.shift", args: { k: "1" } }, { name: "unit shift down", mutator: "si.shift", args: { k: "-1" } },
  { name: "unit tilt up", mutator: "si.tilt", args: { k: "1" } }, { name: "unit tilt down", mutator: "si.tilt", args: { k: "-1" } },
  { name: "nudge a by 1", mutator: "gen.nudge", args: { which: "a", k: "1" } }, { name: "nudge b by 1", mutator: "gen.nudge", args: { which: "b", k: "1" } },
  { name: "nudge c by 1", mutator: "gen.nudge", args: { which: "c", k: "1" } }, { name: "half shift", mutator: "si.shift", args: { k: "1/2" } },
  ...["x", "y", "origin", "diagonal"].map(axis => ({ name: `mirror ${axis}`, mutator: "cart.mirror", args: { axis } })),
].filter(b => offered.has(b.mutator));
const step = (s: LineState, c: { mutator: string; args: Record<string, string> }) => {
  const a = applyCall(lineType, variant, s, { mutator: c.mutator, site: 0, args: c.args });
  return isInvalid(a) ? null : { s: a.result, fee: a.price.total };
};
const whole = (s: LineState) => { const l = s.lines[0]!; if (l.b === 0n) return true; return Qn.isInteger(slope(l)) && Qn.isInteger(intercept(l)); };

for (const params of fam.dealable(variant).filter(p => !o.only || canonicalJson(p).includes(o.only))) for (const tb of fam.tieBreakers.map(t => t.id)) {
  const file = readdirSync(DIR).find(n => n === `${hashHex(canonicalJson(params))}-${tb}.json`);
  if (!file) { say(`no value function for ${canonicalJson(params)} + ${tb}`); continue; }
  const look = valueLookup(JSON.parse(readFileSync(join(DIR, file), "utf8")));
  const ev = (s: LineState) => evaluateSite(lineType, fam as never, params, s, variant, 0, tb);
  const bits = (s: LineState) => { const e = ev(s); return e.score === null ? 0 : look(e.score).bits; };
  const r = rng("frac-check", fam.id, canonicalJson(params), tb);
  const law = lineLaw(variant);
  // Law draws: their bits, the top decile, its fraction share.
  const draws: { s: LineState; b: number }[] = [];
  while (draws.length < Number(o.draws)) { const d = law.draw(r, 1); if (d.state) draws.push({ s: d.state, b: bits(d.state) }); }
  draws.sort((a, b) => b.b - a.b);
  const top = draws.slice(0, Math.ceil(draws.length / 10));
  // Climbs: the energy gate's greedy climber from law draws.
  const climbs: { best: number; spent: number; s: LineState; path: number[] }[] = [];
  for (let k = 0; k < Number(o.chains); k++) {
    let s = draws[Math.floor(draws.length / 2) + k]!.s, spent = 0, best = bits(s);
    const path = [best];
    const seen = new Set([lineType.encode(s)]);
    for (let i = 0; i < 80; i++) {
      const b0 = bits(s);
      let pick: { s: LineState; fee: number; g: number; b: number } | null = null;
      for (const c of calls) {
        const x = step(s, c);
        if (!x || spent + x.fee > INCOME || seen.has(lineType.encode(x.s))) continue;
        const b = bits(x.s), g = (b - b0) / Math.max(x.fee, 1e-9);
        if (g > 0 && (!pick || g > pick.g)) pick = { ...x, g, b };
      }
      if (!pick) break;
      s = pick.s; spent += pick.fee; seen.add(lineType.encode(s)); best = Math.max(best, pick.b); path.push(pick.b);
    }
    climbs.push({ best, spent, s, path });
  }
  // Bumps from good states: the climbs' ends and the top decile of law draws.
  const good = [...climbs.map(c => c.s), ...top.slice(0, 40).map(t => t.s)];
  const kept: Record<string, number[]> = {};
  const all: number[] = [];
  for (const s of good) {
    const b0 = bits(s); if (b0 <= 0) continue;
    const per: number[] = [];
    for (const bm of BUMPS) { const x = step(s, bm); const k = x ? bits(x.s) / b0 : 0; (kept[bm.name] ??= []).push(k); per.push(k); }
    all.push(median(per));
  }
  say(`\n### ${fam.id} ${canonicalJson(params)} + ${tb}`);
  say(`- law draws: median ${f1(median(draws.map(d => d.b)))} bits, top decile from ${f1(top[top.length - 1]!.b)}, best ${f1(draws[0]!.b)}; top decile with a non-whole coefficient: ${f2(top.filter(t => !whole(t.s)).length / top.length)}`);
  say(`- energy gate climber (${INCOME}⚡, ${climbs.length} chains from law draws): best ${climbs.map(c => f1(c.best)).join(", ")} bits; spent ${climbs.map(c => c.spent.toFixed(0)).join(", ")}⚡; steps up ${climbs.map(c => c.path.length - 1).join(", ")}`);
  say(`- bumps (share of bits kept, median over ${all.length} good states): ${Object.entries(kept).map(([n, v]) => `${n} ${f2(median(v))}`).join("; ")}; median over moves ${f2(median(all))}`);
  say(`- climb ends: ${climbs.slice(0, 3).map(c => lineType.encode(c.s)).join("  ")}`);
}
