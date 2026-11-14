/**
 * pnpm --filter @workspace/v2-valuation calibrate -- [--variant line-z] [--family id] [--layers k] [--all] [--budget n] [--seed s] [--write]
 *
 * Calibrates rules on a variant and prints bits per rung of the whole ladder, every layer, with error bars (spec §7).
 * --layers deals a prefix of each family's ladder (default: all its layers; the beginner pool deals two). Without --all, each family's first
 * dealable parameters; with --all, every dealable parameter set. --write stores artefacts under artefacts/ and records
 * rules that did not converge in docs/engine-v2/too-hard-backlog.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex, type RuleFamily } from "@workspace/v2-core";
import { calibrate, type Artefact } from "./artefact.ts";
import type { Estimate } from "./estimate.ts";
import { findVariant } from "./registry.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const flag = (name: string): boolean => args.includes(`--${name}`);

const { type, variant } = findVariant(opt("variant") ?? "line-z");
const families = (type.families as RuleFamily<unknown, unknown>[]).filter(f => !opt("family") || f.id === opt("family"));
if (!families.length) throw new Error(`No family ${opt("family")}`);
const budget = opt("budget") ? Number(opt("budget")) : undefined;
const seed = opt("seed") ?? "v2";
const layersOpt = opt("layers") ? Number(opt("layers")) : undefined;

const ROOT = join(import.meta.dirname, "..");
const BACKLOG = join(ROOT, "..", "..", "docs", "engine-v2", "too-hard-backlog.md");

const pad = (s: string, n: number) => s.padEnd(n);
const num = (x: number | null | undefined, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(d));

function report(a: Artefact, e: Estimate, seconds: number): void {
  console.log(`\n${a.family} ${canonicalJson(a.params)} on ${a.variant}: ${a.status} — ${e.steps.toLocaleString("en")} steps, ${seconds.toFixed(1)} s, ${e.samplesPerChain} samples per chain`);
  if (!e.rungs.length) { console.log(`  ${a.reasons.join("; ")}`); return; }
  console.log(`  ${pad("layer", 6)} ${pad("rung", 38)} ${pad("bits", 8)} ${pad("±", 7)} ${pad("split", 7)} direct`);
  e.rungs.forEach((r, i) => {
    const layer = a.rungs[i]!.layer;
    console.log(`  ${pad(layer < 0 ? "" : String(layer + 1), 6)} ${pad(r.label, 38)} ${pad(num(r.bits), 8)} ${pad(i ? num(r.error) : "", 7)} ${pad(num(r.split), 7)} ${num(r.direct)}${r.empty ? "  (empty rung)" : ""}`);
  });
  console.log(`  distinct values where each layer counts: ${e.distinctLevels.map(d => (d === null ? "—" : String(d))).join(", ")}`);
  if (a.curve) {
    const c = a.curve;
    const f = c.model === "log-distance" ? `${num(c.alpha, 4)} − ${num(c.beta, 4)}·log2(d + ${c.delta})` : `${num(c.alpha, 4)} + ${num(c.beta, 4)}·n + ${num(c.gamma, 4)}·n²`;
    console.log(`  curve: V = ${f}${c.snapped ? " (snapped)" : ""}`);
  } else console.log("  curve: none accepted");
  console.log(`  reversibility ${num(e.reversibility)}, mixing ${num(e.mixingSteps, 0)} steps${a.reasons.length ? `; ${a.reasons.join("; ")}` : ""}`);
}

// The backlog is regenerated for the rules calibrated now: their old rows go, and the unconverged ones come back.
const backlogRow = (family: string, params: unknown, variantId: string) => `| ${family} | \`${canonicalJson(params)}\` | ${variantId} |`;
const calibrated: string[] = [];
const backlog: string[] = [];
for (const family of families) {
  const paramSets = flag("all") ? family.dealable(variant) : family.dealable(variant).slice(0, 1);
  for (const params of paramSets) {
    const t = Date.now();
    const { artefact, estimate } = calibrate(type, variant, family, params, { seed, layers: layersOpt, config: budget ? { computeBudget: budget } : {} });
    report(artefact, estimate, (Date.now() - t) / 1000);
    if (flag("write")) {
      const dir = join(ROOT, "artefacts", variant.id, family.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${hashHex(canonicalJson(params))}-l${artefact.layers}.json`), JSON.stringify(artefact, null, 1) + "\n");
      calibrated.push(backlogRow(family.id, params, variant.id));
      if (artefact.status !== "converged") backlog.push(`${backlogRow(family.id, params, variant.id)} ${artefact.status} | ${artefact.reasons.join("; ")} |`);
    }
  }
}
if (flag("write")) {
  const head = "# Too-hard backlog (spec §7.5)\n\nRules whose calibration did not converge, or was flagged, at the budget it ran with. They are not dealable.\n" +
    "`pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of the rules it calibrates.\n\n" +
    "| Family | Params | Variant | Status | Why |\n|---|---|---|---|---|\n";
  const kept = existsSync(BACKLOG)
    ? readFileSync(BACKLOG, "utf8").split("\n").filter(l => l.startsWith("| ") && !l.startsWith("| Family") && !calibrated.some(c => l.startsWith(c)))
    : [];
  writeFileSync(BACKLOG, head + [...kept, ...backlog].map(l => l + "\n").join(""));
}
