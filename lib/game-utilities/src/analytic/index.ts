/**
 * Analytic survival functions, by object type (docs/analytic-calibration/playbook.md).
 *
 * `analyticLevels(familyId, canonicalParams, inst)` returns [ordinal, log2 μ{u ≥ ordinal}] for every attainable
 * ordinal (the `AnalyticSurvival.levels` format of src/analytic.ts), or null when the family has no analytic solution for
 * this draw (the caller falls back to the Monte Carlo + splitting estimator). Every solution is exact under the
 * uniform spawn prior and is verified against the shipped empirical tables (test/analytic-solutions.test.ts,
 * scripts/analytic-verify.ts).
 */
import type { Instantiation } from "@workspace/game-types";
import type { Params } from "../types.ts";
import { GRID_SOLVED, gridLevels } from "./grid.ts";
import { INT_SOLVED, intLevels } from "./int.ts";
import { STRING_SOLVED, stringLevels } from "./string.ts";
import type { Levels } from "./kit.ts";

export type { Levels } from "./kit.ts";

export function analyticLevels(familyId: string, params: Params, inst: Instantiation): Levels | null {
  if (inst.objectType === "Grid") return gridLevels(familyId, params, inst);
  if (inst.objectType === "Int") return intLevels(familyId, params, inst);
  if (inst.objectType === "string") return stringLevels(familyId, params, inst);
  return null;
}

/** Family ids with an analytic solution for at least some draws, by object type. */
export const ANALYTIC_FAMILIES: Readonly<Record<string, readonly string[]>> = { Grid: GRID_SOLVED, Int: INT_SOLVED, string: STRING_SOLVED };
