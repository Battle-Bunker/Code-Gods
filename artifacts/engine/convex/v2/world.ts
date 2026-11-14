/**
 * Values and points (spec §7.7, §8), pure: each player's rule evaluated on a state, its level on the artefact's ladder,
 * the level's ✨ rarity n_i in bits, and π_i = n_i · Σ_{j≠i} n_j. Used by the commit (loop.ts) and the read
 * affordances, so a value has one definition.
 */
import { evaluateObject, levelOf, scoreToWire, type Rung } from "@workspace/v2-core";
import { lineType, type LineState } from "@workspace/v2-linear";
import { findVariant } from "@workspace/v2-valuation";
import { artefactFor, rarityOf } from "./artefacts.ts";
import { artefactLadder, familyOf, type DealtRule } from "./deal.ts";

export interface SeatRule { memberId: string; rule: DealtRule }
export interface Value { memberId: string; score: (string | null)[] | null; level: number; rarityBits: number; want: number; points: number }

const ladders = new Map<string, Rung[]>();
const ladderOf = (rule: DealtRule) => {
  let l = ladders.get(rule.ruleKey);
  if (!l) ladders.set(rule.ruleKey, l = artefactLadder(rule));
  return l;
};

export const variantOf = (id: string) => findVariant(id).variant;
export const decode = (wire: string): LineState => lineType.decode(wire);
export const encode = (state: LineState): string => lineType.encode(state);

/** One player's score, level and rarity of a state. */
export function valueOf(state: LineState, variantId: string, rule: DealtRule) {
  const family = familyOf(rule.family);
  const score = evaluateObject(lineType, family as never, rule.params, state, variantOf(variantId), rule.tieBreaker).score;
  const a = artefactFor(rule.ruleKey);
  if (!a) throw new Error(`No artefact for ${rule.ruleKey}`);
  return { score: scoreToWire(score), level: levelOf(score, ladderOf(rule)), rarityBits: rarityOf(a, score) };
}

/** Every seated player's value of a state, with want (the others' rarity) and points. */
export function valuesOf(state: LineState, variantId: string, seats: readonly SeatRule[]): Value[] {
  const own = seats.map(s => ({ memberId: s.memberId, ...valueOf(state, variantId, s.rule) }));
  const total = own.reduce((t, v) => t + v.rarityBits, 0);
  return own.map(v => {
    const want = total - v.rarityBits;
    return { ...v, want, points: v.rarityBits * want };
  });
}
