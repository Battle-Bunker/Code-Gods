/**
 * A rule's value function without its curve (its contentHash, family, params): what the lobby, the deal and drift need
 * to name a rule, from the small index only. A module that imports this and not values.ts never loads the curves
 * (test/unit/v2-values-load.test.ts).
 */
import { VALUE_INDEX, type ValueRecord } from "./values-index.gen.ts";

const INDEX = new Map(VALUE_INDEX.map(r => [r.ruleKey, r]));
/** A rule's value function without its curve, or null: never parses a curve. */
export const valueHead = (ruleKey: string): (Omit<ValueRecord, "knots" | "tail"> & { measuredTo: number }) | null => INDEX.get(ruleKey) ?? null;
