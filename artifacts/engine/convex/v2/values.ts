/**
 * What a score is worth (owner decision 23): each dealt rule's value function (convex/v2/values.gen.ts, keyed by the
 * same ruleKey as the deal), looked up at a score's utility: bits = −log2 of the stationary mass of states at least
 * that good, with its interval. No levels, ladders or caps. Pure; any runtime.
 */
import type { Score } from "@workspace/v2-core";
import type { ObjectType } from "@workspace/v2-core";
import { findVariant, valueLookup, valuesVariant, withUniqueness } from "@workspace/v2-valuation";
import { UNIQUENESS, VALUE_RECORDS, type ValueRecord } from "./values.gen.ts";

const BY_KEY = new Map(VALUE_RECORDS.map(r => [r.ruleKey, r]));
const LOOKUPS = new Map<string, ReturnType<typeof valueLookup>>();

/** The rule's value function, or null when it has none (such a rule is not dealt). */
export const valueRecord = (ruleKey: string): ValueRecord | null => BY_KEY.get(ruleKey) ?? null;

/**
 * The game a worth is looked up in (owner decision 24, spec §2.6): its variant and `objects`, the object count the
 * uniqueness correction assumes (world.ts `valueObjects`, fixed per game).
 */
export interface ValueScope { variant: string; objects: number }

/** The uniqueness correction's table for a variant (values.gen.ts), with the game's object count: what an agent host takes. */
export function uniquenessOf(scope: ValueScope): { ns: number[]; heldMass: number[]; objects: number } | null {
  // A variant that differs from another only in its menu shares that variant's law, so its table (Variant.valuesOf).
  let id = scope.variant;
  try { const f = findVariant(id); id = valuesVariant(f.type as ObjectType<unknown>, f.variant).id; } catch (e) { if (!/^Unknown variant/.test((e as Error).message)) throw e; }
  const t = UNIQUENESS.find(u => u.variant === id);
  return t ? { ns: [...t.ns], heldMass: [...t.heldMass], objects: scope.objects } : null;
}

/** A utility's worth under a dealt rule in a game: bits, and the interval [lo, hi] (hi = Infinity past the last knot). */
export function worthOf(ruleKey: string, utility: Score, scope: ValueScope) {
  let f = LOOKUPS.get(ruleKey);
  if (!f) {
    const r = valueRecord(ruleKey);
    if (!r) throw new Error(`No value function for ${ruleKey}`);
    LOOKUPS.set(ruleKey, f = valueLookup(r));
  }
  const u = uniquenessOf(scope);
  return (u ? withUniqueness(f, u, u.objects) : f)(utility);
}

/** A rule's value function as `valueLookup` takes it, with the game's uniqueness correction (agents, faces, replays). */
export const slimKnots = <U>(knots: readonly { u: U; bits: number; lo: number; hi: number }[]) => knots.map(k => ({ u: k.u, bits: k.bits, lo: k.lo, hi: k.hi }));
export function valueFnIn(ruleKey: string, scope: ValueScope) {
  const r = valueRecord(ruleKey);
  if (!r) return null;
  const u = uniquenessOf(scope);
  return { knots: r.knots, tail: r.tail, ...(u ? { uniqueness: u } : {}) };
}

/** The most bits a rule's states reach in its value function (its last knot): a family's "top" in the bid phase. */
export const topBits = (r: ValueRecord): number => r.knots.reduce((m, k) => Math.max(m, k.bits), 0);

/** The value function as a curve, worst to best: each knot's utility (wire) and bits. */
export const curveOf = (r: ValueRecord) => r.knots.map(k => ({ score: k.u, bits: k.bits }));
