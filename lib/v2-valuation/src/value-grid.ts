/**
 * Value functions for grid rules (owner decision 23; value.ts holds the machinery). A grid board's bits are the survival
 * of the stationary law at its actual utilities, −log2 π{x : utility(x) ≥ utility(board)}, with no thresholds.
 *
 * - A family that declares units (lib/v2-grid sums.ts) has its whole utility distribution exactly: the convolution of
 *   its units' laws (exact-grid.ts), so every attainable score is a knot with lo = hi.
 * - Any other family is sampled: boards drawn from π and from proposals adapted towards the best utilities
 *   (grid-draws.ts), weighted exactly and self-normalised (sampledOracle).
 */
import { canonicalJson, evaluateObject, hashHex, scoreOf, tieBreakerId, type ObjectType, type RuleFamily, type Score, type TieBreaker, type Variant } from "@workspace/v2-core";
import { gridSums, type GridState } from "@workspace/v2-grid";
import { ruleKey } from "./estimate.ts";
import { gridJointLaw } from "./exact-grid.ts";
import { DRAW_CONFIG, GridMixture } from "./grid-draws.ts";
import { knotsFrom, massOracle, sampledOracle, tailOf, VALUE_CONFIG, type Oracle, type ValueConfig, type ValueFunction } from "./value.ts";
import { compareScores } from "@workspace/v2-core";

/** Draws for a sampled grid family (after adaptation), on top of VALUE_CONFIG. */
export const GRID_DRAWS = 400_000;

export function gridValueFunction<P>(type: ObjectType<GridState>, family: RuleFamily<GridState, P>, params: P, variant: Variant,
  options: { tieBreaker?: TieBreaker; seed?: string; config?: Partial<ValueConfig>; draws?: number } = {}): ValueFunction {
  const cfg = { ...VALUE_CONFIG, ...options.config };
  const seed = options.seed ?? "v2";
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const oracles: Oracle[] = [];
  const exact: { name: string; outside: number }[] = [];
  let sampled: ValueFunction["diagnostics"]["sampled"] = null;
  if (gridSums[family.id]) {
    const { entries } = gridJointLaw(type, family, params, variant, tb);
    const name = "convolution of the units' laws";
    oracles.push(massOracle(name, entries.map(e => ({ u: scoreOf(family, params, variant, tb, id => e.terms[ruleLayersIndex(family, tb, id)]!).utility, w: e.w })), 0));
    exact.push({ name, outside: 0 });
  } else {
    const utility = (cells: number[]): Score => { const e = evaluateObject(type, family, params, { cells }, variant, tb); return e.utility === undefined ? e.score : e.utility; };
    const mixture = new GridMixture(variant, family.id, ["grid-value", seed, family.id, JSON.stringify(params), String(tb), variant.id]);
    mixture.adapt(utility, compareScores, DRAW_CONFIG);
    const n = options.draws ?? GRID_DRAWS;
    const draws: { u: Score; w: number }[] = [];
    for (let i = 0; i < n; i++) { const d = mixture.draw(); draws.push({ u: utility(d.cells), w: d.w }); }
    const W = draws.reduce((a, d) => a + d.w, 0), W2 = draws.reduce((a, d) => a + d.w * d.w, 0);
    sampled = { draws: n, accepted: n, ess: Math.round(W2 > 0 ? (W * W) / W2 : 0) };
    oracles.push(sampledOracle("direct and importance-sampled draws", draws));
  }
  const { knots, candidates } = knotsFrom(oracles, cfg);
  const body = {
    schema: 6 as const, kind: "value-function" as const,
    ruleKey: ruleKey(type as ObjectType<unknown>, variant, family.id, params, tieBreaker),
    objectType: type.id, objectTypeVersion: type.version, variant: variant.id, variantHash: hashHex(canonicalJson(variant)),
    family: family.id, params, tieBreaker, seed, config: cfg, knots, tail: tailOf(knots),
    diagnostics: { exact, sampled, candidates },
  };
  return { ...body, contentHash: hashHex(canonicalJson(body)) };
}

/** The dealt layers in order (main, then the tie-breaker), as gridJointLaw lists their terms. */
function ruleLayersIndex<P>(family: RuleFamily<GridState, P>, tb: TieBreaker, id: string): number {
  return id === family.main.id ? 0 : tb !== null && id === tb ? 1 : -1;
}
