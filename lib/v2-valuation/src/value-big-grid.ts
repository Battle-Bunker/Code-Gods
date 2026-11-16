/**
 * Value functions on the big-numbers board (lib/v2-grid big-numbers-type.ts): direct draws from the cells' constant
 * field, tilted to reach big numbers (t < 1 is a weaker field), weighted back to π (value.ts sampledDraws), and a tree
 * for the tuple families (tree-value.ts).
 */
import { canonicalJson, hashHex, tieBreakerId, type ObjectType, type RuleFamily, type TieBreaker, type Variant } from "@workspace/v2-core";
import type { Law } from "@workspace/v2-linear";
import { bigCellBits, bigGridParams, bigGridType, bigLog2Z, type GridState } from "@workspace/v2-grid";
import { ruleKey, valuesHash } from "./keys.ts";
import { buildTree, type TreeValue } from "./tree-value.ts";
import { knotsFrom, sampledDraws, sampledOracle, tailOf, VALUE_CONFIG, type ValueConfig, type ValueFunction } from "./value.ts";

/** The board's law with tilts: each cell from the field t·g (α = 1), bits read at the untilted field. */
export function bigGridLaw(variant: Variant): Law<GridState> {
  const { size, g, alpha } = bigGridParams(variant);
  if (alpha !== 1) throw new Error("the big-numbers law draws α = 1 only (a constant field)");
  const L = bigLog2Z(variant), n = size * size;
  return {
    draw(r, t) {
      const cells: number[] = [];
      let bits = 0;
      for (let i = 0; i < n; i++) {
        const x = Math.floor(-Math.log2(1 - r.unit()) / (t * g)) || 0;
        cells.push(x);
        bits += bigCellBits(x, variant);
      }
      return { state: { cells }, bits };
    },
    // log2 Σ_v 2^(−t·φ(v)) per cell = −t·L − log2(1 − 2^(−t·g)).
    log2Norm: t => n * (-t * L - Math.log2(1 - 2 ** (-t * g))),
  };
}

export function bigGridValueFunction<P>(family: RuleFamily<GridState, P>, params: P, variant: Variant,
  options: { tieBreaker?: TieBreaker; seed?: string; config?: Partial<ValueConfig> } = {}): ValueFunction {
  const cfg = { ...VALUE_CONFIG, ...options.config };
  const seed = options.seed ?? "v2";
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const { draws, total } = sampledDraws(bigGridType, bigGridLaw(variant), family, params, variant, tb, cfg, seed);
  const tree: TreeValue | undefined = family.valuation === "tree" ? buildTree(draws) : undefined;
  const W = draws.reduce((a, d) => a + d.w, 0), W2 = draws.reduce((a, d) => a + d.w * d.w, 0);
  const sampled = { draws: total, accepted: draws.length, ess: Math.round(W2 > 0 ? (W * W) / W2 : 0) };
  const { knots, candidates } = knotsFrom([sampledOracle("direct draws", draws)], cfg);
  const body = {
    schema: 7 as const, kind: "value-function" as const,
    ruleKey: ruleKey(bigGridType as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: bigGridType.id, objectTypeVersion: bigGridType.version, variant: variant.id, variantHash: valuesHash(variant),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots),
    ...(tree ? { tree } : {}),
    diagnostics: { exact: [], sampled, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}
