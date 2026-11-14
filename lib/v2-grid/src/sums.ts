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
}

const cells = (v: Variant) => Array.from({ length: gridParams(v).size ** 2 }, (_, i) => [i]);

/**
 * The plans, by family id. Spread of Three reads overlapping windows and has none: it is sampled (owner decision 22).
 */
export const gridSums: Readonly<Record<string, GridSums>> = {
  "mirrormancer": { units: v => rows(gridParams(v).size) },
  "magic-eighteen": { units: v => rows(gridParams(v).size) },
  "opposite-nines": { units: v => pairs(gridParams(v).size) },
  "two-pair": { units: v => boxes(gridParams(v).size) },
  "strangers": { units: v => boxes(gridParams(v).size) },
  "leapfrog": { units: v => rows(gridParams(v).size) },
  "crosswise-threes": { units: v => { const n = gridParams(v).size; return [...folds(n), ...foldLine(n).map(i => [i])]; } },
  "steady-steps": { units: v => rows(gridParams(v).size) },
  "box-totals": { units: v => boxes(gridParams(v).size) },
  "prime-cells": { units: cells },
};

/**
 * For families with no exact sum, pairs of cells the sampler's proposals should model jointly (v2-valuation
 * sample-grid.ts), because the rule ties them together. Only efficiency depends on them, never correctness.
 */
export const gridSampleBlocks: Readonly<Record<string, (v: Variant) => readonly (readonly number[])[]>> = {};
