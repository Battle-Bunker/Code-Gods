/**
 * The scoring trial's DYNAMIC mode on grids (docs/engine-v2/scoring-trial.md, "Dynamic energy on grids"; trial only,
 * comparison only). The owner: "grids don't have variations in size ... measuring the expected heuristic energy cost
 * of reaching a given utility or higher from a globally random state."
 *
 *   energy(s, rule) = mean over K random boards x of min(floor(x), rewrite(x → s))
 *
 * - Random board: each cell drawn from the law (chance ∝ 2^−step·x over 0..cap).
 * - floor: the cheapest single move (any mutator of the variant, any argument up to `maxBits`) to a board whose score
 *   is at least s's (scores compared as the game compares them: lexicographically, main part then the dealt
 *   tie-breaker).
 * - rewrite (the ceiling): add to each cell that differs, one cells.add per cell, onto s itself.
 * - Price: the game's price of each call (which + argument bits + any surcharge), as applyPriced gives it.
 * - Fresh randomness unless a seed is given. Nothing is computed at import time.
 */
import { applyPriced, compareScores, evaluateSite, isInvalid, rng as makeRng, variantMutators, type Rng, type RuleFamily, type Score, type Variant } from "@workspace/v2-core";
import { cellName, gridParams, type GridState } from "./grid.ts";
import { gridType } from "./type.ts";

export interface GridTrialRule { readonly family: RuleFamily<GridState, unknown>; readonly params: unknown; readonly tieBreaker: string | null }
export const gridScore = (r: GridTrialRule, s: GridState, v: Variant): Score => evaluateSite(gridType, r.family, r.params, s, v, 0, r.tieBreaker as never).score;
const atLeast = (a: Score, b: Score) => compareScores(a, b) >= 0;

/** A random board from the law. */
export function lawBoard(v: Variant, r: Rng): GridState {
  const { size, cap, step } = gridParams(v), w = Array.from({ length: cap + 1 }, (_, x) => 2 ** (-step * x)), z = w.reduce((a, b) => a + b, 0);
  const cell = () => { let u = r.unit() * z; for (let x = 0; x <= cap; x++) { u -= w[x]!; if (u <= 0) return x; } return cap; };
  return { cells: Array.from({ length: size * size }, cell) };
}

const MOVES = new Map<string, { m: ReturnType<typeof variantMutators<GridState>>[number]; args: unknown }[]>();
/** Every single move of the variant with argument bits up to maxBits (listed once per variant). */
function movesOf(v: Variant, maxBits: number) {
  const key = `${v.id}:${maxBits}`;
  if (!MOVES.has(key)) MOVES.set(key, variantMutators(gridType, v).flatMap(m => [...(m.args(v).enumerate?.(maxBits) ?? [])].map(args => ({ m, args }))));
  return MOVES.get(key)!;
}
/** The price of rewriting x into s: one cells.add per differing cell. */
export function rewritePrice(x: GridState, s: GridState, v: Variant): number {
  const add = variantMutators(gridType, v).find(m => m.id === "cells.add")!;
  let cur = x, total = 0;
  for (let i = 0; i < s.cells.length; i++) {
    const k = s.cells[i]! - cur.cells[i]!;
    if (k === 0) continue;
    const a = applyPriced(gridType, v, cur, add, 0, { cell: cellName(gridParams(v).size, i), k } as never);
    if (isInvalid(a)) return Infinity;
    total += a.price.total; cur = a.result;
  }
  return total;
}
export interface GridEnergy { readonly energy: number; readonly evals: number; readonly ceilingBinds: number; readonly zeroShare: number }
/** energy(s, rule): the mean over K law boards of min(cheapest single move to score ≥ s's, rewrite onto s). */
export function gridEnergy(s: GridState, rule: GridTrialRule, v: Variant, o: { K?: number; maxBits?: number; seed?: string } = {}): GridEnergy {
  const K = o.K ?? 30, r = makeRng("grid-dynamic", o.seed ?? `${Date.now()}:${Math.random()}`), target = gridScore(rule, s, v), moves = movesOf(v, o.maxBits ?? 24);
  let sum = 0, evals = 1, binds = 0, zero = 0;
  for (let i = 0; i < K; i++) {
    const x = lawBoard(v, r);
    evals++;
    if (atLeast(gridScore(rule, x, v), target)) { zero++; continue; }
    let floor = Infinity;
    for (const { m, args } of moves) {
      const a = applyPriced(gridType, v, x, m, 0, args);
      if (isInvalid(a) || a.price.total >= floor) continue;
      evals++;
      if (atLeast(gridScore(rule, a.result, v), target)) floor = a.price.total;
    }
    const ceiling = rewritePrice(x, s, v);
    if (ceiling < floor) binds++;
    sum += Math.min(floor, ceiling);
  }
  return { energy: sum / K, evals, ceilingBinds: binds / K, zeroShare: zero / K };
}
/** A greedy climb: the best single move by score, cheapest first among equals, for at most `steps` steps. */
export function greedyClimb(s: GridState, rule: GridTrialRule, v: Variant, steps: number, maxBits = 24): GridState {
  let cur = s, best = gridScore(rule, s, v);
  for (let i = 0; i < steps; i++) {
    let next: GridState | null = null, nextScore = best, nextPrice = Infinity;
    for (const { m, args } of movesOf(v, maxBits)) {
      const a = applyPriced(gridType, v, cur, m, 0, args);
      if (isInvalid(a)) continue;
      const sc = gridScore(rule, a.result, v), c = compareScores(sc, nextScore);
      if (c > 0 || (c === 0 && next && a.price.total < nextPrice)) { next = a.result; nextScore = sc; nextPrice = a.price.total; }
    }
    if (!next || compareScores(nextScore, best) <= 0) break;
    cur = next; best = nextScore;
  }
  return cur;
}
