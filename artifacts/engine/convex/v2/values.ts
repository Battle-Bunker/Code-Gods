/**
 * What a score is worth (owner decision 23): each dealt rule's value function (convex/v2/values.gen.ts, keyed by the
 * same ruleKey as the deal), looked up at a score's utility: bits = −log2 of the stationary mass of states at least
 * that good, with its interval. No levels, ladders or caps. Pure; any runtime.
 */
import type { Score } from "@workspace/v2-core";
import { valueLookup } from "@workspace/v2-valuation";
import { VALUE_RECORDS, type ValueRecord } from "./values.gen.ts";

const BY_KEY = new Map(VALUE_RECORDS.map(r => [r.ruleKey, r]));
const LOOKUPS = new Map<string, ReturnType<typeof valueLookup>>();

/** The rule's value function, or null when it has none (such a rule is not dealt). */
export const valueRecord = (ruleKey: string): ValueRecord | null => BY_KEY.get(ruleKey) ?? null;

/** A utility's worth under a dealt rule: bits, and the interval [lo, hi] (hi = Infinity past the last knot). */
export function worthOf(ruleKey: string, utility: Score) {
  let f = LOOKUPS.get(ruleKey);
  if (!f) {
    const r = valueRecord(ruleKey);
    if (!r) throw new Error(`No value function for ${ruleKey}`);
    LOOKUPS.set(ruleKey, f = valueLookup(r));
  }
  return f(utility);
}

/** The most bits a rule's states reach in its value function (its last knot): a family's "top" in the bid phase. */
export const topBits = (r: ValueRecord): number => r.knots.reduce((m, k) => Math.max(m, k.bits), 0);

/** The value function as a curve, worst to best: each knot's utility (wire) and bits. */
export const curveOf = (r: ValueRecord) => r.knots.map(k => ({ score: k.u, bits: k.bits }));
