/**
 * The power check (docs/engine-v2/power-calibration.md): how high objects' bits climb under an economy, for owner
 * decisions 38 and 40. Analysis only: it changes no preset and no economy constant; each option is passed to the table
 * (src/table.ts runTable) as its `economy`, and a summon-price scale through the table's experiment knob `summonScale`.
 *
 *   pnpm --filter @workspace/v2-agents power-check [-- --options 8:600:240,2:150:240s] [--games 4] [--seconds 600]
 *     [--objects 3] [--births 0.0041667] [--beta 0.05] [--climber plain,shortcut] [--alone yes|no] [--jobs 4] [--json]
 *
 * An option is power:startingEnergy:store (⚡/s, ⚡, seconds), with a trailing "s" when summon prices scale with power
 * (price × power / 8: the same seconds of full power as at 8 ⚡/s). Per option and game (seed `power-g<k>`), three rules
 * from three different families of the beginner line pool (lines-beginner on line-q) play a 3-seat table of the plain
 * starters (or the shortcut climber, scripts/climbers.ts) at 3 opportunities a second, unique objects, β 0.05. With
 * --alone yes, one of the three rules (rule k mod 3) also plays alone (no opposition) with a climber that takes the
 * step best for its own rarity, the measure of an unopposed climb.
 *
 * Reported per option (mean over games, or max where it says so):
 *   - top: the highest bits any rule held on any object at any moment (peak) and at the end, 3 seats and alone;
 *   - joint ≥20 / ≥30: the share of objects at the end where at least two seats each hold ≥ 20 (≥ 30) bits, and the
 *     share of games in which any object did so at any moment;
 *   - median end bits per (object, rule) at the 3-seat table;
 *   - acts and moves (committed changes) per seat per minute ("watchable");
 *   - bits per ⚡: a seat's own bits gained over the energy its committed moves cost (the price of a bit in play);
 *   - summons: whether the dearest and the cheapest simple starter fit in min(startingEnergy, power × store), and how
 *     many seconds the own store then takes to pay for a second dearest starter (∞: the store never holds it).
 *
 * World time is not dilated (v2-economy has no `dilate` helper yet): each game simulates its full --seconds.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { rng } from "@workspace/v2-core";
import { changeCharge, firstAgentShare, KAPPA, defaultShare, type Economy } from "@workspace/v2-economy";
import { beginnerPool } from "@workspace/v2-linear";
import { births, EngineHost, sandboxes, startersFor, summonBits } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { lineStarter, SHORTCUT } from "./climbers.ts";
import { median, poolOf, ruleName, spaceOf, type Rule } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  options: { type: "string", default: "8:600:240,4:300:240s,2:150:240s,1:75:240s,2:600:300,1:600:600" },
  games: { type: "string", default: "4" },
  seconds: { type: "string", default: "600" },
  objects: { type: "string", default: "3" },
  births: { type: "string", default: String(1 / 240) },
  beta: { type: "string", default: "0.05" },
  climber: { type: "string", default: "plain,shortcut" },
  alone: { type: "string", default: "yes" },
  jobs: { type: "string", default: String(Math.min(4, availableParallelism())) },
  hills: { type: "string", default: "yes" },
  "hill-steps": { type: "string", default: "1500" },
  "birth-sample": { type: "string", default: "300" },
  task: { type: "string" },
  json: { type: "boolean", default: false },
} });

interface Option { readonly label: string; readonly power: number; readonly start: number; readonly store: number; readonly scaled: boolean }
const OPTIONS: Option[] = o.options.split(",").map(x => {
  const scaled = x.endsWith("s"), [p, s, t] = x.replace(/s$/, "").split(":").map(Number);
  if (![p, s, t].every(v => Number.isFinite(v) && v! >= 0)) throw new Error(`--options: ${x} is not power:start:store[s]`);
  return { label: x, power: p!, start: s!, store: t!, scaled };
});
const GAMES = Number(o.games), SECONDS = Number(o.seconds), OBJECTS = Number(o.objects), BIRTHS = Number(o.births), BETA = Number(o.beta);
const THRESHOLDS = [20, 30] as const;
const log = (s: string) => console.error(s);
function f1(x: number) { return Number.isFinite(x) ? x.toFixed(1) : "∞"; }
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const space = spaceOf("line-q");
const POOL = poolOf("line-q");
const economyOf = (x: Option): Economy => ({ powerPerSecond: x.power, fullChargeSeconds: x.store, startingEnergy: x.start, opportunitiesPerSecond: 3 });
const scaleOf = (x: Option) => (x.scaled ? x.power / 8 : 1);

/** Three rules from three different families, dealt by a seeded draw (as scripts/collapse-check.ts deals). */
function deal(seed: string): Rule[] {
  const r = rng("power-check", seed), fams = [...new Set(POOL.rules.map(x => x.family))], pick: Rule[] = [];
  for (let k = 0; k < 3; k++) { const fam = fams.splice(r.below(fams.length), 1)[0]!; const of = POOL.rules.filter(x => x.family === fam); pick.push(of[r.below(of.length)]!); }
  return pick;
}

/**
 * The unopposed climber: the plain starter's steps plus the shortcut climber's representation moves (stretch, pivot,
 * mirror: scripts/climbers.ts SHORTCUT), taking the step best for its own rarity (alone there are no others to multiply by).
 */
const OWN = `  const now = score(m, c, p, tie), all = options.slice();
  if (m !== null) {
    for (const f of [2, 3, -1, Q.of(1, 2), Q.of(1, 3)]) all.push([move("mach.stretch", { f }), score(Q.mul(m, Q.from(f)), Q.mul(c, Q.from(f)), p, tie)]);
    for (const x0 of [-1, 1, 2]) for (const k of [-2, -1, 1, 2]) all.push([move("cart.pivot", { x0, k }), score(Q.add(m, Q.from(k)), Q.sub(c, Q.mul(Q.from(k), Q.from(x0))), p, tie)]);
    all.push([move("cart.mirror", { axis: "y" }), score(Q.neg(m), c, p, tie)], [move("cart.mirror", { axis: "x" }), score(Q.neg(m), Q.neg(c), p, tie)], [move("cart.mirror", { axis: "origin" }), score(m, Q.neg(c), p, tie)]);
  }
  all.sort((x, y) => (better(x[1], y[1]) ? -1 : better(y[1], x[1]) ? 1 : 0));
  let best = null, value = rarity(offer, now) + 1e-9;
  for (const [plan, s] of all.slice(0, QUOTES)) { const r = rarity(offer, s); if (r > value && price(offer, plan) !== null) { value = r; best = plan; } }
  return best === null ? null : (Array.isArray(best) ? best : [best]);`;

type Mode = "plain" | "shortcut" | "alone";
const MODES = (["plain", "shortcut", "alone"] as const).filter(m => (m === "alone" ? o.alone === "yes" : o.climber.split(",").includes(m)));
const program = (rule: Rule, mode: Mode) => (mode === "alone" ? lineStarter(rule.family, OWN) : mode === "shortcut" ? lineStarter(rule.family, SHORTCUT) : lineStarter(rule.family));

interface Game {
  option: string; game: number; mode: Mode; rules: string[];
  /** Per rule: the highest bits on any object, at any moment and at the end. */
  peak: number[]; end: number[];
  /** Objects at the end; of them, how many have ≥ 2 seats at ≥ 20 and ≥ 30 bits; whether any object ever did. */
  objects: number; jointEnd: number[]; jointEver: boolean[];
  /** The largest second-highest bits on one object, at any moment. */
  jointPeak: number;
  /** Every (object, rule) bits at the end. */
  endBits: number[];
  acts: number[]; moves: number[]; spentActs: number[]; ownGain: number[];
}

async function runGame(x: Option, g: number, mode: Mode): Promise<Game> {
  const alone = mode === "alone", all = deal(`power-g${g}`), rules = alone ? [all[g % 3]!] : all;
  const bits = rules.map(r => space.bits(r));
  const read = (s: unknown) => bits.map(b => b(s));
  const peakOf = new Map<number, number[]>(), sorted2 = (n: number[]) => (n.length < 2 ? 0 : n.slice().sort((a, b) => b - a)[1]!);
  const jointEver = THRESHOLDS.map(() => false), ownGain = rules.map(() => 0);
  let jointPeak = 0;
  const boxes = sandboxes();
  const report = await runTable(boxes, {
    type: space.type, variant: space.variant, lines: OBJECTS, birthsPerSecond: BIRTHS, seed: `power-g${g}`, seconds: SECONDS, unique: true,
    seats: rules.map((rule, k) => ({ name: `P${k}`, kind: "starter" as const, rule, program: program(rule, mode) })),
    actEconomy: { kappa: KAPPA, beta: BETA }, economy: economyOf(x), summonScale: scaleOf(x),
    // The shortcut and alone climbers' extra lines are not what is measured: their summons are capped at the planning
    // store (as scripts/collapse-check.ts caps them at the starting energy). The plain starters pay their full price.
    ...(mode !== "plain" ? { summonCap: Math.min(x.start, x.power * x.store) } : {}),
    onAct: e => {
      if (!e.committed) return;
      const n = read(e.state), before = read(e.before);
      ownGain[e.seat]! += n[e.seat]! - before[e.seat]!;
      const p = peakOf.get(e.object) ?? n.map(() => 0);
      peakOf.set(e.object, p.map((v, i) => Math.max(v, n[i]!)));
      const second = sorted2(n);
      jointPeak = Math.max(jointPeak, second);
      THRESHOLDS.forEach((t, i) => { if (second >= t) jointEver[i] = true; });
    },
  });
  await boxes.close();
  const finals = report.final.map(read);
  const peak = rules.map((_, i) => Math.max(...finals.map(n => n[i]!), ...[...peakOf.values()].map(n => n[i]!)));
  return {
    option: x.label, game: g, mode, rules: rules.map(ruleName), peak, end: rules.map((_, i) => Math.max(...finals.map(n => n[i]!))),
    objects: finals.length, jointEnd: THRESHOLDS.map(t => finals.filter(n => n.filter(v => v >= t).length >= 2).length), jointEver, jointPeak,
    endBits: finals.flat(), acts: report.seats.map(s => s.acts), moves: report.seats.map(s => s.moves), spentActs: report.seats.map(s => s.spent.acts), ownGain,
  };
}

/** Whether the simple starters fit the planning store, and how long a second dearest one takes to save for. */
function summons(x: Option) {
  const prices = beginnerPool.map(f => summonBits("typescript", startersFor(f.id, "typescript").find(a => a.kind === "simple")!.source).energy * scaleOf(x));
  const lo = Math.min(...prices), hi = Math.max(...prices), P = x.power, T = x.store, store = Math.min(x.start, P * T);
  const share = firstAgentShare({ allocated: 0, powerPerSecond: P, fullChargeSeconds: T, need: hi }) ?? defaultShare(0);
  const ownIncome = (1 - share) * P, ownCap = ownIncome * T, left = store - hi;
  const second = ownCap < hi ? Infinity : ownIncome > 0 ? Math.max(0, hi - Math.max(0, Math.min(left, ownCap))) / ownIncome : Infinity;
  return { lo, hi, store, fitsAll: store >= hi, fitsSome: prices.filter(p => p <= store).length, second, share };
}

// ---------------------------------------------------------------- one task (a child process)

if (o.task) {
  const [k, g, mode] = o.task.split(":");
  const r = await runGame(OPTIONS[Number(k)]!, Number(g), mode as Mode);
  console.log(JSON.stringify(r));
  process.exit(0);
}

// ---------------------------------------------------------------- what a bit costs along a hill, and what births hold

const BUDGETS = [100, 300, 675, 1560, 2940, 5400];
const DIRECTIONS = [["si.shift", "1"], ["si.shift", "-1"], ["si.tilt", "1"], ["si.tilt", "-1"]] as const;
/**
 * The straight walk: from a birth, unit steps one way (shift or tilt by ±1, each its own act, charged W + β·W² with
 * W = fee + surcharge: no reads, no search), recording the best bits reached within each energy budget. A lower bound
 * on what a determined unopposed climber buys with that energy (it crosses valleys by walking through them).
 */
function hills() {
  const starts = births(space.type, space.variant, "power-hills", 3), steps = Number(o["hill-steps"]);
  const out: { rule: string; start: number; reach: number[]; perBit: number }[] = [];
  for (const rule of POOL.rules) {
    const b = space.bits(rule), reach = BUDGETS.map(() => 0);
    let start = 0, perBit = Infinity;
    for (const s0 of starts) {
      const b0 = b(s0), best = BUDGETS.map(() => b0);
      start += b0 / starts.length;
      for (const [mutator, k] of DIRECTIONS) {
        let s = s0, spent = 0;
        for (let i = 0; i < steps && spent <= BUDGETS.at(-1)!; i++) {
          const p = new EngineHost({ type: space.type, variant: space.variant, state: s, rule, energy: 0 }).price([{ mutator, site: 0, args: { k } }]);
          if (!p.valid) break;
          spent += changeCharge([p.total]); s = p.result;
          const v = b(s);
          BUDGETS.forEach((B, j) => { if (spent <= B && v > best[j]!) best[j] = v; });
          if (v - b0 > 0) perBit = Math.min(perBit, spent / (v - b0));
        }
      }
      best.forEach((v, j) => { reach[j]! += v / starts.length; });
    }
    out.push({ rule: ruleName(rule), start, reach, perBit });
  }
  return out;
}

/** Bits a newborn object already holds, per rule: median, 90th percentile and max over a sample of births. */
function birthBits() {
  const sample = births(space.type, space.variant, "power-births", Number(o["birth-sample"]));
  return POOL.rules.map(rule => {
    const xs = sample.map(space.bits(rule)).sort((a, b) => a - b);
    return { rule: ruleName(rule), median: xs[Math.floor(xs.length / 2)]!, p90: xs[Math.floor(xs.length * 0.9)]!, max: xs.at(-1)!, over20: xs.filter(x => x >= 20).length / xs.length };
  });
}

if (o.hills === "yes") {
  const t = performance.now(), h = hills(), bb = birthBits();
  console.log(`hills: the straight walk from 3 births (unit shift or tilt, best of 4 directions, ${o["hill-steps"]} steps at most; ${f1((performance.now() - t) / 1000)} s). Bits within a budget of ⚡ (mean over the starts); ⚡ per bit: the cheapest rise seen. Births: ${o["birth-sample"]} newborn lines.`);
  console.log(`| rule | birth bits median / p90 / max (share ≥ 20) | walk start | ${BUDGETS.map(B => `${B} ⚡`).join(" | ")} | ⚡ per bit (best) |`);
  console.log(`|---|--:|--:|${BUDGETS.map(() => "--:").join("|")}|--:|`);
  for (const r of h) {
    const x = bb.find(y => y.rule === r.rule)!;
    console.log(`| ${r.rule} | ${f1(x.median)} / ${f1(x.p90)} / ${f1(x.max)} (${pct(x.over20)}) | ${f1(r.start)} | ${r.reach.map(f1).join(" | ")} | ${f1(r.perBit)} |`);
  }
}

// ---------------------------------------------------------------- the parent: tasks over a pool of child processes

const tasks: string[] = [];
for (const [k, x] of OPTIONS.entries()) {
  if (!summons(x).fitsAll) log(`option ${x.label}: the dearest starter does not fit the planning store; seats whose starter does not fit cannot play`);
  for (let g = 0; g < GAMES; g++) for (const m of MODES) tasks.push(`${k}:${g}:${m}`);
}
const passOn = ["--options", o.options, "--seconds", o.seconds, "--objects", o.objects, "--births", o.births, "--beta", o.beta, "--climber", o.climber];
const results: Game[] = [];
const t0 = performance.now();
let next = 0;
async function worker() {
  while (next < tasks.length) {
    const task = tasks[next++]!;
    const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, ...passOn, "--task", task], { stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    child.stdout.on("data", d => { text += d; });
    const code: number = await new Promise(res => child.on("close", res));
    if (code !== 0) { log(`task ${task} failed (exit ${code})`); continue; }
    const r = JSON.parse(text.trim().split("\n").at(-1)!) as Game;
    results.push(r);
    log(`${r.option} game ${r.game} ${r.mode} (${r.rules.join(", ")}): peak ${r.peak.map(f1).join("/")}, end ${r.end.map(f1).join("/")}, joint peak ${f1(r.jointPeak)}, acts/seat/min ${r.acts.map(a => f1(a / (SECONDS / 60))).join("/")} (${f1((performance.now() - t0) / 1000)} s)`);
  }
}
await Promise.all(Array.from({ length: Number(o.jobs) }, worker));


const TABLE_MODES = MODES.filter(m => m !== "alone");
const rows = OPTIONS.flatMap(x => (TABLE_MODES.length ? TABLE_MODES : (["plain"] as const)).map(mode => {
  const table = results.filter(r => r.option === x.label && r.mode === mode), alone = results.filter(r => r.option === x.label && r.mode === "alone");
  const minutes = SECONDS / 60, sm = summons(x);
  const objects = table.reduce((t, r) => t + r.objects, 0);
  const spent = table.reduce((t, r) => t + r.spentActs.reduce((a, b) => a + b, 0), 0), gained = table.reduce((t, r) => t + r.ownGain.reduce((a, b) => a + b, 0), 0);
  const spentAlone = alone.reduce((t, r) => t + r.spentActs[0]!, 0), gainedAlone = alone.reduce((t, r) => t + r.ownGain[0]!, 0);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : NaN);
  return {
    option: x.label, mode, power: x.power, start: x.start, store: x.store, scaled: x.scaled, games: table.length,
    income: x.start + x.power * SECONDS,
    peak3: max(table.flatMap(r => r.peak)), peak3Mean: mean(table.map(r => max(r.peak))), end3Mean: mean(table.map(r => max(r.end))),
    peakAlone: max(alone.flatMap(r => r.peak)), peakAloneMean: mean(alone.map(r => r.peak[0]!)), endAloneMean: mean(alone.map(r => r.end[0]!)),
    aloneOver20: mean(alone.map(r => (r.peak[0]! >= 20 ? 1 : 0))),
    jointPeakMax: max(table.map(r => r.jointPeak)), jointPeakMean: mean(table.map(r => r.jointPeak)),
    joint20End: objects ? table.reduce((t, r) => t + r.jointEnd[0]!, 0) / objects : 0, joint30End: objects ? table.reduce((t, r) => t + r.jointEnd[1]!, 0) / objects : 0,
    joint20Ever: mean(table.map(r => (r.jointEver[0] ? 1 : 0))), joint30Ever: mean(table.map(r => (r.jointEver[1] ? 1 : 0))),
    medianEnd: table.length ? median(table.flatMap(r => r.endBits)) : NaN,
    actsPerSeatMin: mean(table.flatMap(r => r.acts.map(a => a / minutes))), movesPerSeatMin: mean(table.flatMap(r => r.moves.map(a => a / minutes))),
    actsAloneMin: mean(alone.map(r => r.acts[0]! / minutes)), movesAloneMin: mean(alone.map(r => r.moves[0]! / minutes)),
    bitsPerEnergy: spent ? gained / spent : NaN, bitsPerEnergyAlone: spentAlone ? gainedAlone / spentAlone : NaN,
    summon: sm,
  };
}));

if (o.json) console.log(JSON.stringify({ rows, games: results }, null, 2));
{
  const out = o.json ? log : (x: string) => console.log(x);
  out(`power check: ${GAMES} games per option, ${SECONDS} s, ${OBJECTS} objects + ${BIRTHS.toFixed(5)} births/s, β ${BETA}, 3 opportunities/s, no time dilation (${f1((performance.now() - t0) / 1000)} s)`);
  out("| option (⚡/s : start : store s) | climber | income ⚡/player | summon (cheap–dear in store; 2nd) | peak bits, max (mean of game max) | end bits (mean of game max) | joint: 2nd-highest on an object, max (mean) | objects ≥2 seats ≥20 at end / games ever | ≥30 end / ever | median end bits (object, rule) | acts / moves per seat-min | bits per ⚡ | alone: peak max (mean), games ≥20 | alone acts / moves per min | alone bits per ⚡ |");
  out("|---|---|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const r of rows) {
    const sm = r.summon;
    out(`| ${r.option} | ${r.mode} | ${r.income} | ${f1(sm.lo)}–${f1(sm.hi)} in ${f1(sm.store)}: ${sm.fitsAll ? "all" : `${sm.fitsSome}/10`}; 2nd ${f1(sm.second)} s | ${f1(r.peak3)} (${f1(r.peak3Mean)}) | ${f1(r.end3Mean)} | ${f1(r.jointPeakMax)} (${f1(r.jointPeakMean)}) | ${pct(r.joint20End)} / ${pct(r.joint20Ever)} | ${pct(r.joint30End)} / ${pct(r.joint30Ever)} | ${f1(r.medianEnd)} | ${f1(r.actsPerSeatMin)} / ${f1(r.movesPerSeatMin)} | ${r.bitsPerEnergy.toFixed(3)} | ${f1(r.peakAlone)} (${f1(r.peakAloneMean)}), ${pct(r.aloneOver20)} | ${f1(r.actsAloneMin)} / ${f1(r.movesAloneMin)} | ${r.bitsPerEnergyAlone.toFixed(3)} |`);
  }
}
