/**
 * Re-fit the stored tails of committed line and pair value functions from their own knots, after a change to the tail rule
 * (src/value.ts fitTail): no resampling, the knots stay as measured.
 *
 *   node --experimental-strip-types scripts/retail.ts [family …]     (default: every ladder family, RuleFamily.keepsParams)
 *
 * It rewrites each file's tail and content hash, and prints the primary tail before and after.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";
import { pairType } from "@workspace/v2-pair";
import { pairTail } from "../src/value-pair.ts";
import { ladderCaps, layerMeasures, TAIL_CEILING, tailOf } from "../src/value.ts";
import { findVariant } from "../src/index.ts";

const ROOT = join(import.meta.dirname, "../values");
const want = process.argv.slice(2).filter(a => a !== "--");
const families = lineType.families.filter(f => (want.length ? want.includes(f.id) : f.keepsParams));
for (const variant of readdirSync(ROOT).filter(v => v.startsWith("line"))) {
  for (const fam of families) {
    const dir = join(ROOT, variant, fam.id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith(".json"))) {
      const v = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const tail = tailOf(v.knots, TAIL_CEILING, layerMeasures(fam, v.tieBreaker), undefined, ladderCaps(lineType, fam, v.params, findVariant(variant).variant));
      const { contentHash: _h, ...body } = { ...v, tail };
      writeFileSync(join(dir, f), JSON.stringify({ ...body, contentHash: hashHex(canonicalJson(body)) }) + "\n");
      console.log(`${variant} ${fam.id} ${canonicalJson(v.params)} ${v.tieBreaker}: primary ${tail.primary.form} ${tail.primary.slope.toFixed(2)}/level, caps ${(tail.primary.caps ?? []).slice(0, 8).map(([u, p]) => `${u.toFixed(2)}:${p.toFixed(0)}`).join(" ")}`);
    }
  }
}

// Pairs (two-line-systems.md §12): every dealt pair family is a ladder; its tail along the level of its base.
const pairFamilies = pairType.families.filter(f => (want.length ? want.includes(f.id) : f.keepsParams));
for (const fam of pairFamilies) {
  const dir = join(ROOT, "pair-q", fam.id);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter(x => x.endsWith(".json"))) {
    const v = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const tb = v.tieBreaker === "none" ? null : v.tieBreaker;
    const fit = pairTail(fam, tb, v.knots, ladderCaps(pairType, fam, v.params, findVariant("pair-q").variant), v.params);
    const tail = v.tail.levels ? { ...fit, levels: v.tail.levels } : fit;   // the per-level tie-breaker comes from draws, not knots
    console.log(`pair-q ${fam.id} ${canonicalJson(v.params)} ${v.tieBreaker}: primary ${v.tail.primary.slope.toFixed(2)} → ${tail.primary.slope.toFixed(2)} a doubling`);
    const { contentHash: _h, ...body } = { ...v, tail };
    writeFileSync(join(dir, f), JSON.stringify({ ...body, contentHash: hashHex(canonicalJson(body)) }) + "\n");
  }
}
