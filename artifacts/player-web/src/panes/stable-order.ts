/**
 * A list that holds still while the player is pointing at it (persona walk: Lines re-sorted every few seconds under
 * the mouse, and a tap opened a different grid). Pure: the order to show from the order held and the live rows.
 */
export function stableOrder<R extends { objectId: string }>(held: readonly string[] | null, live: readonly R[]): R[] {
  if (!held) return [...live];
  const byId = new Map(live.map(r => [r.objectId, r]));
  const kept = held.map(id => byId.get(id)).filter((r): r is R => !!r);
  const known = new Set(held);
  return [...kept, ...live.filter(r => !known.has(r.objectId))];
}
