/**
 * migrations.agentPricesV2 (docs/energy-model.md §9). Pure, so test/unit checks it on legacy rows.
 *
 * An agent priced before the energy model: drop the decision price and the floor from its stored estimate.
 *
 * Idempotent: an agent already in the new shape gets undefined (left alone).
 */
export function agentPriceV2(row: { breakdown: unknown; decisionBits?: number; perActFloorBits?: number }) {
  const old = row.breakdown as { erasure?: number; motion?: number; read?: number };
  if (old.read !== undefined && row.decisionBits === undefined && row.perActFloorBits === undefined) return undefined;
  const change = old.read !== undefined ? (row.breakdown as { change: number }).change : (old.erasure ?? 0) + (old.motion ?? 0);
  const read = old.read ?? 0;
  return { breakdown: { read, change }, expectedActCost: read + change, decisionBits: undefined, perActFloorBits: undefined };
}
