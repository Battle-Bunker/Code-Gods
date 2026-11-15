/**
 * Starter dynamics on a preset's own pool, per family: the coordinator's drift check, and rows 2, 3 and 9 of the rule
 * design check (docs/engine-v2/design-principles.md). Each game seats three families drawn from the pool (a random
 * dealt rule each, with a random tie-breaker; pairs: no table their seating rule forbids). Every seat runs the shipped starter, and the parameters drift
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
 * - contest: how often another seat's move took main-part progress on an object it had climbed (one episode until it
 *   climbs back; a redraw ends it), and the share of episodes it climbed back (an uncontested hill is the old bug on a
 *   slower clock);
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
import { pairClashes, pairPresets, pairQ, pairType } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { practiceDeal } from "../../../artifacts/engine/convex/v2/deal.ts";
import { presetOf } from "../../../artifacts/engine/convex/v2/presets.ts";
import { lensClimber, LENS_IDS, lineStarter, optionsClimber, SHORTCUT } from "./climbers.ts";

/**
 * --twostep (an experiment, TypeScript line starters only): when no single step raises the seat's points, it weighs
 * pairs of steps (each of its tries followed by a shift or tilt of up to FAR) with climb, and takes the first step of the
 * best pair: can it see joint climbs a greedy step cannot?
 */
/**
 * --menu full (an experiment, TypeScript line starters): the rest of the beginner menu beside the shipped tries: the
 * pattern's step (seq.step ±1), a nudge to one number of ax + by + c = 0 (gen.nudge a, b or c by ±1) and turns about
 * the y-axis crossing (rot.turn by ±1 and ±1/2), each with the line it reaches.
 */
function fullMenu(source: string): string {
  const at = "  let options = tries.map(";
  if (!source.includes(at)) return source;
  return source.replace(at, `  if (Q.isQ(m) && Q.isQ(c)) {
    for (const k of [-1, 1]) tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);
    let b = 1n; for (const x of [m, c]) { const g = (a, b) => (b === 0n ? a : g(b, a % b)); b = (b * x.d) / g(b, x.d); }
    const A = Q.neg(Q.mul(m, Q.of(b))), C = Q.neg(Q.mul(c, Q.of(b))), B = Q.of(b);
    for (const k of [-1, 1]) {
      const K = Q.of(k), Bk = Q.add(B, K);
      tries.push([move("gen.nudge", { which: "a", k }), Q.neg(Q.div(Q.add(A, K), B)), c]);
      if (!Q.isZero(Bk) && Q.cmp(Bk, Q.of(0)) > 0) tries.push([move("gen.nudge", { which: "b", k }), Q.neg(Q.div(A, Bk)), Q.neg(Q.div(C, Bk))]);
      tries.push([move("gen.nudge", { which: "c", k }), m, Q.neg(Q.div(Q.add(C, K), B))]);
    }
    for (const t of [Q.of(1), Q.of(-1), Q.of(1, 2), Q.of(-1, 2)]) {
      const den = Q.sub(Q.of(1), Q.mul(m, t));
      if (!Q.isZero(den)) tries.push([move("rot.turn", { centre: 0, turn: t }), Q.div(Q.add(m, t), den), c]);
    }
  }
${at}`);
}

/**
 * --look two | dip:F (an experiment, TypeScript line starters): when no single step is worth it, look two moves ahead on
 * the offered line: the 3 best first steps for the seat's rule, each followed by a shift or tilt by 1, and take the first
 * move of the best affordable pair (climb prices the whole pair, honestly). two: any first move, even one that lowers
 * the seat's points; dip:F: only first moves that keep at least 1 − F of the seat's own bits now.
 */
function lookahead(source: string, mode: string): string {
  const call = /  return climb\(offer, options, (score\([^)]*\)), QUOTES\);/;
  if (!call.test(source)) return source;
  const f = mode.startsWith("dip:") ? Number(mode.slice(4)) : null;
  return source.replace(call, (_m, now) => `  const one = climb(offer, options, ${now}, QUOTES);
  if (one || PROTECT.includes(offer.object)) return one;
  const here = ${now}, floor = ${f === null ? "null" : `(1 - ${f}) * rarity(offer, here)`};
  const firsts = tries.map((t, i) => [t, options[i][1]]).filter(([[, m1], s1]) => Q.isQ(m1) && s1 && (floor === null || rarity(offer, s1) >= floor))
    .sort((a, b) => (better(a[1], b[1]) ? -1 : better(b[1], a[1]) ? 1 : 0)).slice(0, 3).map(([t]) => t);
  const pairs = [];
  for (const [plan, m1, c1] of firsts) {
    const first = Array.isArray(plan) ? plan : [plan];
    for (const k of [-1, 1]) {
      pairs.push([[...first, move("si.shift", { k })], ${now.replace("(m, c", "(m1, Q.add(c1, k)")}]);
      pairs.push([[...first, move("si.tilt", { k })], ${now.replace("(m, c", "(Q.add(m1, k), c1")}]);
    }
  }
  const two = climb(offer, pairs, here, 4);
  return two ? two.slice(0, -1) : null;`);
}

function twoStep(source: string): string {
  const call = /  return climb\(offer, options, (score\([^)]*\)), QUOTES\);/;
  if (!call.test(source)) return source;
  return source.replace(call, (_m, now) => `  const one = climb(offer, options, ${now}, QUOTES);
  if (one) return one;
  const pairs = [];
  for (const [plan, m1, c1] of tries) {
    if (!Q.isQ(m1)) continue;
    for (let k = -FAR; k <= FAR; k++) if (k !== 0) {
      const first = Array.isArray(plan) ? plan : [plan];
      pairs.push([[...first, move("si.shift", { k })], ${now.replace("(m, c", "(m1, Q.add(c1, k)")}]);
      pairs.push([[...first, move("si.tilt", { k })], ${now.replace("(m, c", "(Q.add(m1, k), c1")}]);
    }
  }
  const two = climb(offer, pairs, ${now}, QUOTES);
  return two ? two.slice(0, -1) : null;`);
}

const { values: o } = parseArgs({ options: {
  type: { type: "string", default: "lines" },
  games: { type: "string", default: "12" }, seconds: { type: "string", default: "600" }, drift: { type: "string", default: "120" },
  kind: { type: "string", default: "simple" }, objects: { type: "string", default: "3" }, births: { type: "string", default: String(1 / 240) },
  variant: { type: "string", default: "line-q" }, preset: { type: "string" }, instances: { type: "boolean", default: false }, only: { type: "string" }, from: { type: "string", default: "0" }, json: { type: "string" }, focus: { type: "string" }, climber: { type: "string", default: "plain" }, seed: { type: "string" },
  seats: { type: "string", default: "3" }, cap: { type: "string" }, look: { type: "string" }, menu: { type: "string" }, "births-quiet": { type: "string" }, "retire-play": { type: "string" }, "retire-family": { type: "string" }, twostep: { type: "boolean", default: false },
  power: { type: "string", default: "1" }, reading: { type: "string" }, server: { type: "boolean", default: false }, practice: { type: "boolean", default: false }, "drift-ladders": { type: "boolean", default: false }, "no-mirror": { type: "boolean", default: false },
} });

interface PoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }
const setup = ((): { type: ObjectType<unknown>; variant: Variant; pool: readonly PoolRule[]; economy: typeof LINES_BEGINNER_ECONOMY } => {
  if (o.type === "grids") return { type: gridType as ObjectType<unknown>, variant: grid4, pool: (o.preset ? gridPresets.find(p => p.id === o.preset)! : gridPresets[0]).rules, economy: GRIDS_BEGINNER_ECONOMY };
  if (o.type === "pairs") return { type: pairType as ObjectType<unknown>, variant: pairQ, pool: pairPresets[0].rules, economy: LINES_BEGINNER_ECONOMY };
  const variant = o.variant === "line-z" ? lineZ : o.variant === "line-q-lenses" ? lineQLenses : lineQ;
  return { type: lineType as ObjectType<unknown>, variant, pool: presets.find(p => p.variant === variant.id)!.rules, economy: LINES_BEGINNER_ECONOMY };
})();
// --power scales the economy's power (every seat's income); --reading distinct seats rules whose main parts are read in
// different representations, --reading shared seats two that share one (the third is any other family).
const { type, variant, pool } = setup, E = { ...setup.economy, powerPerSecond: setup.economy.powerPerSecond * Number(o.power) };
const readingOf = (r: PoolRule) => type.families.find(f => f.id === r.family)!.main.rep;
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
  committed: number; raisedOther: number; bestJoint: number[]; thirds: number[]; upThirds: number[]; upOthers: number[]; peak: number[]; skipsLate: number; actsLate: number;
  /** Contest: episodes where another seat's move lowered this seat's main part on an object it had climbed; those it climbed back. */
  taken: number; reclimbed: number;
}
const stats = new Map<string, Stat>();
const objectsPerMinute: number[][] = [[], [], []], quietShare: number[] = [];
const stat = (f: string) => stats.get(f) ?? (stats.set(f, {
  games: 0, gained: [], lastThird: [], latency: [], redraws: 0, answered: 0, grids: 0, cur: [], alt: [],
  levels: [], endBits: [], seats: 0, climbingLate: 0, plateauEarly: 0, mainSteps: 0, valleys: 0, tbLost: 0, recovered: 0, recovery: [],
  energyEnd: [], spentShare: [], perMinute: [],
  own: [], others: [], moves: [], trueGain: [], flips: [], reversal: [], taken: 0, reclimbed: 0,
  committed: 0, raisedOther: 0, bestJoint: [], thirds: [0, 0, 0], upThirds: [0, 0, 0], upOthers: [], peak: [], skipsLate: 0, actsLate: 0,
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
/** Per family and mutator (a mirror by its axis): moves, the mover's bits gained, and repeats (the same seat's same move on the same object again). */
const byFamMove = new Map<string, { moves: number; gain: number; repeats: number }>();
const seenMoves = new Set<string>();
/**
 * The tug of war (the coordinator's question, 15 Nov): over all committed moves, flips (a move that puts an object back
 * to its state before another seat's last move on it, as table.ts counts them) and the movers' bits gained, with the
 * share made by reflections; and repairs: a reflection that raises its mover's bits right after another seat's move on
 * that object lowered them (after a reflection by that seat: a mirror tug; after any other move: a sign repair).
 */
const tug = { levels: 0, lateMoves: 0, lateOnTwoState: 0, lateObjects: 0, lateStates: 0, twoStateObjects: 0, moves: 0, mirrors: 0, flips: 0, mirrorFlips: 0, gain: 0, mirrorGain: 0, repairsAfterMirror: 0, repairsAfterOther: 0, repairGain: 0 };
// --cap: rungs stepped in the last third on lines younger than 60 s against older ones.
const lateUp = { young: 0, old: 0 };
// Dips (lookahead's first moves): a committed move that lowered its mover's own bits, and what came next on that line:
// the same seat's next move (it rose above where it dipped from: recovered), another seat's (undone: back to the state
// before the dip), or nothing before the game ended.
const failed = { acts: 0, n: 0, steps: 0, calls: 0 };
// Survival: of the bits other seats held on a line just before a seat's move, the share they still hold after it.
const survival = { held: 0, kept: 0 };
const dips = { n: 0, followed: 0, recovered: 0, interrupted: 0, undone: 0, open: 0 };
// --cap: line lives (retired lines; still live at the end: censored), rungs per line, banked share of seats' totals, moves
// and own gains in a line's last 30 s before it retires, and (--births-quiet) gains on lines born in the last 90 s.
const life = { retired: [] as number[], censored: 0, rungs: [] as number[], banked: [] as number[], nearMoves: 0, nearGain: 0, allMoves: 0, allGain: 0, lateBornGain: 0 };
// --retire-play fresh|rush, for the seat of --retire-family: fresh acts only on the newer half of the live lines
// (neglecting the old); rush acts only on the two lines next to retire.
const retirePlay = o["retire-play"], retireFamily = o["retire-family"];
const peaks: { seat: number; table: number; stretchRun: number; runBy: string; game: number }[] = [];
/** Per family (the stats key): the largest bits its seat held on any object, and in which game. */
const peakBy = new Map<string, { bits: number; game: number }>();

for (let g = Number(o.from); g < Number(o.from) + Number(o.games); g++) {
  const choices = o.only ? pool.filter(r => o.only!.split(",").includes(r.family)) : pool;
  const picks: PoolRule[] = [];
  if (o.focus && !o.practice) { const mine = pool.filter(r => r.family === o.focus); if (!mine.length) throw new Error(`no ${o.focus} in the pool`); picks.push(mine[g % mine.length]!); }
  // --instances: three seats of distinct dealt rules (a family may sit twice with other params), counted per rule; a pool
  // of fewer than three families (Grids · arithmetic) seats that way.
  const same = (a: PoolRule, b: PoolRule) => a.family === b.family && (!o.instances || JSON.stringify(a.params) === JSON.stringify(b.params));
  const readable = (r: PoolRule) => o.reading === "distinct" ? !picks.some(x => readingOf(x) === readingOf(r))
    : o.reading === "shared" && picks.length === 1 ? readingOf(picks[0]!) === readingOf(r) : true;
  if (o.reading === "shared" && !o.focus) {   // start from a family that has a partner sharing its reading
    const twins = choices.filter(r => choices.some(x => x.family !== r.family && readingOf(x) === readingOf(r)));
    picks.push(twins[R.below(twins.length)]!);
  }
  // Pairs: no table the seating rule forbids (lib/v2-pair seating.ts), as the dealer.
  const seatable = (r: PoolRule) => o.type !== "pairs" || pairClashes([...picks, r]).length === 0;
  while (picks.length < Math.min(Number(o.seats), o.instances ? choices.length : new Set(choices.map(c => c.family)).size)) { const r = choices[R.below(choices.length)]!; if (!picks.some(x => same(x, r)) && seatable(r) && readable(r)) picks.push(r); }
  // --practice: the table a practice game deals (convex/v2/deal.ts practiceDeal: no two partners against the human,
  // partners that share the human's goal where they can), seat 0 the human's.
  if (o.practice) {
    const preset = presetOf(o.type === "grids" ? "grids-beginner" : o.type === "pairs" ? "lines-pairs" : "lines-beginner");
    let dealt = practiceDeal(preset.pool as never, ["human", "practice", "practice"], `pool-dynamics:${g}`, preset.variant) as { family: string; params: unknown; tieBreaker?: string }[];
    // --focus with --practice: the human's seat holds the focus family (re-dealt until it does).
    for (let t = 0; o.focus && dealt[0]!.family !== o.focus && t < 2000; t++) dealt = practiceDeal(preset.pool as never, ["human", "practice", "practice"], `pool-dynamics:${g}:${t}`, preset.variant) as never;
    picks.length = 0;
    for (const d of dealt) { const pr = pool.find(x => x.family === d.family && JSON.stringify(x.params) === JSON.stringify(d.params)) ?? pool.find(x => x.family === d.family)!;
      picks.push({ family: d.family, params: d.params, tieBreakers: d.tieBreaker ? [d.tieBreaker] : pr.tieBreakers }); }
  }
  const keyOf = (r: PoolRule) => (r.family === o.focus || o.instances ? `${r.family} ${JSON.stringify(r.params)}` : r.family);
  const keys = picks.map(keyOf);
  const seats = picks.map((r, k) => {
    const tieBreaker = r.tieBreakers[R.below(r.tieBreakers.length)]!;
    // --server: as the server seats practice partners (convex/v2/agents.ts): the first in TypeScript, the rest in Python.
    const a = startersFor(r.family, o.server && k > 0 ? "python" : "typescript").find(x => x.kind === o.kind)!;
    const program = ending ? lineStarter(r.family, ending) : { language: a.language, source: (x => (o.look ? lookahead(x, o.look) : x))(o.menu === "full" ? fullMenu(o.twostep ? twoStep(a.source) : a.source) : o.twostep ? twoStep(a.source) : a.source) };
    // --no-mirror: the counterfactual with no reflections in any seat's search (the shortcuts of #855 less cart.mirror).
    if (o["no-mirror"]) program.source = program.source.replaceAll("shortcuts(m, c, rule.mutators)", `shortcuts(m, c, rule.mutators).filter(([plan]) => plan.mutator !== "cart.mirror")`);
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
  const lastOn = new Map<number, { by: number; from: string; mirror: boolean; lowered: boolean[] }>();   // object → its last committed move
  const lastThird = new Map<number, { moves: number; states: Set<string> }>();   // object → its changing moves and distinct states in the last third
  let peakSeat = 0, peakTable = 0, stretchRun = 0, runBy = "";
  const bestJoint = seats.map(() => 0), peak = seats.map(() => 0);   // per seat: its highest bits on a state that also holds at least 10 of the others' bits
  const dipOn = new Map<number, { seat: number; from: string; level: number }>();   // object → its open dip
  const retiredAt = new Map<number, number>(), bankedBy = seats.map(() => 0), gains: { object: number; at: number; gain: number; born: number }[] = [], rungsOn = new Map<number, number>();
  const rep = await runTable(boxes, {
    type, variant, lines: Number(o.objects), seed: `pool-${o.type}-${g}`, seconds, seats, unique: true, economy: E,
    ...(o.cap ? { objectCap: Number(o.cap), onRetire: (e: { at: number; object: number; born: number; points: readonly number[] }) => { retiredAt.set(e.object, e.at); life.retired.push(e.at - e.born); e.points.forEach((p, i) => (bankedBy[i] = bankedBy[i]! + p)); } } : {}),
    ...(o["births-quiet"] ? { birthsQuietSeconds: Number(o["births-quiet"]) } : {}),
    ...(retirePlay ? { offerFilter: (i: number, _obj: number, c: { age: number; live: number }) => seats[i]!.rule.family !== retireFamily || (retirePlay === "fresh" ? c.age >= Math.floor(c.live / 2) : c.age <= 1) } : {}), birthsPerSecond: Number(o.births), summonCap: E.startingEnergy, ...(drift > 0 ? { driftSeconds: drift } : {}), ...(o["drift-ladders"] ? { driftLadders: true } : {}), ...(o.server ? { regularBirths: true } : {}),
    onAct: e => {
      live = Math.max(live, e.objects);
      failed.acts++; if (e.outcome === "failed") { failed.n++; if (/Step limit/.test(e.reason ?? "")) failed.steps++; else if (/host-call cap/.test(e.reason ?? "")) failed.calls++; }
      lastBalance[e.seat] = e.balance; income[e.seat] = e.income; spent[e.seat]! += e.charge;
      if (e.at >= (2 * seconds) / 3) { const sl = stat(keys[e.seat]!); sl.actsLate++; if (!e.committed) sl.skipsLate++; }
      if (!e.committed) return;
      moves.push({ at: e.at, seat: e.seat, object: e.object });
      // Contest: this move takes main-part progress from another seat that had climbed this object.
      seats.forEach((_, j) => {
        if (j === e.seat) return;
        const cj = climbs[j]!.get(e.object);
        if (!cj || cj.levels === 0) return;
        const b = head(scoreOf(j, e.before)), a = head(scoreOf(j, e.state));
        if (compareScores(a, b) < 0 && cj.lost === undefined) { stat(keys[j]!).taken++; cj.lost = b; }
      });
      {
        const b = seats.map((_, j) => seatBits(j, e.before)), a = seats.map((_, j) => seatBits(j, e.state));
        const key = e.calls.map(c => c.mutator).join("+") || "?", fee = e.calls.reduce((t, c) => t + c.price.total, 0);
        const m = byMove.get(key) ?? (byMove.set(key, { moves: 0, own: 0, fee: 0, aboveFee: 0, others: 0, halved: 0, exposed: 0, shared: 0 }), byMove.get(key)!);
        const gain = a[e.seat]! - b[e.seat]!;
        gains.push({ object: e.object, at: e.at, gain: Math.max(0, gain), born: e.born });
        b.forEach((bj, j) => { if (j !== e.seat && bj > 0) { survival.held += bj; survival.kept += Math.min(bj, a[j]!); } });
        {
          const d = dipOn.get(e.object);
          if (d) {
            dipOn.delete(e.object);
            if (d.seat === e.seat) { dips.followed++; if (seatBits(e.seat, e.state) > d.level + 1e-9) dips.recovered++; }
            else { dips.interrupted++; if (type.encode(e.state as never) === d.from) dips.undone++; }
          }
          if (gain < -1e-9) { dips.n++; dipOn.set(e.object, { seat: e.seat, from: type.encode(e.before as never), level: b[e.seat]! }); }
        }
        {
          const fam = keys[e.seat]!.split(" ")[0]!, mk = e.calls.map(c => c.mutator === "cart.mirror" ? `cart.mirror ${(c.args as { axis?: string }).axis}` : c.mutator).join("+") || "?";
          const fm = byFamMove.get(`${fam}|${mk}`) ?? (byFamMove.set(`${fam}|${mk}`, { moves: 0, gain: 0, repeats: 0 }), byFamMove.get(`${fam}|${mk}`)!);
          const rk2 = `${g}:${e.seat}:${e.object}:${mk}`;
          fm.moves++; fm.gain += gain; if (seenMoves.has(rk2)) fm.repeats++; seenMoves.add(rk2);
          const isMirror = e.calls.some(c => c.mutator === "cart.mirror"), to = type.encode(e.state as never), prev = lastOn.get(e.object);
          tug.moves++; if (isMirror) tug.mirrors++;
          if (gain > 0) { tug.gain += gain; if (isMirror) tug.mirrorGain += gain; }
          if (prev && prev.by !== e.seat && prev.from === to) { tug.flips++; if (isMirror) tug.mirrorFlips++; }
          if (isMirror && gain > 0 && prev && prev.by !== e.seat && prev.lowered[e.seat]) {
            if (prev.mirror) tug.repairsAfterMirror++; else tug.repairsAfterOther++;
            tug.repairGain += gain;
          }
          if (e.at >= (2 * seconds) / 3) { const l = lastThird.get(e.object) ?? (lastThird.set(e.object, { moves: 0, states: new Set([type.encode(e.before as never)]) }), lastThird.get(e.object)!); l.moves++; l.states.add(to); }
          lastOn.set(e.object, { by: e.seat, from: type.encode(e.before as never), mirror: isMirror, lowered: seats.map((_, j) => a[j]! < b[j]! - 1e-9) });
        }
        m.moves++; m.own += gain; m.fee += fee; if (gain > fee) m.aboveFee++;
        let shared = false;
        seats.forEach((_, j) => { if (j === e.seat) return; m.others += a[j]! - b[j]!; if (a[j]! >= b[j]! + 1) shared = true; if (b[j]! >= 2) { m.exposed++; if (a[j]! < b[j]! / 2) m.halved++; } });
        if (shared) m.shared++;
        const tot = a.reduce((t, x) => t + x, 0);
        { const sm = stat(keys[e.seat]!); sm.committed++; sm.thirds[Math.min(2, Math.floor((3 * e.at) / seconds))]!++; if (seats.some((_, j) => j !== e.seat && a[j]! >= b[j]! + 0.5)) sm.raisedOther++; }
        a.forEach((x, j) => { if (tot - x >= 10) bestJoint[j] = Math.max(bestJoint[j]!, x); peak[j] = Math.max(peak[j]!, x); });
        a.forEach((x, j) => { const k = keys[j]!, p = peakBy.get(k); if (!p || x > p.bits) peakBy.set(k, { bits: x, game: g }); });
        peakSeat = Math.max(peakSeat, ...a); peakTable = Math.max(peakTable, a.reduce((t, x) => t + x * (tot - x), 0));
        const rk = `${e.seat}:${e.object}`, run = key === "mach.stretch" ? (runs.get(rk) ?? 0) + 1 : 0;
        runs.set(rk, run); if (run > stretchRun) { stretchRun = run; runBy = keys[e.seat]!; }
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
        if (compareScores(head(after), head(c.best)) > 0) {
          c.best = after; c.levels++; tug.levels++; c.lastUp = e.at; lastStep[i] = e.at;
          // A rung stepped up: when, and how many of the others' bits the object held before the step (fresh or contested).
          st.upThirds[Math.min(2, Math.floor((3 * e.at) / seconds))]!++;
          if (3 * e.at >= 2 * seconds) { if (e.at - e.born < 60) lateUp.young++; else lateUp.old++; }
          rungsOn.set(e.object, (rungsOn.get(e.object) ?? 0) + 1);
          st.upOthers.push(seats.reduce((a2, _s, j) => (j === i ? a2 : a2 + seatBits(j, e.before)), 0));
        }
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
  // The share of the game's minutes in which no object changed.
  { const mins = Math.round(seconds / 60); let q = 0; for (let m = 0; m < mins; m++) if (!moves.some(x => x.at >= 60 * m && x.at < 60 * (m + 1))) q++; quietShare.push(q / mins); }
  // Objects changed per minute (the playtest's measure), averaged over each third's minutes.
  for (let t = 0; t < 3; t++) {
    const mins = Array.from({ length: Math.round(seconds / 180) }, (_, j) => t * (seconds / 3) + j * 60);
    const per = mins.map(m0 => new Set(moves.filter(m => m.at >= m0 && m.at < m0 + 60).map(m => m.object)).size);
    objectsPerMinute[t]!.push(per.reduce((a, b) => a + b, 0) / per.length);
  }
  const late = new Set(moves.filter(m => m.at >= (2 * seconds) / 3).map(m => m.object)).size / live;
  seats.forEach((s, i) => {
    const st = stat(keys[i]!), fam = fams[i]!;
    st.games++; st.gained.push(rep.seats[i]!.gained); st.lastThird.push(late); st.bestJoint.push(bestJoint[i]!); st.peak.push(peak[i]!);
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
  dips.open += dipOn.size;
  peaks.push({ seat: peakSeat, table: peakTable, stretchRun, runBy, game: g });
  if (o.cap) {
    for (let k = 0; k < rep.objects; k++) { life.rungs.push(rungsOn.get(k) ?? 0); if (!retiredAt.has(k)) life.censored++; }
    rep.seats.forEach((sr, i) => { if (sr.end > 0) life.banked.push(bankedBy[i]! / sr.end); });
    for (const x of gains) {
      life.allMoves++; life.allGain += x.gain;
      const r = retiredAt.get(x.object);
      if (r !== undefined && r - x.at <= 30) { life.nearMoves++; life.nearGain += x.gain; }
      if (x.born >= seconds - 90) life.lateBornGain += x.gain;
    }
  }
  // A two-state cycle: an object moved at least 6 times in the last third through no more than 2 distinct states.
  for (const l of lastThird.values()) {
    tug.lateMoves += l.moves; tug.lateObjects++; tug.lateStates += l.states.size;
    if (l.moves >= 6 && l.states.size <= 2) { tug.twoStateObjects++; tug.lateOnTwoState += l.moves; }
  }
  console.error(`game ${g + 1}: ${seats.map(s => `${s.rule.family}/${s.rule.tieBreaker}`).join(", ")}; ${redraws.length} redraws`);
}
await boxes.close();

console.log(`${variant.id} pool, ${o.kind} starters, climber ${climber}, ${o.games} games of ${seconds} s, ${drift > 0 ? `drift every ${drift} s` : "no drift"}, power ${E.powerPerSecond}, ${E.opportunitiesPerSecond}/s`);
console.log("| family | games | mean points gained | moves a minute | energy at end | spent / income | own bits at end | others' bits at end | moves | share raising points | flips | energy taken back | objects moving in the last third | main-part levels per object climbed: median / max | end bits on those objects (mean, max) | seats still climbing the main part in the last third | seats whose last main-part step came in the first 120 s | valleys crossed (rung to higher rung) | main-part steps that lowered the tie-breaker | recovered, median s | redraws answered, median s | end bits under current / other params | main-part progress taken by others: episodes (climbed back) |");
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
console.log(`survival: a seat's bits on a line that survive the next move by another seat ${survival.held ? ((100 * survival.kept) / survival.held).toFixed(0) : "-"}%`);
console.log(`acts failed: ${failed.n} of ${failed.acts} (step limit ${failed.steps}, host-call cap ${failed.calls})`);
console.log(`dips (moves that lowered the mover's own bits): ${dips.n}; next move on that line by the same seat ${dips.followed} (above where it dipped from: ${dips.recovered}), by another seat ${dips.interrupted} (back to the state before the dip: ${dips.undone}), none before the end ${dips.open}`);
console.log(`late rungs: on lines younger than 60 s ${lateUp.young}, on older lines ${lateUp.old}`);
if (o.cap) {
  const q = (xs: number[], f: number) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(f * (v.length - 1))]! : 0; };
  console.log(`lines: lived ${q(life.retired, 0.5).toFixed(0)} s median (${q(life.retired, 0.1).toFixed(0)}–${q(life.retired, 0.9).toFixed(0)}), ${life.censored} still live at the end; rungs stepped per line over its life: median ${q(life.rungs, 0.5)}, mean ${(life.rungs.reduce((a, b) => a + b, 0) / Math.max(1, life.rungs.length)).toFixed(1)}, 90th ${q(life.rungs, 0.9)}; banked share of a seat's final total: median ${(100 * q(life.banked, 0.5)).toFixed(0)}%; moves in a line's last 30 s before retiring ${(100 * life.nearMoves / Math.max(1, life.allMoves)).toFixed(0)}% of moves, ${(100 * life.nearGain / Math.max(1, life.allGain)).toFixed(0)}% of own bits gained; gained on lines born in the last 90 s ${(100 * life.lateBornGain / Math.max(1, life.allGain)).toFixed(0)}%`);
}
for (const [f, s] of rows) console.log(`per seat: ${f} gain ${mean(s.gained).toFixed(0)}, energy at end ${mean(s.energyEnd).toFixed(0)}, skipped late ${s.actsLate ? ((100 * s.skipsLate) / s.actsLate).toFixed(0) : 0}%, rungs stepped by third ${s.upThirds.map(x => (x / s.games).toFixed(1)).join(" / ")} a game`);
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
console.log(`\npeak bits by family (game): ${[...peakBy.entries()].sort((x, y) => y[1].bits - x[1].bits).map(([k, p]) => `${k} ${fmt(p.bits)} (${p.game + 1})`).join("; ")}`);
const ps = peaks.map(p => p.seat), pt = peaks.map(p => p.table), pr = peaks.map(p => p.stretchRun);
console.log(`\npeaks per game: a seat's bits median ${fmt(median(ps))}, max ${fmt(Math.max(...ps))}; an object's table total median ${fmt(median(pt))}, max ${fmt(Math.max(...pt))}; longest run of one seat's stretches on one object median ${median(pr)}, max ${Math.max(...pr)}`);
{ const rows = [...byFamMove].filter(([, v]) => v.moves >= 10).sort((a, b) => b[1].gain - a[1].gain).slice(0, 25);
  console.log(`\n| family | move | moves | mover's bits gained, mean | total | repeated on the same object by the same seat |\n|---|---|--:|--:|--:|--:|\n${rows.map(([k, v]) => `| ${k.split("|")[0]} | ${k.split("|")[1]} | ${v.moves} | ${(v.gain / v.moves).toFixed(2)} | ${v.gain.toFixed(0)} | ${(100 * v.repeats / v.moves).toFixed(0)}% |`).join("\n")}`); }
{ const top = [...peaks].sort((a, b) => b.stretchRun - a.stretchRun).slice(0, 3); console.log(`longest stretch runs: ${top.map(p => `${p.stretchRun} by ${p.runBy} (game ${p.game}, table total ${fmt(p.table)})`).join("; ")}`); }
{ const p = (x: number, n: number) => `${n ? ((100 * x) / n).toFixed(0) : 0}%`;
  console.log(`\nlast third: ${tug.lateMoves} changing moves on ${tug.lateObjects} objects (${(tug.lateStates / Math.max(1, tug.lateObjects)).toFixed(1)} distinct states per object, ${(tug.lateMoves / Math.max(1, tug.lateObjects)).toFixed(1)} moves); two-state cycles (≥ 6 moves, ≤ 2 states): ${tug.twoStateObjects} objects, ${p(tug.lateOnTwoState, tug.lateMoves)} of the last third's moves; main-part levels stepped in all: ${tug.levels}`);
  console.log(`\ntug: ${tug.moves} moves, ${p(tug.mirrors, tug.moves)} reflections; flips ${tug.flips}, of them reflections ${p(tug.mirrorFlips, tug.flips)}; movers' bits gained ${tug.gain.toFixed(0)}, by reflections ${p(tug.mirrorGain, tug.gain)}; reflections repairing another seat's move that lowered the mover: after its reflection ${tug.repairsAfterMirror}, after another move (a sign repair) ${tug.repairsAfterOther}, gaining ${tug.repairGain.toFixed(0)} bits (${p(tug.repairGain, tug.gain)} of all)`); }
console.log(`objects changed per minute, by third: ${objectsPerMinute.map(x => (x.reduce((a, b) => a + b, 0) / x.length).toFixed(2)).join(" / ")}`);
if (o.json) (await import("node:fs")).writeFileSync(o.json, JSON.stringify({ ...Object.fromEntries(stats), _objectsPerMinute: objectsPerMinute, _quiet: quietShare, _tug: tug }));
