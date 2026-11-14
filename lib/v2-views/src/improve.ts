/**
 * The candidate calls for a search over moves (moves.ts): a mutator's argument values in ascending code length, and
 * the search budget.
 */
import { rng, type ArgCode } from "@workspace/v2-core";

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

