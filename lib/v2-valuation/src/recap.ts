/**
 * pnpm --filter @workspace/v2-valuation recap
 *
 * Brings the committed artefacts to the current schema without recalibrating: the cap and the dealable flag
 * (coordinator's call (g)) follow from each artefact's stored rungs, errors, status and config (capOf). Rewrites each
 * artefact with its new content hash, and docs/engine-v2/too-hard-backlog.md from all of them.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@workspace/v2-core";
import { BACKLOG_HEAD, capOf, contentHash, type Artefact } from "./artefact.ts";

const ROOT = join(import.meta.dirname, "..", "artefacts");
const BACKLOG = join(import.meta.dirname, "..", "..", "..", "docs", "engine-v2", "too-hard-backlog.md");
const rows: string[] = [];
let n = 0;
for (const variant of readdirSync(ROOT).sort()) for (const family of readdirSync(join(ROOT, variant)).sort()) {
  for (const file of readdirSync(join(ROOT, variant, family)).filter(f => f.endsWith(".json")).sort()) {
    const path = join(ROOT, variant, family, file);
    const { contentHash: _old, ...a } = JSON.parse(readFileSync(path, "utf8")) as Artefact & { schema: number };
    const { cap, dealable } = capOf(a);
    const body = { ...a, schema: 3 as const, cap, dealable };
    writeFileSync(path, JSON.stringify({ ...body, contentHash: contentHash(body) }, null, 1) + "\n");
    n++;
    if (!dealable) rows.push(`| ${a.family} | \`${canonicalJson(a.params)}\` | ${a.tieBreaker} | ${a.variant} | ${a.status} | ${a.reasons.join("; ") || `fewer than 6 rungs converged`} |`);
  }
}
writeFileSync(BACKLOG, BACKLOG_HEAD + rows.map(l => l + "\n").join(""));
console.log(`${n} artefacts recapped, ${rows.length} not dealable`);
