/**
 * Value functions on two-line systems (docs/engine-v2/two-line-systems.md §5): direct draws from π only (owner decision
 * 22: no exact sums yet), the same weighted mixture of tilted laws, intervals and tails as lines (value.ts).
 */
import { canonicalJson, hashHex, tieBreakerId, type ObjectType, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";
import { pairLaw, pairType, type PairState } from "@workspace/v2-pair";
import { knotsFrom, layerMeasures, sampledDraws, sampledOracle, TAIL_CEILING, tailOf, VALUE_CONFIG, type ValueConfig, type ValueFunction } from "./value.ts";
import { ruleKey } from "./keys.ts";

/**
 * About one raw draw in twenty-five is a canonical pair of different lines (a line is canonical in about one in five),
 * so a pair takes five times line-q's draws per tilt for a comparable sample.
 */
export const PAIR_DRAWS_PER_TILT = 300_000;

export function pairValueFunction<P>(family: RuleFamily<PairState, P>, params: P, variant: Variant,
  options: { tieBreaker?: TieBreaker; seed?: string; config?: Partial<ValueConfig> } = {}): ValueFunction {
  const cfg = { ...VALUE_CONFIG, drawsPerTilt: PAIR_DRAWS_PER_TILT, ...options.config };
  const seed = options.seed ?? "v2";
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const { draws, total } = sampledDraws(pairType, pairLaw(variant), family, params, variant, tb, cfg, seed);
  const W = draws.reduce((a, d) => a + d.w, 0), W2 = draws.reduce((a, d) => a + d.w * d.w, 0);
  const sampled = { draws: total, accepted: draws.length, ess: Math.round(W2 > 0 ? (W * W) / W2 : 0) };
  const { knots, candidates } = knotsFrom([sampledOracle("direct draws", draws)], cfg);
  const body = {
    schema: 7 as const, kind: "value-function" as const,
    ruleKey: ruleKey(pairType as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: pairType.id, objectTypeVersion: pairType.version, variant: variant.id, variantHash: hashHex(canonicalJson(variant)),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots, TAIL_CEILING, layerMeasures(family, tb)),
    diagnostics: { exact: [], sampled, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}
