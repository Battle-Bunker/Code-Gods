/**
 * Re-fit the stored tails of committed line value functions from their own knots, after a change to the tail rule
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
import { layerMeasures, TAIL_CEILING, tailOf } from "../src/value.ts";

const ROOT = join(import.meta.dirname, "../values");
const want = process.argv.slice(2).filter(a => a !== "--");
const families = lineType.families.filter(f => (want.length ? want.includes(f.id) : f.keepsParams));
for (const variant of readdirSync(ROOT).filter(v => v.startsWith("line"))) {
  for (const fam of families) {
    const dir = join(ROOT, variant, fam.id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith(".json"))) {
      const v = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const tail = tailOf(v.knots, TAIL_CEILING, layerMeasures(fam, v.tieBreaker));
      const { contentHash: _h, ...body } = { ...v, tail };
      writeFileSync(join(dir, f), JSON.stringify({ ...body, contentHash: hashHex(canonicalJson(body)) }) + "\n");
      console.log(`${variant} ${fam.id} ${canonicalJson(v.params)} ${v.tieBreaker}: primary ${JSON.stringify(v.tail.primary)} → ${JSON.stringify(tail.primary)}`);
    }
  }
}
