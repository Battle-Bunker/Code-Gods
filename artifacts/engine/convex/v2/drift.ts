/**
 * Parameter drift (the coordinator's declared TRIAL, the spec lead's call 18; playtest round 13: with fixed rules a
 * beginner game settles within a minute or two and stays flat). Every `driftSeconds` of world time (0: off; 120 on the
 * beginner presets; `dilate` scales it), on the same tick for every seat, each seat whose dealt rule has other
 * parameter values with precomputed values gets its parameters redrawn (they may stay as they were): never its family, lens or tie-breaker. The
 * rule document and card update, every object's values are recomputed under the new rules, standings follow at the
 * next score interval, the event log records the redraw (`drift`, then a `values` event per object, which the replay
 * folds), and agents see the new parameters on their next act (the tick reads the seats' rules every tick).
 *
 * Drift k happens at world second k × driftSeconds, so a client counts down to the next one from the clock alone.
 * Pure; any runtime.
 */
import { canonicalJson, driftParams } from "@workspace/v2-core";
import { findVariant, ruleKey } from "@workspace/v2-valuation";
import { familyOf } from "./deal.ts";
import { valueRecord } from "./values.ts";

/** A game's drift interval in world seconds (0: off; games stored before drift have none). */
export const driftSecondsOf = (game: { settings: { driftSeconds?: number } }) => Math.max(0, game.settings.driftSeconds ?? 0);

/** The drift due at this world second, if any: k ≥ 1 when k × interval has passed and fewer than k drifts were done. */
export function driftDue(intervalSeconds: number, world: number, done: number): number | null {
  if (!(intervalSeconds > 0)) return null;
  const k = Math.floor(world / intervalSeconds + 1e-9);
  return k > done ? k : null;
}

/**
 * A seat's redrawn parameters at drift `tick`, or null when it keeps them: the spec lead's `driftParams` (v2-core),
 * uniform over the family's dealable parameter values on the variant that have precomputed values (with its
 * tie-breaker), the current ones included (a two-value grid is no predictable flip), seeded by the game, the seat's index and the tick, so the record replays it.
 */
export function redrawParams(variantId: string, family: string, tieBreaker: string | null, current: unknown, seed: string, seat: number, tick: number):
  { params: unknown; ruleKey: string; contentHash: string } | null {
  let f;
  try { f = familyOf(family); } catch { return null; }
  const { type, variant } = findVariant(variantId);
  const keyOf = (p: unknown) => ruleKey(type, variant, family, p, tieBreaker ?? "none");
  const next = driftParams(f, variant, current, seed, seat, tick, p => valueRecord(keyOf(p)) !== null);
  if (canonicalJson(next) === canonicalJson(current)) return null;
  const key = keyOf(next), record = valueRecord(key)!;
  return { params: next, ruleKey: key, contentHash: record.contentHash };
}
