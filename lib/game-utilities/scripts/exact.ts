/**
 * Exact survival tails for families whose top the splitting kernel cannot climb (grid-lab `exact_log2_tail`):
 * all-or-nothing rules (no intermediate levels to split on) and rules whose high set needs coordinated multi-cell
 * moves. Each entry lists log2 μ{u ≥ t} for every attainable ordinal t, computed from the iid-cell prior, and must
 * reproduce the family's TypeScript card exactly (test/calibration.test.ts checks it against Monte Carlo).
 *
 * The ids are versioned and listed in src/calibration.ts EXACT_TAILS (they are part of the table key): bump the
 * id when a formula changes.
 */
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type Instantiation } from "@workspace/game-types";
import { EXACT_TAILS } from "../src/calibration.ts";
import type { Ordinal, Params } from "../src/types.ts";

export type ExactLevels = readonly (readonly [Ordinal, number])[];

function gridOf(inst: Instantiation) {
  const N = Number(inst.args.size);
  const s = SYMBOL_COMPONENTS[inst.args.symbols as keyof typeof SYMBOL_COMPONENTS];
  const C = COLOUR_COMPONENTS[inst.args.colours as keyof typeof COLOUR_COMPONENTS].count;
  // value → probability of a uniform symbol having it
  const pv = new Map<number, number>();
  for (const v of s.values) pv.set(v, (pv.get(v) ?? 0) + 1 / s.count);
  return { N, n: N * N, C, pv: [...pv.entries()].sort((a, b) => a[0] - b[0]) };
}

const IMPL: Readonly<Record<string, (params: Params, inst: Instantiation) => ExactLevels>> = {
  /** 1 iff every edge cell has your colour: μ = C^−(4N−4). */
  "picture-frame@1": (_p, inst) => {
    const { N, C } = gridOf(inst);
    return [[0, 0], [1, -(4 * N - 4) * Math.log2(C)]];
  },
  /**
   * (gap, mine): gap = how far a unique peak of your colour stands above the rest (0 otherwise); mine = some peak
   * is your colour. μ{≥ (0,1)} = Σ_m [(F(m−1)+p_m)^n − (F(m−1)+p_m(1−q))^n]; μ{≥ (g,1)} = Σ_m n q p_m F(m−g)^(n−1).
   */
  "lone-peak@1": (_p, inst) => {
    const { n, C, pv } = gridOf(inst), q = 1 / C;
    const F = (x: number) => pv.reduce((a, [v, p]) => a + (v <= x ? p : 0), 0);
    const out: [Ordinal, number][] = [[[0, 0], 0]];
    const has = pv.reduce((a, [m, p]) => a + (F(m - 1) + p) ** n - (F(m - 1) + p * (1 - q)) ** n, 0);
    out.push([[0, 1], Math.log2(has)]);
    const vmin = pv[0][0], vmax = pv[pv.length - 1][0];
    for (let g = 1; g <= vmax - vmin; g++) {
      const tot = pv.reduce((a, [m, p]) => a + n * q * p * F(m - g) ** (n - 1), 0);
      if (tot > 0) out.push([[g, 1], Math.log2(tot)]);
    }
    return out;
  },
};

/** The exact level list for a family, or null when it has no exact tail. */
export function exactLevels(familyId: string, params: Params, inst: Instantiation): ExactLevels | null {
  const id = EXACT_TAILS[familyId];
  if (!id) return null;
  const impl = IMPL[id];
  if (!impl) throw new Error(`exact tail ${id} (${familyId}) has no implementation in scripts/exact.ts`);
  return impl(params, inst);
}

export const EXACT_IMPLEMENTATIONS = Object.keys(IMPL);
