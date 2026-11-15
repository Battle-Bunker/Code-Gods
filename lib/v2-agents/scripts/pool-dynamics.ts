/**
 * Starter dynamics on a preset's own pool, per family: the coordinator's drift check, and rows 2, 3 and 9 of the rule
 * design check (docs/engine-v2/design-principles.md). Each game seats three families drawn from the pool (a random
 * tie-breaker each, the family's first dealt parameters). Every seat runs the shipped starter, and the parameters drift
 * unless --drift 0. Per family, over the games it was seated in:
 *
 * - row 9: the points it gained (balance: the best family's mean over the worst's), and the share of objects its games
 *   still changed in the last third;
 * - row 2, the ladder: per (seat, object) it raised, the main-part levels its own moves reached (each a new best main
 *   part on that object under its current parameters), the rule's bits on that object at the end, and the share of
 *   seats that still raised a main part in the last third;
 * - row 3, entanglement: the share of its own main-part steps that lowered the tie-breaker, and, for those, the share
 *   recovered (its later moves on that object brought the tie-breaker back to where it was, the main part held) and the
 *   median seconds to recover;
 * - drift: how fast its seat moved again after each redraw, and, at the end, its mean bits on the final objects under
 *   its current parameters and under the other value it drifts between (a seat that tracks the redraws scores more
 *   under the current one; one parked between the two scores little under both).
 *
 *   node --experimental-strip-types scripts/pool-dynamics.ts [--type lines|grids|pairs] [--games 12] [--seconds 600]
 *     [--drift 120] [--kind simple] [--objects 3] [--births 0.0041667] [--variant line-q] [--only prime-landing,treasure]
 */
import { parseArgs } from "node:util";
import { compareScores, evaluateSite, rng, type ObjectType, type Score, type Variant } from "@workspace/v2-core";
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { grid4, gridPresets, gridType } from "@workspace/v2-grid";
import { lineQ, lineType, lineZ, presets } from "@workspace/v2-linear";
import { pairPresets, pairQ, pairType } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  type: { type: "string", default: "lines" },
  games: { type: "string", default: "12" }, seconds: { type: "string", default: "600" }, drift: { type: "string", default: "120" },
  kind: { type: "string", default: "simple" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  variant: { type: "string", default: "line-q" }, only: { type: "string" },
} });

interface PoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }
const setup = ((): { type: ObjectType<unknown>; variant: Variant; pool: readonly PoolRule[]; economy: typeof LINES_BEGINNER_ECONOMY } => {
  if (o.type === "grids") return { type: gridType as ObjectType<unknown>, variant: grid4, pool: gridPresets[0].rules, economy: GRIDS_BEGINNER_ECONOMY };
  if (o.type === "pairs") return { type: pairType as ObjectType<unknown>, variant: pairQ, pool: pairPresets[0].rules, economy: LINES_BEGINNER_ECONOMY };
  const variant = o.variant === "line-z" ? lineZ : lineQ;
  return { type: lineType as ObjectType<unknown>, variant, pool: presets.find(p => p.variant === variant.id)!.rules, economy: LINES_BEGINNER_ECONOMY };
})();
const { type, variant, pool, economy: E } = setup;
const seconds = Number(o.seconds), drift = Number(o.drift);
const boxes = sandboxes();
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const median = (x: number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");

interface Stat {
  games: number; gained: number[]; lastThird: number[]; latency: number[]; redraws: number; answered: number; grids: number; cur: number[]; alt: number[];
  levels: number[]; endBits: number[]; seats: number; climbingLate: number;
  mainSteps: number; tbLost: number; recovered: number; recovery: number[];
}
const stats = new Map<string, Stat>();
const stat = (f: string) => stats.get(f) ?? (stats.set(f, {
  games: 0, gained: [], lastThird: [], latency: [], redraws: 0, answered: 0, grids: 0, cur: [], alt: [],
  levels: [], endBits: [], seats: 0, climbingLate: 0, mainSteps: 0, tbLost: 0, recovered: 0, recovery: [],
}), stats.get(f)!);
const R = rng("pool-dynamics", variant.id);
const head = (s: Score) => (s === null ? null : s.slice(0, 1));
const tail = (s: Score) => (s === null ? null : s.slice(1));

for (let g = 0; g < Number(o.games); g++) {
  const choices = o.only ? pool.filter(r => o.only!.split(",").includes(r.family)) : pool;
  const picks: PoolRule[] = [];
  while (picks.length < Math.min(3, new Set(choices.map(c => c.family)).size)) { const r = choices[R.below(choices.length)]!; if (!picks.some(x => x.family === r.family)) picks.push(r); }
  const seats = picks.map((r, k) => {
    const tieBreaker = r.tieBreakers[R.below(r.tieBreakers.length)]!;
    const a = startersFor(r.family, "typescript").find(x => x.kind === o.kind)!;
    return { name: `P${k}`, kind: "starter" as const, rule: { family: r.family, params: r.params as Record<string, unknown>, tieBreaker }, program: { language: a.language, source: a.source } };
  });
  const fams = seats.map(s => type.families.find(f => f.id === s.rule.family)!);
  const params = seats.map(s => s.rule.params);
  const scoreOf = (i: number, s: unknown): Score => evaluateSite(type, fams[i]!, params[i], s, variant, 0, seats[i]!.rule.tieBreaker).score;
  const moves: { at: number; seat: number; object: number }[] = [], redraws: { at: number; seat: number }[] = [];
  // The ladder, per seat and object, under the seat's current parameters (a redraw starts it again).
  interface Climb { best: Score; levels: number; lastUp: number; pending: { tb: Score; main: Score; at: number } | null }
  const climbs = seats.map(() => new Map<number, Climb>());
  const levelsDone = seats.map(() => [] as number[]);
  let live = Number(o.objects);
  const rep = await runTable(boxes, {
    type, variant, lines: Number(o.objects), seed: `pool-${o.type}-${g}`, seconds, seats, unique: true, economy: E,
    birthsPerSecond: Number(o.births), summonCap: E.startingEnergy, ...(drift > 0 ? { driftSeconds: drift } : {}),
    onAct: e => {
      live = Math.max(live, e.objects);
      if (!e.committed) return;
      moves.push({ at: e.at, seat: e.seat, object: e.object });
      const i = e.seat, st = stat(seats[i]!.rule.family);
      const before = scoreOf(i, e.before), after = scoreOf(i, e.state);
      const c = climbs[i]!.get(e.object) ?? { best: before, levels: 0, lastUp: -Infinity, pending: null };
      climbs[i]!.set(e.object, c);
      if (compareScores(head(after), head(before)) > 0) {
        st.mainSteps++;
        if (compareScores(head(after), head(c.best)) > 0) { c.best = after; c.levels++; c.lastUp = e.at; }
        if (compareScores(tail(after), tail(before)) < 0) { st.tbLost++; c.pending = { tb: tail(before), main: head(after), at: e.at }; }
        else c.pending = null;
      } else if (c.pending && compareScores(head(after), c.pending.main) >= 0 && compareScores(tail(after), c.pending.tb) >= 0) {
        st.recovered++; st.recovery.push(e.at - c.pending.at); c.pending = null;
      } else if (c.pending && compareScores(head(after), c.pending.main) < 0) c.pending = null;   // gave the step back
    },
    onDrift: e => {
      redraws.push({ at: e.at, seat: e.seat }); params[e.seat] = e.params;
      for (const c of climbs[e.seat]!.values()) if (c.levels) levelsDone[e.seat]!.push(c.levels);
      climbs[e.seat]!.clear();
    },
  });
  const late = new Set(moves.filter(m => m.at >= (2 * seconds) / 3).map(m => m.object)).size / live;
  seats.forEach((s, i) => {
    const st = stat(s.rule.family), fam = fams[i]!;
    st.games++; st.gained.push(rep.seats[i]!.gained); st.lastThird.push(late);
    const bitsUnder = (p: Record<string, unknown>) => { const v = valuer(type, variant, { ...s.rule, params: p }); return (o2: unknown) => v.bits(o2); };
    const now = bitsUnder(params[i]!);
    st.seats++;
    const climbed = [...climbs[i]!.entries()].filter(([, c]) => c.levels > 0);
    st.levels.push(...levelsDone[i]!, ...climbed.map(([, c]) => c.levels));
    st.endBits.push(...climbed.map(([k]) => now(rep.final[k])));
    if (climbed.some(([, c]) => c.lastUp >= (2 * seconds) / 3)) st.climbingLate++;
    const grid = fam.dealable(variant) as Record<string, unknown>[];
    if (grid.length > 1) {
      st.grids++;
      const other = grid.find(p => JSON.stringify(p) !== JSON.stringify(params[i]));
      if (other) { const alt = bitsUnder(other); st.cur.push(mean(rep.final.map(x => now(x)))); st.alt.push(mean(rep.final.map(x => alt(x)))); }
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

console.log(`${variant.id} pool, ${o.kind} starters, ${o.games} games of ${seconds} s, ${drift > 0 ? `drift every ${drift} s` : "no drift"}, power ${E.powerPerSecond}, ${E.opportunitiesPerSecond}/s`);
console.log("| family | games | mean points gained | objects moving in the last third | main-part levels per object climbed: median / max | end bits on those objects | seats still climbing the main part in the last third | main-part steps that lowered the tie-breaker | recovered, median s | redraws answered, median s | end bits under current / other params |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const rows = [...stats.entries()].sort((a, b) => mean(b[1].gained) - mean(a[1].gained));
for (const [f, s] of rows) console.log([
  f, s.games, mean(s.gained).toFixed(0), `${(100 * mean(s.lastThird)).toFixed(0)}%`,
  s.levels.length ? `${median(s.levels)} / ${Math.max(...s.levels)}` : "-", s.endBits.length ? mean(s.endBits).toFixed(1) : "-",
  pct(s.climbingLate, s.seats), `${pct(s.tbLost, s.mainSteps)} of ${s.mainSteps}`,
  s.tbLost ? `${pct(s.recovered, s.tbLost)}, ${s.recovery.length ? median(s.recovery).toFixed(0) : "-"}` : "-",
  s.redraws ? `${s.answered}/${s.redraws}, ${s.latency.length ? median(s.latency).toFixed(1) : "-"}` : "-",
  s.cur.length ? `${mean(s.cur).toFixed(1)} / ${mean(s.alt).toFixed(1)}` : "-",
].join(" | ").replace(/^/, "| ").concat(" |"));
const means = rows.map(([, s]) => mean(s.gained)).filter(x => x > 0);
console.log(`balance: best family's mean gain over the worst's: ${(Math.max(...means) / Math.min(...means)).toFixed(1)}`);
