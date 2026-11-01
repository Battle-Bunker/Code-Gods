/**
 * Recomputes `meta.topReached` (the exemplar's ordinal is at or below the table's top level) for every shipped table
 * of the given families, leaving everything else byte-identical. Needed after an exemplar changes: the table key does
 * not cover the exemplar, so the tables stay fresh but the flag goes stale (test/calibration.test.ts checks it).
 *
 *   node --experimental-strip-types scripts/refresh-top-reached.ts <family,…> [dir]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { context, evaluator, family } from "../src/catalog.ts";
import { CALIBRATION_FORMAT, cmpOrdinal, instantiateKey, tableOrder, type CalibrationFile } from "../src/calibration.ts";
import { tableJson } from "./estimator.ts";

const [list, dirArg] = process.argv.slice(2);
if (!list) throw new Error("usage: refresh-top-reached.ts <family,…> [dir]");
const ids = new Set(list.split(","));
const dir = dirArg ?? new URL(`../data/calibration/${CALIBRATION_FORMAT}`, import.meta.url).pathname;
let changed = 0;
for (const name of readdirSync(dir).filter(n => n.endsWith(".json") && n !== "manifest.json")) {
  const path = join(dir, name), file = JSON.parse(readFileSync(path, "utf8")) as CalibrationFile;
  const inst = instantiateKey(file.instance), ctx = context(inst);
  let dirty = false;
  const tables = file.tables.map(t => {
    const f = family(t.family);
    if (!ids.has(t.family) || !f.exemplar) return t;
    const top = t.levels[t.levels.length - 1][0];
    const reached = cmpOrdinal(evaluator({ familyId: t.family, params: t.canonicalParams }, inst)(f.exemplar(t.canonicalParams, ctx)), top) <= 0;
    if (reached === t.meta.topReached) return t;
    dirty = true; changed++;
    return { ...t, meta: { ...t.meta, topReached: reached } };
  });
  if (dirty) writeFileSync(path, `{"format":${JSON.stringify(CALIBRATION_FORMAT)},"instance":${JSON.stringify(file.instance)},"tables":[\n`
    + [...tables].sort(tableOrder).map(tableJson).join(",\n") + "\n]}\n");
}
console.error(`${changed} tables' topReached refreshed`);
