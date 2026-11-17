/**
 * Values and points (spec §7.7, §8; owner decision 23), pure: each player's rule evaluated on a state, its utility (the
 * plain lexicographic score), the utility's rarity worth n_i in bits from the rule's value function, and
 * π_i = n_i · Σ_{j≠i} n_j. Used by the commit (loop.ts) and the read affordances, so a value has one definition.
 */
import { energyOf, evaluateObject, type EstimateOpts, scoreToWire, type ObjectType } from "@workspace/v2-core";
import { findVariant } from "@workspace/v2-valuation";
import { knownFamily, type DealtRule } from "./deal.ts";
import { births } from "@workspace/v2-agents/pure";

/** A defence goal as dealt (v1, restored; owner-decisions call 1): one of the variant's penalty families. */
export interface DefenceRule { family: string; params: unknown; ruleKey: string }
export interface SeatRule { memberId: string; rule: DealtRule; defence?: DefenceRule }
/** The game's defence weight w (v1's penaltyWeight, default 1). */
export const DEFAULT_PENALTY_WEIGHT = 1;
/** A game's w: its setting, else v1's default. */
export const penaltyWeightOf = (game: { settings: object }): number =>
  (game.settings as { penaltyWeight?: number }).penaltyWeight ?? DEFAULT_PENALTY_WEIGHT;
export interface Value {
  memberId: string; score: (string | null)[] | null; rarityBits: number; want: number; points: number; /** With a defence goal: the badness h in bits. */ badnessBits?: number
  /** The estimator's work budget ran out: rarityBits is an upper bound on the energy, not one it found. */
  bound?: true
}

export { decode, encode, typeOf, variantOf } from "./variants.ts";
import { encode, typeOf, variantOf } from "./variants.ts";

/**
 * One player's utility (as its wire) and its energy under the rule (rarityBits, the field's old name).
 */
export function valueOf(state: unknown, variantId: string, rule: DealtRule, objects: number, defence?: DefenceRule, weight = DEFAULT_PENALTY_WEIGHT, estimate?: EstimateOpts) {
  return valueWithParts(state, variantId, rule, objects, defence, weight, estimate).value;
}

/** A layer's share of a player's own bits (the value-table era's points tree): never produced under the energy measure. */
export interface ValuePart { layer: string; bits: number }

/** valueOf, and the parts of the bits for a tree-valued rule (null otherwise): what a player's own object read shows. */
export function valueWithParts(state: unknown, variantId: string, rule: DealtRule, objects: number, defence?: DefenceRule, weight = DEFAULT_PENALTY_WEIGHT, estimate?: EstimateOpts) {
  const family = knownFamily(rule.family);
  // A family retired since the game was dealt (decision 50) scores nothing.
  if (!family) return { value: { score: null, rarityBits: 0 }, parts: null };
  const type = typeOf(variantId), variant = variantOf(variantId);
  const score = scoreToWire(evaluateObject(type, family as never, rule.params, state, variant, family.dynamic ? null : rule.tieBreaker).score);
  // Every rule is scored by the dynamic measure (owner decision 50): energy is a fresh estimate each time, in energy
  // units (energy.md). A family valued by a table (the value-table era) has no table now and scores 0. Defence goals
  // valued badness through tables: the room refuses them (lobby.ts), and a stored one is ignored.
  void objects; void defence; void weight;
  if (!family.dynamic) return { value: { score, rarityBits: 0 }, parts: null as ValuePart[] | null };
  const e = energyOf(type, family as never, rule.params, state, variant, estimate);
  // The estimator's work budget ran out (physics estimatorWork): the energy is an upper bound, not a found value.
  if (e.bound) console.log(`energy bound, not found: ${rule.family} on ${variantId}`);
  return { value: { score, rarityBits: e.energy, ...(e.bound ? { bound: true as const } : {}) }, parts: null as ValuePart[] | null };
}

/** Every seated player's value of a state, with want (the others' rarity) and points. */
export function valuesOf(state: unknown, variantId: string, seats: readonly SeatRule[], objects: number, weight = DEFAULT_PENALTY_WEIGHT): Value[] {
  const own = seats.map(s => ({ memberId: s.memberId, ...valueOf(state, variantId, s.rule, objects, s.defence, weight) }));
  const total = own.reduce((t, v) => t + v.rarityBits, 0);
  return own.map(v => {
    const want = total - v.rarityBits;
    // v1's floored payoff (defence-goals.md §4): own × max(0, others). Without defence goals bits are ≥ 0 and the floor
    // changes nothing; with them, a seat never scores from others' shared negatives.
    return { ...v, want, points: want > 0 ? v.rarityBits * want : 0 };
  });
}

// ---------------------------------------------------------------- unique objects (spec §2.6, owner decision 24)

/**
 * The object count a game's values assume for the uniqueness correction: its mean over the game (the starting objects
 * and half the births it expects), fixed per game. A live count would make every stored value stale at each birth.
 */
export function valueObjects(settings: { startingObjects: number; worldSeconds: number; economy: { birthsPerSecond: number }; turnover?: { liveCap: number; retiredHolds: boolean; retiredPoints?: string } }): number {
  // Line turnover with retired lines releasing their states (retirement-design.md rule 4): at most the cap hold states.
  if (settings.turnover && !settings.turnover.retiredHolds) return settings.turnover.liveCap;
  return Math.max(1, Math.round(settings.startingObjects + settings.economy.birthsPerSecond * settings.worldSeconds / 2));
}
/** A game's value scope: its variant and object count (the value-table era's uniqueness correction read it). */
export interface ValueScope { variant: string; objects: number }
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
  // A coloured board (board4 … board7) is a grid to a player.
  const id = typeOf(variantId).id.replace(/^board\d+$/, "grid"), one = id === "grid" ? "grid" : id === "pair" ? "pair of lines" : "line";
  return `another ${one} (${id === "pair" ? "pair" : one} ${number}) is already in that state: no two ${id === "pair" ? "pairs of lines" : `${one}s`} may be the same`;
}
