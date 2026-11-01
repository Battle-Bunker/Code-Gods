/**
 * One-off migration (docs/rules-design.md §5): table keys used to hash the whole TypeScript card source, comments
 * included; they now hash its program (`cardProgram`). For every table in the shipped calibration files and the
 * analytic reference archive, this verifies that the stored key equals the OLD derivation for the current code (with
 * or without the analytic id, for any prior) and rewrites it to the NEW one, in place, byte for byte otherwise.
 * A table that matches neither is reported and left alone (it was already stale). Run before rewording any card:
 *
 *   node --experimental-strip-types lib/game-utilities/scripts/rekey-programs.ts [--dry]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@workspace/game-types";
import { context, family } from "../src/catalog.ts";
import { instantiateKey, keyFromParts, tableKeyParts, UNIFORM_PRIOR, type CalibrationTable, type PriorRef } from "../src/calibration.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const dry = process.argv.includes("--dry");
const files = [
  ...readdirSync(join(root, "calibration", "v1")).filter(f => f.endsWith(".json") && f !== "manifest.json").map(f => join(root, "calibration", "v1", f)),
  ...readdirSync(join(root, "analytic-reference")).filter(f => f.endsWith(".json")).map(f => join(root, "analytic-reference", f)),
];

const rename = new Map<string, string>();
let unchanged = 0, stale = 0;
for (const path of files) {
  const tables = (JSON.parse(readFileSync(path, "utf8")) as { tables: (CalibrationTable & { prior?: PriorRef })[] }).tables;
  for (const t of tables) {
    const inst = instantiateKey(t.instance), prior = t.prior ?? UNIFORM_PRIOR;
    const parts = tableKeyParts(t.family, t.canonicalParams, inst, prior);
    const oldCard = sha256(family(t.family).card.typescript(t.canonicalParams, context(inst)));
    const { exact: _exact, ...mc } = parts;
    const candidates = [parts, mc];
    const hit = candidates.find(p => keyFromParts({ ...p, card: oldCard }) === t.key);
    if (hit) {
      const next = keyFromParts(hit);
      if (next === t.key) unchanged++;
      else rename.set(t.key, next);
    } else if (candidates.some(p => keyFromParts(p) === t.key)) unchanged++;
    else { stale++; console.error(`stale before migration, left alone: ${path.split("/").slice(-2).join("/")} ${t.family} ${JSON.stringify(t.canonicalParams)}`); }
  }
}

const manifest = join(root, "calibration", "v1", "manifest.json");
let edited = 0;
for (const path of [...files, manifest]) {
  const before = readFileSync(path, "utf8");
  const after = before.replace(/[0-9a-f]{64}/g, k => rename.get(k) ?? k);
  if (after !== before) { edited++; if (!dry) writeFileSync(path, after); }
}
console.log(`${rename.size} keys rewritten, ${unchanged} already current, ${stale} stale (untouched), ${edited} files ${dry ? "would change" : "changed"}`);
