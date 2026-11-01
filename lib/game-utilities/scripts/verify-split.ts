/**
 * Fidelity of the split estimator (architecture.md §3.2, §9.2): for every family with a verified analytic and every
 * canonical params it covers on the given shapes, builds the sampling table as R replicates merged (`buildTable` with
 * `plan: { replicates: R }`, exact: false, so it is keyed like the archived reference) and compares it with
 *  - the analytic (the truth): the same bands test/analytic.test.ts holds the single-run reference tables to
 *    (`tableViolations`, RMS z ≤ MAX_RMS_Z_BELOW_32 per family below 32 bits), pooled by depth band;
 *  - the single run (the archived reference table of the same key, data/analytic-reference/, or a fresh single build
 *    with --build-single): Δ = split − single at their common ordinals, z = Δ / √(se₁² + se₂²) with the nominal se.
 *
 *   node --experimental-strip-types scripts/verify-split.ts --replicates 8 --instances "Grid(4,base10,rgby)" [--families a,b] [--build-single] [--json out.json]
 *
 * Prints the band summaries (split and single against the analytic) and the split-vs-single agreement; exits 1 when a
 * split table breaks a band.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyticFor, instantiateKey, type CalibrationTable } from "../src/calibration.ts";
import {
  DEPTH_BANDS, MAX_RMS_Z_BELOW_32, bandSummaryMarkdown, compareWithTable, keyOfOrdinal, nominalSe, tableViolations, type TableComparison,
} from "../src/analytic-verify.ts";
import { FAMILIES, canonicalSupport, context } from "../src/catalog.ts";
import { budgetFor, buildTable, mcTableKey, tableJson } from "./estimator.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let R = 8, buildSingle = false, jsonOut: string | undefined;
const instances: string[] = [], families = new Set<string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--replicates") R = Number(args[++i]);
  else if (args[i] === "--instances") instances.push(...args[++i].split(/;|,(?![^(]*\))/));
  else if (args[i] === "--families") args[++i].split(",").forEach(f => families.add(f));
  else if (args[i] === "--build-single") buildSingle = true;
  else if (args[i] === "--json") jsonOut = args[++i];
  else throw new Error(`unknown argument ${args[i]}`);
}
if (!instances.length) throw new Error("--instances is required");

const references = new Map<string, CalibrationTable>();
const referenceOf = (familyId: string): void => {
  const path = join(HERE, "..", "data", "analytic-reference", `${familyId}.json`);
  if (!existsSync(path)) return;
  for (const t of (JSON.parse(readFileSync(path, "utf8")) as { tables: CalibrationTable[] }).tables) references.set(t.key, t);
};

/** Split − single at the ordinals both tables list. */
function agreement(split: CalibrationTable, single: CalibrationTable) {
  const s = new Map(single.levels.map(([o, b]) => [keyOfOrdinal(o), b]));
  let maxAbs = 0, sz2 = 0, n = 0, maxZ = 0;
  const bands = DEPTH_BANDS.map(() => ({ n: 0, sd2: 0, sz2: 0, max: 0 }));
  for (const [o, b] of split.levels) {
    const b1 = s.get(keyOfOrdinal(o));
    if (b1 === undefined) continue;
    const d = b - b1, se = Math.sqrt(nominalSe(split, b) ** 2 + nominalSe(single, b1) ** 2 + 2 * 0.02 ** 2), z = Math.abs(d) / se;
    maxAbs = Math.max(maxAbs, Math.abs(d)); maxZ = Math.max(maxZ, z); sz2 += z * z; n++;
    const bi = DEPTH_BANDS.findIndex(([lo, hi]) => b1 >= lo && b1 < hi);
    if (bi >= 0) { const x = bands[bi]; x.n++; x.sd2 += d * d; x.sz2 += z * z; x.max = Math.max(x.max, Math.abs(d)); }
  }
  return { common: n, maxAbsDelta: maxAbs, maxZ, rmsZ: n ? Math.sqrt(sz2 / n) : 0, bands };
}

const rows: { family: string; params: unknown; instance: string; split: TableComparison; single: TableComparison; agree: ReturnType<typeof agreement>; violations: string[]; seconds: number; topSplit: number; topSingle: number }[] = [];
const bad: string[] = [];
for (const key of instances) {
  const inst = instantiateKey(key), ctx = context(inst);
  for (const f of FAMILIES) {
    if (!f.analytic || f.objectType !== inst.objectType || (families.size && !families.has(f.id))) continue;
    referenceOf(f.id);
    for (const params of canonicalSupport(f, ctx)) {
      const a = analyticFor(f.id, params, inst);
      if (!a) continue;
      const k = mcTableKey(f.id, params, inst);
      let single = references.get(k);
      if (!single && buildSingle) single = JSON.parse(tableJson(buildTable(f.id, params, inst, budgetFor(inst.objectType), { exact: false }).table)) as CalibrationTable;
      if (!single) continue;
      const r = buildTable(f.id, params, inst, budgetFor(inst.objectType), { exact: false, plan: { replicates: R } });
      const split = JSON.parse(tableJson(r.table)) as CalibrationTable;
      const c = compareWithTable(a, split), violations = tableViolations(a, split, c);
      const where = `${f.id} ${JSON.stringify(params)} on ${key}`;
      bad.push(...violations.map(v => `${where}: ${v}`));
      const row = { family: f.id, params, instance: key, split: c, single: compareWithTable(a, single), agree: agreement(split, single), violations, seconds: r.seconds, topSplit: split.meta.maxBits, topSingle: single.meta.maxBits };
      rows.push(row);
      console.error(`${where}: split ${r.seconds.toFixed(1)} s, top ${row.topSplit.toFixed(1)} / single ${row.topSingle.toFixed(1)} bits, vs analytic max|Δ| ${c.maxAbsDelta.toFixed(2)} (single ${row.single.maxAbsDelta.toFixed(2)}), vs single max|Δ| ${row.agree.maxAbsDelta.toFixed(2)} RMS z ${row.agree.rmsZ.toFixed(2)}${violations.length ? " VIOLATION" : ""}`);
    }
  }
}
// The pooled RMS z bound, per family, as the reference test applies it.
for (const fam of new Set(rows.map(r => r.family))) {
  let sz2 = 0, nz = 0;
  for (const r of rows) if (r.family === fam) for (const b of r.split.bands) if (b.band[1] <= 32) { sz2 += b.rmsZ ** 2 * b.levels; nz += b.levels; }
  if (nz && Math.sqrt(sz2 / nz) > MAX_RMS_Z_BELOW_32) bad.push(`${fam}: RMS z over split levels below 32 bits is ${Math.sqrt(sz2 / nz).toFixed(2)} > ${MAX_RMS_Z_BELOW_32}`);
}
console.log(`\n### Split (R = ${R}) against the analytic: ${rows.length} tables on ${instances.join(", ")}\n`);
console.log(bandSummaryMarkdown(rows.map(r => r.split)));
console.log(`\n### Single run (the archived reference) against the analytic, same draws\n`);
console.log(bandSummaryMarkdown(rows.map(r => r.single)));
const acc = DEPTH_BANDS.map(() => ({ n: 0, sd2: 0, sz2: 0, max: 0 }));
for (const r of rows) r.agree.bands.forEach((b, i) => { acc[i].n += b.n; acc[i].sd2 += b.sd2; acc[i].sz2 += b.sz2; acc[i].max = Math.max(acc[i].max, b.max); });
console.log(`\n### Split against single, common ordinals (z with both nominal se)\n`);
console.log("| band (bits) | levels | RMS Δ | max abs Δ | RMS z |\n|---|---|---|---|---|");
acc.forEach((a, i) => { if (a.n) console.log(`| ${DEPTH_BANDS[i][0]}–${Number.isFinite(DEPTH_BANDS[i][1]) ? DEPTH_BANDS[i][1] : ""} | ${a.n} | ${Math.sqrt(a.sd2 / a.n).toFixed(3)} | ${a.max.toFixed(2)} | ${Math.sqrt(a.sz2 / a.n).toFixed(2)} |`); });
const tops = rows.map(r => r.topSplit - r.topSingle);
console.log(`\nTop level, split − single: mean ${(tops.reduce((a, b) => a + b, 0) / Math.max(1, tops.length)).toFixed(2)} bits, min ${Math.min(...tops).toFixed(2)}, max ${Math.max(...tops).toFixed(2)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows.map(r => ({ ...r, split: { ...r.split, bands: undefined }, single: { ...r.single, bands: undefined } }))));
if (bad.length) { console.log(`\n${bad.length} band violations:\n${bad.join("\n")}`); process.exitCode = 1; }
else console.log("\nEvery split table is within the reference bands.");
