/**
 * pnpm --filter @workspace/v2-valuation values -- [--variant line-z] [--family id] [--tie-breaker id|none] [--draws n] [--all-params] [--where json] [--params json] [--seed s] [--write]
 *
 * Builds value functions (owner decision 23; value.ts, value-grid.ts) for the rules on a line, grid or two-line variant: each family's first dealable
 * parameters (every dealable parameter set with --all-params; with --where '{"T":18}', those that match it), once per tie-breaker dealt there. --draws sets the direct draws per tilt (default: VALUE_CONFIG's). Prints each one's knots in brief; --write stores it under
 * values/<variant>/<family>/<params hash>-<tie-breaker>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashHex, tieBreakersOn, type RuleFamily } from "@workspace/v2-core";
import { findVariant } from "./registry.ts";
import { lineValueFunction } from "./value.ts";
import { gridValueFunction } from "./value-grid.ts";
import { pairValueFunction } from "./value-pair.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
const { type, variant } = findVariant(opt("variant") ?? "line-z");
const families = (type.families as RuleFamily<any, unknown>[]).filter(f => !opt("family") || f.id === opt("family"));
if (!families.length) throw new Error(`No family ${opt("family")}`);
const tbOpt = opt("tie-breaker");
const ROOT = join(import.meta.dirname, "..");

const where = opt("where") ? (JSON.parse(opt("where")!) as Record<string, unknown>) : null;
const matches = (p: unknown) => !where || Object.entries(where).every(([k, v]) => (p as Record<string, unknown>)[k] === v);
// --params '[{"q":11,"r":1}]': exactly these parameter sets (candidates to measure before they are dealt).
const explicit = opt("params") ? (JSON.parse(opt("params")!) as unknown[]) : null;
const paramsOf = (family: RuleFamily<any, unknown>) =>
  explicit ?? (args.includes("--all-params") ? family.dealable(variant).filter(matches) : family.dealable(variant).slice(0, 1));
for (const family of families) for (const params of paramsOf(family)) {
  const choices: (string | null)[] = tbOpt ? [tbOpt === "none" ? null : tbOpt] : tieBreakersOn(family, variant).length ? tieBreakersOn(family, variant).map(t => t.id) : [null];
  for (const tieBreaker of choices) {
    const t = Date.now();
    const vf = type.id === "pair"
      ? pairValueFunction(family, params, variant, { tieBreaker, ...(opt("seed") ? { seed: opt("seed")! } : {}), ...(opt("draws") ? { config: { drawsPerTilt: Number(opt("draws")) } } : {}) })
      : type.id === "grid"
      ? gridValueFunction(type as never, family, params, variant, { tieBreaker, ...(opt("seed") ? { seed: opt("seed")! } : {}), ...(opt("draws") ? { draws: Number(opt("draws")) } : {}) })
      : lineValueFunction(family, params, variant, { tieBreaker, config: opt("draws") ? { drawsPerTilt: Number(opt("draws")) } : {} });
    const best = vf.knots[vf.knots.length - 1]!;
    console.log(`${family.id} ${canonicalJson(params)} + ${vf.tieBreaker} on ${variant.id}: ${vf.knots.length} knots in ${((Date.now() - t) / 1000).toFixed(1)} s; ` +
      `best ${JSON.stringify(best.u)} = ${best.bits} bits [${best.lo}, ${best.hi}] (${best.source}); exact: ${vf.diagnostics.exact.map(e => e.name).join(", ") || "none"}; ` +
      `draws ${vf.diagnostics.sampled?.accepted ?? 0}, ESS ${vf.diagnostics.sampled?.ess ?? 0}; tail ${vf.tail.secondary.slope.toFixed(3)} ${vf.tail.secondary.form} on the secondary, ${vf.tail.primary.slope.toFixed(3)} ${vf.tail.primary.form} on the primary`);
    if (args.includes("--write")) {
      const dir = join(ROOT, "values", variant.id, family.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${hashHex(canonicalJson(params))}-${vf.tieBreaker}.json`), JSON.stringify(vf) + "\n");
    }
  }
}
