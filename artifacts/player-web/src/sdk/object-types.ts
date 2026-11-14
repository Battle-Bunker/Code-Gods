/**
 * The object types this build can draw (lines, grids), and what the app calls each: a game's variant decides its type,
 * as on the server (convex/v2/world.ts typeOf). "Grid" is the noun everywhere in a game of grids (ux-lessons 2.8).
 */
import type { ObjectType, Variant } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";
import { gridType } from "@workspace/v2-grid";

export const OBJECT_TYPES: readonly ObjectType<any>[] = [lineType, gridType];

/** The type a variant belongs to (lines when this build does not know the variant). */
export function objectTypeOf(variantId?: string | null): ObjectType<any> {
  return OBJECT_TYPES.find(t => t.variants.some(v => v.id === variantId)) ?? lineType;
}

/** A variant by id, from every type (the first line variant when this build does not know it). */
export function variantOf(id: string): Variant {
  for (const t of OBJECT_TYPES) { const v = t.variants.find(x => x.id === id); if (v) return v; }
  return lineType.variants[0]!;
}

export interface ObjectWord { readonly one: string; readonly One: string; readonly many: string; readonly Many: string }
const WORDS: Readonly<Record<string, ObjectWord>> = {
  line: { one: "line", One: "Line", many: "lines", Many: "Lines" },
  grid: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
};
/** What a game of this variant calls its objects. */
export const objectWord = (variantId?: string | null): ObjectWord => WORDS[objectTypeOf(variantId).id] ?? WORDS.line!;

/** A spectator's or a replay viewer's representation when there is no rule: the type's first. */
export const defaultRepOf = (variantId?: string | null): string => objectTypeOf(variantId).representations[0]!.id;
