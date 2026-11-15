/**
 * The mechanical rows of the rule-design check (docs/engine-v2/design-principles.md): rows 1 (the main part has no
 * attained top), 3 (a tie-breaker's best state depends on the main part's level) and 4 (at least four dealable
 * instances). They take a family's main and tie-breaker readings on candidate states, so each object type supplies its
 * own states (lib/v2-linear test design-principles.test.ts applies them to every dealt line family).
 */

/** One candidate state's readings: the main part's value and each tie-breaker's (null: undefined, the worst). */
export interface Reading<K> { readonly key: K; readonly main: number | null; readonly ties: Readonly<Record<string, number | null>> }

/**
 * Row 1. `levels[i]` are the readings of every candidate within search radius i (radii increasing). The main part is
 * unbounded when the best main value found never falls as the radius grows and still rises at the widest step (the
 * best of a long search is improvable; a sparse ladder may sit on one rung across a few radii); a distance main
 * (sense "min") that reaches 0 has an attained top.
 */
export function mainUnbounded<K>(sense: "min" | "max", levels: readonly (readonly Reading<K>[])[]): { ok: boolean; best: number[]; why?: string } {
  const sign = sense === "max" ? 1 : -1;
  const best = levels.map(rs => Math.max(...rs.map(r => (r.main === null ? -Infinity : sign * r.main))) * sign);
  if (sense === "min" && best.some(b => b === 0)) return { ok: false, best, why: "a distance main part reaches 0, its top" };
  for (let i = 1; i < best.length; i++) if (sign * best[i]! < sign * best[i - 1]!) return { ok: false, best, why: `a worse best within radius ${i} than within ${i - 1}` };
  const n = best.length - 1;
  if (!(sign * best[n]! > sign * best[n - 1]!)) return { ok: false, best, why: `no better main part within the widest radius ${n} than within ${n - 1}: the search found a top` };
  return { ok: true, best };
}

/**
 * Row 3, for one tie-breaker. `low` and `high` are the readings of candidates sharing one main-part value each (a lower
 * and a higher level); `same(a, b)` says whether two candidates make the same tie-breaker choice (e.g. the same gradient).
 * Entangled when the tie-breaker's best choice on the low level is not best on the high level, and taking that choice
 * up to the high level scores less there than the high level's best (the climb starts again).
 */
export function tieEntangled<K>(low: readonly Reading<K>[], high: readonly Reading<K>[], tie: string, same: (a: K, b: K) => boolean): { ok: boolean; why?: string } {
  const val = (r: Reading<K>) => r.ties[tie] ?? -Infinity;
  const top = (rs: readonly Reading<K>[]) => Math.max(...rs.map(val));
  const bestLow = low.filter(r => val(r) === top(low)), bestHigh = top(high);
  if (!Number.isFinite(bestHigh) || !bestLow.length) return { ok: false, why: "no tie-breaker value on a level" };
  const carried = bestLow.map(r => high.find(h => same(r.key, h.key))).filter((h): h is Reading<K> => !!h);
  if (!carried.length) return { ok: false, why: "the low level's best choice has no counterpart on the high level" };
  return carried.every(h => val(h) < bestHigh) ? { ok: true } : { ok: false, why: "the low level's best choice is still best on the high level: the tie-breaker ignores the main part" };
}

/** Row 4: at least `min` dealable instances. */
export const enoughInstances = (dealable: readonly unknown[], min = 4): boolean => dealable.length >= min;
