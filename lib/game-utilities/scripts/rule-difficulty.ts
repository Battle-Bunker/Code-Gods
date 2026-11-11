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
import { instantiate, type Instantiation } from "@workspace/game-types";
import { SEED_SETUPS } from "../../game-core/src/settings.ts";
import {
  DEFAULT_BUDGET, QUICK_BUDGET, adHocRule, verdict, colourBlind, familyParams, familyRule, measurePool, poolFamilies, space,
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
const budget = opt("budget") === "quick" ? QUICK_BUDGET : DEFAULT_BUDGET;
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
log(`${inst.key}, moves=${moveSet}, ${chosen.length} rules, budget=${opt("budget") ?? "default"}`);
const t0 = performance.now();
const report = measurePool(chosen, { sp, budget }, { pairs: !flag("no-pairs"), log });
log(`measured in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
print(report);
if (opt("json")) writeFileSync(opt("json")!, JSON.stringify({ shape: inst.key, moves: moveSet, budget, ...report }, (_, v) => (v === Infinity ? "inf" : v), 2) + "\n");

if (opt("markdown")) writeFileSync(opt("markdown")!, markdown(report));

function markdown(r: PoolReport): string {
  const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "–");
  const syn = new Map(r.partners.map(p => [p.id, p]));
  const lines = [
    `${inst.key}, moves: ${moveSet}, budget: ${opt("budget") ?? "default"}`, "",
    "| rule | reads | card | top | rate4 | rate8 | g10 | g20 | uniform max | reach16 | to90 | plat | trap | esc2 | gap | K | **DIFF** | **SYN** | confl |",
    "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
    ...[...r.rules].sort((a, b) => a.difficulty - b.difficulty || b.rate4 - a.rate4).map(x => `| ${x.id} | ${x.colourBlind ? "numbers" : "colours"} | ${f(x.cardBits, 0)} | ${f(x.topBits, 1)} | ${f(x.rate4)} | ${f(x.rate8)} | ${f(x.greedy10, 1)} | ${f(x.greedy20, 1)} | ${x.uniformTop.length ? x.uniformTop.join(", ") : "–"} | ${f(x.reach16)} | ${f(x.movesTo90, 0)} | ${f(x.plateau)} | ${f(x.trap)} | ${f(x.escape2)} | ${f(x.gap)} | ${f(x.entangle, 1)} | **${f(x.difficulty, 1)}** | **${f(syn.get(x.id)?.synergy ?? NaN, 1)}** | ${f(syn.get(x.id)?.conflict ?? NaN)} |`),
  ];
  if (r.pairs.length) {
    const ids = r.rules.map(x => x.id), at = new Map(r.pairs.flatMap(p => [[`${p.a}|${p.b}`, p], [`${p.b}|${p.a}`, p]]));
    lines.push("", "Synergy difficulty SYN per pair (100 × (1 − considerate)); the joint ceiling found is in brackets.", "",
      `| | ${ids.map(i => `\`${i}\``).join(" | ")} |`, `|---|${ids.map(() => "--:").join("|")}|`,
      ...ids.map(a => `| \`${a}\` | ${ids.map(b => { const p = at.get(`${a}|${b}`); return p ? `${f(p.difficulty, 0)} (${f(p.ceiling, 1)})` : "·"; }).join(" | ")} |`));
  }
  const s = r.summary;
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
    ["rate4", 6, x => f(x.rate4)], ["rate8", 6, x => f(x.rate8)], ["g10", 6, x => f(x.greedy10, 1)], ["g20", 6, x => f(x.greedy20, 1)], ["unif", 6, x => (x.uniformTop.length === sp.S ? "all" : x.uniformTop.length > 4 ? `${x.uniformTop.length}` : x.uniformTop.join("") || "-")], ["reach16", 8, x => f(x.reach16)], ["to90", 5, x => f(x.movesTo90, 0)],
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
  const s = r.summary;
  console.log(`\npool: rate max/min ${f(s.rateRatio)} (cv ${f(s.rateCv)}), reach16 max/min ${f(s.reachRatio)}, card max/min ${f(s.cardBitsRatio)}, `
    + `difficulty max ${f(s.difficultyMax, 1)} spread ${f(s.difficultySpread, 1)}, worst pair ${s.worstPair || "-"} ${f(s.worstPairDifficulty, 1)}, `
    + `min ceiling ${f(s.minCeiling)}, dominated: ${s.dominated.join(", ") || "none"}`);
  const fails = verdict(r);
  console.log(fails.length ? `\nsymmetric beginner pool (SYMMETRIC_POOL): FAILS ${fails.length}\n  ${fails.join("\n  ")}` : "\nsymmetric beginner pool (SYMMETRIC_POOL): passes");
}
