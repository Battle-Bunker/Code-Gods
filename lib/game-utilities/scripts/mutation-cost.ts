/**
 * Mutation-cost prototypes (docs/mutation-cost-design.md): cost tables and the cost-weighted balance re-measurement.
 * Throwaway-grade measurement, not shipped pricing: nothing on the engine's path imports it.
 *
 *   pnpm --filter @workspace/game-utilities mutation-cost [--tables] [--balance] [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/mutation-cost.ts ...)
 *
 *   --tables              print the add / multiply / divide cost tables for Z_10, Z_12, Z_13 (card ranks), Z_16 and
 *                         the palettes, under each candidate model (default when no mode is given)
 *   --balance             climb the beginner stand-in rules (scripts/mutation-cost-beginner-rules.mjs) on a 4×4 digit
 *                         board under each model and report the bits held per energy budget
 *   --rules FILE          another ad-hoc rule module (same format as rule-difficulty --adhoc)
 *   --starts N            start boards per rule (default 12)
 *   --policy P            steepest | per-energy | both (default both)
 *   --beta B              β of energy = W + β·W² (default 0.05)
 *
 * Takes about a minute with --balance (the rules are calibrated on the spot, as rule-difficulty does for ad-hoc rules).
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { instantiate } from "@workspace/game-types";
import { adHocRule, space, type Rule } from "./rule-difficulty-lib.ts";
import {
  BETA, balance, energyOf, meanRetargetEnergy, floorDivideRow, kraftLambda, lee, leeModel, linearModel, leeSpectrum, logModel, multiplyTable, setModel, spread, unitWordLength,
  type CostModel, type Policy,
} from "./mutation-cost-lib.ts";
import type { Ordinal } from "../src/index.ts";

/** A rule module's utility as card source (the same convention as rule-difficulty.ts). */
const sourceOf = (utility: unknown): string => {
  const src = typeof utility === "function" ? utility.toString() : String(utility);
  return /function\s+utility\s*\(/.test(src) ? src : `const utility = (${src});`;
};

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const beta = Number(opt("beta") ?? BETA);
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "∞");
const out = (s = "") => process.stdout.write(s + "\n");
const log = (s: string) => process.stderr.write(s + "\n");

const CELLS = 16;
const modelsFor = (b: number, cells = CELLS): CostModel[] => [
  setModel(cells, b), leeModel("lee-located", cells, b), leeModel("lee-proportional", cells, b), leeModel("lee-diameter", cells, b), logModel(cells, b), linearModel(cells, b),
];

if (flag("tables") || !flag("balance")) tables();
if (flag("balance")) await balanceRun();

function tables() {
  out(`## Add k on a cyclic layer, one cell of a ${CELLS}-cell board (W bits; energy = W + ${beta}·W² in brackets)\n`);
  for (const [name, b] of [["digits base10", 10], ["base12", 12], ["card ranks (13, cyclic)", 13], ["base16", 16], ["rainbow6 (hue wheel)", 6], ["rgby", 4], ["rgb", 3]] as const) {
    const ms = modelsFor(b), ks = Array.from({ length: Math.floor(b / 2) }, (_, i) => i + 1);
    out(`### ${name}: λ Kraft-tight over shifts ${f(kraftLambda(leeSpectrum(b)), 3)}, over (cell, shift) ${f(kraftLambda(leeSpectrum(b), 1 / CELLS), 3)}\n`);
    out(`| model | ${ks.map(k => `±${k}`).join(" | ")} | mean of a random retarget |`);
    out(`|---|${ks.map(() => "--:").join("|")}|--:|`);
    for (const m of ms) {
      let mean = 0;
      for (let x = 0; x < b; x++) for (let y = 0; y < b; y++) if (x !== y) mean += m.cellW(x, y) / (b * (b - 1));
      out(`| ${m.id} | ${ks.map(k => `${f(m.cellW(0, k), 1)} (${f(energyOf(m.cellW(0, k), beta), 1)})`).join(" | ")} | ${f(mean, 1)} |`);
    }
    out();
  }
  out(`## Categorical layer (discrete metric): every change is distance 1\n`);
  out(`| layer | values | located: log2 cells + log2 (b − 1) | today's set (with erasure) |`);
  out(`|---|--:|--:|--:|`);
  for (const [name, b] of [["rgb", 3], ["rgby", 4], ["rainbow6 as plain colours", 6], ["suits", 4], ["mono", 1]] as const) {
    out(`| ${name} | ${b} | ${b > 1 ? f(Math.log2(CELLS) + Math.log2(b - 1)) : "– (no move)"} | ${b > 1 ? f(Math.log2(CELLS) + 2 * Math.log2(b)) : "–"} |`);
  }
  out();
  for (const b of [10, 12, 16]) {
    out(`## Multiply x ↦ m·x mod ${b}\n`);
    const gen = b === 10 ? 3 : b === 12 ? 5 : 3;
    out(`| m | image | erased bits | unit | inverse | word length in ⟨${gen}⟩ | Lee(m − 1) |`);
    out(`|--:|--:|--:|---|--:|--:|--:|`);
    for (const r of multiplyTable(b)) out(`| ${r.m} | ${r.image} | ${f(r.erased)} | ${r.unit ? "yes" : "no"} | ${r.inverse ?? "–"} | ${r.unit ? f(unitWordLength(r.m, gen, b), 0) : "–"} | ${lee(r.m - 1, b)} |`);
    out();
  }
  out(`## Floor division x ↦ ⌊x / m⌋ on 0..9\n`);
  out(`| m | image | erased bits (largest block) | erased bits (mean over x) |`);
  out(`|--:|--:|--:|--:|`);
  for (let m = 2; m <= 9; m++) { const r = floorDivideRow(m, 10); out(`| ${m} | ${r.image} | ${f(r.erasedMax)} | ${f(r.erasedMean)} |`); }
  out();
}

async function balanceRun() {
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), sp = space(inst, "symbol");
  const here = dirname(fileURLToPath(import.meta.url));
  const file = opt("rules") ?? resolve(here, "mutation-cost-beginner-rules.mjs");
  const mod = await import(pathToFileURL(resolve(file)).href) as { rules: { id: string; utility: unknown; top?: Ordinal }[] };
  const rules: Rule[] = mod.rules.map(x => { log(`calibrating ${x.id}`); return adHocRule(x.id, sourceOf(x.utility), inst, { top: x.top }); });
  const nStarts = Number(opt("starts") ?? 12), budgets = [32, 64, 128];
  const policies: Policy[] = opt("policy") === "steepest" ? ["steepest"] : opt("policy") === "per-energy" ? ["per-energy"] : ["steepest", "per-energy"];
  const models = modelsFor(10);
  out(`## Bits held after spending ${budgets.join(" / ")} energy bits (4×4 digits, β = ${beta}, ${nStarts} starts; mean step = Lee distance)\n`);
  out(`Mean energy of one random retarget: ${models.map(m => `${m.id} ${f(meanRetargetEnergy(m, 10, beta), 1)}`).join(", ")}.\n`);
  for (const policy of policies) {
    out(`### policy: ${policy}\n`);
    const results = models.map(m => ({ m, rows: balance(rules, sp, m, policy, budgets, nStarts, beta) }));
    out(`| rule | top | ${results.map(({ m }) => `${m.id}: ${budgets.join(" / ")} · step`).join(" | ")} |`);
    out(`|---|--:|${results.map(() => "---").join("|")}|`);
    for (let i = 0; i < rules.length; i++) {
      out(`| ${rules[i].id} | ${f(rules[i].topBits, 1)} | ${results.map(({ rows }) => { const x = rows[i]; return `${x.bitsAt.map(v => f(v, 1)).join(" / ")} · ${f(x.meanStep, 1)}`; }).join(" | ")} |`);
    }
    for (const j of [0, 1]) {
      const s = results.map(({ rows }) => spread(rows.map(x => x.bitsAt[j] / x.topBits)));
      out(`| **share of top at ${budgets[j]}: mean; max/min; CV** | | ${results.map(({ rows }, k) => `${f(rows.reduce((t, x) => t + x.bitsAt[j] / x.topBits, 0) / rows.length)}; ${f(s[k].ratio)}; ${f(s[k].cv)}`).join(" | ")} |`);
    }
    out();
  }
}
