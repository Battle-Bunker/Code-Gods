/**
 * The viewer's dealt rule as the view components take it (`RuleRef` of lib/v2-views): the family, parameters and
 * tie-breaker the server dealt (`v2/play:myRule`), resolved against the deployed object type (lines, grids). The browser
 * never scores for the server: this is for drawing the viewer's own annotations (integration plan §3.1).
 */
import type { RuleFamily, Score } from "@workspace/v2-core";
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

/** A rule's worth at a score, with bounds: the value-table era's lookup. Rules are scored by energy now (decision 50). */
export type ValueOf = (u: Score) => { bits: number; lo: number; hi: number };
/** Just the bits of a value lookup: what the faces take. */
export const bitsOf = (value: ValueOf | null): ((u: Score) => number) | null => (value ? (u: Score) => value(u).bits : null);

/** A score alone has no worth under the energy measure (owner decision 50): always null (no rule has a table). */
export function valueOf(..._legacy: unknown[]): ValueOf | null {
  return null;
}

/**
 * A state on the wire as its object type holds it: the game's variant decides the type; without one, the wire's shape
 * does (a grid's rows are joined by "/", a line is `a,b,c;…`).
 */
export const decodeState = (wire: string, variantId?: string | null): any =>
  (variantId ? objectTypeOf(variantId) : wire.includes("/") ? gridType : lineType).decode(wire);
