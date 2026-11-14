/**
 * Values and points (spec §7.7, §8; owner decision 23), pure: each player's rule evaluated on a state, its utility (the
 * plain lexicographic score), the utility's ✨ worth n_i in bits from the rule's value function, and
 * π_i = n_i · Σ_{j≠i} n_j. Used by the commit (loop.ts) and the read affordances, so a value has one definition.
 */
import { evaluateObject, scoreToWire, type ObjectType } from "@workspace/v2-core";
import { findVariant } from "@workspace/v2-valuation";
import { familyOf, type DealtRule } from "./deal.ts";
import { worthOf } from "./values.ts";

export interface SeatRule { memberId: string; rule: DealtRule }
export interface Value { memberId: string; score: (string | null)[] | null; rarityBits: number; want: number; points: number }

export const variantOf = (id: string) => findVariant(id).variant;
/** The object type a variant belongs to (lines, grids): every state, birth and host of a game goes through it. */
export const typeOf = (variantId: string): ObjectType<unknown> => findVariant(variantId).type as ObjectType<unknown>;
export const decode = (wire: string, variantId: string): unknown => typeOf(variantId).decode(wire);
export const encode = (state: unknown, variantId: string): string => typeOf(variantId).encode(state);

/** One player's utility (as its wire) and its worth in bits. */
export function valueOf(state: unknown, variantId: string, rule: DealtRule) {
  const family = familyOf(rule.family);
  // One-site variants only: a multi-site object's utility comes with decision 23's PR 2 (no such rule is dealt yet).
  const utility = evaluateObject(typeOf(variantId), family as never, rule.params, state, variantOf(variantId), rule.tieBreaker).utility ?? null;
  return { score: scoreToWire(utility), rarityBits: worthOf(rule.ruleKey, utility).bits };
}

/** Every seated player's value of a state, with want (the others' rarity) and points. */
export function valuesOf(state: unknown, variantId: string, seats: readonly SeatRule[]): Value[] {
  const own = seats.map(s => ({ memberId: s.memberId, ...valueOf(state, variantId, s.rule) }));
  const total = own.reduce((t, v) => t + v.rarityBits, 0);
  return own.map(v => {
    const want = total - v.rarityBits;
    return { ...v, want, points: v.rarityBits * want };
  });
}
