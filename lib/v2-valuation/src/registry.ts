/** The object types valuation knows about. Adding a type is a line here (spec §1). */
import type { ObjectType } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";

export const objectTypes: readonly ObjectType<any>[] = [lineType];

export function findVariant(id: string) {
  for (const type of objectTypes) {
    const variant = type.variants.find(v => v.id === id);
    if (variant) return { type, variant };
  }
  throw new Error(`Unknown variant ${id}`);
}
