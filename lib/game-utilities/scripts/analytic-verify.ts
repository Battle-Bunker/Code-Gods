/**
 * Verify every analytic solution (src/analytic) against empirical calibration tables.
 *
 *   node --experimental-strip-types scripts/analytic-verify.ts [table dir …] [--family id] [--md]
 *
 * Default dir: data/calibration/v1. Prints one line per (family, canonical params, instance) and a per-family
 * summary (shapes, levels, max |Δbits|, max z); --md prints the summary as the Markdown table the docs use.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { instantiateKey, type CalibrationFile } from "../src/calibration.ts";
import { analyticLevels } from "../src/analytic/index.ts";
import { compareTable } from "../src/analytic/compare.ts";

const args = process.argv.slice(2);
const md = args.includes("--md"), verbose = args.includes("--verbose");
const fi = args.indexOf("--family"), only = fi >= 0 ? args[fi + 1].split(",") : null;
const dirs = args.filter((a, i) => !a.startsWith("--") && (fi < 0 || i !== fi + 1));
if (!dirs.length) dirs.push(new URL("../data/calibration/v1", import.meta.url).pathname);

interface Agg { shapes: Set<string>; tables: number; levels: number; maxD: number; maxZ: number; bodyZ: number; tailD: number; worst: string }
const agg = new Map<string, Agg>();
for (const dir of dirs) {
  for (const name of readdirSync(dir).filter(n => n.endsWith(".json") && n !== "manifest.json").sort()) {
    const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as CalibrationFile;
    const inst = instantiateKey(file.instance);
    for (const t of file.tables) {
      if (only && !only.includes(t.family)) continue;
      if (t.prior) continue;
      const L = analyticLevels(t.family, t.canonicalParams, inst);
      if (!L) continue;
      const c = compareTable(t, L);
      const k = t.family;
      const a = agg.get(k) ?? { shapes: new Set(), tables: 0, levels: 0, maxD: 0, maxZ: 0, bodyZ: 0, tailD: 0, worst: "" };
      a.shapes.add(file.instance); a.tables++; a.levels += c.levels;
      a.maxD = Math.max(a.maxD, c.maxAbsDelta); a.bodyZ = Math.max(a.bodyZ, c.bodyZ); a.tailD = Math.max(a.tailD, c.tailDelta);
      if (c.maxZ >= a.maxZ) { a.maxZ = c.maxZ; a.worst = `${file.instance} ${JSON.stringify(t.canonicalParams)} @${JSON.stringify(c.worst.ordinal)} table ${c.worst.table.toFixed(3)} analytic ${c.worst.analytic.toFixed(3)}`; }
      agg.set(k, a);
      if (verbose) console.log(`${k} ${file.instance} ${JSON.stringify(t.canonicalParams)} levels=${c.levels} maxΔ=${c.maxAbsDelta.toFixed(4)} maxZ=${c.maxZ.toFixed(2)} worst@${JSON.stringify(c.worst.ordinal)} ${c.worst.table.toFixed(3)} vs ${c.worst.analytic.toFixed(3)}`);
    }
  }
}
if (md) {
  console.log("| family | shapes | tables | levels | max \\|Δbits\\| | max z | body max z | tail max \\|Δbits\\| |");
  console.log("|---|---|---|---|---|---|---|---|");
}
for (const [k, a] of [...agg.entries()].sort()) {
  if (md) console.log(`| \`${k}\` | ${a.shapes.size} | ${a.tables} | ${a.levels} | ${a.maxD.toFixed(3)} | ${a.maxZ.toFixed(1)} | ${a.bodyZ.toFixed(1)} | ${a.tailD.toFixed(2)} |`);
  else console.log(`${k.padEnd(22)} shapes=${a.shapes.size} tables=${a.tables} levels=${a.levels} maxΔ=${a.maxD.toFixed(4)} maxZ=${a.maxZ.toFixed(2)} bodyZ=${a.bodyZ.toFixed(2)} tailΔ=${a.tailD.toFixed(2)}  worst: ${a.worst}`);
}
