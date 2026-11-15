/**
 * Parameter drift (the coordinator's trial call 18, beginner default 120 s): at every drift tick each seat's dealt
 * params are redrawn from its family's `dealable()` list (the current params included), never the family, the
 * tie-breaker, a `lens` param (a family whose params name a lens, such as Divisibility's powers or matching, deals
 * goals that read differently; drift moves within one) or a `layout` param (which cells a rule reads: a redraw that
 * switched it would read new numbers and reset the board's worth). One pure function, so
 * the server and the in-memory table (lib/v2-agents src/table.ts) redraw alike.
 */
import type { RuleFamily, Variant } from "./contracts.ts";
import { rng } from "./rng.ts";

/**
 * The params a seat holds after drift tick `tick` (1, 2, …): uniform over the family's dealable params on `variant`
 * (and, when `allowed` is given, those it accepts: e.g. those with a value function), the current ones included, so a
 * redraw may keep them: with a two-value grid (a rule and its mirror) a redraw is not a predictable flip a seat could
 * straddle (the coordinator, 15 Nov). `current` itself when none is allowed. Deterministic per (seed, seat, tick).
 */
export function driftParams<P>(
  family: Pick<RuleFamily<unknown, P>, "dealable">, variant: Variant, current: P, seed: string, seat: number, tick: number,
  allowed?: (params: P) => boolean,
): P {
  const kept = (p: P) => (p !== null && typeof p === "object" ? JSON.stringify([(p as { lens?: unknown }).lens, (p as { layout?: unknown }).layout]) : "");
  const all = family.dealable(variant).filter(p => kept(p) === kept(current) && (allowed?.(p) ?? true));
  return all.length ? all[rng("drift", seed, seat, tick).below(all.length)]! : current;
}

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
