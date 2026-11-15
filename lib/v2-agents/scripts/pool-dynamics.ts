/**
 * Starter dynamics on a preset's own pool, per family (the coordinator's drift check): each game seats three families
 * drawn from the pool (a random tie-breaker each, the preset's first parameters), every seat runs the shipped starter,
 * and the parameters drift. Per family, over the games it was seated in: the points it gained, the share of objects
 * its games still changed in the last third, and how fast its seat moved again after each redraw (the first committed
 * move after the redraw, any object). Balance is the best family's mean gain over the worst's.
 *
 *   node --experimental-strip-types scripts/pool-dynamics.ts [--games 12] [--seconds 600] [--drift 120] [--kind simple]
 *     [--objects 3] [--births 0.0041667] [--variant line-q] [--only prime-landing,treasure,same-on-both-rulers]
 *     [--from 0] [--json out.json]
 *
 * Balance diagnosis, per family at the end: its own bits on the final objects (mean over objects), the others' bits
 * there (the sum it multiplies), its committed moves and the share that raised its points, flips (another seat put an
 * object back), and the energy its gains cost that others took back. --from offsets the game seeds (parallel runs);
 * --json writes the per-family numbers for merging.
 *
 * Midway: at the end, for a seat whose parameters drift between two values (a rule and its mirror), its mean bits on
 * the final objects under its current parameters and under the other one. A seat that tracks the redraws scores more
 * under the current one; a seat parked between the two scores little under both.
 */
import { parseArgs } from "node:util";
import { evaluateSite, rng } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { lineQ, lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  games: { type: "string", default: "12" }, seconds: { type: "string", default: "600" }, drift: { type: "string", default: "120" },
  kind: { type: "string", default: "simple" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  variant: { type: "string", default: "line-q" }, only: { type: "string" }, from: { type: "string", default: "0" }, json: { type: "string" },
} });
const variant = o.variant === "line-z" ? lineZ : lineQ;
const pool = presets.find(p => p.variant === variant.id)!.rules;
const seconds = Number(o.seconds), drift = Number(o.drift);
const boxes = sandboxes();
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
interface Stat { games: number; gained: number[]; lastThird: number[]; latency: number[]; redraws: number; answered: number; grids: number; cur: number[]; alt: number[]; own: number[]; others: number[]; moves: number[]; trueGain: number[]; flips: number[]; reversal: number[] }
const stats = new Map<string, Stat>();
const stat = (f: string) => stats.get(f) ?? (stats.set(f, { games: 0, gained: [], lastThird: [], latency: [], redraws: 0, answered: 0, grids: 0, cur: [], alt: [], own: [], others: [], moves: [], trueGain: [], flips: [], reversal: [] }), stats.get(f)!);
const R = rng("pool-dynamics", variant.id, o.from);

for (let g = Number(o.from); g < Number(o.from) + Number(o.games); g++) {
  const choices = o.only ? pool.filter(r => o.only!.split(",").includes(r.family)) : pool;
  const picks: typeof pool[number][] = [];
  while (picks.length < Math.min(3, new Set(choices.map(c => c.family)).size)) { const r = choices[R.below(choices.length)]!; if (!picks.some(x => x.family === r.family)) picks.push(r); }
  const seats = picks.map((r, k) => {
    const tieBreaker = r.tieBreakers[R.below(r.tieBreakers.length)]!;
    const a = startersFor(r.family, "typescript").find(x => x.kind === o.kind)!;
    return { name: `P${k}`, kind: "starter" as const, rule: { family: r.family, params: r.params as Record<string, unknown>, tieBreaker }, program: { language: a.language, source: a.source } };
  });
  const moves: { at: number; seat: number; object: number }[] = [], redraws: { at: number; seat: number }[] = [];
  const params = seats.map(s => s.rule.params);
  let live = Number(o.objects);
  const rep = await runTable(boxes, {
    type: lineType, variant, lines: Number(o.objects), seed: `pool-${g}`, seconds, seats, unique: true, economy: E,
    birthsPerSecond: Number(o.births), summonCap: E.startingEnergy, ...(drift > 0 ? { driftSeconds: drift } : {}),
    onAct: e => { live = Math.max(live, e.objects); if (e.committed) moves.push({ at: e.at, seat: e.seat, object: e.object }); },
    onDrift: e => { redraws.push({ at: e.at, seat: e.seat }); params[e.seat] = e.params; },
  });
  const late = new Set(moves.filter(m => m.at >= (2 * seconds) / 3).map(m => m.object)).size / live;
  seats.forEach((s, i) => {
    const st = stat(s.rule.family);
    st.games++; st.gained.push(rep.seats[i]!.gained); st.lastThird.push(late);
    const sr = rep.seats[i]!;
    st.moves.push(sr.moves); st.trueGain.push(sr.trueGainShare); st.flips.push(sr.flips); st.reversal.push(sr.reversalEnergy);
    // Own bits and the others' bits on each final object, under each seat's final parameters.
    const bitsOf = (k: number, x: unknown) => { const sk = seats[k]!, f = lineType.families.find(ff => ff.id === sk.rule.family)!, vf = findValues(variant.id, { ...sk.rule, params: params[k]! });
      return vf ? valueLookup(vf)(evaluateSite(lineType, f, params[k]!, x as never, variant, 0, sk.rule.tieBreaker).score).bits : NaN; };
    for (const x of rep.final as unknown[]) { st.own.push(bitsOf(i, x)); st.others.push(seats.reduce((a, _s, k) => (k === i ? a : a + bitsOf(k, x)), 0)); }
    const fam = lineType.families.find(f => f.id === s.rule.family)!, grid = fam.dealable(variant) as Record<string, unknown>[];
    if (grid.length > 1) {
      st.grids++;
      const bits = (p: Record<string, unknown>) => { const vf = findValues(variant.id, { ...s.rule, params: p }); if (!vf) return NaN; const look = valueLookup(vf);
        return mean((rep.final as never[]).map(x => look(evaluateSite(lineType, fam, p, x, variant, 0, s.rule.tieBreaker).score).bits)); };
      const now = params[i]!, other = grid.find(p => JSON.stringify(p) !== JSON.stringify(now));
      if (other) { st.cur.push(bits(now)); st.alt.push(bits(other)); }
    }
    for (const d of redraws.filter(d => d.seat === i)) {
      st.redraws++;
      const next = moves.find(m => m.seat === i && m.at >= d.at);
      if (next && next.at - d.at <= Math.min(drift, seconds - d.at)) { st.latency.push(next.at - d.at); st.answered++; }
    }
  });
  console.error(`game ${g + 1}: ${seats.map(s => `${s.rule.family}/${s.rule.tieBreaker}`).join(", ")}; ${redraws.length} redraws`);
}
await boxes.close();

const median = (x: number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
console.log(`${variant.id} pool, ${o.kind} starters, ${o.games} games of ${seconds} s, drift every ${drift} s, power ${E.powerPerSecond}, ${E.opportunitiesPerSecond}/s`);
console.log("| family | games | params that drift | mean points gained | own bits at end | others' bits at end | moves | share raising points | flips | energy taken back | objects still moving in the last third | redraws answered by a move | median seconds to that move | end: mean bits under current / mirror |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const rows = [...stats.entries()].sort((a, b) => mean(b[1].gained) - mean(a[1].gained));
for (const [f, s] of rows) console.log(`| ${f} | ${s.games} | ${s.grids ? "yes" : "no"} | ${mean(s.gained).toFixed(0)} | ${mean(s.own).toFixed(1)} | ${mean(s.others).toFixed(1)} | ${mean(s.moves).toFixed(0)} | ${(100 * mean(s.trueGain)).toFixed(0)}% | ${mean(s.flips).toFixed(1)} | ${mean(s.reversal).toFixed(0)} | ${(100 * mean(s.lastThird)).toFixed(0)}% | ${s.redraws ? `${s.answered}/${s.redraws}` : "-"} | ${s.latency.length ? median(s.latency).toFixed(1) : "-"} | ${s.cur.length ? `${mean(s.cur).toFixed(1)} / ${mean(s.alt).toFixed(1)}` : "-"} |`);
const means = rows.map(([, s]) => mean(s.gained)).filter(x => x > 0);
console.log(`balance: best family's mean gain over the worst's: ${(Math.max(...means) / Math.min(...means)).toFixed(1)}`);
if (o.json) (await import("node:fs")).writeFileSync(o.json, JSON.stringify(Object.fromEntries(stats)));
