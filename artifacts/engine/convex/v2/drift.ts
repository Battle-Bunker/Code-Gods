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
import { familyOf } from "./deal.ts";
import { valueRecord } from "./values.ts";

/** A game's drift interval in world seconds (0: off; games stored before drift have none). */
export const driftSecondsOf = (game: { settings: { driftSeconds?: number } }) => Math.max(0, game.settings.driftSeconds ?? 0);

/** No redraw within this many world seconds of a fixed-length game's end. */
export const END_GUARD_SECONDS = 90;

/**
 * The drift events due by this world second after `done` of them: event e (1, 2, …) falls at e × interval / seats and
 * redraws seat e mod seats (so seat 0 last in each round). An event within END_GUARD_SECONDS of `endWorld` (a
 * fixed-length game's end; null when the end is hidden) is passed over: counted, not run.
 */
export function driftEventsDue(intervalSeconds: number, seats: number, world: number, done: number, endWorld: number | null): { e: number; seat: number; skip: boolean }[] {
  if (!(intervalSeconds > 0) || seats < 1) return [];
  const step = intervalSeconds / seats, last = Math.floor(world / step + 1e-9), out = [];
  for (let e = done + 1; e <= last; e++) out.push({ e, seat: e % seats, skip: endWorld !== null && e * step > endWorld - END_GUARD_SECONDS + 1e-9 });
  return out;
}

/** The world second of a seat's next redraw after `world`, or null when none is left before the end guard. */
export function nextDriftAt(intervalSeconds: number, seats: number, seat: number, world: number, endWorld: number | null): number | null {
  if (!(intervalSeconds > 0) || seats < 1) return null;
  const first = ((seat % seats) || seats) * intervalSeconds / seats;
  const m = Math.max(0, Math.floor((world - first) / intervalSeconds + 1e-9) + 1);
  const at = world < first - 1e-9 ? first : first + m * intervalSeconds;
  return endWorld !== null && at > endWorld - END_GUARD_SECONDS + 1e-9 ? null : at;
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
