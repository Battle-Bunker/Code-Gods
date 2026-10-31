/**
 * The family-side hook for the solutions in this folder (src/analytic.ts `AnalyticSurvival`): a family declares
 * `analytic: solvedAnalytic("<family id>")` and gets its exact levels from `analyticLevels`, under the formula id
 * `<family-id>@<version>` (part of the table key: bump FORMULA_VERSIONS when a solution's formula changes, which
 * regenerates exactly that family's tables).
 */
import type { AnalyticSurvival } from "../analytic.ts";
import type { FamilyContext, Params } from "../types.ts";
import { analyticLevels, hasSolution } from "./index.ts";

/** Formula versions that are not 1 (bump one here when that family's solution changes). */
const FORMULA_VERSIONS: Readonly<Record<string, number>> = {};

export const formulaId = (familyId: string): string => `${familyId.replace(/_/g, "-")}@${FORMULA_VERSIONS[familyId] ?? 1}`;

/** Rounding slack for the first level (the summed masses of an exact law are 1 up to ~1e-15). */
const FIRST_LEVEL_SLACK = 1e-9;

/**
 * The `analytic` member for a family solved in src/analytic (null for draws it has no solution for). The formula id is
 * available at once; the levels are computed on first read (calibration.ts reads only the id to build a table key).
 */
export function solvedAnalytic(familyId: string) {
  return (p: Params, _spec: unknown, ctx: FamilyContext): AnalyticSurvival | null => {
    if (!hasSolution(familyId, p, ctx.inst)) return null;
    let memo: AnalyticSurvival["levels"] | undefined;
    return {
      id: formulaId(familyId),
      kind: "exact",
      get levels() {
        if (memo) return memo;
        const L = analyticLevels(familyId, p, ctx.inst);
        if (!L) throw new Error(`${familyId}: solution disappeared for ${JSON.stringify(p)}`);
        // log2 G of the least ordinal is 0 up to rounding; anything further from 0 means the law lost mass: refuse it.
        if (Math.abs(L[0][1]) > FIRST_LEVEL_SLACK) throw new Error(`${familyId}: total mass 2^${L[0][1]} ≠ 1`);
        return (memo = L.map(([o, l], i) => [o, i === 0 ? 0 : Math.min(0, l)] as const));
      },
    };
  };
}
