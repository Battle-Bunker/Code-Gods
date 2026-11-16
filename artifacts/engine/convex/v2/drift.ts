/**
 * Parameter drift (the coordinator's declared TRIAL, the spec lead's call 18; playtest round 13: with fixed rules a
 * beginner game settles within a minute or two and stays flat). Every `driftSeconds` of world time (0: off; 120 on the
 * beginner presets; `dilate` scales it), on the same tick for every seat, each seat whose dealt rule has other
 * parameter values with precomputed values gets its parameters redrawn (they may stay as they were): never its family, lens or tie-breaker. The
 * rule document and card update, every object's values are recomputed under the new rules, standings follow at the
 * next score interval, the event log records the redraw (`drift`, then a `values` event per object, which the replay
 * folds), and agents see the new parameters on their next act (the tick reads the seats' rules every tick).
 *
 * Staggered (the coordinator's trial under call 18, after playtest round 16's sawtooth leaderboard): seat k of n is
 * redrawn at world seconds k × driftSeconds / n + m × driftSeconds, so one seat's rule changes every driftSeconds / n
 * and each seat's every driftSeconds. In a fixed-length game no redraw falls in the last END_GUARD_SECONDS (round 16:
 * a redraw at the buzzer collapsed the final scores). A client counts down from the clock alone (`nextDriftAt`).
 * Pure; any runtime.
 */
import { canonicalJson, driftParams } from "@workspace/v2-core";
import { findVariant, ruleKey } from "@workspace/v2-valuation";
import { familyOf, seatingClashes } from "./deal.ts";
import type { SeatedRule } from "@workspace/v2-linear";
import { valueHead } from "./valuesHead.ts";

/** A game's drift interval in world seconds (0: off; games stored before drift have none). */
export const driftSecondsOf = (game: { settings: { driftSeconds?: number } }) => Math.max(0, game.settings.driftSeconds ?? 0);

// The schedule is pure and shared with the app (its countdown): lib/v2-core drift.ts.
export { END_GUARD_SECONDS, driftEventsDue, nextDriftAt } from "@workspace/v2-core";

/**
 * A seat's redrawn parameters at drift `tick`, or null when it keeps them: the spec lead's `driftParams` (v2-core),
 * uniform over the family's dealable parameter values on the variant that have precomputed values (with its
 * tie-breaker), the current ones included (a two-value grid is no predictable flip), seeded by the game, the seat's index and the tick, so the record replays it.
 * With `others` (the other seats' rules as they stand), a value the seating rule forbids beside them is not drawn
 * (lines: Prime Landing beside Whole Crossing on the same landings; deal.ts seatingClashes).
 */
export function redrawParams(variantId: string, family: string, tieBreaker: string | null, current: unknown, seed: string, seat: number, tick: number,
  others: readonly SeatedRule[] = []): { params: unknown; ruleKey: string; contentHash: string } | null {
  let f;
  try { f = familyOf(family); } catch { return null; }
  const { type, variant } = findVariant(variantId);
  const keyOf = (p: unknown) => ruleKey(type, variant, family, p, tieBreaker ?? "none");
  const seatable = (p: unknown) => seatingClashes(variantId, [...others, { family, params: p }]).length === seatingClashes(variantId, others).length;
  const next = driftParams(f, variant, current, seed, seat, tick, p => valueHead(keyOf(p)) !== null && seatable(p));
  if (canonicalJson(next) === canonicalJson(current)) return null;
  const key = keyOf(next), record = valueHead(key)!;
  return { params: next, ruleKey: key, contentHash: record.contentHash };
}
