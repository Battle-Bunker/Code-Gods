/**
 * The object types this build can draw (lines, grids, coloured grids, pairs of lines), and what the app calls each: a game's variant decides its type,
 * as on the server (convex/v2/world.ts typeOf). "Grid" is the noun everywhere in a game of grids (ux-lessons 2.8).
 */
import { withPhysics, type ObjectType, type Variant } from "@workspace/v2-core";
import { physicsForVariant } from "@workspace/v2-economy";
import { lineType } from "@workspace/v2-linear";
import { gridType } from "@workspace/v2-grid";
import { pairType } from "@workspace/v2-pair";
import { BOARD_TYPES } from "@workspace/v2-grid-boards";

export const OBJECT_TYPES: readonly ObjectType<any>[] = [lineType, gridType, pairType, ...BOARD_TYPES];

/** The type a variant belongs to (lines when this build does not know the variant). */
export function objectTypeOf(variantId?: string | null): ObjectType<any> {
  return OBJECT_TYPES.find(t => t.variants.some(v => v.id === variantId)) ?? lineType;
}

/** A variant by id, from every type (the first line variant when this build does not know it). */
const withSettings = new Map<string, Variant>();
/** A variant by id, from every type (the first line variant when this build does not know it), with its configuration's physics. */
export function variantOf(id: string): Variant {
  const known = OBJECT_TYPES.some(t => t.variants.some(x => x.id === id));
  const key = known ? id : lineType.variants[0]!.id;
  let v = withSettings.get(key);
  if (!v) {
    let base: Variant = lineType.variants[0]!;
    for (const t of OBJECT_TYPES) { const x = t.variants.find(y => y.id === key); if (x) { base = x; break; } }
    const physics = physicsForVariant(key);
    v = physics ? withPhysics(base, physics) : base;
    withSettings.set(key, v);
  }
  return v;
}

export interface ObjectWord { readonly one: string; readonly One: string; readonly many: string; readonly Many: string }
const WORDS: Readonly<Record<string, ObjectWord>> = {
  line: { one: "line", One: "Line", many: "lines", Many: "Lines" },
  grid: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
  // The old game's coloured boards (lib/v2-grid-boards), one type per size: "grid" to a player, as the digit board.
  board4: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
  board5: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
  board6: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
  board7: { one: "grid", One: "Grid", many: "grids", Many: "Grids" },
  pair: { one: "pair of lines", One: "Pair of lines", many: "pairs of lines", Many: "Pairs of lines" },
};
/** What a game of this variant calls its objects. */
export const objectWord = (variantId?: string | null): ObjectWord => WORDS[objectTypeOf(variantId).id] ?? WORDS.line!;

/** A spectator's or a replay viewer's representation when there is no rule: the type's first. */
export const defaultRepOf = (variantId?: string | null): string => objectTypeOf(variantId).representations[0]!.id;
