/**
 * Starter dynamics on a preset's own pool, per family (the coordinator's drift check): each game seats three families
 * drawn from the pool (a random tie-breaker each, the preset's first parameters), every seat runs the shipped starter,
 * and the parameters drift. Per family, over the games it was seated in: the points it gained, the share of objects
 * its games still changed in the last third, and how fast its seat moved again after each redraw (the first committed
 * move after the redraw, any object). Balance is the best family's mean gain over the worst's.
 *
 *   node --experimental-strip-types scripts/pool-dynamics.ts [--games 12] [--seconds 600] [--drift 120] [--kind simple]
 *     [--objects 3] [--births 0.0041667] [--variant line-q]
 */
import { parseArgs } from "node:util";
import { rng } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { lineQ, lineType, lineZ, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  games: { type: "string", default: "12" }, seconds: { type: "string", default: "600" }, drift: { type: "string", default: "120" },
  kind: { type: "string", default: "simple" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  variant: { type: "string", default: "line-q" },
} });
const variant = o.variant === "line-z" ? lineZ : lineQ;
const pool = presets.find(p => p.variant === variant.id)!.rules;
const seconds = Number(o.seconds), drift = Number(o.drift);
const boxes = sandboxes();
interface Stat { games: number; gained: number[]; lastThird: number[]; latency: number[]; redraws: number; answered: number; grids: number }
const stats = new Map<string, Stat>();
const stat = (f: string) => stats.get(f) ?? (stats.set(f, { games: 0, gained: [], lastThird: [], latency: [], redraws: 0, answered: 0, grids: 0 }), stats.get(f)!);
const R = rng("pool-dynamics", variant.id);

for (let g = 0; g < Number(o.games); g++) {
  const picks: typeof pool[number][] = [];
  while (picks.length < 3) { const r = pool[R.below(pool.length)]!; if (!picks.includes(r)) picks.push(r); }
  const seats = picks.map((r, k) => {
    const tieBreaker = r.tieBreakers[R.below(r.tieBreakers.length)]!;
    const a = startersFor(r.family, "typescript").find(x => x.kind === o.kind)!;
    return { name: `P${k}`, kind: "starter" as const, rule: { family: r.family, params: r.params as Record<string, unknown>, tieBreaker }, program: { language: a.language, source: a.source } };
  });
  const moves: { at: number; seat: number; object: number }[] = [], redraws: { at: number; seat: number }[] = [];
  let live = Number(o.objects);
  const rep = await runTable(boxes, {
    type: lineType, variant, lines: Number(o.objects), seed: `pool-${g}`, seconds, seats, unique: true, economy: E,
    birthsPerSecond: Number(o.births), summonCap: E.startingEnergy, ...(drift > 0 ? { driftSeconds: drift } : {}),
    onAct: e => { live = Math.max(live, e.objects); if (e.committed) moves.push({ at: e.at, seat: e.seat, object: e.object }); },
    onDrift: e => redraws.push({ at: e.at, seat: e.seat }),
  });
  const late = new Set(moves.filter(m => m.at >= (2 * seconds) / 3).map(m => m.object)).size / live;
  seats.forEach((s, i) => {
    const st = stat(s.rule.family);
    st.games++; st.gained.push(rep.seats[i]!.gained); st.lastThird.push(late);
    if (lineType.families.find(f => f.id === s.rule.family)!.dealable(variant).length > 1) st.grids++;
    for (const d of redraws.filter(d => d.seat === i)) {
      st.redraws++;
      const next = moves.find(m => m.seat === i && m.at >= d.at);
      if (next && next.at - d.at <= Math.min(drift, seconds - d.at)) { st.latency.push(next.at - d.at); st.answered++; }
    }
  });
  console.error(`game ${g + 1}: ${seats.map(s => `${s.rule.family}/${s.rule.tieBreaker}`).join(", ")}; ${redraws.length} redraws`);
}
await boxes.close();

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const median = (x: number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
console.log(`${variant.id} pool, ${o.kind} starters, ${o.games} games of ${seconds} s, drift every ${drift} s, power ${E.powerPerSecond}, ${E.opportunitiesPerSecond}/s`);
console.log("| family | games | params that drift | mean points gained | objects still moving in the last third | redraws answered by a move | median seconds to that move |");
console.log("|---|---|---|---|---|---|---|");
const rows = [...stats.entries()].sort((a, b) => mean(b[1].gained) - mean(a[1].gained));
for (const [f, s] of rows) console.log(`| ${f} | ${s.games} | ${s.grids ? "yes" : "no"} | ${mean(s.gained).toFixed(0)} | ${(100 * mean(s.lastThird)).toFixed(0)}% | ${s.redraws ? `${s.answered}/${s.redraws}` : "-"} | ${s.latency.length ? median(s.latency).toFixed(1) : "-"} |`);
const means = rows.map(([, s]) => mean(s.gained)).filter(x => x > 0);
console.log(`balance: best family's mean gain over the worst's: ${(Math.max(...means) / Math.min(...means)).toFixed(1)}`);
