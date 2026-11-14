/**
 * The rules' value functions for the dev galleries (owner decision 23): the records under lib/v2-valuation/values,
 * looked up with valueLookup. The app gets the same record from the server (myRule's `value`).
 */
import type { Score } from "@workspace/v2-core";
import { valueLookup, type ValueFunction } from "@workspace/v2-valuation";

const RECORDS = import.meta.glob("../../../../lib/v2-valuation/values/*/*/*.json", { eager: true, import: "default" }) as Record<string, ValueFunction>;

/** bits(utility) for exactly this dealt rule (variant, family, parameters, tie-breaker), or undefined when none is calibrated. */
export function valueFor(variant: string, family: string, params: unknown, tieBreaker: string | null | undefined): ((u: Score) => number) | undefined {
  if (tieBreaker == null) return undefined;
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  const vf = Object.values(RECORDS).find(r => r.variant === variant && r.family === family && r.tieBreaker === tieBreaker && same(r.params, params));
  if (!vf) return undefined;
  const look = valueLookup(vf);
  return u => look(u).bits;
}
