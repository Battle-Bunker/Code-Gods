/**
 * Parameter drift (the coordinator's trial call 18, beginner default 120 s): at every drift tick each seat's dealt
 * params are redrawn from its family's `dealable()` list (the current params included), never the family or the
 * tie-breaker. One pure function, so
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
  const all = family.dealable(variant).filter(p => allowed?.(p) ?? true);
  return all.length ? all[rng("drift", seed, seat, tick).below(all.length)]! : current;
}
