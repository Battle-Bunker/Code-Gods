/**
 * pnpm --filter @workspace/v2-valuation sampler-check -- <family> <tie-breaker> [draws per tilt]
 *
 * Checks the direct-draw sampler (value.ts: a mixture of tilted laws, self-normalised) against the exact sums on
 * line-z (spec §7.0): for every certified exact knot of the committed value function, the sampler's estimate, its
 * support (draws at or above the knot) and z = (estimate − exact) / σ, one JSON line each. Run with the configuration
 * used for line-q; the rarity up to which |z| stays normal is the rarity line-q's sampled knots may be certified to
 * (ValueConfig.sampledMaxBits).
 */
import { readdirSync, readFileSync } from "node:fs";
import { findVariant, sampledDraws, sampledOracle, VALUE_CONFIG } from "./index.ts";
import { lineLaw } from "@workspace/v2-linear";
import { scoreFromWire } from "@workspace/v2-core";
const [fam, tb, draws] = process.argv.slice(2);
const { type, variant } = findVariant("line-z");
const f = (type.families as any[]).find(x => x.id === fam);
const p = f.dealable(variant)[0];
const d = `values/line-z/${fam}/`;
const vf = JSON.parse(readFileSync(d + readdirSync(d).find(x => x.endsWith(`-${tb}.json`))!, "utf8"));
const { draws: ds } = sampledDraws(type as any, lineLaw(variant) as any, f, p, variant, tb, { tilts: VALUE_CONFIG.tilts, drawsPerTilt: Number(draws ?? 400000) }, "calib");
const o = sampledOracle("draws", ds);
for (const k of vf.knots) {
  if (k.source !== "exact" || k.u === null || k.hi - k.lo > 0.06) continue;
  const S = 2 ** -k.bits, s = o.survival(scoreFromWire(k.u));
  const sd = (s.estimate - s.lo) / 2;
  const z = sd > 0 ? (s.estimate - S) / sd : (s.estimate === S ? 0 : -Infinity);
  console.log(JSON.stringify({ f: fam, tb, bits: k.bits, support: s.support, est: s.estimate > 0 ? -Math.log2(s.estimate) : null, z: Number.isFinite(z) ? +z.toFixed(2) : String(z) }));
}
