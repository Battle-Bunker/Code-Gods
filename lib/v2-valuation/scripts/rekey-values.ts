/**
 * Re-key a variant's stored value functions after a change that does not change its values: its menu (mutators, the
 * which code) or anything else outside its params. A value function reads only the law π ∝ 2^−φ on the variant's params,
 * so the knots stand; only the rule key, the variant hash and the content hash follow the variant.
 *
 *   node --experimental-strip-types scripts/rekey-values.ts line-q
 *
 * Then regenerate the server's copy: node artifacts/engine/scripts/gen-v2-values.mjs.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex } from "@workspace/v2-core";
import { findVariant } from "../src/registry.ts";

const id = process.argv[2];
if (!id) throw new Error("usage: rekey-values.ts <variant>");
const { variant } = findVariant(id);
if (variant.valuesOf) throw new Error(`${id} reads ${variant.valuesOf}'s values: re-key that one`);
const hash = hashHex(canonicalJson(variant));
const root = join(import.meta.dirname, "..", "values", id);
let changed = 0, files = 0;
for (const family of readdirSync(root)) for (const f of readdirSync(join(root, family))) {
  const path = join(root, family, f), v = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  files++;
  if (v.variantHash === hash) continue;
  const key = String(v.ruleKey), at = `/${id}#${String(v.variantHash)}/`;
  if (!key.includes(at)) throw new Error(`${path}: its rule key ${key} does not name ${at}`);
  const { contentHash: _, ...body } = { ...v, ruleKey: key.replace(at, `/${id}#${hash}/`), variantHash: hash };
  writeFileSync(path, JSON.stringify({ ...body, contentHash: hashHex(canonicalJson(body)) }) + "\n");
  changed++;
}
console.log(`${id}: variant hash ${hash}; re-keyed ${changed} of ${files} value functions`);
