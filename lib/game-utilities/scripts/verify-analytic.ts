/**
 * Verification report: every table in the given calibration files (default: data/calibration/v1 and the archived
 * data/analytic-reference files) whose family has an analytic survival function, compared level by level with it.
 * Prints the markdown tables the docs record (docs/analytic-calibration/*.md) and a pooled depth-band summary.
 *
 *   node --experimental-strip-types scripts/verify-analytic.ts [--tables dir ...] [--families a,b] [--bands-only]
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyticFor, instantiateKey, type CalibrationFile, type CalibrationTable } from "../src/calibration.ts";
import { bandSummaryMarkdown, compareWithTable, comparisonMarkdown, type TableComparison } from "../src/analytic-verify.ts";
import { family } from "../src/catalog.ts";
import { mcTableKey } from "./estimator.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirs: string[] = [], families = new Set<string>();
let bandsOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--tables") dirs.push(args[++i]);
  else if (args[i] === "--families") args[++i].split(",").forEach(f => families.add(f));
  else if (args[i] === "--bands-only") bandsOnly = true;
  else throw new Error(`unknown argument ${args[i]}`);
}
if (!dirs.length) dirs.push(join(HERE, "..", "data", "calibration", "v1"), join(HERE, "..", "data", "analytic-reference"));

const tables: CalibrationTable[] = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  const files = statSync(dir).isDirectory() ? readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json").map(f => join(dir, f)) : [dir];
  for (const path of files) {
    const json = JSON.parse(readFileSync(path, "utf8")) as CalibrationFile | { tables: CalibrationTable[] };
    tables.push(...json.tables);
  }
}
const byFamily = new Map<string, TableComparison[]>();
let skipped = 0;
for (const t of tables) {
  if (t.prior || typeof t.estimator.budget === "string") continue;   // only sampling tables are evidence
  if (families.size && !families.has(t.family)) continue;
  let f; try { f = family(t.family); } catch { continue; }
  if (!f.analytic) continue;
  const inst = instantiateKey(t.instance);
  if (t.key !== mcTableKey(t.family, t.canonicalParams, inst)) { skipped++; continue; }   // the card changed since: not evidence
  const a = analyticFor(t.family, t.canonicalParams, inst);
  if (!a) continue;
  (byFamily.get(t.family) ?? byFamily.set(t.family, []).get(t.family)!).push(compareWithTable(a, t));
}
for (const [fam, rows] of [...byFamily].sort()) {
  const inst = instantiateKey(rows[0].instance);
  const id = analyticFor(fam, tables.find(t => t.family === fam)!.canonicalParams, inst)!.id;
  console.log(`\n### ${fam} (${id}): ${rows.length} tables\n`);
  if (!bandsOnly) console.log(comparisonMarkdown(rows) + "\n");
  console.log(bandSummaryMarkdown(rows));
}
const all = [...byFamily.values()].flat();
console.log(`\n### All ${all.length} comparisons pooled\n`);
console.log(bandSummaryMarkdown(all));
if (skipped) console.error(`\n${skipped} tables skipped: built from a card that has since changed (their keys are not the current estimator's)`);
