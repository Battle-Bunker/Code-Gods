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

/**
 * No straight hill (the coordinator's mechanical check, 15 Nov, after Smooth Intercept ran to 59 bits by stretching by 3
 * again and again: playtest round 21's "multiply every output by −3" to 3⁸, then a frozen board). One shortcut (a
 * stretch, zoom or turn, or an inverse) applied repeatedly from a typical state must not keep paying the same: given the
 * rule's bits before and after each application (`bits`, one longer than `fees`) and each application's fee, the bits
 * gained per fee paid over the second half of the chain (the least-squares slope of bits against the fees paid so far)
 * must be below the first half's, unless it is under STRAIGHT_FLOOR bits per fee bit (about a quarter of a bit for a
 * typical 12-bit stretch: a chain that wanders on and off a rung, or cycles, is no hill); and the chain must gain at
 * most `cap` bits over its start. Null when it passes, else why it fails. (Smooth Intercept by size: 0.9 bits for a
 * 12-bit stretch, 0.075 per fee bit, at every size.)
 */
export const STRAIGHT_FLOOR = 0.02;
export function straightHill(bits: readonly number[], fees: readonly number[], cap = 30): string | null {
  const n = fees.length;
  if (n < 3 || bits.length !== n + 1) return null;
  const gained = Math.max(...bits) - bits[0]!;
  if (gained > cap) return `gains ${gained.toFixed(1)} bits over ${n} applications (at most ${cap})`;
  const paid = [0];
  for (const f of fees) paid.push(paid.at(-1)! + f);
  /** The least-squares slope of bits against fees paid, over points from..to (inclusive). */
  const slope = (from: number, to: number) => {
    let n2 = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = from; i <= to; i++) { n2++; sx += paid[i]!; sy += bits[i]!; sxx += paid[i]! ** 2; sxy += paid[i]! * bits[i]!; }
    const den = n2 * sxx - sx * sx;
    return den > 0 ? (n2 * sxy - sx * sy) / den : 0;
  };
  const half = Math.floor(n / 2), first = slope(0, half), last = slope(half, n);
  return last > STRAIGHT_FLOOR && last >= first ? `a straight hill: ${last.toFixed(3)} bits per fee bit over the second half, ${first.toFixed(3)} over the first` : null;
}
