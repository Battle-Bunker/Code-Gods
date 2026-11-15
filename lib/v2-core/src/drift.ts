/**
 * Parameter drift (the coordinator's trial call 18, beginner default 120 s): at every drift tick each seat's dealt
 * params are redrawn from its family's `dealable()` list, never the family or the tie-breaker. One pure function, so
 * the server and the in-memory table (lib/v2-agents src/table.ts) redraw alike.
 */
import type { RuleFamily, Variant } from "./contracts.ts";
import { canonicalJson } from "./hash.ts";
import { rng } from "./rng.ts";

/**
 * The params a seat holds after drift tick `tick` (1, 2, …): uniform over the family's dealable params on `variant`
 * other than `current` (and, when `allowed` is given, that it accepts: e.g. those with a value function); `current`
 * itself when no other is left. Deterministic per (seed, seat, tick).
 */
export function driftParams<P>(
  family: Pick<RuleFamily<unknown, P>, "dealable">, variant: Variant, current: P, seed: string, seat: number, tick: number,
  allowed?: (params: P) => boolean,
): P {
  const now = canonicalJson(current);
  const others = family.dealable(variant).filter(p => canonicalJson(p) !== now && (allowed?.(p) ?? true));
  return others.length ? others[rng("drift", seed, seat, tick).below(others.length)]! : current;
}
