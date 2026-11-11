/**
 * Tiered difficulty profile for layered rules (docs/layered-rules-design.md §5): each family's base alone, then the base
 * with each interaction, measured with the rule-difficulty framework (docs/rule-difficulty.md), plus what only a layered
 * rule has: how much of the added top a base-only agent reaches by accident, what a tier-aware agent gains, the upper
 * tail of the calibration, synergy with the beginner eight, and three-player games where the layered player plays the
 * base only or the whole rule.
 *
 *   pnpm --filter @workspace/game-utilities layered [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/layered-profile.ts [options])
 *
 *   --rules FILE          the layered rules module (default scripts/rule-difficulty-layered.mjs)
 *   --families a,b        only these families
 *   --budget default|quick
 *   --no-pairs            skip synergy with the beginner eight and between params
 *   --compositions-only   only the extra compositions (gate, unlock, sum) and their bases
 *   --no-games            skip the three-player games
 *   --games N             games per variant and policy (default 40)
 *   --json FILE / --markdown FILE
 *
 * Board: Grid(4,base10,rgb), numbers-only moves (colour is ignored by every rule here). Rules are compiled from their
 * card source with a fast stand-in for the prelude (grid.size, grid.rows, cell.value: all these cards use) and
 * calibrated on the spot with the framework's small budget. About 6–10 s per rule, 2 s per pair.
 */
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { instantiate, seededRng, SYMBOL_COMPONENTS, gridArgs, type GridValue, type Instantiation, type Rng } from "@workspace/game-types";
import {
  DEFAULT_BUDGET, QUICK_BUDGET, anneal, apply, beam, cardBits, familyRule, greedy, measurePair, measureRule, space, starts,
  type Budget, type Context, type PairReport, type Rule, type RuleReport, type Space,
} from "./rule-difficulty-lib.ts";
import { calibrateScore } from "./estimator.ts";
import { compareOrdinals, surprisal, type CalibrationTable, type Ordinal } from "../src/index.ts";
import type { CalibrationBudget } from "../src/calibration.ts";

// ------------------------------------------------------------------------------------------------
// compiling and calibrating a card source
// ------------------------------------------------------------------------------------------------

/** A fast stand-in for the prelude's grid: `size` and `rows` of `{ value, row, col }` (what these cards read). */
export function fastCompile(source: string, inst: Instantiation): (g: GridValue) => Ordinal {
  const values = SYMBOL_COMPONENTS[gridArgs(inst).symbols].values;
  const utility = new Function(`"use strict";\n${source}\n;return utility;`)() as (grid: unknown) => unknown;
  return g => {
    const N = g.size, rows = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) row.push({ row: r, col: c, value: values[g.sym[r * N + c]] });
      rows.push(row);
    }
    const o = utility({ size: N, rows, cells: rows.flat() });
    if (typeof o === "number" && Number.isFinite(o)) return o;
    if (Array.isArray(o) && o.length && o.every(x => typeof x === "number" && Number.isFinite(x))) return o as number[];
    throw new Error(`utility returned ${JSON.stringify(o)}`);
  };
}

const SMALL_BUDGET: CalibrationBudget = {
  nMc: 1 << 13, minMcCount: 64, particles: 200, p0: 0.5, sweeps: 1, targetBits: 64, maxStages: 300, maxStuck: 3,
};

export interface Calibrated { rule: Rule; levels: [Ordinal, number][]; seconds: number }

/** A rule from a card source, calibrated here (the framework's small budget), its top raised by annealing. */
export function calibrated(id: string, source: string, inst: Instantiation, budget: CalibrationBudget = SMALL_BUDGET): Calibrated {
  const score = fastCompile(source, inst);
  const t0 = performance.now();
  const cal = calibrateScore(v => score(v as GridValue), inst, budget, `layered|${id}|${source}|${inst.key}`);
  const table = { levels: cal.levels, slope: cal.slope } as unknown as CalibrationTable;
  const raw = (o: Ordinal) => surprisal(table, o);
  const rule: Rule = {
    id, source, score, calibration: "calibrated", topBits: cal.levels[cal.levels.length - 1][1],
    bits: o => Math.min(rule.topBits, raw(o)),
  };
  return { rule, levels: cal.levels, seconds: (performance.now() - t0) / 1000 };
}

/**
 * Raises a rule's top by annealing on its uncapped bits from random and uniform boards (seeded). Returns the best board.
 * The top of an ad-hoc rule is "the best any search found": a lower bound on the true top.
 */
export function searchTop(c: Calibrated, sp: Space, runs: number, evals: number): { bits: number; board: GridValue; ordinal: Ordinal } {
  const table = { levels: c.levels, slope: 0 } as unknown as CalibrationTable;
  const value = (g: GridValue) => surprisal(table, c.rule.score(g));
  const rng = seededRng(`layered|top|${c.rule.id}`);
  let best = { bits: -Infinity, board: sp.spawn(rng) };
  const consider = (g: GridValue) => { const b = value(g); if (b > best.bits) best = { bits: b, board: g }; };
  const startsList: GridValue[] = [];
  for (let k = 0; k < runs; k++) startsList.push(sp.spawn(rng));
  for (let d = 0; d < sp.S; d++) startsList.push({ size: Math.sqrt(sp.cells), sym: new Uint8Array(sp.cells).fill(d), col: new Uint8Array(sp.cells) });
  for (const s of startsList.slice(0, runs)) {
    // Anneal, keeping the best board seen (anneal itself returns only the value).
    let g = s, v = value(g);
    for (let t = 0; t < evals; t++) {
      const T = 2 * 0.005 ** (t / evals), i = rng.int(sp.cells), h = apply(g, { cell: i, layer: 0, value: rng.int(sp.S) }), hv = value(h);
      if (hv >= v || rng.int(1 << 30) / (1 << 30) < Math.exp((hv - v) / T)) { g = h; v = hv; consider(g); }
    }
  }
  for (const s of startsList.slice(runs)) consider(s);
  c.rule.topBits = Math.max(c.rule.topBits, best.bits);
  return { ...best, ordinal: c.rule.score(best.board) };
}

// ------------------------------------------------------------------------------------------------
// the tiered profile
// ------------------------------------------------------------------------------------------------

export interface TierReport {
  id: string;
  family: string;
  base: string;
  interaction?: string;
  report: RuleReport;
  /** Calibration seconds at the small budget, and the table's levels (its upper tail: the last few). */
  calSeconds: number;
  levels: number;
  tail: [Ordinal, number][];
  best: { bits: number; board: string; ordinal: Ordinal };
  /** Base-only one-cell greedy to its end, scored on this rule: bits, and the share of the added top it reaches by accident. */
  baseAgent: number;
  accidental: number;
  /** One-cell greedy on this rule (tier-aware) to its end, and a tier-aware beam (width 6, 16 moves) */
  tierAgent: number;
  addedTop: number;
  /** Mean bits on uniform random boards (the prior mean: a tier that breaks ties at the bottom raises it). */
  priorMean: number;
  /** The share of the tier's headroom (same base, tier 0 → full top) the tier-aware greedy end holds. */
  tierShare: number;
  /** The tier's range on the best-base boards the climbs found (see tierColumns). */
  live?: Liveness;
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const boardText = (g: GridValue) => Array.from({ length: g.size }, (_, r) => Array.from(g.sym.slice(r * g.size, (r + 1) * g.size)).join("")).join("/");

/** The extra columns for a layered variant given its base rule (both already measured, sharing the starts). */
export interface Liveness { boards: number; tierMin: number; tierMax: number; uniformAtTierMax: boolean }
export function tierColumns(full: Rule, base: Rule, sp: Space, b: Budget, lex = true): { baseAgent: number; tierAgent: number; accidental: number; addedTop: number; tierShare: number; live?: Liveness } {
  const S = starts(sp, b.starts);
  const baseEnds = S.map(g => greedy(base, sp, g, b.longSteps).boards.at(-1)!);
  const fullEnds = S.map(g => greedy(full, sp, g, b.longSteps).boards.at(-1)!);
  const top = full.topBits;
  // The share of the tier's headroom an end board holds: from the same base with tier 0 (lexicographic: [...base, tier])
  // to the full top.
  const headroom = (g: GridValue) => {
    const o = full.score(g) as number[], at = full.bits(o), floor = full.bits([...o.slice(0, -1), 0]);
    return top - floor > 1e-6 ? Math.max(0, (at - floor) / (top - floor)) : 1;
  };
  const live = lex ? liveness(full, sp, [...baseEnds, ...fullEnds]) : undefined;
  return {
    live,
    baseAgent: mean(baseEnds.map(g => full.bits(full.score(g)))), tierAgent: mean(fullEnds.map(g => full.bits(full.score(g)))),
    addedTop: top - base.topBits,
    accidental: lex ? mean(baseEnds.map(headroom)) : NaN, tierShare: lex ? mean(fullEnds.map(headroom)) : NaN,
  };
}

/**
 * Liveness of a lexicographic tier ([...base, tier]): on the best-base boards among `found` (plus the uniform boards),
 * the tier's range. A tier that is constant there adds nothing (dead at the top); one a uniform board maxes there keeps
 * the degenerate maximum. A lower bound on the truth: only the boards the climbs found.
 */
export function liveness(full: Rule, sp: Space, found: readonly GridValue[]): Liveness {
  const uniform = Array.from({ length: sp.S }, (_, d) => ({ size: Math.sqrt(sp.cells), sym: new Uint8Array(sp.cells).fill(d), col: new Uint8Array(sp.cells) }));
  const pool = [...found, ...uniform].map(g => ({ g, o: full.score(g) as number[] }));
  const headOf = (o: number[]) => o.slice(0, -1), tierOf = (o: number[]) => o[o.length - 1];
  const bestHead = pool.reduce((m, x) => (compareOrdinals(headOf(x.o), m) > 0 ? headOf(x.o) : m), headOf(pool[0].o));
  const atTop = pool.filter(x => compareOrdinals(headOf(x.o), bestHead) === 0);
  const tierMax = Math.max(...atTop.map(x => tierOf(x.o))), tierMin = Math.min(...atTop.map(x => tierOf(x.o)));
  const uniformAtTierMax = atTop.some(x => tierOf(x.o) === tierMax && pool.indexOf(x) >= found.length);
  return { boards: atTop.length, tierMin, tierMax, uniformAtTierMax };
}

// ------------------------------------------------------------------------------------------------
// three-player games (the family-balance model, with these rules)
// ------------------------------------------------------------------------------------------------

export interface GameReport { id: string; games: number; winBase: number; winTier: number; ownBase: number; ownTier: number; payRatio: number }

/**
 * Seat 0 is dealt the layered rule; seats 1 and 2 a random pair of the beginner eight, all playing the family-balance
 * greedy policy (each turn: 16 candidate one-cell resamples on random objects of 10, keep the best for own payoff).
 * Seat 0 plays it twice on the same seeds: believing its bits are the base's (a base-only player) and the whole rule's.
 * Payoffs always use true bits.
 */
export function games(full: Rule, base: Rule, opponents: readonly Rule[], sp: Space, n: number, rounds = 40): GameReport {
  const K = 10, C = 16;
  const pay = (bits: number[][]) => bits[0].map((_, i) => bits.reduce((s, b) => {
    const peers = b.reduce((a, x, j) => a + (j === i ? 0 : x), 0);
    return s + (peers > 0 ? b[i] * peers : 0);
  }, 0));
  const play = (seed: string, belief: Rule, opp: Rule[]) => {
    const rng: Rng = seededRng(seed), truth = [full, ...opp], beliefs = [belief, ...opp];
    const objs = Array.from({ length: K }, () => sp.spawn(rng));
    const bits = objs.map(o => truth.map(r => r.bits(r.score(o))));
    const seen = objs.map(o => beliefs.map(r => r.bits(r.score(o))));
    for (let t = 0; t < rounds; t++) for (let p = 0; p < 3; p++) {
      let best: { k: number; g: GridValue } | null = null, bestV = -Infinity;
      for (let c = 0; c < C; c++) {
        const k = rng.int(K), g = apply(objs[k], { cell: rng.int(sp.cells), layer: 0, value: rng.int(sp.S) });
        const trial = seen.slice(); trial[k] = beliefs.map(r => r.bits(r.score(g)));
        const v = pay(trial)[p];
        if (v > bestV) { bestV = v; best = { k, g }; }
      }
      objs[best!.k] = best!.g; bits[best!.k] = truth.map(r => r.bits(r.score(best!.g))); seen[best!.k] = beliefs.map(r => r.bits(r.score(best!.g)));
    }
    const p = pay(bits);
    return { win: p[0] > Math.max(p[1], p[2]) ? 1 : 0, own: mean(bits.map(b => b[0])), pay: p[0] };
  };
  const rng = seededRng(`layered|deal|${full.id}`);
  const rows: { b: ReturnType<typeof play>; t: ReturnType<typeof play> }[] = [];
  for (let i = 0; i < n; i++) {
    const a = opponents[rng.int(opponents.length)], c = opponents[rng.int(opponents.length)];
    const seed = `layered|game|${full.id}|${i}`;
    rows.push({ b: play(seed, base, [a, c]), t: play(seed, full, [a, c]) });
  }
  return {
    id: full.id, games: n, winBase: mean(rows.map(r => r.b.win)), winTier: mean(rows.map(r => r.t.win)),
    ownBase: mean(rows.map(r => r.b.own)), ownTier: mean(rows.map(r => r.t.own)),
    payRatio: mean(rows.map(r => r.t.pay)) / Math.max(1e-9, mean(rows.map(r => r.b.pay))),
  };
}

// ------------------------------------------------------------------------------------------------
// command line
// ------------------------------------------------------------------------------------------------

interface Variant { id: string; family: string; base: string; interaction?: string; source: string }

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(`--${name}`);
  const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
  const here = dirname(fileURLToPath(import.meta.url));
  const mod = await import(pathToFileURL(resolve(opt("rules") ?? `${here}/rule-difficulty-layered.mjs`)).href) as {
    variants(): Variant[]; compositionVariants?(): Variant[]; BEGINNER: { id: string; utility: string }[];
  };
  const only = opt("families")?.split(",");
  const comps = mod.compositionVariants?.() ?? [];
  const list = (flag("compositions-only")
    ? [...mod.variants().filter(v => !v.interaction && comps.some(c => c.family === v.family && c.base === v.base)), ...comps]
    : [...mod.variants(), ...comps]).filter(v => !only || only.includes(v.family));
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
  const sp = space(inst, "symbol"), budget = opt("budget") === "quick" ? QUICK_BUDGET : DEFAULT_BUDGET, ctx: Context = { sp, budget };
  const log = (s: string) => process.stderr.write(s + "\n");

  const rules = new Map<string, Calibrated>(), tiers: TierReport[] = [];
  for (const v of list) {
    const c = calibrated(v.id, v.source, inst);
    const best = searchTop(c, sp, 3, budget === QUICK_BUDGET ? 6000 : 15000);
    rules.set(v.id, c);
    const report = measureRule(c.rule, ctx);
    const baseId = `${v.family}.${v.base}`, base = rules.get(baseId)!;
    const extra = v.interaction ? tierColumns(c.rule, base.rule, sp, budget, !v.id.includes("@") || v.id.includes("@gate")) : { baseAgent: NaN, tierAgent: NaN, accidental: NaN, addedTop: 0, tierShare: NaN };
    const priorMean = mean(starts(sp, 400, "prior").map(g => c.rule.bits(c.rule.score(g))));
    tiers.push({ id: v.id, priorMean, family: v.family, base: v.base, interaction: v.interaction, report, calSeconds: c.seconds, levels: c.levels.length,
      tail: c.levels.slice(-5), best: { bits: best.bits, board: boardText(best.board), ordinal: best.ordinal }, ...extra });
    log(`${v.id}: top ${report.topBits.toFixed(1)} DIFF ${report.difficulty.toFixed(1)} K ${report.entangle.toFixed(1)} rate4 ${report.rate4.toFixed(2)} cal ${c.seconds.toFixed(1)}s`);
  }

  const beginner = [familyRule("mirrormancer", { axis: "LR" }, inst), ...mod.BEGINNER.map(b => calibrated(b.id, b.utility, inst).rule)];
  for (const b of beginner) measureRule(b, ctx);
  const pairs: PairReport[] = [];
  if (!flag("no-pairs")) {
    // Synergy of each family's first base and its interactions' first params with the beginner eight, and of two players
    // dealt the same interaction with different params.
    const firstBase = (fam: string) => tiers.find(t => t.family === fam)!.base;
    const firsts = tiers.filter(t => t.base === firstBase(t.family) && !t.id.includes("@"));
    const seenInt = new Set<string>();
    for (const t of firsts) {
      const key = `${t.family}|${t.interaction ?? ""}`;
      if (seenInt.has(key)) continue;
      seenInt.add(key);
      for (const b of beginner) pairs.push(measurePair(rules.get(t.id)!.rule, b, ctx));
      log(`pairs ${t.id}`);
    }
    for (const key of seenInt) {
      const [fam, intr] = key.split("|");
      const same = firsts.filter(t => t.family === fam && t.interaction === intr);
      if (intr && same.length > 1) pairs.push(measurePair(rules.get(same[0].id)!.rule, rules.get(same[1].id)!.rule, ctx));
    }
  }
  const gameReports: GameReport[] = [];
  if (!flag("no-games")) for (const t of tiers) if (t.interaction && !t.id.includes("@")) {
    gameReports.push(games(rules.get(t.id)!.rule, rules.get(`${t.family}.${t.base}`)!.rule, beginner, sp, Number(opt("games") ?? 40)));
  }

  const md = markdown(tiers, pairs, gameReports, beginner.map(b => b.id));
  console.log(md);
  if (opt("markdown")) writeFileSync(opt("markdown")!, md);
  if (opt("json")) writeFileSync(opt("json")!, JSON.stringify({ tiers, pairs, games: gameReports }, (_, v) => (v === Infinity ? "inf" : v), 2) + "\n");
}

function markdown(tiers: TierReport[], pairs: PairReport[], gameReports: GameReport[], beginner: string[]): string {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "–");
  const out = [
    "| variant | card | top | +top | rate4 | g10 | g20 | trap | gap | K | **DIFF** | plat | unif | base agent | accidental | tier agent | tier share | prior mean | tier at best base (n) | best board (ordinal) |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|",
    ...tiers.map(t => {
      const r = t.report;
      return `| ${t.id} | ${f(r.cardBits, 0)} | ${f(r.topBits)} | ${t.interaction ? f(t.addedTop) : ""} | ${f(r.rate4, 2)} | ${f(r.greedy10)} | ${f(r.greedy20)} | ${f(r.trap, 2)} | ${f(r.gap, 2)} | ${f(r.entangle)} | **${f(r.difficulty)}** | ${f(r.plateau, 2)} | ${r.uniformTop.join("") || "–"} | ${f(t.baseAgent)} | ${f(t.accidental, 2)} | ${f(t.tierAgent)} | ${f(t.tierShare, 2)} | ${f(t.priorMean, 2)} | ${t.live ? `${t.live.tierMin}–${t.live.tierMax}${t.live.uniformAtTierMax ? " U" : ""} (${t.live.boards})` : ""} | ${t.best.board} ${JSON.stringify(t.best.ordinal)} |`;
    }),
    "",
    "Upper tail of each calibration (the last levels: ordinal → bits) and calibration seconds at the small budget:",
    "",
    ...tiers.map(t => `- ${t.id}: ${t.tail.map(([o, b]) => `${JSON.stringify(o)}→${b.toFixed(1)}`).join(", ")} (${t.levels} levels, ${t.calSeconds.toFixed(1)} s)`),
  ];
  if (pairs.length) {
    out.push("", `Synergy SYN (ceiling) with the beginner eight: ${beginner.join(", ")}`, "",
      `| variant | ${beginner.map(b => b.slice(0, 10)).join(" | ")} | mean SYN |`, `|---|${beginner.map(() => "--:").join("|")}|--:|`);
    const ids = [...new Set(pairs.filter(p => beginner.includes(p.b)).map(p => p.a))];
    for (const a of ids) {
      const row = beginner.map(b => pairs.find(p => p.a === a && p.b === b)!);
      out.push(`| ${a} | ${row.map(p => `${f(p.difficulty, 0)} (${f(p.ceiling, 2)})`).join(" | ")} | ${f(mean(row.map(p => p.difficulty)))} |`);
    }
    const self = pairs.filter(p => !beginner.includes(p.b));
    if (self.length) out.push("", "Same family, different params (two players dealt the same interaction with different targets):", "",
      ...self.map(p => `- ${p.a} × ${p.b}: SYN ${f(p.difficulty, 0)}, ceiling ${f(p.ceiling, 2)}, conflict ${f(p.conflict, 2)}`));
  }
  if (gameReports.length) out.push("", "Three-player games (seat 0 dealt the variant, two beginner-eight opponents; same seeds): win share and own mean bits per object when seat 0 plays the base only vs the whole rule; payoff ratio whole/base.", "",
    "| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |", "|---|--:|--:|--:|--:|--:|--:|",
    ...gameReports.map(g => `| ${g.id} | ${g.games} | ${f(g.winBase, 2)} | ${f(g.winTier, 2)} | ${f(g.ownBase)} | ${f(g.ownTier)} | ${f(g.payRatio, 2)} |`));
  return out.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
