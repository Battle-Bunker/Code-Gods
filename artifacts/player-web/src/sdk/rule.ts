/**
 * The viewer's dealt rule as the view components take it (`RuleRef` of lib/v2-views): the family, parameters and
 * tie-breaker the server dealt (`v2/play:myRule`), resolved against the deployed object type (lines, grids). The browser
 * never scores for the server: this is for drawing the viewer's own annotations (integration plan §3.1).
 */
import type { RuleFamily } from "@workspace/v2-core";
import { gridType } from "@workspace/v2-grid";
import { lineType } from "@workspace/v2-linear";
import type { RuleRef } from "@workspace/v2-views";
import { OBJECT_TYPES, objectTypeOf, variantOf } from "./object-types.ts";
import type { MyRuleRow } from "./types";

export { variantOf };
/** A dealt rule as the views take it, on whichever object type the game plays. */
export type GameRule = RuleRef<any, unknown>;

/** A family by id, from every object type (ids are unique across types). */
export function familyOf(id: string): RuleFamily<any, unknown> | undefined {
  for (const t of OBJECT_TYPES) { const f = t.families.find(x => x.id === id); if (f) return f as RuleFamily<any, unknown>; }
  return undefined;
}

/** The rule a view draws with, or null when this build does not know the family (a deploy behind the server). */
export function ruleRefOf(row: MyRuleRow, variantId: string): GameRule | null {
  const family = familyOf(row.family);
  if (!family) return null;
  return { type: objectTypeOf(variantId), family, params: row.params, variant: variantOf(variantId), tieBreaker: row.tieBreaker };
}

/** The rarity in bits of each rung of the dealt ladder (index = level), as the server calibrated them. */
export const rungRarities = (row: MyRuleRow): number[] => row.ladder.map(r => r.rarityBits);

/**
 * A state on the wire as its object type holds it: the game's variant decides the type; without one, the wire's shape
 * does (a grid's rows are joined by "/", a line is `a,b,c;…`).
 */
export const decodeState = (wire: string, variantId?: string | null): any =>
  (variantId ? objectTypeOf(variantId) : wire.includes("/") ? gridType : lineType).decode(wire);
