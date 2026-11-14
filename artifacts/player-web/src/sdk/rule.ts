/**
 * The viewer's dealt rule as the view components take it (`RuleRef` of lib/v2-views): the family, parameters and
 * tie-breaker the server dealt (`v2/play:myRule`), resolved against the deployed object type (v2-linear). The browser
 * never scores for the server: this is for drawing the viewer's own annotations (integration plan §3.1).
 */
import type { RuleFamily, Variant } from "@workspace/v2-core";
import { lineType, type LineState } from "@workspace/v2-linear";
import type { RuleRef } from "@workspace/v2-views";
import type { MyRuleRow } from "./types";

export type LineRule = RuleRef<LineState, unknown>;

export function variantOf(id: string): Variant {
  return lineType.variants.find(v => v.id === id) ?? lineType.variants[0]!;
}

export function familyOf(id: string): RuleFamily<LineState, unknown> | undefined {
  return lineType.families.find(f => f.id === id) as RuleFamily<LineState, unknown> | undefined;
}

/** The rule a view draws with, or null when this build does not know the family (a deploy behind the server). */
export function ruleRefOf(row: MyRuleRow, variantId: string): LineRule | null {
  const family = familyOf(row.family);
  if (!family) return null;
  return { type: lineType, family, params: row.params, variant: variantOf(variantId), tieBreaker: row.tieBreaker };
}

/** The ✨ rarity of each rung of the dealt ladder (index = level), as the server calibrated them. */
export const rungRarities = (row: MyRuleRow): number[] => row.ladder.map(r => r.rarityBits);

/** A state on the wire (`a,b,c;…`) as the line type holds it. */
export const decodeState = (wire: string): LineState => lineType.decode(wire);

/** A spectator's or a replay viewer's representation when there is no rule: the variant's first. */
export const DEFAULT_REP = "si";
