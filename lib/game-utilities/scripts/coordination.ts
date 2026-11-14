/**
 * Coordination incentives (docs/coordination-incentives.md): plays the policy zoo on a seed setup with the real rules,
 * tables and energy, and prints each table's payoffs, win shares, welfare, best responses and equilibria.
 *
 *   pnpm --filter @workspace/game-utilities coordination [mode] [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/coordination.ts [mode] [options])
 *
 * Modes
 *   report (default)  everything the document's tables need, for develop's rules and each candidate rule (slow: minutes)
 *   seat              identical policies at every seat: win share by seat
 *   duel              every policy as the one deviator at a table where the others all play one policy
 *   equilibria        every multiset of policies: equilibria by win share and by points
 *   tables            the named mixed tables
 *   rules             win share, rank and bits by DEALT RULE at tables where every god plays the same policy (--set)
 *   combos            every combination of P rules of the pool dealt as a fixed set: each rule's win share by policy
 *   validate          the model against real engine games (scripts/coordination-engine-games.json) on the same deals
 *
 * Options
 *   --setup annotated|rgb             the seed setup (default annotated: the default beginner setup), or rgb:
 *                                     the 4×4 board in three colours on its tuned defaults, slowed to 25 Hz with a fixed 600 s (no setup ships it)
 *   --games N                         games per table (default 24); deals and seeds are shared by every table
 *   --players P                       gods (default 3)
 *   --pool a,b,c                      deal from exactly these rule families instead of the setup's pool
 *   --equal-tops B                    experiment: scale every rule's bits so that its best board is worth B bits
 *   --equal-par B [--par-games N] [--par-policy greedy]   experiment (mode rules): scale every rule's bits so that
 *                                     reference play holds B bits per object at the end (measured first, on other deals)
 *   --match                           tables/duel/equilibria: a match of P rounds per game, the dealt rules rotated each round
 *   --saturation                      mode rules: also print saturation and the leader's lead over the game's time
 *   --set a,b,c                       the policies in play (default: all but random and sniper for equilibria)
 *   --duration S  --objects K  --spawn HZ  --power B  --rate HZ      override the setup
 *   --kappa K  --capacity S|none  --distance | --flat (default: the setup's cost model)  --unbounded-debt  --erasure L  --aggregate sum|min|geo  --scoring final|integral
 *   --learn S  --agents N  --candidates C  --cap HZ  --free-offers  --hoard T  --snipe S       the model's knobs (coordination-lib Econ, Tuning)
 *   --summon                          charge each policy its summon price: its agents start once the god has saved it
 *   --only a,b  --out DIR             report: only these sections; also write each section's text and JSON to DIR
 *   --jobs J                          worker processes (default: the cores)
 *   --json FILE                       also write every table's statistics as JSON
 */
import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { instantiate, seededRng, type Instantiation } from "@workspace/game-types";
import { SEED_SETUPS, costModelOf, defaultSettingsFor } from "../../game-core/src/settings.ts";
import { availableFamilies, context, family, selector, type Params } from "../src/index.ts";
import { familyRule, space, type Rule } from "./rule-difficulty-lib.ts";
import {
  DEFAULT_TUNING, DEVELOP_ECON, POLICIES, equilibria, playGame, profileKey, profiles, ranksOf, summarise, valueIn, winShares,
  type Aggregate, type Econ, type GameResult, type Metric, type Policy, type TableStats, type Tuning,
} from "./coordination-lib.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d?: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const num = (n: string, d: number) => Number(opt(n, String(d)));

/** One record of coordination-engine-games.json (what the model needs of it). */
interface EngineGame {
  table: string; gameId: string; worldSeconds: number; objectsAtEnd: number;
  settings: { objectType: string; typeArgs: Record<string, unknown>; powerPerSecond: number; interactionRateHz: number; fullChargeSeconds?: number };
  seats: { policy: Policy; utility: { familyId: string; params: Record<string, unknown> }; totalPayoff: number; rank: number; acts: number; transforms: number; skips: number; spent: number; spentRead: number }[];
}
export interface Run { setup: string; games: number; players: number; econ: Econ; tuning: Tuning; /** --pool: deal from exactly these families instead of the setup's pool. */ pool?: string[]; /** --equal-tops B: scale every rule so its best board is worth B bits (0: as shipped). */ equalTops?: number;
  /** Mode combos: every game deals exactly these families, passed one seat along per game (params at random from each family's support). */ deal?: string[];
  /** --match: every table is a match of P rounds with the rules rotated (fix candidate d). */ match?: boolean;
  /** --equal-par B: per family, the factor that scales its bits so reference greedy play holds B bits per object (computed before the run). */ scale?: Record<string, number> }
/** The pool in force (the worker processes set it from their Run before they deal). */
let POOL: readonly string[] | undefined, EQUAL_TOPS = 0, SCALE: Record<string, number> = {}, DEAL: readonly string[] | undefined;
export function setPool(pool: readonly string[] | undefined, equalTops = 0, scale: Record<string, number> = {}, deal?: readonly string[]) { POOL = pool; EQUAL_TOPS = equalTops; SCALE = scale; DEAL = deal; ruleCache.clear(); }

export function setupOf(id: string) {
  if (id === "rgb") return { seedId: "grid-4-rgb", name: "Grid 4×4 rgb", settings: {
    ...defaultSettingsFor("Grid", ["python"], { size: 4, symbols: "base10", colours: "rgb" }), interactionRateHz: 25, durationMode: "fixed" as const, halfLifeSeconds: 600 } };
  const setup = SEED_SETUPS.find(s => s.seedId === (id === "annotated" ? "grid-annotated-basics" : id));
  if (!setup) throw new Error(`Unknown setup: ${id}`);
  return setup;
}
export function econOf(setupId: string, patch: Partial<Econ> = {}): Econ {
  const s = setupOf(setupId).settings;
  return {
    powerPerSecond: s.powerPerSecond, interactionRateHz: s.interactionRateHz, durationSeconds: s.halfLifeSeconds,
    startingObjectCount: s.startingObjectCount, spawnRateHz: s.spawnRateHz, capacitySeconds: s.fullChargeSeconds, ...DEVELOP_ECON,
    // The setup's own cost model (Annotated basics prices changes by distance since 11 Nov 2026).
    distancePricing: costModelOf(s) === "distance-v1", ...patch,
  };
}

const ruleCache = new Map<string, Rule>();
/** A dealt rule as the engine scores it: the shipped table's surprisal (`players` keys the cache only). */
export function gameRule(familyId: string, params: Params, inst: Instantiation, players: number): Rule {
  const key = `${inst.key}|${familyId}|${JSON.stringify(params)}|m=${players - 1}`;
  let rule = ruleCache.get(`${key}|${SCALE[familyId] ?? 1}`);
  if (rule) return rule;
  const base = familyRule(familyId, params, inst);
  const top = base.topBits;
  // --equal-tops B (an experiment, docs/beginner-pool.md §5): every rule's bits are scaled so its best board is worth B.
  // --equal-par B: scaled so reference greedy play holds B bits per object at the end (the par, measured per family).
  const scale = (EQUAL_TOPS ? EQUAL_TOPS / top : 1) * (SCALE[familyId] ?? 1);
  ruleCache.set(`${key}|${SCALE[familyId] ?? 1}`, rule = { ...base, bits: o => scale * base.bits(o), topBits: scale * top });
  return rule;
}
/** The rules of game `g`: the setup's own dealer (settings.utilitySelectorId) on a seed shared by every table. */
export function dealOf(setupId: string, players: number, g: number): { inst: Instantiation; rules: Rule[]; families: string[] } {
  const s = setupOf(setupId).settings, inst = instantiate(s.objectType, s.typeArgs);
  if (DEAL) {
    // A fixed combination (mode combos): seat k holds DEAL[(k + g) mod P], so every rule meets every seat.
    const rng = seededRng(`coordination|deal|${setupId}|${players}|${g}`), ctx = context(inst);
    const deal = Array.from({ length: players }, (_, k) => { const f = DEAL![(k + g) % DEAL!.length], sup = family(f).support(ctx); return { familyId: f, params: sup[rng.int(sup.length)] as Params }; });
    return { inst, rules: deal.map(d => gameRule(d.familyId, d.params, inst, players)), families: deal.map(d => d.familyId) };
  }
  const exclude = POOL ? availableFamilies(inst, "reward").map(f => f.id).filter(id => !POOL!.includes(id)) : s.excludedFamilies;
  const deal = selector(s.utilitySelectorId).select(inst, players, seededRng(`coordination|deal|${setupId}|${players}|${g}`), { exclude });
  return { inst, rules: deal.map(d => gameRule(d.familyId, d.params, inst, players)), families: deal.map(d => d.familyId) };
}

/** Game `g` of a table: slot k of `policies` sits at seat (k + g) mod P, so every policy meets every seat and rule. */
export function playTable(run: Run, policies: readonly Policy[]): GameResult[] {
  const P = run.players, out: GameResult[] = [];
  for (let g = 0; g < run.games; g++) {
    const { inst, rules } = dealOf(run.setup, P, g), sp = space(inst, "symbol");
    const seatOf = (slot: number) => (slot + g) % P, bySeat = new Array<Policy>(P);
    policies.forEach((p, slot) => (bySeat[seatOf(slot)] = p));
    // --match: P rounds on the same deal, the rules passed one seat on each round, so every player holds every rule
    // once; the match is decided by the sum of the rounds' points.
    const rounds = run.match ? Array.from({ length: P }, (_, k) => playGame(rules.map((_, s) => rules[(s + k) % P]), bySeat, sp, run.econ, seededRng(`coordination|game|${run.setup}|${g}|round${k}`), run.tuning))
      : [playGame(rules, bySeat, sp, run.econ, seededRng(`coordination|game|${run.setup}|${g}`), run.tuning)];
    const add = (f: (x: GameResult) => readonly number[]) => rounds.map(f).reduce((a, b) => a.map((x, i) => x + b[i]));
    const r: GameResult = { ...rounds[0], final: add(x => x.final), average: add(x => x.average), score: add(x => x.score), acts: add(x => x.acts), changes: add(x => x.changes), skips: add(x => x.skips),
      refused: add(x => x.refused), readSpent: add(x => x.readSpent), changeSpent: add(x => x.changeSpent), destroyed: add(x => x.destroyed), created: add(x => x.created), ownBits: add(x => x.ownBits).map(x => x / rounds.length) };
    const slots = <T>(a: readonly T[]) => policies.map((_, slot) => a[seatOf(slot)]);
    out.push({ ...r, final: slots(r.final), average: slots(r.average), score: slots(r.score), acts: slots(r.acts), changes: slots(r.changes), skips: slots(r.skips), refused: slots(r.refused),
      readSpent: slots(r.readSpent), changeSpent: slots(r.changeSpent), destroyed: slots(r.destroyed), created: slots(r.created), ownBits: slots(r.ownBits) });
  }
  return out;
}
/** Seat statistics: the same policy everywhere, no rotation. */
export function playSeats(run: Run, policy: Policy): TableStats {
  const P = run.players, results: GameResult[] = [];
  for (let g = 0; g < run.games; g++) {
    const { inst, rules } = dealOf(run.setup, P, g);
    results.push(playGame(rules, new Array<Policy>(P).fill(policy), space(inst, "symbol"), run.econ, seededRng(`coordination|game|${run.setup}|${g}`), run.tuning));
  }
  return summarise(new Array<Policy>(P).fill(policy), results, run.econ.durationSeconds);
}

// ------------------------------------------------------------------------------------------------ by dealt rule
/** One game at a table where every god plays `policy`: what each seat's dealt rule got. */
export interface RuleGame { families: string[]; score: number[]; ownBits: number[]; topBits: number[]; changes: number[]; refused: number[]; checkpoints?: GameResult["checkpoints"] }
export function playRules(run: Run, policy: Policy, from: number, to: number): RuleGame[] {
  const P = run.players, out: RuleGame[] = [];
  for (let g = from; g < to; g++) {
    const { inst, rules, families } = dealOf(run.setup, P, g);
    const r = playGame(rules, new Array<Policy>(P).fill(policy), space(inst, "symbol"), run.econ, seededRng(`coordination|game|${run.setup}|${g}`), run.tuning);
    out.push({ families, score: r.score, ownBits: r.ownBits, topBits: rules.map(x => x.topBits), changes: r.changes, refused: r.refused, checkpoints: r.checkpoints });
  }
  return out;
}
/** Per rule: games it was dealt in, win share (ties split), mean rank (1 = first; ties share the mean of their places), points against the table's mean, bits held per object at the end and as a share of the rule's top, changes per game. */
export interface RuleStats { n: number; win: number; rank: number; relative: number; ownBits: number; topShare: number; changes: number; refused: number }
export function ruleStats(games: readonly RuleGame[]): Map<string, RuleStats> {
  const acc = new Map<string, RuleStats>();
  for (const game of games) {
    const wins = winShares(game.score), ranks = ranksOf(game.score), mean = game.score.reduce((a, b) => a + b, 0) / game.score.length;
    game.families.forEach((f, i) => {
      const s = acc.get(f) ?? { n: 0, win: 0, rank: 0, relative: 0, ownBits: 0, topShare: 0, changes: 0, refused: 0 };
      s.n++; s.win += wins[i]; s.rank += ranks[i]; s.relative += mean > 0 ? game.score[i] / mean : 1;
      s.ownBits += game.ownBits[i]; s.topShare += game.ownBits[i] / game.topBits[i]; s.changes += game.changes[i]; s.refused += game.refused[i];
      acc.set(f, s);
    });
  }
  for (const s of acc.values()) for (const k of ["win", "rank", "relative", "ownBits", "topShare", "changes", "refused"] as const) s[k] /= s.n;
  return acc;
}
/**
 * Saturation and contest over a game's time (--saturation): per checkpoint, the mean share of its rule's top a god holds
 * per object, the share of (object, god) pairs at the top, and how often the leader then is the final winner.
 */
export function saturationMarkdown(games: readonly RuleGame[]): string {
  const ts = games[0]?.checkpoints?.map(c => c.t) ?? [];
  const lines = ["| world second | share of top held | objects at a god's top | leader then wins |", "|---|---|---|---|"];
  ts.forEach((t, k) => {
    let share = 0, at = 0, n = 0, same = 0;
    for (const g of games) {
      const c = g.checkpoints![k], winner = g.score.indexOf(Math.max(...g.score));
      c.topShare.forEach((x, i) => { share += x; at += c.atTop[i]; n++; });
      if (c.leader === winner) same++;
    }
    lines.push(`| ${t} | ${(100 * share / n).toFixed(0)}% | ${(100 * at / n).toFixed(0)}% | ${(100 * same / games.length).toFixed(0)}% |`);
  });
  return lines.join("\n");
}
export function rulesMarkdown(policies: readonly Policy[], byPolicy: ReadonlyMap<Policy, ReadonlyMap<string, RuleStats>>, players: number): string {
  const rules = [...new Set(policies.flatMap(p => [...byPolicy.get(p)!.keys()]))].sort();
  const cell = (s: RuleStats | undefined) => (s ? `${(100 * s.win).toFixed(0)}% / ${s.rank.toFixed(2)} / ${s.relative.toFixed(2)} / ${s.ownBits.toFixed(1)} (${(100 * s.topShare).toFixed(0)}%)` : "–");
  const lines = [`Win share / mean rank / points against the table's mean / own bits per object at the end (share of the rule's top), ${players} gods, every god playing the column's policy (fair win share ${(100 / players).toFixed(0)}%, fair rank ${((players + 1) / 2).toFixed(1)}):`, "",
    `| rule | games | ${policies.join(" | ")} |`, `|---|---|${policies.map(() => "---").join("|")}|`];
  for (const r of rules) lines.push(`| ${r} | ${byPolicy.get(policies[0])!.get(r)?.n ?? 0} | ${policies.map(p => cell(byPolicy.get(p)!.get(r))).join(" | ")} |`);
  const spread = (p: Policy) => { const w = rules.map(r => byPolicy.get(p)!.get(r)?.win ?? 0); return `${(100 * Math.min(...w)).toFixed(0)}%–${(100 * Math.max(...w)).toFixed(0)}% (×${(Math.max(...w) / Math.max(1e-9, Math.min(...w))).toFixed(2)})`; };
  lines.push(`| **win share, lowest–highest (ratio)** | | ${policies.map(spread).join(" | ")} |`);
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------------------ workers
const SELF = fileURLToPath(import.meta.url);
/** Plays every table (in worker processes) and returns profileKey → stats. Tables are given in slot order. */
export async function playTables(run: Run, tables: readonly (readonly Policy[])[], jobs: number): Promise<Map<string, TableStats>> {
  for (let g = 0; g < run.games; g++) dealOf(run.setup, run.players, g); // every deal, once, before the workers
  const unique = [...new Map(tables.map(t => [profileKey(t), [...t].sort() as Policy[]])).values()];
  const chunks: Policy[][][] = Array.from({ length: Math.min(jobs, unique.length) }, () => []);
  unique.forEach((t, k) => chunks[k % chunks.length].push(t));
  const parts = await Promise.all(chunks.map(chunk => new Promise<[string, TableStats][]>((resolve, reject) => {
    execFile(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", SELF, "--worker", JSON.stringify({ run, tables: chunk })],
      { maxBuffer: 1 << 28 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(JSON.parse(stdout))));
  })));
  return new Map(parts.flat());
}

// ------------------------------------------------------------------------------------------------ printing
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const f0 = (x: number) => x.toFixed(0);
export function tableRow(s: TableStats): string {
  const names = [...new Set(s.policies)];
  const cell = (p: Policy) => `${p} ${pct(valueIn(s, p, "win"))} / ${f0(valueIn(s, p, "score"))}`;
  return `| ${s.policies.join(", ")} | ${names.map(cell).join("; ")} | ${f0(s.welfare)} | ${s.actsPerSecond.map(x => x.toFixed(1)).join(" / ")} | ${s.skipShare.map(pct).join(" / ")} | ${s.destroyedPerChange.map(x => x.toFixed(1)).join(" / ")} |`;
}
export const TABLE_HEAD = "| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |\n|---|---|---|---|---|---|";

/** The duel matrix: rows = what the other gods play, columns = what the one god plays; cell = its value by `metric`. */
export function duelMarkdown(set: readonly Policy[], players: number, table: ReadonlyMap<string, TableStats>, metric: Metric): string {
  const fmt = metric === "win" ? pct : metric === "relative" || metric === "rank" ? (x: number) => x.toFixed(2) : f0;
  const better = metric === "rank" ? Math.min : Math.max;   // a rank is better when it is lower
  const lines = [`| the others play ↓, one god plays → | ${set.join(" | ")} | best response |`, `|---|${set.map(() => "---").join("|")}|---|`];
  for (const base of set) {
    const row = set.map(dev => {
      const s = table.get(profileKey([dev, ...new Array<Policy>(players - 1).fill(base)]));
      return s ? valueIn(s, dev, metric) : NaN;
    });
    const best = set[row.indexOf(better(...row.filter(x => !Number.isNaN(x))))];
    lines.push(`| ${base} | ${row.map((x, k) => (set[k] === base ? `*${fmt(x)}*` : fmt(x))).join(" | ")} | ${best} |`);
  }
  return lines.join("\n");
}
export function equilibriaMarkdown(set: readonly Policy[], players: number, table: ReadonlyMap<string, TableStats>, metric: Metric, tolerance: number): string {
  const all = equilibria(set, players, table, metric, tolerance);
  const fmt = metric === "win" ? pct : f0;
  const eq = all.filter(e => e.equilibrium);
  const lines = [`Equilibria by ${metric === "win" ? "win share" : "points"} (no god gains more than ${fmt(tolerance)} by switching), of ${all.length} tables:`, ""];
  if (!eq.length) lines.push("none.");
  for (const e of eq) lines.push(`- **${e.profile.join(", ")}**: welfare ${f0(e.stats.welfare)}; ${[...new Set(e.profile)].map(p => `${p} ${fmt(valueIn(e.stats, p, metric))}`).join(", ")}`
    + (e.best ? `; best switch ${e.best.from} → ${e.best.to} ${e.best.gain >= 0 ? "+" : "−"}${fmt(Math.abs(e.best.gain))}` : ""));
  const homogeneous = all.filter(e => new Set(e.profile).size === 1 && !e.equilibrium);
  if (homogeneous.length) {
    lines.push("", "Tables of one policy that are not equilibria, and the switch that breaks them:");
    for (const e of homogeneous) lines.push(`- all ${e.profile[0]} (welfare ${f0(e.stats.welfare)}): one god switches to ${e.best!.to}, +${fmt(e.best!.gain)}`);
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------------------ main
/**
 * Summon prices (bits) of each policy as the smallest honest Python agent on the default board, from the engine's own
 * validate path (scripts/coordination-programs/README.md: a god holding Magic Eighteen against Opposite Nines and
 * Leapfrog). clause = greedy plus the clause; defender, hoarder and sniper were not written: estimated from deny.
 * A deity can hold at most power × fullChargeSeconds (1920 bits on the default setup), so each of these can be paid.
 */
export const SUMMON_BITS: Record<Policy, number> = {
  random: 143, greedy: 738, clause: 760, considerate: 1179, payoff: 1599, cooperator: 1797, defender: 1700, deny: 1612, hoarder: 1650, sniper: 1700,
};
const ZOO: Policy[] = ["greedy", "clause", "considerate", "payoff", "cooperator", "defender", "deny"];
function runOf(): Run {
  const setup = opt("setup", "annotated")!;
  const patch: Partial<Econ> = {
    ...(opt("duration") ? { durationSeconds: num("duration", 0) } : {}), ...(opt("objects") ? { startingObjectCount: num("objects", 0) } : {}),
    ...(opt("spawn") ? { spawnRateHz: num("spawn", 0) } : {}), ...(opt("power") ? { powerPerSecond: num("power", 0) } : {}),
    ...(opt("rate") ? { interactionRateHz: num("rate", 0) } : {}), ...(opt("kappa") ? { kappa: num("kappa", 0) } : {}),
    ...(opt("capacity") ? { capacitySeconds: opt("capacity") === "none" ? undefined : num("capacity", 0) } : {}), ...(flag("distance") ? { distancePricing: true } : {}), ...(flag("flat") ? { distancePricing: false } : {}), ...(flag("unbounded-debt") ? { debtBound: false } : {}),
    ...(opt("erasure") ? { erasure: num("erasure", 0) } : {}), ...(opt("aggregate") ? { aggregate: opt("aggregate") as Aggregate } : {}),
    ...(opt("scoring") ? { scoring: opt("scoring") as Econ["scoring"] } : {}), ...(opt("learn") ? { learnSeconds: num("learn", 0) } : {}),
    ...(opt("agents") ? { agentsPerGod: num("agents", 1) } : {}), ...(opt("candidates") ? { candidates: num("candidates", 24) } : {}), ...(opt("cap") ? { agentCapHz: num("cap", 4) } : {}), ...(flag("free-offers") ? { offerReads: false } : {}),
  };
  return { setup, games: num("games", 24), players: num("players", 3), econ: econOf(setup, patch), ...(opt("pool") ? { pool: opt("pool")!.split(",") } : {}), ...(opt("equal-tops") ? { equalTops: num("equal-tops", 0) } : {}), ...(flag("match") ? { match: true } : {}),
    tuning: { hoarderThreshold: num("hoard", DEFAULT_TUNING.hoarderThreshold), sniperSeconds: num("snipe", DEFAULT_TUNING.sniperSeconds),
      ...(flag("summon") ? { summonBits: SUMMON_BITS, startingEnergy: setupOf(setup).settings.startingEnergy } : {}) } };
}

async function main() {
  if (flag("worker")) {
    const { run, tables } = JSON.parse(opt("worker")!) as { run: Run; tables: Policy[][] };
    setPool(run.pool, run.equalTops, run.scale, run.deal);
    process.stdout.write(JSON.stringify(tables.map(t => [profileKey(t), summarise(t, playTable(run, t), run.econ.durationSeconds)])));
    return;
  }
  if (flag("rules-worker")) {
    const { run, policy, from, to } = JSON.parse(opt("rules-worker")!) as { run: Run; policy: Policy; from: number; to: number };
    setPool(run.pool, run.equalTops, run.scale, run.deal);
    process.stdout.write(JSON.stringify(playRules(run, policy, from, to)));
    return;
  }
  const mode = argv[0] && !argv[0].startsWith("--") ? argv[0] : "report";
  const run = runOf(), jobs = num("jobs", availableParallelism()), P = run.players;
  setPool(run.pool, run.equalTops, run.scale, run.deal);
  const set = (opt("set")?.split(",") as Policy[] | undefined) ?? ZOO;
  for (const p of set) if (!POLICIES.includes(p)) throw new Error(`Unknown policy: ${p}`);
  console.log(`setup ${run.setup}, ${P} gods, ${run.games} games per table, econ ${JSON.stringify(run.econ)}`);
  const json: Record<string, unknown> = { run };
  if (mode === "seat") {
    for (const p of set) {
      const s = playSeats(run, p);
      console.log(`all ${p}: win share by seat ${s.win.map(pct).join(" / ")} (fair ${pct(1 / P)}); points by seat ${s.score.map(f0).join(" / ")}; acts/s ${s.actsPerSecond.map(x => x.toFixed(2)).join(" / ")}; idle opportunities ${pct(s.idleShare)}`);
      json[`seat:${p}`] = s;
    }
  } else if (mode === "duel" || mode === "equilibria") {
    const tables = mode === "duel" ? set.flatMap(base => set.map(dev => [dev, ...new Array<Policy>(P - 1).fill(base)])) : profiles(set, P);
    const table = await playTables(run, tables, jobs);
    json.tables = Object.fromEntries(table);
    console.log(`\nWin share of the one god:\n${duelMarkdown(set, P, table, "win")}`);
    console.log(`\nPoints of the one god:\n${duelMarkdown(set, P, table, "score")}`);
    console.log(`\nWelfare of each one-policy table: ${set.map(p => `${p} ${f0(table.get(profileKey(new Array<Policy>(P).fill(p)))!.welfare)}`).join(", ")}`);
    if (mode === "equilibria") {
      console.log(`\n${equilibriaMarkdown(set, P, table, "win", 0.03)}`);
      console.log(`\n${equilibriaMarkdown(set, P, table, "score", 0.02 * Math.max(...[...table.values()].map(s => s.welfare / P)))}`);
    }
  } else if (mode === "tables") {
    const named = (opt("tables") ?? "cooperator,cooperator,deny;deny,deny,deny;cooperator,cooperator,cooperator;greedy,greedy,greedy;random,greedy,deny;cooperator,cooperator,sniper;payoff,payoff,sniper")
      .split(";").map(t => t.split(",") as Policy[]);
    const table = await playTables(run, named, jobs);
    json.tables = Object.fromEntries(table);
    console.log(TABLE_HEAD);
    for (const t of named) console.log(tableRow(table.get(profileKey(t))!));
  } else if (mode === "report") {
    // The document's tables: develop's rules on the full zoo, each candidate rule, and the sensitivities. `--only a,b`
    // runs the named sections; `--out DIR` also writes each section's text and JSON there.
    const only = opt("only")?.split(","), out = opt("out");
    const CORE: Policy[] = ["greedy", "payoff", "cooperator", "deny"];
    const sections: { name: string; title: string; mode: "equilibria" | "duel" | "tables"; set?: Policy[]; players?: number; econ?: Partial<Econ>; tuning?: Partial<Tuning>; tables?: Policy[][] }[] = [
      { name: "develop-zoo", title: "The rules on develop, the whole zoo", mode: "equilibria", set: ZOO },
      { name: "develop", title: "The rules on develop", mode: "equilibria", set: CORE },
      { name: "erasure1", title: "Candidate: breaking costs extra (1 bit of work per bit destroyed)", mode: "equilibria", set: CORE, econ: { erasure: 1 } },
      { name: "erasure3", title: "Candidate: breaking costs extra (3 bits of work per bit destroyed)", mode: "equilibria", set: CORE, econ: { erasure: 3 } },
      { name: "min", title: "Candidate: own bits × the smallest other god's bits", mode: "equilibria", set: CORE, econ: { aggregate: "min" } },
      { name: "geo", title: "Candidate: own bits × the geometric mean of the others' bits", mode: "equilibria", set: CORE, econ: { aggregate: "geo" } },
      { name: "integral", title: "Candidate: points averaged over the game's time", mode: "equilibria", set: CORE, econ: { scoring: "integral" } },
      { name: "min-erasure1", title: "Smallest other × breaking costs extra", mode: "equilibria", set: CORE, econ: { aggregate: "min", erasure: 1 } },
      { name: "mixed", title: "Mixed tables on develop", mode: "tables", tables: [["cooperator", "cooperator", "deny"], ["payoff", "payoff", "deny"], ["payoff", "payoff", "greedy"], ["deny", "deny", "deny"], ["random", "greedy", "deny"], ["random", "random", "random"], ["considerate", "considerate", "considerate"], ["defender", "defender", "deny"]] },
      { name: "sniper-nocap", title: "Saving energy for the end, no capacity, 8 agents per god", mode: "tables", econ: { capacitySeconds: undefined, agentsPerGod: 8 }, tables: [["payoff", "payoff", "sniper"], ["greedy", "greedy", "sniper"], ["payoff", "payoff", "payoff"]] },
      { name: "sniper-cap", title: "Saving energy for the end, develop's capacity, 8 agents per god", mode: "tables", econ: { agentsPerGod: 8 }, tables: [["payoff", "payoff", "sniper"], ["greedy", "greedy", "sniper"], ["payoff", "payoff", "payoff"]] },
      { name: "sniper-integral", title: "Saving energy for the end, no capacity, points averaged over time", mode: "tables", econ: { capacitySeconds: undefined, agentsPerGod: 8, scoring: "integral" }, tables: [["payoff", "payoff", "sniper"], ["greedy", "greedy", "sniper"], ["payoff", "payoff", "payoff"]] },
      ...([1, 8, 128] as const).map(kappa => ({ name: `kappa${kappa}`, title: `Read price: κ = ${kappa}`, mode: "duel" as const, set: CORE, econ: { kappa } })),
      { name: "capacity-none", title: "No energy capacity", mode: "duel", set: CORE, econ: { capacitySeconds: undefined } },
      { name: "capacity-5", title: "Capacity 5 s", mode: "duel", set: CORE, econ: { capacitySeconds: 5 } },
      { name: "flat", title: "Flat pricing (set-v1: every one-cell write costs the same)", mode: "duel", set: CORE, econ: { distancePricing: false } },
      { name: "unbounded-debt", title: "No debt bound (the economy before 13 Nov 2026)", mode: "duel", set: CORE, econ: { debtBound: false } },
      { name: "players2", title: "Two gods", mode: "duel", set: CORE, players: 2 },
      { name: "players4", title: "Four gods", mode: "duel", set: CORE, players: 4 },
      { name: "players5", title: "Five gods", mode: "duel", set: CORE, players: 5 },
      { name: "length", title: "The full 600 s game", mode: "duel", set: CORE, econ: { durationSeconds: 600 } },
      { name: "objects40", title: "40 starting objects", mode: "duel", set: CORE, econ: { startingObjectCount: 40 } },
      { name: "agents1", title: "One agent per god", mode: "duel", set: CORE, econ: { agentsPerGod: 1 } },
      { name: "learn120", title: "The others' rules known only after 120 s", mode: "duel", set: CORE, econ: { learnSeconds: 120 } },
      { name: "summon", title: "Programs paid for: agents start once their summon price is saved", mode: "duel", set: CORE, tuning: { summonBits: SUMMON_BITS, startingEnergy: setupOf(run.setup).settings.startingEnergy } },
      { name: "exhaustive", title: "Agents try all 144 writes", mode: "duel", set: CORE, econ: { candidates: 1000 } },
    ];
    for (const sec of sections) {
      if (only && !only.includes(sec.name)) continue;
      const r: Run = { ...run, players: sec.players ?? run.players, econ: { ...run.econ, ...sec.econ }, tuning: { ...run.tuning, ...sec.tuning } };
      const Q = r.players, sset = sec.set ?? CORE;
      const tables = sec.mode === "tables" ? sec.tables! : sec.mode === "duel" ? sset.flatMap(base => sset.map(dev => [dev, ...new Array<Policy>(Q - 1).fill(base)])) : profiles(sset, Q);
      const started = Date.now(), table = await playTables(r, tables, jobs);
      const lines = [`### ${sec.title}`, "", `\`${sec.name}\`: ${Q} gods, ${r.games} games per table, ${r.econ.durationSeconds} s, ${r.econ.agentsPerGod} agent(s) per god.`, ""];
      if (sec.mode === "tables") { lines.push(TABLE_HEAD); for (const t of sec.tables!) lines.push(tableRow(table.get(profileKey(t))!)); }
      else {
        lines.push(`Win share of the one god:\n${duelMarkdown(sset, Q, table, "win")}`, "", `Mean rank of the one god (1 = first; fair ${((Q + 1) / 2).toFixed(1)}):\n${duelMarkdown(sset, Q, table, "rank")}`, "", `Points of the one god:\n${duelMarkdown(sset, Q, table, "score")}`, "",
          `Welfare of each one-policy table: ${sset.map(p => `${p} ${f0(table.get(profileKey(new Array<Policy>(Q).fill(p)))!.welfare)}`).join(", ")}`);
        if (sec.mode === "equilibria") lines.push("", equilibriaMarkdown(sset, Q, table, "win", 0.03), "", equilibriaMarkdown(sset, Q, table, "score", 0.02 * Math.max(...[...table.values()].map(s => s.welfare / Q))));
      }
      const text = lines.join("\n");
      console.log(`\n${text}\n\n(${((Date.now() - started) / 1000).toFixed(0)} s)`);
      json[sec.name] = Object.fromEntries(table);
      if (out) { mkdirSync(out, { recursive: true }); writeFileSync(join(out, `${sec.name}.md`), text + "\n"); writeFileSync(join(out, `${sec.name}.json`), JSON.stringify({ run: r, tables: Object.fromEntries(table) })); }
    }
  } else if (mode === "rules") {
    // Win share by dealt rule (docs/beginner-pool.md §5): every god plays the same policy, so what differs between the
    // seats is the rule each was dealt. The setup's own dealer deals, on seeds shared by every policy.
    const policies = (opt("set")?.split(",") as Policy[] | undefined) ?? ["greedy", "considerate", "deny"];
    for (let g = 0; g < run.games; g++) dealOf(run.setup, P, g);
    const rulesIn = async (r: Run, policy: Policy, from: number, to: number) => {
      const step = Math.ceil((to - from) / jobs);
      const parts = await Promise.all(Array.from({ length: Math.ceil((to - from) / step) }, (_, k) => new Promise<RuleGame[]>((resolve, reject) => {
        execFile(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", SELF, "--rules-worker", JSON.stringify({ run: r, policy, from: from + k * step, to: Math.min(to, from + (k + 1) * step) })],
          { maxBuffer: 1 << 28 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(JSON.parse(stdout))));
      })));
      if (flag("saturation")) console.log(`\n${policy}:\n${saturationMarkdown(parts.flat())}`);
      return ruleStats(parts.flat());
    };
    if (opt("equal-par")) {
      // Par: each family's own bits per object at the end under reference greedy play, as shipped, on deals disjoint
      // from the measured ones (games 100000 on); every family is then scaled so its par is B.
      const B = num("equal-par", 0), parGames = num("par-games", 300);
      for (let g = 100000; g < 100000 + parGames; g++) dealOf(run.setup, P, g);
      const par = await rulesIn({ ...run, scale: {} }, (opt("par-policy") ?? "greedy") as Policy, 100000, 100000 + parGames);
      run.scale = Object.fromEntries([...par].map(([f, s]) => [f, B / s.ownBits]));
      setPool(run.pool, run.equalTops, run.scale, run.deal);
      console.log(`par (${opt("par-policy") ?? "greedy"}, ${parGames} games): ${[...par].map(([f, s]) => `${f} ${s.ownBits.toFixed(2)} (×${run.scale![f].toFixed(3)})`).join(", ")}`);
    }
    const byPolicy = new Map<Policy, Map<string, RuleStats>>();
    for (const policy of policies) byPolicy.set(policy, await rulesIn(run, policy, 0, run.games));
    console.log(`\n${rulesMarkdown(policies, byPolicy, P)}`);
    json.rules = Object.fromEntries([...byPolicy].map(([p, m]) => [p, Object.fromEntries(m)]));
  } else if (mode === "combos") {
    // Fix candidate (c'): every combination of P rules from the pool, dealt as a fixed set (seats rotated), each policy
    // of --set at every seat; per combination, each rule's win share by policy. Prints the combinations where every
    // rule's win share lies within --band lo,hi (default 20,45 at 3 players) under every policy.
    const policies = (opt("set")?.split(",") as Policy[] | undefined) ?? ["greedy", "considerate", "deny"];
    const pool = run.pool ?? (setupOf(run.setup).settings.excludedFamilies ? availableFamilies(instantiate(setupOf(run.setup).settings.objectType, setupOf(run.setup).settings.typeArgs), "reward").map(f => f.id).filter(id => !setupOf(run.setup).settings.excludedFamilies!.includes(id)) : []);
    const [lo, hi] = (opt("band") ?? (P === 3 ? "20,45" : "14,36")).split(",").map(Number);
    const combos: string[][] = [];
    const rec = (from: number, acc: string[]) => { if (acc.length === P) { combos.push(acc); return; } for (let k = from; k < pool.length; k++) rec(k + 1, [...acc, pool[k]]); };
    rec(0, []);
    const tasks = combos.flatMap(c => policies.map(policy => ({ c, policy })));
    const results = new Map<string, Map<Policy, Map<string, RuleStats>>>();
    let next = 0;
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < tasks.length) {
        const { c, policy } = tasks[next++];
        const r: Run = { ...run, deal: c };
        const games = await new Promise<RuleGame[]>((resolve, reject) => execFile(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", SELF, "--rules-worker", JSON.stringify({ run: r, policy, from: 0, to: run.games })],
          { maxBuffer: 1 << 28 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(JSON.parse(stdout)))));
        const key = c.join(",");
        if (!results.has(key)) results.set(key, new Map());
        results.get(key)!.set(policy, ruleStats(games));
      }
    }));
    const lines = [`| combination | ${policies.join(" | ")} | worst | in band |`, `|---|${policies.map(() => "---").join("|")}|---|---|`];
    const rows = combos.map(c => {
      const m = results.get(c.join(","))!, wins = policies.flatMap(p => c.map(f => m.get(p)!.get(f)!.win));
      const worst = Math.max(...wins.map(w => Math.max(lo / 100 - w, w - hi / 100, 0)));
      return { c, m, worst, ok: worst === 0 };
    }).sort((a, b) => a.worst - b.worst);
    for (const { c, m, worst, ok } of rows) lines.push(`| ${c.join(", ")} | ${policies.map(p => c.map(f => `${(100 * m.get(p)!.get(f)!.win).toFixed(0)}`).join("/")).join(" | ")} | ${(100 * worst).toFixed(0)} | ${ok ? "yes" : ""} |`);
    console.log(`\nWin share of each rule (in the combination's order) by policy, ${run.games} games per cell; band ${lo}–${hi}%:\n${lines.join("\n")}`);
    console.log(`\n${rows.filter(r => r.ok).length} of ${combos.length} combinations in band.`);
    json.combos = rows.map(r => ({ combo: r.c, worst: r.worst, ok: r.ok, byPolicy: Object.fromEntries([...r.m].map(([p, x]) => [p, Object.fromEntries(x)])) }));
  } else if (mode === "validate") {
    // Real engine games (artifacts/engine/scripts/coordination-games.ts) against the model on the same deals and policies.
    const games = JSON.parse(readFileSync(opt("engine", fileURLToPath(new URL("./coordination-engine-games.json", import.meta.url)))!, "utf8")) as EngineGame[];
    const runs = num("runs", 20), rows: Record<string, { engine: number[]; model: number[] }> = {};
    const add = (key: string, engine: number, model: number) => { (rows[key] ??= { engine: [], model: [] }).engine.push(engine); rows[key].model.push(model); };
    for (const game of games) {
      const s = game.settings, inst = instantiate(s.objectType, s.typeArgs), sp = space(inst, "symbol");
      const rules = game.seats.map(seat => gameRule(seat.utility.familyId, seat.utility.params as Params, inst, game.seats.length)), policies = game.seats.map(seat => seat.policy);
      const econ = econOf(run.setup, { ...run.econ, durationSeconds: game.worldSeconds, powerPerSecond: s.powerPerSecond, interactionRateHz: s.interactionRateHz, capacitySeconds: s.fullChargeSeconds, candidates: 1000, agentsPerGod: 1,
        agentCapHz: 4, offerReads: false }); // the recorded games were played under the 4 Hz cap, with free offers
      const model = Array.from({ length: runs }, (_, k) => playGame(rules, policies, sp, econ, seededRng(`coordination|validate|${game.gameId}|${k}`), run.tuning));
      const mean = (f: (r: GameResult) => number) => model.reduce((a, r) => a + f(r), 0) / runs;
      game.seats.forEach((seat, g) => {
        const k = `${game.table} ${seat.policy}`;
        add(`${k}: acts/s`, seat.acts / game.worldSeconds, mean(r => r.acts[g]) / game.worldSeconds);
        add(`${k}: changes/s`, seat.transforms / game.worldSeconds, mean(r => r.changes[g]) / game.worldSeconds);
        add(`${k}: energy spent/s`, seat.spent / game.worldSeconds, mean(r => r.readSpent[g] + r.changeSpent[g]) / game.worldSeconds);
        add(`${k}: read share of spend`, seat.spentRead / Math.max(1e-9, seat.spent), mean(r => r.readSpent[g] / Math.max(1e-9, r.readSpent[g] + r.changeSpent[g])));
        add(`${k}: final points`, seat.totalPayoff, mean(r => r.final[g]));
        add(`${k}: win share`, seat.rank === 1 ? 1 : 0, mean(r => winShares(r.final)[g]));
        add(`seat ${g} (all tables): win share`, seat.rank === 1 ? 1 : 0, mean(r => winShares(r.final)[g]));
      });
      add(`${game.table}: objects at the end`, game.objectsAtEnd, mean(r => r.objects));
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a: number[]) => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
    console.log(`${games.length} engine games, ${runs} model games each\n\n| table and policy: quantity | n | engine mean (sd over games) | model mean | model / engine |\n|---|---|---|---|---|`);
    for (const [key, v] of Object.entries(rows).sort()) {
      const e = avg(v.engine), m = avg(v.model), fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2));
      console.log(`| ${key} | ${v.engine.length} | ${fmt(e)} (${fmt(sd(v.engine))}) | ${fmt(m)} | ${e ? (m / e).toFixed(2) : "–"} |`);
    }
    json.validation = rows;
  } else throw new Error(`Unknown mode: ${mode}`);
  if (opt("json")) writeFileSync(opt("json")!, JSON.stringify(json, null, 1));
}

if (process.argv[1] === SELF) await main();
