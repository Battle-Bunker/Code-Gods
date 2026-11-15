/**
 * A mirrored parameter's value function is its original's (docs/engine-v2/owner-decisions.md, call 18: drifting values
 * by mirrors). The law is even in a and c (C3), and each mirror scores the reflected line exactly as the original scores
 * the line (lib/v2-linear test beginner.test.ts), so the two value functions are equal; sampling them apart would only
 * add noise to the equal-opportunity audit. This rewrites each mirror's file with its original's knots, tail and
 * diagnostics, keeping the mirror's own rule key and params (written new when the mirror has no file yet), with its
 * content hash recomputed.
 *
 *   node --experimental-strip-types scripts/mirror-values.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex } from "@workspace/v2-core";

const DIR = join(import.meta.dirname, "../values/line-q");
/** family → [original params, mirror params]. */
const MIRRORS: Record<string, [object, object][]> = {
  "prime-landing": [[{ ends: 7 }, { ends: 7, side: -1 }]],
  "treasure": [11, 13].map(T => [{ k: 2, T }, { k: 2, T: -T }] as [object, object]),
  "same-on-both-rulers": [[{ T: 6 }, { T: -6 }]],
  "prime-gradient": [[{ ends: 1 }, { ends: 1, side: -1 }]],
  "prime-staircase": [[{ ends: 3 }, { ends: 3, side: -1 }]],
};
for (const [family, pairs] of Object.entries(MIRRORS)) {
  const files = readdirSync(join(DIR, family)).map(f => ({ f, v: JSON.parse(readFileSync(join(DIR, family, f), "utf8")) }));
  for (const [orig, mirror] of pairs) {
    for (const o of files.filter(x => canonicalJson(x.v.params) === canonicalJson(orig))) {
      const m = files.find(x => canonicalJson(x.v.params) === canonicalJson(mirror) && x.v.tieBreaker === o.v.tieBreaker)
        ?? { f: `${hashHex(canonicalJson(mirror))}-${o.v.tieBreaker}.json`, v: { ...o.v, params: mirror, ruleKey: o.v.ruleKey.replace(`/${canonicalJson(orig)}/`, `/${canonicalJson(mirror)}/`) } };
      if (!m.v.ruleKey.includes(`/${canonicalJson(mirror)}/`)) throw new Error(`cannot form the mirror's rule key from ${o.v.ruleKey}`);
      const { contentHash: _h, ...body } = { ...m.v, knots: o.v.knots, tail: o.v.tail, diagnostics: o.v.diagnostics, config: o.v.config, seed: o.v.seed };
      writeFileSync(join(DIR, family, m.f), JSON.stringify({ ...body, contentHash: hashHex(canonicalJson(body)) }) + "\n");
      console.log(`${family} ${canonicalJson(mirror)} ${o.v.tieBreaker} ← ${canonicalJson(orig)}`);
    }
  }
}
