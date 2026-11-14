/**
 * How the exact valuation sums a grid rule's level sets (docs/engine-v2/grids.md §5). The stationary law is a product
 * of independent cells, so a rule whose layers add up over disjoint units of cells has an exact law: the convolution
 * of its units' laws. A family declares its units here; the valuation reads each unit's contribution by evaluating the
 * rule itself, and checks the additivity on boards drawn from the law before using it.
 */
import { gridParams } from "./grid.ts";
import { boxes, foldLine, folds, pairs, rows } from "./units.ts";
import type { Variant } from "@workspace/v2-core";

export interface GridSums {
  /** Disjoint groups of cell indices; every layer of the family adds up over them. */
  units(variant: Variant): readonly (readonly number[])[];
  /**
   * The tie-breakers that add up over the units too (absent: all of them). A tie-breaker that reads across units (the
   * columns of a row family, the diagonals, a set of different splits) is not listed: a rule dealt with it is sampled.
   */
  readonly tieBreakers?: readonly string[];
}

/** Whether a rule (a family, and its dealt tie-breaker or none) is valued exactly: its family declares units covering it. */
export function exactlySummed(family: string, tieBreaker: string | null): boolean {
  const plan = gridSums[family];
  return !!plan && (tieBreaker === null || !plan.tieBreakers || plan.tieBreakers.includes(tieBreaker));
}

const cells = (v: Variant) => Array.from({ length: gridParams(v).size ** 2 }, (_, i) => [i]);

/**
 * The plans, by family id. Spread of Three reads overlapping windows and has none: it is sampled (owner decision 22).
 */
export const gridSums: Readonly<Record<string, GridSums>> = {
  "mirrormancer": { units: v => rows(gridParams(v).size), tieBreakers: ["middle", "primes", "zeros", "one-apart", "small-middle"] },
  "magic-eighteen": { units: v => rows(gridParams(v).size), tieBreakers: ["first-column", "primes", "odd", "different-numbers"] },
  "opposite-nines": { units: v => pairs(gridParams(v).size), tieBreakers: ["top-half", "primes", "odd", "big-on-top"] },
  "two-pair": { units: v => boxes(gridParams(v).size), tieBreakers: ["apart", "primes", "corners", "diagonal-pairs", "small-pairs"] },
  "strangers": { units: v => boxes(gridParams(v).size), tieBreakers: ["ones", "primes", "corners", "prime-strangers"] },
  "leapfrog": { units: v => rows(gridParams(v).size), tieBreakers: ["first-column", "primes", "zeros", "same-way", "middle-factors"] },
  "crosswise-threes": {
    units: v => { const n = gridParams(v).size; return [...folds(n), ...foldLine(n).map(i => [i])]; },
    tieBreakers: ["fold-line", "primes", "zeros", "bigger-side", "fold-factors"],
  },
  "steady-steps": { units: v => rows(gridParams(v).size) },
  "box-totals": { units: v => boxes(gridParams(v).size) },
  "prime-cells": { units: cells },
};

