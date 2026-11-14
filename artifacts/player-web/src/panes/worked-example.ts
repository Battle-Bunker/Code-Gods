/**
 * The goal card's worked example (integration plan §5.7, pure, unit-tested): the family's own first example when it
 * has one, else a seeded walk from the origin that keeps one line per step reached and offers a middling one, so the
 * card shows both what already counts and the next step up. The same rule always gets the same example.
 */
import { evaluateObject, levelOf, objectLadder, rng, walkStep } from "@workspace/v2-core";
import type { RuleRef } from "@workspace/v2-views";

const WALK = 3000;

export function workedExample<S, P>(rule: RuleRef<S, P>): S {
  const { type, family, params, variant, tieBreaker } = rule;
  const own = family.examples?.(params, variant)[0];
  if (own !== undefined) return own;
  const ladder = objectLadder(type, family, params, variant, tieBreaker);
  const top = ladder.length - 1;
  const r = rng("worked-example", family.id, JSON.stringify(params), tieBreaker ?? "");
  const byLevel = new Map<number, S>();
  let s = type.origin(variant);
  for (let i = 0; i < WALK && byLevel.size < top; i++) {
    s = walkStep(type, variant, s, r);
    const score = evaluateObject(type, family, params, s, variant, tieBreaker).score;
    if (score === null) continue;
    const l = levelOf(score, ladder);
    if (l > 0 && !byLevel.has(l)) byLevel.set(l, s);
  }
  const below = [...byLevel.keys()].filter(l => l < top).sort((a, b) => a - b);
  if (below.length) return byLevel.get(below[Math.floor(below.length / 2)]!)!;
  return byLevel.get(top) ?? type.origin(variant);
}
