/**
 * pnpm --filter @workspace/v2-valuation sampler-check -- <family> <tie-breaker> [draws per tilt]
 *
 * Checks the direct-draw sampler (value.ts: a mixture of tilted laws, self-normalised) against the exact sums on
 * line-z (spec §7.0): for every certified exact knot of the committed value function, the sampler's estimate, its
 * support (draws at or above the knot) and z = (estimate − exact) / σ, one JSON line each. Run with the configuration
 * used for line-q; the rarity up to which |z| stays normal is the rarity line-q's sampled knots may be certified to
 * (ValueConfig.sampledMaxBits).
 *
 * With --replicates R [--plain]: the calibration test. Scores of one sample share it, so their z values move together;
 * instead, R independently seeded samples are drawn and z is read at fixed scores (exact knots nearest 2, 5, 8, …, 23
 * bits), one JSON line per replicate and score, with the support (draws at or above the score). --plain draws from π
 * alone (tilt 1) with the same total number of draws, for comparison.
 */
import { readdirSync, readFileSync } from "node:fs";
import { findVariant, sampledDraws, sampledOracle, VALUE_CONFIG } from "./index.ts";
import { lineLaw } from "@workspace/v2-linear";
import { scoreFromWire } from "@workspace/v2-core";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? undefined : args[i + 1]; };
const [fam, tb] = args;
const perTilt = Number(opt("draws") ?? args[2] ?? 400000);
const replicates = Number(opt("replicates") ?? 0);
const plain = args.includes("--plain");
const { type, variant } = findVariant("line-z");
const f = (type.families as any[]).find(x => x.id === fam);
const p = f.dealable(variant)[0];
const d = `values/line-z/${fam}/`;
const vf = JSON.parse(readFileSync(d + readdirSync(d).find(x => x.endsWith(`-${tb}.json`))!, "utf8"));
const exactKnots = vf.knots.filter((k: any) => k.source === "exact" && k.u !== null && k.hi - k.lo <= 0.06);
const tilts = plain ? [1] : VALUE_CONFIG.tilts;
const draws = plain ? perTilt * VALUE_CONFIG.tilts.length : perTilt;
const zOf = (o: ReturnType<typeof sampledOracle>, k: any) => {
  const S = 2 ** -k.bits, s = o.survival(scoreFromWire(k.u));
  const sd = (s.estimate - s.lo) / 2;
  const z = sd > 0 ? (s.estimate - S) / sd : (s.estimate === S ? 0 : -Infinity);
  return { bits: k.bits, support: s.support, est: s.estimate > 0 ? -Math.log2(s.estimate) : null, z: Number.isFinite(z) ? +z.toFixed(2) : String(z) };
};
if (replicates > 0) {
  const fixed = [2, 5, 8, 11, 14, 17, 20, 23].map(b => exactKnots.reduce((a: any, k: any) => (Math.abs(k.bits - b) < Math.abs(a.bits - b) ? k : a), exactKnots[0]))
    .filter((k: any, i: number, xs: any[]) => xs.indexOf(k) === i);
  for (let r = 0; r < replicates; r++) {
    const { draws: ds } = sampledDraws(type as any, lineLaw(variant) as any, f, p, variant, tb, { tilts, drawsPerTilt: draws }, `replicate-${r}`);
    const o = sampledOracle("draws", ds);
    for (const k of fixed) console.log(JSON.stringify({ f: fam, tb, plain, r, ...zOf(o, k) }));
  }
} else {
  const { draws: ds } = sampledDraws(type as any, lineLaw(variant) as any, f, p, variant, tb, { tilts, drawsPerTilt: draws }, "calib");
  const o = sampledOracle("draws", ds);
  for (const k of exactKnots) console.log(JSON.stringify({ f: fam, tb, ...zOf(o, k) }));
}
