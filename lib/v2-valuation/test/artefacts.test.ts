/** Committed artefacts are intact (spec §7.6): each one's content hash matches its contents and its rule key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { contentHash, type Artefact } from "../src/artefact.ts";
import { ruleKey } from "../src/estimate.ts";
import { findVariant } from "../src/registry.ts";

const DIR = join(import.meta.dirname, "..", "artefacts");
const files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".json") ? [p] : []; });

test("every committed artefact matches its hash and its rule key", () => {
  const all = existsSync(DIR) ? files(DIR) : [];
  assert.ok(all.length >= 4);
  for (const f of all) {
    const a = JSON.parse(readFileSync(f, "utf8")) as Artefact;
    const { contentHash: h, ...body } = a;
    assert.equal(contentHash(body), h, f);
    const { type, variant } = findVariant(a.variant);
    assert.equal(a.ruleKey, ruleKey(type, variant, a.family, a.params, a.layers), `${f}: stale variant or object type version`);
  }
});
