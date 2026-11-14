/**
 * pnpm --filter @workspace/v2-valuation calibrate -- [--variant line-z] [--family id] [--tie-breaker id|none] [--all] [--budget n] [--seed s] [--write]
 *
 * Calibrates rules on a variant and prints bits per rung of the whole ladder, every layer, with error bars (spec §7).
 * Each family is calibrated once per tie-breaker (the main layer plus that alternative), or with --tie-breaker only one. Without --all, each family's first
 * dealable parameters; with --all, every dealable parameter set. --write stores artefacts under artefacts/ and records
 * rules that did not converge in docs/engine-v2/too-hard-backlog.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex, tieBreakersOn, type RuleFamily } from "@workspace/v2-core";
import { BACKLOG_HEAD, calibrate, type Artefact } from "./artefact.ts";
import { findVariant } from "./registry.ts";
import { describeLine } from "@workspace/v2-linear";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const flag = (name: string): boolean => args.includes(`--${name}`);

const { type, variant } = findVariant(opt("variant") ?? "line-z");
const families = (type.families as RuleFamily<unknown, unknown>[]).filter(f => !opt("family") || f.id === opt("family"));
if (!families.length) throw new Error(`No family ${opt("family")}`);
const budget = opt("budget") ? Number(opt("budget")) : undefined;
const seed = opt("seed") ?? "v2";
const tbOpt = opt("tie-breaker");

const ROOT = join(import.meta.dirname, "..");
const BACKLOG = join(ROOT, "..", "..", "docs", "engine-v2", "too-hard-backlog.md");

const pad = (s: string, n: number) => s.padEnd(n);
/** A state's wire, described by the type when it can (lines: "y = 2x + 1"). */
const describe = (wire: string): string => {
  try { const st = type.decode(wire) as { lines?: { a: bigint; b: bigint; c: bigint }[] }; return st.lines ? st.lines.map(describeLine).join("; ") : wire; } catch { return wire; }
};
const num = (x: number | null | undefined, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(d));

function report(a: Artefact, seconds: number): void {
  const sim = a.diagnostics.simulation;
  console.log(`\n${a.family} ${canonicalJson(a.params)} + ${a.tieBreaker} on ${a.variant}: ${a.status} — ${seconds.toFixed(1)} s` +
    `${sim ? `, simulated ${sim.steps.toLocaleString("en")} steps` : ", no simulation"}; dealt to rung ${a.cap} of ${a.rungs.length - 1}${a.dealable ? "" : " (not dealable)"}`);
  if (!a.rungs.length) { console.log(`  ${a.reasons.join("; ")}`); return; }
  console.log(`  ${pad("layer", 6)} ${pad("rung", 46)} ${pad("bits", 8)} ${pad("±", 7)} ${pad("source", 10)} a line there`);
  a.rungs.forEach((r, i) => {
    const example = sim?.examples[i];
    console.log(`  ${pad(r.layer < 0 ? "" : String(r.layer + 1), 6)} ${pad(r.label.slice(0, 46), 46)} ${pad(num(r.bits), 8)} ${pad(i ? num(r.error) : "", 7)} ${pad(r.source ?? "", 10)} ${example ? describe(example) : ""}${r.empty ? "  (empty rung)" : ""}`);
  });
  if (a.reasons.length) console.log(`  ${a.reasons.join("; ")}`);
}

// The backlog is regenerated for the rules calibrated now: their old rows go, and the unconverged ones come back.
const backlogRow = (family: string, params: unknown, tb: string, variantId: string) => `| ${family} | \`${canonicalJson(params)}\` | ${tb} | ${variantId} |`;
const calibrated: string[] = [];
const backlog: string[] = [];
for (const family of families) {
  const paramSets = flag("all") ? family.dealable(variant) : family.dealable(variant).slice(0, 1);
  const choices: (string | null)[] = tbOpt ? [tbOpt === "none" ? null : tbOpt] : tieBreakersOn(family, variant).length ? tieBreakersOn(family, variant).map(t => t.id) : [null];
  for (const params of paramSets) for (const tieBreaker of choices) {
    const t = Date.now();
    const { artefact } = calibrate(type, variant, family, params, { seed, tieBreaker, config: budget ? { computeBudget: budget } : {} });
    report(artefact, (Date.now() - t) / 1000);
    if (flag("write")) {
      const dir = join(ROOT, "artefacts", variant.id, family.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${hashHex(canonicalJson(params))}-${artefact.tieBreaker}.json`), JSON.stringify(artefact, null, 1) + "\n");
      calibrated.push(backlogRow(family.id, params, artefact.tieBreaker, variant.id));
      if (!artefact.dealable) backlog.push(`${backlogRow(family.id, params, artefact.tieBreaker, variant.id)} ${artefact.status} | ${artefact.reasons.join("; ")} |`);
    }
  }
}
if (flag("write")) {
  const kept = existsSync(BACKLOG)
    ? readFileSync(BACKLOG, "utf8").split("\n").filter(l => l.startsWith("| ") && !l.startsWith("| Family") && !calibrated.some(c => l.startsWith(c)))
    : [];
  writeFileSync(BACKLOG, BACKLOG_HEAD + [...kept, ...backlog].map(l => l + "\n").join(""));
}
