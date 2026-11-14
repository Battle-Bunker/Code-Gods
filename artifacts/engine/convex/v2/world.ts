/**
 * Values and points (spec §7.7, §8; owner decision 23), pure: each player's rule evaluated on a state, its utility (the
 * plain lexicographic score), the utility's ✨ worth n_i in bits from the rule's value function, and
 * π_i = n_i · Σ_{j≠i} n_j. Used by the commit (loop.ts) and the read affordances, so a value has one definition.
 */
import { evaluateObject, scoreToWire, type ObjectType } from "@workspace/v2-core";
import { findVariant } from "@workspace/v2-valuation";
import { familyOf, type DealtRule } from "./deal.ts";
import { worthOf, type ValueScope } from "./values.ts";
import { births } from "@workspace/v2-agents/pure";

export interface SeatRule { memberId: string; rule: DealtRule }
export interface Value { memberId: string; score: (string | null)[] | null; rarityBits: number; want: number; points: number }

export const variantOf = (id: string) => findVariant(id).variant;
/** The object type a variant belongs to (lines, grids): every state, birth and host of a game goes through it. */
export const typeOf = (variantId: string): ObjectType<unknown> => findVariant(variantId).type as ObjectType<unknown>;
export const decode = (wire: string, variantId: string): unknown => typeOf(variantId).decode(wire);
export const encode = (state: unknown, variantId: string): string => typeOf(variantId).encode(state);

/** One player's utility (as its wire) and its worth in bits. */
export function valueOf(state: unknown, variantId: string, rule: DealtRule, objects: number) {
  const family = familyOf(rule.family);
  // One-site variants only: a multi-site object has no score yet (per-line bits summed comes next; none is dealt).
  const utility = evaluateObject(typeOf(variantId), family as never, rule.params, state, variantOf(variantId), rule.tieBreaker).score;
  return { score: scoreToWire(utility), rarityBits: worthOf(rule.ruleKey, utility, { variant: variantId, objects }).bits };
}

/** Every seated player's value of a state, with want (the others' rarity) and points. */
export function valuesOf(state: unknown, variantId: string, seats: readonly SeatRule[], objects: number): Value[] {
  const own = seats.map(s => ({ memberId: s.memberId, ...valueOf(state, variantId, s.rule, objects) }));
  const total = own.reduce((t, v) => t + v.rarityBits, 0);
  return own.map(v => {
    const want = total - v.rarityBits;
    return { ...v, want, points: v.rarityBits * want };
  });
}

// ---------------------------------------------------------------- unique objects (spec §2.6, owner decision 24)

/**
 * The object count a game's values assume for the uniqueness correction: its mean over the game (the starting objects
 * and half the births it expects), fixed per game. A live count would make every stored value stale at each birth.
 */
export function valueObjects(settings: { startingObjects: number; worldSeconds: number; economy: { birthsPerSecond: number } }): number {
  return Math.max(1, Math.round(settings.startingObjects + settings.economy.birthsPerSecond * settings.worldSeconds / 2));
}
/** A game's value scope: its variant and `valueObjects`. */
export const scopeOf = (game: { variant: string; settings: Parameters<typeof valueObjects>[0] }): ValueScope => ({ variant: game.variant, objects: valueObjects(game.settings) });

/** Draws a later birth may take: the first not held wins (a commit refuses to place a duplicate). */
export const BIRTH_DRAWS = 8;

/** A birth's candidate states, in the order of its seeded birth walk (encoded). */
export function birthDraws(variantId: string, seed: string, draws = BIRTH_DRAWS): string[] {
  return births(typeOf(variantId), variantOf(variantId), seed, draws).map(s => encode(s, variantId));
}

/** The game's starting objects: the seeded birth walk's draws, skipping any state already drawn (never a duplicate). */
export function distinctBirths(variantId: string, seed: string, count: number): string[] {
  for (let draws = count; ; draws *= 2) {
    const distinct = [...new Set(birthDraws(variantId, seed, draws))];
    if (distinct.length >= count || draws > 64 * count + 64) return distinct.slice(0, count);
  }
}

/** "Another line (line 4) is already in that state": why a move onto a held state is refused. */
export function heldReason(variantId: string, number: number): string {
  const one = typeOf(variantId).id === "grid" ? "grid" : "line";
  return `another ${one} (${one} ${number}) is already in that state: no two ${one}s may be the same`;
}
