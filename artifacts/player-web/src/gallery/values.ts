/**
 * The rules' value functions for the dev galleries (owner decision 23): the records under lib/v2-valuation/values,
 * looked up with valueLookup. The app gets the same record from the server (myRule's `value`).
 */
import { compareScores, type Score } from "@workspace/v2-core";
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

/**
 * Example states for a gallery: the best, a middling and a low one among those met, one per whole bit of the rule's
 * value function (or, without one, per distinct score, in score order).
 */
export function pickExamples<S>(met: readonly { state: S; score: Score }[], value: ((u: Score) => number) | undefined): S[] {
  const found = new Map<string, { state: S; score: Score; bits: number }>();
  for (const { state, score } of met) {
    const bits = value ? value(score) : 0;
    const key = value ? String(Math.floor(bits)) : JSON.stringify(score?.map(x => (x === null ? null : `${x.n}/${x.d}`)) ?? null);
    if (!found.has(key)) found.set(key, { state, score, bits });
  }
  const ranked = [...found.values()].sort((a, b) => (value ? b.bits - a.bits : compareScores(b.score, a.score)));
  return [ranked[0], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1]]
    .filter((x, i, a): x is NonNullable<typeof x> => x !== undefined && a.indexOf(x) === i).map(x => x.state);
}
