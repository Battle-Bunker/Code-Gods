/**
 * Archives the sampling estimator's tables of a family as the reference its analytic is verified against
 * (data/analytic-reference/<family>.json; test/analytic.test.ts "archived reference tables"). A reference table is a
 * Monte Carlo + splitting table keyed by `mcTableKey` (the current key minus the analytic id), so it stays valid
 * exactly as long as the family's card does.
 *
 *   node --experimental-strip-types scripts/analytic-reference.ts <family> [--from dir ...] [--instances "Grid(5,base10,rgby)",...]
 *
 * --from imports every current sampling table of the family found in the given calibration files (e.g. the data of a
 * branch before the analytic replaced them); --instances builds the missing shapes with the default budget
 * (13–30 s each). Existing archived tables with current keys are kept; stale ones are dropped.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { instantiateKey, tableOrder, type CalibrationFile, type CalibrationTable } from "../src/calibration.ts";
import { canonicalSupport, context, family } from "../src/catalog.ts";
import { budgetFor, buildTable, mcTableKey, tableJson } from "./estimator.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REFERENCE_DIR = join(HERE, "..", "data", "analytic-reference");
const FORMAT = "analytic-reference/v1";

const [familyId, ...rest] = process.argv.slice(2);
if (!familyId) throw new Error("usage: analytic-reference.ts <family> [--from dir ...] [--instances keys]");
const f = family(familyId);
const from: string[] = [], instances: string[] = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--from") from.push(rest[++i]);
  else if (rest[i] === "--instances") instances.push(...rest[++i].split(/;|,(?![^(]*\))/));
  else throw new Error(`unknown argument ${rest[i]}`);
}
mkdirSync(REFERENCE_DIR, { recursive: true });
const path = join(REFERENCE_DIR, `${familyId}.json`);
const current = (t: CalibrationTable) => !t.prior && typeof t.estimator.budget !== "string" && t.key === mcTableKey(t.family, t.canonicalParams, instantiateKey(t.instance));
const kept = new Map<string, CalibrationTable>();
if (existsSync(path)) for (const t of (JSON.parse(readFileSync(path, "utf8")) as { tables: CalibrationTable[] }).tables) if (current(t)) kept.set(t.key, t);
for (const dir of from) {
  for (const name of readdirSync(dir).filter(n => n.endsWith(".json") && n !== "manifest.json")) {
    const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as CalibrationFile;
    for (const t of file.tables) if (t.family === familyId && current(t)) kept.set(t.key, t);
  }
}
for (const key of instances) {
  const inst = instantiateKey(key), ctx = context(inst);
  for (const p of canonicalSupport(f, ctx)) {
    const k = mcTableKey(familyId, p, inst);
    if (kept.has(k)) continue;
    const r = buildTable(familyId, p, inst, budgetFor(inst.objectType), { exact: false });
    if (r.table.key !== k) throw new Error("internal: reference key mismatch");
    kept.set(k, JSON.parse(tableJson(r.table)) as CalibrationTable);
    console.error(`${key} ${JSON.stringify(p)}: ${r.table.levels.length} levels, ${r.table.meta.maxBits.toFixed(1)} bits, ${r.seconds.toFixed(1)} s`);
  }
}
const tables = [...kept.values()].sort((a, b) => a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : tableOrder(a, b));
writeFileSync(path, `{"format":${JSON.stringify(FORMAT)},"family":${JSON.stringify(familyId)},"tables":[\n${tables.map(tableJson).join(",\n")}\n]}\n`);
console.error(`${familyId}: ${tables.length} reference tables in ${path}`);
