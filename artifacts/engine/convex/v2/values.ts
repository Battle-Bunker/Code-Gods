/**
 * What a score is worth (owner decision 23): each dealt rule's value function (convex/v2/values.gen.ts, keyed by the
 * same ruleKey as the deal), looked up at a score's utility: bits = −log2 of the stationary mass of states at least
 * that good, with its interval. No levels, ladders or caps. Pure; any runtime.
 */
import type { Score } from "@workspace/v2-core";
import type { ObjectType } from "@workspace/v2-core";
import { findVariant, meanHinge, valueLookup, valuesVariant, withUniqueness } from "@workspace/v2-valuation";
import { CURVES, UNIQUENESS, VALUE_INDEX, type ValueRecord } from "./values.gen.ts";

const INDEX = new Map(VALUE_INDEX.map(r => [r.ruleKey, r]));
const RECORDS = new Map<string, ValueRecord>();
const LOOKUPS = new Map<string, ReturnType<typeof valueLookup>>();

/** The rule's value function, or null when it has none (such a rule is not dealt). Its curve is parsed on first use. */
export function valueRecord(ruleKey: string): ValueRecord | null {
  let r = RECORDS.get(ruleKey);
  if (!r) {
    const head = INDEX.get(ruleKey), curve = CURVES[ruleKey];
    if (!head || curve === undefined) return null;
    RECORDS.set(ruleKey, r = { ...head, ...(JSON.parse(curve) as Pick<ValueRecord, "knots" | "tail">) });
  }
  return r;
}
/** A rule's value function without its curve (its contentHash, family, params), or null: never parses a curve. */
export const valueHead = (ruleKey: string): Omit<ValueRecord, "knots" | "tail"> | null => INDEX.get(ruleKey) ?? null;

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

/**
 * The bits at a rule's furthest measured knot: a family's scale in the bid phase. Not a maximum: past it the tail keeps
 * rising without bound (owner decision 26).
 */
export const measuredToBits =(r: ValueRecord): number => r.knots.reduce((m, k) => Math.max(m, k.bits), 0);

/** The value function as a curve, worst to best: each knot's utility (wire) and bits. */
export const curveOf = (r: ValueRecord) => r.knots.map(k => ({ score: k.u, bits: k.bits }));

// ---------------------------------------------------------------- defence goals (v1, restored; owner-decisions call 1)

/**
 * A penalty's badness worth in bits (how rare "at least this bad" is), from its own value function. No uniqueness
 * correction: that corrects a reward's rarity for states other objects hold, not how bad an object is.
 */
export function penaltyBitsOf(ruleKey: string, badness: Score): number {
  let f = LOOKUPS.get(ruleKey);
  if (!f) {
    const r = valueRecord(ruleKey);
    if (!r) throw new Error(`No value function for the defence goal ${ruleKey}`);
    LOOKUPS.set(ruleKey, f = valueLookup(r));
  }
  return f(badness).bits;
}
const MEANS = new Map<string, number>();
/** E_π η(h) of a penalty (lib/v2-valuation defence.ts), from its knots, computed once. */
export function penaltyMean(ruleKey: string): number {
  let m = MEANS.get(ruleKey);
  if (m === undefined) {
    const r = valueRecord(ruleKey);
    if (!r) throw new Error(`No value function for the defence goal ${ruleKey}`);
    MEANS.set(ruleKey, m = meanHinge(r.knots));
  }
  return m;
}
