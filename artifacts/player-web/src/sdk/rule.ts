/**
 * The viewer's dealt rule as the view components take it (`RuleRef` of lib/v2-views): the family, parameters and
 * tie-breaker the server dealt (`v2/play:myRule`), resolved against the deployed object type (lines, grids). The browser
 * never scores for the server: this is for drawing the viewer's own annotations (integration plan §3.1).
 */
import type { RuleFamily, Score } from "@workspace/v2-core";
import { valueLookup, withUniqueness, type Lookup } from "@workspace/v2-valuation";
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

/** A rule's worth: its rarity in bits at any score (utility), with certified bounds (owner decision 23). */
export type ValueOf = (u: Score) => Lookup;
/** Just the bits of a value lookup: what the faces take. */
export const bitsOf = (value: ValueOf | null): ((u: Score) => number) | null => (value ? (u: Score) => value(u).bits : null);

/**
 * The value function's knots as a lookup (`v2/play:myRule`'s `value`, or the gallery's `points`, which carry no bounds
 * and read as exact); null without knots (a replay file carries none).
 */
export function valueOf(
  knots: readonly { u: readonly (string | null)[] | null; bits: number; lo?: number; hi?: number }[] | undefined, tail?: unknown,
  /** The game's uniqueness correction (owner decision 24), as `myRule`'s `value.uniqueness` carries it: the server's bits. */
  uniqueness?: { ns: readonly number[]; heldMass: readonly number[]; objects: number },
): ValueOf | null {
  if (!knots?.length) return null;
  const look = valueLookup({
    knots: knots.map(k => ({ u: k.u as (string | null)[] | null, bits: k.bits, lo: k.lo ?? k.bits, hi: k.hi ?? k.bits })),
    tail: (tail ?? { primary: 0, secondary: 0 }) as { primary: number; secondary: number },
  } as never);
  return uniqueness ? withUniqueness(look, uniqueness, uniqueness.objects) : look;
}


/**
 * A state on the wire as its object type holds it: the game's variant decides the type; without one, the wire's shape
 * does (a grid's rows are joined by "/", a line is `a,b,c;…`).
 */
export const decodeState = (wire: string, variantId?: string | null): any =>
  (variantId ? objectTypeOf(variantId) : wire.includes("/") ? gridType : lineType).decode(wire);
