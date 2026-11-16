/**
 * Locks for agents and the server (docs/engine-v2/locks.md): a predicate's information content under each object
 * type's law, cached by variant and canonical text (the draws do not depend on the state; only the bound φ(s) does).
 */
import { canonicalPredicate, INFO_DRAWS, INFO_MIN_HITS, informationContent, type InformationContent, type ObjectType, type Predicate, type Rng, type Variant } from "@workspace/v2-core";
import { lineLaw } from "@workspace/v2-linear";
import { pairLaw } from "@workspace/v2-pair";
import { drawFromPi } from "@workspace/v2-valuation";

/** One direct draw from the variant's stationary law (null: not a canonical state), for any object type v2 deals. */
export function lawDraw<S>(type: ObjectType<S>, variant: Variant): (r: Rng) => S | null {
  if (type.id === "line") { const law = lineLaw(variant); return r => law.draw(r, 1).state as S | null; }
  if (type.id === "pair") { const law = pairLaw(variant); return r => law.draw(r, 1).state as S | null; }
  if (type.id === "grid") {
    let bound: { r: Rng; next: () => number[] } | null = null;
    return r => {
      if (bound?.r !== r) bound = { r, next: drawFromPi(variant, r) };
      return { cells: bound.next() } as S;
    };
  }
  throw new Error(`no law to price locks on ${type.id}`);
}

const cache = new Map<string, { hits: number; draws: number }>();
const CACHE_MAX = 2000;

/**
 * I(P) at state `s` (lib/v2-core `informationContent`): the draws' hits are cached by variant and canonical text, so a
 * predicate costs one estimate per process; the bound φ(s) is applied per state.
 */
export function lockInfo<S>(type: ObjectType<S>, variant: Variant): (p: Predicate, s: S) => InformationContent {
  const draw = lawDraw(type, variant);
  return (p, s) => {
    const phi = type.readLength(s, variant);
    const key = `${type.id}\0${variant.valuesOf ?? variant.id}\0${canonicalPredicate(p)}`;
    let seen = cache.get(key);
    if (!seen) {
      // Estimated with no bound (Infinity), so the cached hits serve every state.
      const ic = informationContent(type, variant, p, draw, Infinity, INFO_DRAWS);
      seen = { hits: ic.hits, draws: ic.draws };
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, seen);
    }
    if (seen.hits < INFO_MIN_HITS || seen.draws === 0) return { bits: phi, hits: seen.hits, draws: seen.draws, bounded: true };
    const est = -Math.log2(seen.hits / seen.draws);
    return est >= phi ? { bits: phi, hits: seen.hits, draws: seen.draws, bounded: true } : { bits: est, hits: seen.hits, draws: seen.draws, bounded: false };
  };
}
