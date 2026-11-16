/** The object types valuation knows about. Adding a type is a line here (spec §1). */
import type { ObjectType } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";
import { bigGridType, gridType } from "@workspace/v2-grid";
import { pairType } from "@workspace/v2-pair";
import { BOARD_TYPES } from "@workspace/v2-grid-boards";

export const objectTypes: readonly ObjectType<any>[] = [lineType, gridType, pairType, ...BOARD_TYPES, bigGridType];

export function findVariant(id: string) {
  for (const type of objectTypes) {
    const variant = type.variants.find(v => v.id === id);
    if (variant) return { type, variant };
  }
  throw new Error(`Unknown variant ${id}`);
}
