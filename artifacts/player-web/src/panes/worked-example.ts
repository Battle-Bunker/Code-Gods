/**
 * The goal card's worked example (integration plan §5.7, pure, unit-tested): the family's own first example when it
 * has one, else a seeded walk from the origin that keeps one line per value reached and offers a middling one, so the
 * card shows both what already counts and better to come. Values are the rule's bits when its value function is given
 * (whole bits, owner decision 23), else the distinct scores in order. The same rule always gets the same example.
 */
import { compareScores, evaluateObject, rng, walkStep, type Score } from "@workspace/v2-core";
import type { RuleRef } from "@workspace/v2-views";

const WALK = 3000;
/** How many distinct values the walk collects before it stops. */
const KEEP = 12;

export function workedExample<S, P>(rule: RuleRef<S, P>, value?: ((u: Score) => number) | null): S {
  const { type, family, params, variant, tieBreaker } = rule;
  const own = family.examples?.(params, variant)[0];
  if (own !== undefined) return own;
  const r = rng("worked-example", family.id, JSON.stringify(params), tieBreaker ?? "");
  // One state per value reached, keyed by whole bits (with a value function) or by the score itself.
  const found = new Map<string, { score: Score; bits: number; state: S }>();
  let s = type.origin(variant);
  for (let i = 0; i < WALK && found.size < KEEP; i++) {
    s = walkStep(type, variant, s, r);
    const score = evaluateObject(type, family, params, s, variant, tieBreaker).score;
    if (score === null) continue;
    const bits = value ? value(score) : 0;
    if (value && bits <= 0) continue;
    const key = value ? String(Math.floor(bits)) : JSON.stringify(score.map(x => (x === null ? null : `${x.n}/${x.d}`)));
    if (!found.has(key)) found.set(key, { score, bits, state: s });
  }
  const ranked = [...found.values()].sort((a, b) => (value ? a.bits - b.bits : compareScores(a.score, b.score)));
  if (!ranked.length) return type.origin(variant);
  // A middling one below the best found, so there is visibly more to gain.
  const below = ranked.slice(0, -1);
  return (below.length ? below[Math.floor(below.length / 2)]! : ranked[0]!).state;
}
