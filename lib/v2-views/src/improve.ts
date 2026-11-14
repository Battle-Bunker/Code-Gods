/**
 * The nearest improvement (integration plan §3.1): the cheapest single call that raises the object's level on the
 * viewer's rule, or, when none is in budget, the cheapest that brings the score closer. Calls are tried in ascending
 * code length; a call's real price adds the surcharge (never negative), so the search stops as soon as the next call's
 * code length alone costs more than the best found. Computed in the browser for the viewer's own rule only.
 */
import {
  applyPriced, compareScores, evaluateObject, isInvalid, levelOf, objectLadder, rng, variantMutators, type ArgCode,
  type Call, type Mutator, type ObjectType, type Price, type Score,
} from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { fmtEnergy } from "./format.ts";

export interface Improvement {
  /** "level": raises the level; "closer": a better score on the same level. */
  readonly kind: "level" | "closer";
  readonly call: Call;
  /** The mutator's own words: "move the line down 1". */
  readonly describe: string;
  readonly price: Price;
  readonly before: Score;
  readonly after: Score;
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** The state after the call (for the "after" picture). */
  readonly result: unknown;
  /** "Move the line down 1 (6.2 ⚡): step 7 of 7." */
  readonly sentence: string;
}

export interface ImproveBudget {
  /** Calls applied and evaluated at most. */
  readonly evaluations: number;
  /** Largest argument code length tried. */
  readonly maxBits: number;
  /** Draws per mutator when its argument code cannot enumerate (the sampling fallback). */
  readonly samples: number;
}
export const DEFAULT_BUDGET: ImproveBudget = { evaluations: 2000, maxBits: 16, samples: 3000 };

/** A code that can list its values in ascending length (the proposed `ArgCode.enumerate`, plan §5.7). */
type Enumerable<A> = ArgCode<A> & { enumerate?(maxBits: number): Iterable<A> };

/**
 * The argument values of a mutator worth trying, cheapest first. Uses `enumerate` when the code has it; otherwise a
 * seeded sample of the code itself (each value drawn with probability 2^−bits, so every short value turns up).
 */
export function candidateArgs<A>(code: Enumerable<A>, seed: string, budget: ImproveBudget): A[] {
  const seen = new Map<string, A>();
  const take = (a: A) => {
    if (code.bits(a) > budget.maxBits) return;
    const k = JSON.stringify(code.encode(a));
    if (!seen.has(k)) seen.set(k, a);
  };
  if (code.enumerate) {
    for (const a of code.enumerate(budget.maxBits)) take(a);
  } else {
    const r = rng(seed);
    for (let i = 0; i < budget.samples; i++) {
      const a = code.sample(r);
      if (a !== null) take(a);
    }
  }
  return [...seen.values()].sort((a, b) => code.bits(a) - code.bits(b));
}

interface Candidate { m: Mutator<unknown, unknown>; site: number; args: unknown; base: number }

export function nearestImprovement<S, P>(rule: RuleRef<S, P>, state: S, budget: ImproveBudget = DEFAULT_BUDGET): Improvement | null {
  const { type, family, params, variant, tieBreaker } = rule;
  const ladder = objectLadder(type, family, params, variant, tieBreaker);
  const before = evaluateObject(type, family, params, state, variant, tieBreaker).score;
  const levelBefore = levelOf(before, ladder);
  const ms = variantMutators(type as ObjectType<unknown>, variant);
  const k = type.sites(state, variant);
  const which = Math.log2(ms.length);

  const cands: Candidate[] = [];
  for (const m of ms) {
    const code = m.args(variant) as Enumerable<unknown>;
    const args = candidateArgs(code, `nearest-improvement:${variant.id}:${m.id}`, budget);
    const sites = m.perSite ? Array.from({ length: k }, (_, i) => i) : [0];
    const where = m.perSite ? Math.log2(k) : 0;
    for (const site of sites) for (const a of args) cands.push({ m, site, args: a, base: which + where + code.bits(a) });
  }
  cands.sort((a, b) => a.base - b.base);

  type Found = { c: Candidate; price: Price; after: Score; levelAfter: number; result: S };
  let level: Found | null = null;
  let closer: Found | null = null;
  let tried = 0;
  for (const c of cands) {
    if (level && c.base >= level.price.total) break;
    if (tried >= budget.evaluations) break;
    const applied = applyPriced(type as ObjectType<unknown>, variant, state, c.m, c.site, c.args);
    if (isInvalid(applied)) continue;
    tried++;
    const result = applied.result as S;
    const after = evaluateObject(type, family, params, result, variant, tieBreaker).score;
    const levelAfter = levelOf(after, ladder);
    const found: Found = { c, price: applied.price, after, levelAfter, result };
    if (levelAfter > levelBefore) {
      if (!level || applied.price.total < level.price.total) level = found;
    } else if (compareScores(after, before) > 0 && (!closer || applied.price.total < closer.price.total)) {
      closer = found;
    }
  }
  const best = level ?? closer;
  if (!best) return null;
  const code = best.c.m.args(variant);
  const describe = best.c.m.describe(best.c.args);
  const top = ladder.length - 1;
  const outcome = best.levelAfter > levelBefore
    ? `step ${best.levelAfter} of ${top}`
    : `closer, still step ${best.levelAfter} of ${top}`;
  return {
    kind: level ? "level" : "closer",
    call: { mutator: best.c.m.id, site: best.c.site, args: code.encode(best.c.args) as Record<string, string> },
    describe, price: best.price, before, after: best.after, levelBefore, levelAfter: best.levelAfter, result: best.result,
    sentence: `${describe[0]!.toUpperCase()}${describe.slice(1)} (${fmtEnergy(best.price.total)}): ${outcome}.`,
  };
}
