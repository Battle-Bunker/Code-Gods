/**
 * Starter dynamics on a preset's own pool, per family: the coordinator's drift check, and rows 2, 3 and 9 of the rule
 * design check (docs/engine-v2/design-principles.md). Each game seats three families drawn from the pool (a random
 * tie-breaker each, the family's first dealt parameters). Every seat runs the shipped starter, and the parameters drift
 * unless --drift 0. Per family, over the games it was seated in:
 *
 * - row 9: the points it gained (balance: the best family's mean over the worst's), and the share of objects its games
 *   still changed in the last third;
 * - balance diagnosis: its own bits on the final objects (mean over objects), the others' bits there (the sum it
 *   multiplies), its committed moves and the share that raised its points, flips (another seat put an object back),
 *   and the energy its gains cost that others took back;
 * - row 2, the ladder: per (seat, object) it raised, the main-part levels its own moves reached (each a new best main
 *   part on that object under its current parameters), the rule's bits on that object at the end, and the share of
 *   seats that still raised a main part in the last third;
 * - row 3, entanglement: the share of its own main-part steps that lowered the tie-breaker, and, for those, the share
 *   recovered (its later moves on that object brought the tie-breaker back to where it was, the main part held) and the
 *   median seconds to recover;
 * - contest: how often another seat's move lowered its main part on an object it had climbed, and the share it climbed
 *   back (an uncontested hill is the old bug on a slower clock);
 * - drift: how fast its seat moved again after each redraw, and, at the end, its mean bits on the final objects under
 *   its current parameters and under the other value it drifts between (a seat that tracks the redraws scores more
 *   under the current one; one parked between the two scores little under both).
 *
 *   node --experimental-strip-types scripts/pool-dynamics.ts [--type lines|grids|pairs] [--games 12] [--seconds 600]
 *     [--drift 120] [--kind simple] [--objects 3] [--births 0.0041667] [--variant line-q] [--only prime-landing,treasure]
 *     [--from 0] [--json out.json] [--preset grids-arithmetic] [--instances] [--focus prime-landing]
 *
 * --focus seats the family in every game (seat 0, its dealt parameters in turn, game by game; the other two seats from
 * the rest of the pool) and reports it per parameter set. Valleys crossed: its main-part steps from a rung (a main part
 * of at least 0, as on the rung ladders, whose off-rung lines score below 0) to a higher one.
 * --from offsets the game seeds (parallel runs); --json writes the per-family numbers for merging.
 *
 * Lines only: --variant line-q-lenses deals the lines-lenses preset. --climber changes the starter's last line
 * (scripts/climbers.ts): plain (the shipped starter); shortcut (when stuck: stretch, pivot, mirror); nomirror (the same
 * without the mirrors); lens or lens:rot.turn,fold (shortcut plus the lens moves); and the options climbers, which offer
 * moves beside the steps every act, priced by the starter's own climb: stretch (by 2, 3, 5, 7 and their inverses),
 * moves:<ids> (lens moves), stretch+moves:<ids>.
 * --seed names the deal's seed (default: the variant), e.g. --seed line-q on line-q-lenses to seat what line-q seats.
 * Per move kind (the mutators of each committed move): moves, the mover's own bits gained, its fee (W, bits), the share
 * whose gain exceeded the fee, the others' bits changed, the share that halved another seat holding at least 2 bits
 * (collateral), and the share that also raised another seat by at least a bit (a shared climb). Peaks: per game the
 * largest bits any seat held on any object, the largest table total of an object (Σ n_i Σ_{j≠i} n_j), and the longest
 * run of one seat's consecutive stretches on one object. Redraws: each redrawn seat's first move and the bits it won back.
 */
import { parseArgs } from "node:util";
import { compareScores, evaluateSite, rng, type ObjectType, type Score, type Variant } from "@workspace/v2-core";
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { grid4, gridPresets, gridType } from "@workspace/v2-grid";
import { lineQ, lineQLenses, lineType, lineZ, presets } from "@workspace/v2-linear";
import { pairPresets, pairQ, pairType } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { lensClimber, LENS_IDS, lineStarter, optionsClimber, SHORTCUT } from "./climbers.ts";

const { values: o } = parseArgs({ options: {
  type: { type: "string", default: "lines" },
  games: { type: "string", default: "12" }, seconds: { type: "string", default: "600" }, drift: { type: "string", default: "120" },
  kind: { type: "string", default: "simple" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  variant: { type: "string", default: "line-q" }, preset: { type: "string" }, instances: { type: "boolean", default: false }, only: { type: "string" }, from: { type: "string", default: "0" }, json: { type: "string" }, focus: { type: "string" }, climber: { type: "string", default: "plain" }, seed: { type: "string" },
} });

interface PoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }
const setup = ((): { type: ObjectType<unknown>; variant: Variant; pool: readonly PoolRule[]; economy: typeof LINES_BEGINNER_ECONOMY } => {
  if (o.type === "grids") return { type: gridType as ObjectType<unknown>, variant: grid4, pool: (o.preset ? gridPresets.find(p => p.id === o.preset)! : gridPresets[0]).rules, economy: GRIDS_BEGINNER_ECONOMY };
  if (o.type === "pairs") return { type: pairType as ObjectType<unknown>, variant: pairQ, pool: pairPresets[0].rules, economy: LINES_BEGINNER_ECONOMY };
  const variant = o.variant === "line-z" ? lineZ : o.variant === "line-q-lenses" ? lineQLenses : lineQ;
  return { type: lineType as ObjectType<unknown>, variant, pool: presets.find(p => p.variant === variant.id)!.rules, economy: LINES_BEGINNER_ECONOMY };
})();
const { type, variant, pool, economy: E } = setup;
const seconds = Number(o.seconds), drift = Number(o.drift);
/** Row 2 (design-principles.md): no seat should sit on a main-part level it reached this early. */
const EARLY_SECONDS = 120;
const boxes = sandboxes();
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const median = (x: number[]) => { const y = [...x].sort((a, b) => a - b); return y.length ? y[Math.floor(y.length / 2)]! : NaN; };
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");

interface Stat {
  games: number; gained: number[]; lastThird: number[]; latency: number[]; redraws: number; answered: number; grids: number; cur: number[]; alt: number[];
  levels: number[]; endBits: number[]; seats: number; climbingLate: number; plateauEarly: number;
  mainSteps: number; valleys: number; tbLost: number; recovered: number; recovery: number[];
  energyEnd: number[]; spentShare: number[]; perMinute: number[];
  own: number[]; others: number[]; moves: number[]; trueGain: number[]; flips: number[]; reversal: number[];
  /** Contest: another seat's move lowered this seat's main part on an object it had climbed; and how often it climbed back. */
  taken: number; reclimbed: number;
}
const stats = new Map<string, Stat>();
const stat = (f: string) => stats.get(f) ?? (stats.set(f, {
  games: 0, gained: [], lastThird: [], latency: [], redraws: 0, answered: 0, grids: 0, cur: [], alt: [],
  levels: [], endBits: [], seats: 0, climbingLate: 0, plateauEarly: 0, mainSteps: 0, valleys: 0, tbLost: 0, recovered: 0, recovery: [],
  energyEnd: [], spentShare: [], perMinute: [],
  own: [], others: [], moves: [], trueGain: [], flips: [], reversal: [], taken: 0, reclimbed: 0,
}), stats.get(f)!);
// --seed line-q on line-q-lenses deals the same seats as line-q, game for game.
const R = rng("pool-dynamics", o.seed ?? variant.id, o.from);
const head = (s: Score) => (s === null ? null : s.slice(0, 1));
const tail = (s: Score) => (s === null ? null : s.slice(1));

const climber = o.climber!;
const ids = (x: string) => (x === "" ? [] : x.split(","));
const [ending, offered] = ((): [string | undefined, readonly string[]] => {
  if (climber === "plain") return [undefined, []];
  if (climber === "shortcut") return [SHORTCUT, []];
  if (climber === "nomirror") return [lensClimber([], false), []];
  if (climber === "lens") return [lensClimber(), LENS_IDS];
  if (climber.startsWith("lens:")) return [lensClimber(ids(climber.slice(5))), ids(climber.slice(5))];
  if (climber === "stretch") return [optionsClimber(true), []];
  const m = /^(stretch\+)?moves:(.*)$/.exec(climber);
  if (m) return [optionsClimber(!!m[1], ids(m[2]!)), ids(m[2]!)];
  throw new Error(`--climber ${climber}`);
})();
if (ending && o.type !== "lines") throw new Error("--climber is for lines");
for (const id of offered) if (!variant.mutators.includes(id)) throw new Error(`${id} is not offered on ${variant.id}: use --variant line-q-lenses`);
// Bits of a seat's rule, by (family, params, tie-breaker).
const valuers = new Map<string, (s: unknown) => number>();
const bitsFor = (rule: { family: string; params: Record<string, unknown>; tieBreaker: string }) => {
  const key = JSON.stringify([rule.family, rule.params, rule.tieBreaker]);
  if (!valuers.has(key)) { const v = valuer(type, variant, rule); valuers.set(key, x => v.bits(x)); }
  return valuers.get(key)!;
};
interface MoveStat { moves: number; own: number; fee: number; aboveFee: number; others: number; halved: number; exposed: number; shared: number }
const byMove = new Map<string, MoveStat>();
const answers = new Map<string, { n: number; won: number }>();
const peaks: { seat: number; table: number; stretchRun: number }[] = [];

for (let g = Number(o.from); g < Number(o.from) + Number(o.games); g++) {
  const choices = o.only ? pool.filter(r => o.only!.split(",").includes(r.family)) : pool;
  const picks: PoolRule[] = [];
  if (o.focus) { const mine = pool.filter(r => r.family === o.focus); if (!mine.length) throw new Error(`no ${o.focus} in the pool`); picks.push(mine[g % mine.length]!); }
  // --instances: three seats of distinct dealt rules (a family may sit twice with other params), counted per rule; a pool
  // of fewer than three families (Grids · arithmetic) seats that way.
  const same = (a: PoolRule, b: PoolRule) => a.family === b.family && (!o.instances || JSON.stringify(a.params) === JSON.stringify(b.params));
  while (picks.length < Math.min(3, o.instances ? choices.length : new Set(choices.map(c => c.family)).size)) { const r = choices[R.below(choices.length)]!; if (!picks.some(x => same(x, r))) picks.push(r); }
  const keyOf = (r: PoolRule) => (r.family === o.focus || o.instances ? `${r.family} ${JSON.stringify(r.params)}` : r.family);
  const keys = picks.map(keyOf);
  const seats = picks.map((r, k) => {
    const tieBreaker = r.tieBreakers[R.below(r.tieBreakers.length)]!;
    const a = startersFor(r.family, "typescript").find(x => x.kind === o.kind)!;
    const program = ending ? lineStarter(r.family, ending) : { language: a.language, source: a.source };
    return { name: `P${k}`, kind: "starter" as const, rule: { family: r.family, params: r.params as Record<string, unknown>, tieBreaker }, program };
  });
  const fams = seats.map(s => type.families.find(f => f.id === s.rule.family)!);
  const params = seats.map(s => s.rule.params);
  const scoreOf = (i: number, s: unknown): Score => evaluateSite(type, fams[i]!, params[i], s, variant, 0, seats[i]!.rule.tieBreaker).score;
  const moves: { at: number; seat: number; object: number }[] = [], redraws: { at: number; seat: number }[] = [];
  // The ladder, per seat and object, under the seat's current parameters (a redraw starts it again).
  interface Climb { best: Score; levels: number; lastUp: number; pending: { tb: Score; main: Score; at: number } | null; lost?: Score }
  const climbs = seats.map(() => new Map<number, Climb>());
  const levelsDone = seats.map(() => [] as number[]);
  const lastStep = seats.map(() => -Infinity);   // each seat's last new best main part, on any object
  let live = Number(o.objects);
  const lastBalance = seats.map(() => NaN), income = seats.map(() => 0), spent = seats.map(() => 0);
  const seatBits = (i: number, x: unknown) => bitsFor({ ...seats[i]!.rule, params: params[i] as Record<string, unknown> })(x);
  const pending = new Set<number>();   // seats redrawn and not yet answered by a committed move
  const runs = new Map<string, number>();   // seat:object → consecutive stretches
  let peakSeat = 0, peakTable = 0, stretchRun = 0;
  const rep = await runTable(boxes, {
    type, variant, lines: Number(o.objects), seed: `pool-${o.type}-${g}`, seconds, seats, unique: true, economy: E,
    birthsPerSecond: Number(o.births), summonCap: E.startingEnergy, ...(drift > 0 ? { driftSeconds: drift } : {}),
    onAct: e => {
      live = Math.max(live, e.objects);
      lastBalance[e.seat] = e.balance; income[e.seat] = e.income; spent[e.seat]! += e.charge;
      if (!e.committed) return;
      moves.push({ at: e.at, seat: e.seat, object: e.object });
      // Contest: this move takes main-part progress from another seat that had climbed this object.
      seats.forEach((_, j) => {
        if (j === e.seat) return;
        const cj = climbs[j]!.get(e.object);
        if (!cj || cj.levels === 0) return;
        const b = head(scoreOf(j, e.before)), a = head(scoreOf(j, e.state));
        if (compareScores(a, b) < 0) { stat(keys[j]!).taken++; if (!cj.lost) cj.lost = b; }
      });
      {
        const b = seats.map((_, j) => seatBits(j, e.before)), a = seats.map((_, j) => seatBits(j, e.state));
        const key = e.calls.map(c => c.mutator).join("+") || "?", fee = e.calls.reduce((t, c) => t + c.price.total, 0);
        const m = byMove.get(key) ?? (byMove.set(key, { moves: 0, own: 0, fee: 0, aboveFee: 0, others: 0, halved: 0, exposed: 0, shared: 0 }), byMove.get(key)!);
        const gain = a[e.seat]! - b[e.seat]!;
        m.moves++; m.own += gain; m.fee += fee; if (gain > fee) m.aboveFee++;
        let shared = false;
        seats.forEach((_, j) => { if (j === e.seat) return; m.others += a[j]! - b[j]!; if (a[j]! >= b[j]! + 1) shared = true; if (b[j]! >= 2) { m.exposed++; if (a[j]! < b[j]! / 2) m.halved++; } });
        if (shared) m.shared++;
        const tot = a.reduce((t, x) => t + x, 0);
        peakSeat = Math.max(peakSeat, ...a); peakTable = Math.max(peakTable, a.reduce((t, x) => t + x * (tot - x), 0));
        const rk = `${e.seat}:${e.object}`, run = key === "mach.stretch" ? (runs.get(rk) ?? 0) + 1 : 0;
        runs.set(rk, run); stretchRun = Math.max(stretchRun, run);
        if (pending.delete(e.seat)) { const w = answers.get(key) ?? (answers.set(key, { n: 0, won: 0 }), answers.get(key)!); w.n++; w.won += gain; }
      }
      const i = e.seat, st = stat(keys[i]!);
      const before = scoreOf(i, e.before), after = scoreOf(i, e.state);
      const c = climbs[i]!.get(e.object) ?? { best: before, levels: 0, lastUp: -Infinity, pending: null };
      climbs[i]!.set(e.object, c);
      if (c.lost !== undefined && compareScores(head(after), c.lost) >= 0) { st.reclimbed++; c.lost = undefined; }
      if (compareScores(head(after), head(before)) > 0) {
        st.mainSteps++;
        if (before !== null && before[0] !== null && before[0]!.n >= 0n) st.valleys++;
        if (compareScores(head(after), head(c.best)) > 0) { c.best = after; c.levels++; c.lastUp = e.at; lastStep[i] = e.at; }
        if (compareScores(tail(after), tail(before)) < 0) { st.tbLost++; c.pending = { tb: tail(before), main: head(after), at: e.at }; }
        else c.pending = null;
      } else if (c.pending && compareScores(head(after), c.pending.main) >= 0 && compareScores(tail(after), c.pending.tb) >= 0) {
        st.recovered++; st.recovery.push(e.at - c.pending.at); c.pending = null;
      } else if (c.pending && compareScores(head(after), c.pending.main) < 0) c.pending = null;   // gave the step back
    },
    onDrift: e => {
      redraws.push({ at: e.at, seat: e.seat }); params[e.seat] = e.params; pending.add(e.seat);
      for (const c of climbs[e.seat]!.values()) if (c.levels) levelsDone[e.seat]!.push(c.levels);
      climbs[e.seat]!.clear();
    },
  });
  const finalBits = seats.map((s, k) => { const v = valuer(type, variant, { ...s.rule, params: params[k]! }); return (x: unknown) => v.bits(x); });
  const late = new Set(moves.filter(m => m.at >= (2 * seconds) / 3).map(m => m.object)).size / live;
  seats.forEach((s, i) => {
    const st = stat(keys[i]!), fam = fams[i]!;
    st.games++; st.gained.push(rep.seats[i]!.gained); st.lastThird.push(late);
    st.energyEnd.push(lastBalance[i]!); st.spentShare.push(spent[i]! / (income[i]! * seconds)); st.perMinute.push(moves.filter(m => m.seat === i).length / (seconds / 60));
    const sr = rep.seats[i]!;
    st.moves.push(sr.moves); st.trueGain.push(sr.trueGainShare); st.flips.push(sr.flips); st.reversal.push(sr.reversalEnergy);
    // Own bits and the others' bits on each final object, under each seat's final parameters.
    for (const x of rep.final) { st.own.push(finalBits[i]!(x)); st.others.push(finalBits.reduce((a, b, k) => (k === i ? a : a + b(x)), 0)); }
    const bitsUnder = (p: Record<string, unknown>) => { const v = valuer(type, variant, { ...s.rule, params: p }); return (o2: unknown) => v.bits(o2); };
    const now = bitsUnder(params[i]!);
    st.seats++;
    const climbed = [...climbs[i]!.entries()].filter(([, c]) => c.levels > 0);
    st.levels.push(...levelsDone[i]!, ...climbed.map(([, c]) => c.levels));
    st.endBits.push(...climbed.map(([k]) => now(rep.final[k])));
    if (climbed.some(([, c]) => c.lastUp >= (2 * seconds) / 3)) st.climbingLate++;
    if (lastStep[i]! < EARLY_SECONDS) st.plateauEarly++;   // row 2: sits on a level reached in the first two minutes
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
  peaks.push({ seat: peakSeat, table: peakTable, stretchRun });
  console.error(`game ${g + 1}: ${seats.map(s => `${s.rule.family}/${s.rule.tieBreaker}`).join(", ")}; ${redraws.length} redraws`);
}
await boxes.close();

console.log(`${variant.id} pool, ${o.kind} starters, climber ${climber}, ${o.games} games of ${seconds} s, ${drift > 0 ? `drift every ${drift} s` : "no drift"}, power ${E.powerPerSecond}, ${E.opportunitiesPerSecond}/s`);
console.log("| family | games | mean points gained | moves a minute | energy at end | spent / income | own bits at end | others' bits at end | moves | share raising points | flips | energy taken back | objects moving in the last third | main-part levels per object climbed: median / max | end bits on those objects (mean, max) | seats still climbing the main part in the last third | seats whose last main-part step came in the first 120 s | valleys crossed (rung to higher rung) | main-part steps that lowered the tie-breaker | recovered, median s | redraws answered, median s | end bits under current / other params | main-part progress taken by others (climbed back) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const rows = [...stats.entries()].sort((a, b) => mean(b[1].gained) - mean(a[1].gained));
for (const [f, s] of rows) console.log([
  f, s.games, mean(s.gained).toFixed(0), mean(s.perMinute).toFixed(1), mean(s.energyEnd).toFixed(0), `${(100 * mean(s.spentShare)).toFixed(0)}%`, mean(s.own).toFixed(1), mean(s.others).toFixed(1), mean(s.moves).toFixed(0),
  `${(100 * mean(s.trueGain)).toFixed(0)}%`, mean(s.flips).toFixed(1), mean(s.reversal).toFixed(0), `${(100 * mean(s.lastThird)).toFixed(0)}%`,
  s.levels.length ? `${median(s.levels)} / ${Math.max(...s.levels)}` : "-", s.endBits.length ? `${mean(s.endBits).toFixed(1)} (max ${Math.max(...s.endBits).toFixed(1)})` : "-",
  pct(s.climbingLate, s.seats), pct(s.plateauEarly, s.seats), s.valleys, `${pct(s.tbLost, s.mainSteps)} of ${s.mainSteps}`,
  s.tbLost ? `${pct(s.recovered, s.tbLost)}, ${s.recovery.length ? median(s.recovery).toFixed(0) : "-"}` : "-",
  s.redraws ? `${s.answered}/${s.redraws}, ${s.latency.length ? median(s.latency).toFixed(1) : "-"}` : "-",
  s.cur.length ? `${mean(s.cur).toFixed(1)} / ${mean(s.alt).toFixed(1)}` : "-",
  s.taken ? `${s.taken} (${pct(s.reclimbed, s.taken)})` : "0",
].join(" | ").replace(/^/, "| ").concat(" |"));
// Families seen in fewer than 5 games, or gaining under a point, would make the ratio noise.
const means = rows.filter(([, s]) => s.games >= 5).map(([, s]) => mean(s.gained)).filter(x => x >= 1);
console.log(`balance: best family's mean gain over the worst's: ${means.length >= 2 ? (Math.max(...means) / Math.min(...means)).toFixed(1) : "- (too few games)"}`);
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "-");
console.log("\n| move (mutators of the act) | moves | mover's bits gained, mean | fee W (bits), mean | gained more than its fee | others' bits changed, mean | halved a seat holding ≥ 2 bits | raised another seat ≥ 1 bit |");
console.log("|---|--:|--:|--:|--:|--:|--:|--:|");
for (const [k, m] of [...byMove.entries()].sort((a, b) => b[1].moves - a[1].moves))
  console.log(`| ${k} | ${m.moves} | ${fmt(m.own / m.moves)} | ${fmt(m.fee / m.moves)} | ${pct(m.aboveFee, m.moves)} | ${fmt(m.others / m.moves)} | ${pct(m.halved, m.exposed)} | ${pct(m.shared, m.moves)} |`);
if (answers.size) {
  console.log("\n| a redrawn seat's first move | answers | bits won back, mean |");
  console.log("|---|--:|--:|");
  for (const [k, w] of [...answers.entries()].sort((x, y) => y[1].n - x[1].n)) console.log(`| ${k} | ${w.n} | ${fmt(w.won / w.n)} |`);
}
const ps = peaks.map(p => p.seat), pt = peaks.map(p => p.table), pr = peaks.map(p => p.stretchRun);
console.log(`\npeaks per game: a seat's bits median ${fmt(median(ps))}, max ${fmt(Math.max(...ps))}; an object's table total median ${fmt(median(pt))}, max ${fmt(Math.max(...pt))}; longest run of one seat's stretches on one object median ${median(pr)}, max ${Math.max(...pr)}`);
if (o.json) (await import("node:fs")).writeFileSync(o.json, JSON.stringify(Object.fromEntries(stats)));
