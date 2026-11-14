/**
 * The gate a dealt grid family must pass (owner's standing instruction: the game is a metastable ecosystem, an optimum
 * found is a bug; docs/engine-v2/grids.md §6.1). A unit climber starts from boards drawn from π and takes the best of
 * every ±1 change to one cell and every swap of two cells, by the main part alone, until none improves it. A family
 * passes when the climber reaches the main part's top from at most `maxExactShare` of starts (hard to top), yet gains
 * from the start (climbable).
 */
import { evaluateSite, rng, type RuleFamily, type Variant } from "@workspace/v2-core";
import { gridParams, gridType, type GridState } from "@workspace/v2-grid";
import { drawFromPi } from "./value-grid.ts";

export const GATE = { maxExactShare: 0.1, starts: 60, maxSteps: 400 } as const;

export interface GateResult {
  readonly family: string;
  /** The main part's top: 0 for a distance (min), else given (the most a count or total can reach). */
  readonly top: number;
  /** The share of starts from which the climber reached the top. */
  readonly exactShare: number;
  /** Steps to the top, median over the starts that reached it (null when none did). */
  readonly medianSteps: number | null;
  /** The main part where the climber stopped, median over all starts. */
  readonly medianEnd: number;
  /** The climber's gain over its start, median. */
  readonly medianGain: number;
  /** Distinct boards at the top. */
  readonly distinctTops: number;
  readonly pass: boolean;
}

export function gridGate<P>(family: RuleFamily<GridState, P>, params: P, variant: Variant,
  opts: { starts?: number; seed?: string; top?: number; maxSteps?: number } = {}): GateResult {
  const { size, cap } = gridParams(variant);
  const C = size * size;
  const starts = opts.starts ?? GATE.starts, maxSteps = opts.maxSteps ?? GATE.maxSteps;
  const top = family.main.sense === "min" ? 0 : opts.top;
  if (top === undefined) throw new Error(`${family.id}: a count's top must be given`);
  // The main part as a number, bigger better (a distance is already negated in the score).
  const value = (cells: number[]): number => {
    const c = evaluateSite(gridType, family, params, { cells }, variant, 0, null).score?.[0];
    return c ? Number(c.n) / Number(c.d) : -Infinity;
  };
  const draw = drawFromPi(variant, rng("grid-gate", opts.seed ?? "v2", family.id, JSON.stringify(params), variant.id));
  const reached: number[] = [], ends: number[] = [], gains: number[] = [], tops = new Set<string>();
  const goal = family.main.sense === "min" ? 0 : top!;
  for (let s = 0; s < starts; s++) {
    let b = draw(), v = value(b);
    const v0 = v;
    let k = 0;
    for (; k < maxSteps; k++) {
      let best: number[] | null = null, bv = v;
      for (let i = 0; i < C; i++) for (const d of [-1, 1]) {
        const x = b[i]! + d;
        if (x < 0 || x > cap) continue;
        const nb = b.slice(); nb[i] = x;
        const nv = value(nb);
        if (nv > bv) { bv = nv; best = nb; }
      }
      for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
        if (b[i] === b[j]) continue;
        const nb = b.slice(); nb[i] = b[j]!; nb[j] = b[i]!;
        const nv = value(nb);
        if (nv > bv) { bv = nv; best = nb; }
      }
      if (!best) break;
      b = best; v = bv;
    }
    ends.push(v); gains.push(v - v0);
    if (v >= goal) { reached.push(k); tops.add(b.join("")); }
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, c) => a - c); return s[s.length >> 1]!; };
  const exactShare = reached.length / starts;
  const medianGain = med(gains);
  return {
    family: family.id, top: goal, exactShare, medianSteps: reached.length ? med(reached) : null, medianEnd: med(ends), medianGain,
    distinctTops: tops.size, pass: exactShare <= GATE.maxExactShare && medianGain > 0,
  };
}
