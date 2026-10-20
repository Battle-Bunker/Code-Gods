import type { Domain, Rng, UtilityDescriptor } from "./types.ts";
import { familiesFor, legal } from "./catalog.ts";

/**
 * Decides which utility function each god receives. Selectors are the hook for
 * future balancing (e.g. guaranteeing overlapping interests); the default is pure chance.
 */
export interface UtilitySelector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  select(domain: Domain, godCount: number, rng: Rng): UtilityDescriptor[];
}

/** One independent draw per god; only draws that are perfectly reachable in this domain count. */
function draw(domain: Domain, rng: Rng): UtilityDescriptor {
  const candidates = familiesFor(domain.objectType);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const family = candidates[rng(candidates.length)];
    const params = family.sample(rng);
    if (legal(family.exemplar(params), domain)) return { familyId: family.id, params };
  }
  throw new Error("No utility family can reach full utility in this domain; widen the domain");
}

export const divineLottery: UtilitySelector = {
  id: "divine-lottery",
  name: "Divine Lottery",
  description: "Every god independently draws a random utility function from the whole repertoire for the object type. Identical draws are redrawn; anything else, including two gods of the same family, can happen.",
  select(domain, godCount, rng) {
    const chosen: UtilityDescriptor[] = [];
    const seen = new Set<string>();
    while (chosen.length < godCount) {
      const descriptor = draw(domain, rng);
      const key = JSON.stringify(descriptor);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(descriptor);
    }
    return chosen;
  },
};

export const SELECTORS: readonly UtilitySelector[] = [divineLottery];

export function selector(id: string): UtilitySelector {
  const found = SELECTORS.find(s => s.id === id);
  if (!found) throw new Error(`Unknown utility selector: ${id}`);
  return found;
}
