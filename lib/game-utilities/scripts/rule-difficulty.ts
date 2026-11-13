/**
 * Rule difficulty (docs/rule-difficulty.md): per-rule table and pairwise synergy matrix, as text and JSON.
 *
 *   pnpm --filter @workspace/game-utilities difficulty [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/rule-difficulty.ts [options])
 *
 *   --setup annotated|first-steps   the seed setup's shape and reward pool (default annotated)
 *   --families a,b,c                these families instead of the setup's pool
 *   --adhoc FILE                    also measure the ad-hoc rules a module exports (format below)
 *   --only-adhoc                    measure only the ad-hoc rules (no families)
 *   --numbers-only                  keep only rules that ignore colours (measured)
 *   --moves cell|symbol             one-cell moves: symbol and colour (default) or symbol only
 *   --shape "Grid(4,base10,rgb)"    the board, overriding the setup's
 *   --budget default|quick          sample sizes (lib DEFAULT_BUDGET / QUICK_BUDGET)
 *   --starts N                      start boards per rule, overriding the budget's
 *   --cost-model set-v1|distance-v1 the room's cost model (any of game-types COST_MODELS), for the energy columns
 *   --act-overhead BITS             energy every act pays besides its change (its offer and its reads), default 0
 *                                   rateE, e32, e64 and the energy table (default set-v1)
 *   --params N                      distinct canonical params per family (default 1; rows are id#k when > 1)
 *   --no-pairs                      skip the synergy matrix
 *   --calibrate                     calibrate families here even when a shipped table exists
 *   --json FILE                     also write the full report as JSON
 *   --markdown FILE                 also write the tables as Markdown (docs/rule-difficulty.md)
 *
 * Ad-hoc module (.mjs, .js or .ts): `export const rules = [{ id, utility, top? }]`, where `utility` is the card's
 * `function utility(grid) { ... }` (a function or its source text), written against the room's prelude exactly like a
 * TypeScript card (grid.cells, grid.rows, grid.columns, cell.value, cell.colour, cell.surrounding, ...), returning a
 * number or a list of numbers (compared lexicographically, bigger is better). `top` (optional) is the best ordinal the
 * rule can reach, when known; otherwise the best any search finds is used. Example: scripts/rule-difficulty-example.mjs.
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { COST_MODELS, DEFAULT_COST_MODEL, isCostModel, instantiate, type Instantiation } from "@workspace/game-types";
import { SEED_SETUPS } from "../../game-core/src/settings.ts";
import {
  DEFAULT_BUDGET, ENERGY_BUDGETS, QUICK_BUDGET, adHocRule, verdict, colourBlind, familyParams, familyRule, measurePool, poolFamilies, space,
  type MoveSet, type PoolReport, type Rule,
} from "./rule-difficulty-lib.ts";
import type { Ordinal } from "../src/index.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`--${name} needs a value`);
  return argv[i + 1];
};

const setupId = opt("setup") === "first-steps" ? "grid-first-steps" : "grid-annotated-basics";
const setup = SEED_SETUPS.find(s => s.seedId === setupId)!;
function parseShape(s: string): Instantiation {
  const m = /^Grid\((\d+),(\w+),(\w+)\)$/.exec(s.replace(/\s/g, ""));
  if (!m) throw new Error(`--shape must look like Grid(4,base10,rgb), got ${s}`);
  return instantiate("Grid", { size: Number(m[1]), symbols: m[2], colours: m[3] });
}
const inst = opt("shape") ? parseShape(opt("shape")!) : instantiate(setup.settings.objectType, setup.settings.typeArgs);
const moveSet = (opt("moves") ?? "cell") as MoveSet;
const budget = { ...(opt("budget") === "quick" ? QUICK_BUDGET : DEFAULT_BUDGET), ...(opt("starts") ? { starts: Number(opt("starts")) } : {}) };
const costModel = opt("cost-model") ?? DEFAULT_COST_MODEL;
if (!isCostModel(costModel)) throw new Error(`--cost-model must be one of ${COST_MODELS.join(", ")}, got ${costModel}`);
const sp = space(inst, moveSet);
const log = (s: string) => process.stderr.write(s + "\n");

export function sourceOf(utility: unknown): string {
  const src = typeof utility === "function" ? utility.toString() : String(utility);
  return /function\s+utility\s*\(/.test(src) ? src : `const utility = (${src});`;
}

const rules: Rule[] = [];
if (!flag("only-adhoc")) {
  const ids = opt("families") ? opt("families")!.split(",").map(s => s.trim()).filter(Boolean)
    : poolFamilies(inst, opt("shape") ? [] : setup.settings.excludedFamilies);
  const per = Number(opt("params") ?? 1);
  for (const id of ids) {
    const ps = familyParams(id, inst, per);
    ps.forEach((p, k) => rules.push(familyRule(id, p, inst, { calibrate: flag("calibrate"), id: ps.length > 1 ? `${id}#${k}` : id })));
  }
}
if (opt("adhoc")) {
  const mod = await import(pathToFileURL(resolve(opt("adhoc")!)).href) as { rules?: { id: string; utility: unknown; top?: Ordinal }[]; default?: unknown };
  const list = mod.rules ?? (mod.default as typeof mod.rules);
  if (!Array.isArray(list)) throw new Error(`${opt("adhoc")} must export const rules = [{ id, utility, top? }]`);
  for (const x of list) { log(`calibrating ${x.id}`); rules.push(adHocRule(x.id, sourceOf(x.utility), inst, { top: x.top })); }
}
const chosen = flag("numbers-only") ? rules.filter(r => colourBlind(r, sp)) : rules;
log(`${inst.key}, moves=${moveSet}, cost model=${costModel}, ${chosen.length} rules, budget=${opt("budget") ?? "default"}`);
const t0 = performance.now();
const actOverhead = Number(opt("act-overhead") ?? 0);
if (!(actOverhead >= 0)) throw new Error(`--act-overhead must be a number of bits, 0 or more`);
const report = measurePool(chosen, { sp, budget, costModel, actOverhead }, { pairs: !flag("no-pairs"), log });
log(`measured in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
print(report);
if (opt("json")) writeFileSync(opt("json")!, JSON.stringify({ shape: inst.key, moves: moveSet, costModel, budget, ...report }, (_, v) => (v === Infinity ? "inf" : v), 2) + "\n");

if (opt("markdown")) writeFileSync(opt("markdown")!, markdown(report));

/**
 * The energy table (Markdown; the text output prints the same lines): bits held after 32 and 64 energy bits by the
 * steepest and the per-energy greedy under the cost model, then the pool's share-of-top spread for each agent.
 */
function energyLines(r: PoolReport): string[] {
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–"), [i32, i64] = [ENERGY_BUDGETS.indexOf(32), ENERGY_BUDGETS.indexOf(64)];
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const stat = (policy: "steepest" | "per-energy", i: number) => {
    const xs = r.rules.map(x => x.energyBits[policy][i] / x.topBits), m = mean(xs), sd = Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
    return `${f(m)}; ${f(Math.max(...xs) / Math.max(1e-9, Math.min(...xs)))}; ${f(sd / m)}`;
  };
  const s = r.summary;
  return [
    `Energy, cost model ${costModel}: bits held after 32 / 64 energy bits (energy of an act = W + 0.05·W²); rateE = bits gained per energy bit over the first 64, per-energy greedy.`, "",
    "| rule | top | steepest 32 / 64 | per-energy 32 / 64 | rateE | e32 | e64 |", "|---|--:|--:|--:|--:|--:|--:|",
    ...r.rules.map(x => `| ${x.id} | ${f(x.topBits, 1)} | ${f(x.energyBits.steepest[i32], 1)} / ${f(x.energyBits.steepest[i64], 1)} | ${f(x.energyBits["per-energy"][i32], 1)} / ${f(x.energyBits["per-energy"][i64], 1)} | ${f(x.rateE, 3)} | ${f(x.e32)} | ${f(x.e64)} |`),
    `| **share of top at 32: mean; max/min; CV** | | ${stat("steepest", i32)} | ${stat("per-energy", i32)} | | | |`,
    `| **share of top at 64: mean; max/min; CV** | | ${stat("steepest", i64)} | ${stat("per-energy", i64)} | | | |`,
    "", `Pool check (reported, not a gate): rateE max/min ${f(s.rateERatio)} (CV ${f(s.rateECv)}); the design's target is ≤ 1.6.`,
  ];
}

function markdown(r: PoolReport): string {
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "–");
  const syn = new Map(r.partners.map(p => [p.id, p]));
  const lines = [
    `${inst.key}, moves: ${moveSet}, budget: ${opt("budget") ?? "default"}`, "",
    "| rule | reads | card | top | rate4 | rate8 | rateE | g10 | g20 | uniform max | reach16 | to90 | plat | trap | esc2 | gap | K | **DIFF** | **SYN** | confl |",
    "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
    ...[...r.rules].sort((a, b) => a.difficulty - b.difficulty || b.rate4 - a.rate4).map(x => `| ${x.id} | ${x.colourBlind ? "numbers" : "colours"} | ${f(x.cardBits, 0)} | ${f(x.topBits, 1)} | ${f(x.rate4)} | ${f(x.rate8)} | ${f(x.rateE, 3)} | ${f(x.greedy10, 1)} | ${f(x.greedy20, 1)} | ${x.uniformTop.length ? x.uniformTop.join(", ") : "–"} | ${f(x.reach16)} | ${f(x.movesTo90, 0)} | ${f(x.plateau)} | ${f(x.trap)} | ${f(x.escape2)} | ${f(x.gap)} | ${f(x.entangle, 1)} | **${f(x.difficulty, 1)}** | **${f(syn.get(x.id)?.synergy ?? NaN, 1)}** | ${f(syn.get(x.id)?.conflict ?? NaN)} |`),
  ];
  if (r.pairs.length) {
    const ids = r.rules.map(x => x.id), at = new Map(r.pairs.flatMap(p => [[`${p.a}|${p.b}`, p], [`${p.b}|${p.a}`, p]]));
    lines.push("", "Synergy difficulty SYN per pair (100 × (1 − considerate)); the joint ceiling found is in brackets.", "",
      `| | ${ids.map(i => `\`${i}\``).join(" | ")} |`, `|---|${ids.map(() => "--:").join("|")}|`,
      ...ids.map(a => `| \`${a}\` | ${ids.map(b => { const p = at.get(`${a}|${b}`); return p ? `${f(p.difficulty, 0)} (${f(p.ceiling, 1)})` : "·"; }).join(" | ")} |`));
  }
  const s = r.summary;
  lines.push("", ...energyLines(r));
  lines.push("", `Pool: rate4 max/min ${f(s.rateRatio)} (CV ${f(s.rateCv)}); reach16 max/min ${f(s.reachRatio)}; card max/min ${f(s.cardBitsRatio)}; `
    + `DIFF max ${f(s.difficultyMax, 1)}, spread ${f(s.difficultySpread, 1)}; worst pair ${s.worstPair || "–"} (${f(s.worstPairDifficulty, 1)}); `
    + `lowest ceiling ${f(s.minCeiling)}; dominated: ${s.dominated.join(", ") || "none"}.`, "");
  const fails = verdict(r);
  lines.push(fails.length ? `Symmetric beginner pool thresholds: fails ${fails.length} (${fails.slice(0, 6).join("; ")}${fails.length > 6 ? "; …" : ""}).` : "Symmetric beginner pool thresholds: passes.", "");
  return lines.join("\n");
}

function print(r: PoolReport) {
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "inf" : "-");
  const cols: [string, number, (x: PoolReport["rules"][number]) => string][] = [
    ["rule", 24, x => x.id], ["card", 6, x => f(x.cardBits, 0)], ["top", 6, x => f(x.topBits, 1)],
    ["rate4", 6, x => f(x.rate4)], ["rate8", 6, x => f(x.rate8)], ["rateE", 7, x => f(x.rateE, 3)], ["e32", 6, x => f(x.e32)], ["e64", 6, x => f(x.e64)], ["g10", 6, x => f(x.greedy10, 1)], ["g20", 6, x => f(x.greedy20, 1)], ["unif", 6, x => (x.uniformTop.length === sp.S ? "all" : x.uniformTop.length > 4 ? `${x.uniformTop.length}` : x.uniformTop.join("") || "-")], ["reach16", 8, x => f(x.reach16)], ["to90", 5, x => f(x.movesTo90, 0)],
    ["plat", 5, x => f(x.plateau)], ["trap", 5, x => f(x.trap)], ["esc2", 5, x => f(x.escape2)], ["gap", 5, x => f(x.gap)],
    ["K", 5, x => f(x.entangle, 1)], ["DIFF", 6, x => f(x.difficulty, 1)],
  ];
  const partners = new Map(r.partners.map(p => [p.id, p]));
  const pcols: [string, number, (id: string) => string][] = [
    ["SYN", 6, id => f(partners.get(id)?.synergy ?? NaN, 1)], ["confl", 6, id => f(partners.get(id)?.conflict ?? NaN)],
  ];
  console.log(cols.map(([h, w], i) => (i ? h.padStart(w) : h.padEnd(w))).join("") + pcols.map(([h, w]) => h.padStart(w)).join("") + "  reads");
  for (const x of [...r.rules].sort((a, b) => a.difficulty - b.difficulty || b.rate4 - a.rate4)) {
    console.log(cols.map(([, w, g], i) => (i ? g(x).padStart(w) : g(x).slice(0, w - 1).padEnd(w))).join("")
      + pcols.map(([, w, g]) => g(x.id).padStart(w)).join("") + (x.colourBlind ? "  numbers" : "  colours"));
  }
  if (r.pairs.length) {
    const ids = r.rules.map(x => x.id), at = new Map(r.pairs.flatMap(p => [[`${p.a}|${p.b}`, p], [`${p.b}|${p.a}`, p]]));
    console.log("\nsynergy difficulty (0 easy .. 100 hard); see docs/rule-difficulty.md");
    console.log("".padEnd(20) + ids.map(i => i.slice(0, 7).padStart(8)).join(""));
    for (const a of ids) console.log(a.slice(0, 19).padEnd(20) + ids.map(b => {
      const p = at.get(`${a}|${b}`);
      return p ? f(p.difficulty, 0).padStart(8) : "       .";
    }).join(""));
  }
  console.log("\n" + energyLines(r).filter(Boolean).join("\n").replace(/\*\*/g, ""));
  const s = r.summary;
  console.log(`\npool: rate max/min ${f(s.rateRatio)} (cv ${f(s.rateCv)}), reach16 max/min ${f(s.reachRatio)}, card max/min ${f(s.cardBitsRatio)}, `
    + `difficulty max ${f(s.difficultyMax, 1)} spread ${f(s.difficultySpread, 1)}, worst pair ${s.worstPair || "-"} ${f(s.worstPairDifficulty, 1)}, `
    + `min ceiling ${f(s.minCeiling)}, dominated: ${s.dominated.join(", ") || "none"}`);
  const fails = verdict(r);
  console.log(fails.length ? `\nsymmetric beginner pool (SYMMETRIC_POOL): FAILS ${fails.length}\n  ${fails.join("\n  ")}` : "\nsymmetric beginner pool (SYMMETRIC_POOL): passes");
}
