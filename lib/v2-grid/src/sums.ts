/**
 * How the exact valuation sums a grid rule's level sets (docs/engine-v2/grids.md §5). The stationary law is a product
 * of independent cells, so a rule whose layers add up over disjoint units of cells has an exact law: the convolution
 * of its units' laws. A family declares its units here; the valuation reads each unit's contribution by evaluating the
 * rule itself, and checks the additivity on boards drawn from the law before using it.
 */
import { gridParams } from "./grid.ts";
import { boxes, pairs, rows } from "./units.ts";
import type { Variant } from "@workspace/v2-core";

export interface GridSums {
  /** Disjoint groups of cell indices; every layer of the family adds up over them. */
  units(variant: Variant): readonly (readonly number[])[];
}

const cells = (v: Variant) => Array.from({ length: gridParams(v).size ** 2 }, (_, i) => [i]);

export const gridSums: Readonly<Record<string, GridSums>> = {
  "row-totals": { units: v => rows(gridParams(v).size) },
  "opposite-pairs": { units: v => pairs(gridParams(v).size) },
  "mirror-rows": { units: v => rows(gridParams(v).size) },
  "steady-steps": { units: v => rows(gridParams(v).size) },
  "box-totals": { units: v => boxes(gridParams(v).size) },
  "prime-cells": { units: cells },
};
