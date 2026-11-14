/**
 * pnpm --filter @workspace/v2-valuation values -- [--variant line-z] [--family id] [--tie-breaker id|none] [--draws n] [--write]
 *
 * Builds value functions (owner decision 23; value.ts) for the rules on a line variant: each family's first dealable
 * parameters, once per tie-breaker dealt there. --draws sets the direct draws per tilt (default: VALUE_CONFIG's). Prints each one's knots in brief; --write stores it under
 * values/<variant>/<family>/<params hash>-<tie-breaker>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex, tieBreakersOn, type RuleFamily } from "@workspace/v2-core";
import type { LineState } from "@workspace/v2-linear";
import { findVariant } from "./registry.ts";
import { lineValueFunction } from "./value.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const { type, variant } = findVariant(opt("variant") ?? "line-z");
if (type.id !== "line") throw new Error("value functions are built for lines here; grids bring their own law");
const families = (type.families as RuleFamily<LineState, unknown>[]).filter(f => !opt("family") || f.id === opt("family"));
if (!families.length) throw new Error(`No family ${opt("family")}`);
const tbOpt = opt("tie-breaker");
const ROOT = join(import.meta.dirname, "..");

for (const family of families) {
  const params = family.dealable(variant)[0];
  if (params === undefined) continue;
  const choices: (string | null)[] = tbOpt ? [tbOpt === "none" ? null : tbOpt] : tieBreakersOn(family, variant).length ? tieBreakersOn(family, variant).map(t => t.id) : [null];
  for (const tieBreaker of choices) {
    const t = Date.now();
    const vf = lineValueFunction(family, params, variant, { tieBreaker, config: opt("draws") ? { drawsPerTilt: Number(opt("draws")) } : {} });
    const best = vf.knots[vf.knots.length - 1]!;
    console.log(`${family.id} ${canonicalJson(params)} + ${vf.tieBreaker} on ${variant.id}: ${vf.knots.length} knots in ${((Date.now() - t) / 1000).toFixed(1)} s; ` +
      `best ${JSON.stringify(best.u)} = ${best.bits} bits [${best.lo}, ${best.hi}] (${best.source}); exact: ${vf.diagnostics.exact.map(e => e.name).join(", ") || "none"}; ` +
      `draws ${vf.diagnostics.sampled?.accepted ?? 0}, ESS ${vf.diagnostics.sampled?.ess ?? 0}; tail ${vf.tail.secondary.toFixed(3)} per secondary, ${vf.tail.primary.toFixed(3)} per primary`);
    if (args.includes("--write")) {
      const dir = join(ROOT, "values", variant.id, family.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${hashHex(canonicalJson(params))}-${vf.tieBreaker}.json`), JSON.stringify(vf) + "\n");
    }
  }
}
