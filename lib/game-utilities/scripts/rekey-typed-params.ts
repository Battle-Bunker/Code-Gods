/**
 * One-off migration (typed params, docs/rules-design.md §9): a family that now declares its params by name and type
 * stores them differently (`{ X: 0 }` became `{ colour: "red" }`), so its tables' canonical params, and with them their
 * keys, change, while what the card scores does not. For every table of such a family in the shipped calibration files
 * and the analytic reference archive, this upgrades the canonical params (`upgradeParams`, then `canonical`), checks
 * that the stored key equals the key today's code derives with the OLD params in place of the new (so the card program,
 * prelude, estimator and analytic id are unchanged: only the params' spelling moved), and rewrites the key and params.
 * A table that fails the check is reported and left alone (calibrate --check then fails, forcing a rebuild).
 *
 *   node --experimental-strip-types lib/game-utilities/scripts/rekey-typed-params.ts [--dry]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { context, family, paramsKey, upgradeParams } from "../src/catalog.ts";
import {
  instantiateKey, keyFromParts, manifestEntry, manifestOf, tableKeyParts, tableOrder, UNIFORM_PRIOR, type CalibrationFile, type CalibrationTable,
} from "../src/calibration.ts";
import { fileText, filesIn } from "./calibrate.ts";
import { tableJson } from "./estimator.ts";
import type { Params } from "../src/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const dry = process.argv.includes("--dry");
let moved = 0, kept = 0, stale = 0;

/** The table with today's params and key, the table itself when nothing moves, or null when its key does not check out. */
function rekey(t: CalibrationTable): CalibrationTable | null {
  const f = family(t.family);
  if (!f.upgrade) { kept++; return t; }
  const inst = instantiateKey(t.instance), ctx = context(inst), prior = t.prior ?? UNIFORM_PRIOR;
  const next = f.canonical(upgradeParams(t.family, t.canonicalParams, inst), ctx) as Params;
  if (paramsKey(next) === paramsKey(t.canonicalParams)) { kept++; return t; }
  const parts = tableKeyParts(t.family, next, inst, prior);
  const { exact: _exact, ...mc } = parts;
  const hit = [parts, mc].find(p => keyFromParts({ ...p, params: t.canonicalParams }) === t.key);
  if (!hit) {
    stale++;
    console.error(`key does not check out, left alone: ${t.family} ${JSON.stringify(t.canonicalParams)} on ${t.instance}`);
    return null;
  }
  moved++;
  return { ...t, key: keyFromParts(hit), canonicalParams: next };
}

const v1 = join(root, "calibration", "v1");
let edited = 0;
for (const name of readdirSync(v1).filter(n => n.endsWith(".json") && n !== "manifest.json")) {
  const path = join(v1, name), before = readFileSync(path, "utf8"), file = JSON.parse(before) as CalibrationFile;
  const tables = file.tables.map(t => rekey(t) ?? t);
  const after = fileText(file.instance, tables);
  if (after !== before) { edited++; if (!dry) writeFileSync(path, after); }
}
const ref = join(root, "analytic-reference");
for (const name of readdirSync(ref).filter(n => n.endsWith(".json"))) {
  const path = join(ref, name), before = readFileSync(path, "utf8");
  const file = JSON.parse(before) as { format: string; family: string; tables: CalibrationTable[] };
  const tables = file.tables.map(t => rekey(t) ?? t)
    .sort((a, b) => a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : tableOrder(a, b));
  const after = `{"format":${JSON.stringify(file.format)},"family":${JSON.stringify(file.family)},"tables":[\n${tables.map(tableJson).join(",\n")}\n]}\n`;
  if (after !== before) { edited++; if (!dry) writeFileSync(path, after); }
}
if (!dry) {
  const keys = filesIn(v1, Object.keys((JSON.parse(readFileSync(join(v1, "manifest.json"), "utf8")) as { instances: object }).instances));
  const manifest = manifestOf(keys.map(k => [k, manifestEntry(JSON.parse(readFileSync(join(v1, `${k}.json`), "utf8")) as CalibrationFile)] as const));
  writeFileSync(join(v1, "manifest.json"), JSON.stringify(manifest) + "\n");
}
console.log(`${moved} tables re-keyed, ${kept} unchanged, ${stale} left alone (key did not check out), ${edited} files ${dry ? "would change" : "changed"}`);
