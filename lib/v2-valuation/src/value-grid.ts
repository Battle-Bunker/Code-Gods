/**
 * Value functions for grid rules (owner decision 23; value.ts holds the machinery). A grid board's bits are the survival
 * of the stationary law at its actual utilities, −log2 π{x : utility(x) ≥ utility(board)}, with no thresholds.
 *
 * - A family that declares units (lib/v2-grid sums.ts) has its whole utility distribution exactly: the convolution of
 *   its units' laws (exact-grid.ts), so every attainable score is a knot with lo = hi.
 * - Any other family is sampled by plain draws from π (each cell independently), so every weight is 1 and a score's
 *   survival interval is binomial, calibrated by construction. Importance sampling (grid-draws.ts) is not used here: its
 *   intervals failed calibration against the exact families (grids.md §5.2: per-cell proposals miss whole regions at rare
 *   scores, and no constant inflation fixes that). Scores rarer than the draws reach take the marked extrapolated tail.
 */
import { canonicalJson, evaluateObject, hashHex, scoreOf, tieBreakerId, type ObjectType, type RuleFamily, type Score, type TieBreaker, type Variant } from "@workspace/v2-core";
import { gridSums, type GridState } from "@workspace/v2-grid";
import { ruleKey } from "./estimate.ts";
import { gridJointLaw } from "./exact-grid.ts";
import { cellProbability, gridParams } from "@workspace/v2-grid";
import { knotsFrom, massOracle, sampledOracle, tailOf, VALUE_CONFIG, type Oracle, type ValueConfig, type ValueFunction } from "./value.ts";
import { rng, type Rng } from "@workspace/v2-core";

/** Plain draws from π for a sampled grid family: certifies scores down to about log2(draws / minSupport) bits. */
export const GRID_DRAWS = 2_000_000;

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
    const n = options.draws ?? GRID_DRAWS;
    const draw = drawFromPi(variant, rng("grid-value", seed, family.id, JSON.stringify(params), String(tb), variant.id));
    const draws: { u: Score; w: number }[] = [];
    for (let i = 0; i < n; i++) draws.push({ u: utility(draw()), w: 1 });
    sampled = { draws: n, accepted: n, ess: n };
    oracles.push(sampledOracle("plain draws from π", draws));
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

/** A board drawn exactly from π: each cell independently from p(v). */
export function drawFromPi(variant: Variant, r: Rng): () => number[] {
  const { size, cap } = gridParams(variant);
  const p = Array.from({ length: cap + 1 }, (_, v) => cellProbability(v, variant));
  const cell = () => { let u = r.unit(), v = 0; while (v < cap && u >= p[v]!) { u -= p[v]!; v++; } return v; };
  return () => Array.from({ length: size * size }, cell);
}
