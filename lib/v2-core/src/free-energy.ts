/**
 * A state's energy for a rule (the owner, 17 Nov; docs/engine-v2/energy.md): "the surprise of reaching a value at least
 * this good from a random start that is augmented by rule-specific heuristics primarily for performance, in a way that
 * makes evaluated energy less sensitive to those particular heuristics".
 *
 *   energy(s) = mean over starts x of c(x),   c(x) = −log2 Σ_routes 2^−cost(route)
 *
 * A route is ONE turn from x onto a target t with u(t) ≥ u(s); its cost in bits is the naming bits of the cheapest
 * mutation list that names t plus the turn's surprise (lines; grids have none). c(x) = 0 when x already qualifies.
 * Routes, in order of importance: the universal ones (a cost-aware greedy climb, and the direct turn onto s itself: the
 * ceiling), then the rule's own `candidates`. Distinct routes (by target) are summed (a soft minimum), so a candidate can
 * only lower c(x). The per-start costs are averaged (not pooled: pooling is the old rarity).
 *
 * This file is the shared machinery; each object type supplies a `RouteSpace` (its moves, naming and surprise) and its
 * own starts. Nothing is computed at import time.
 */

/** What an object type gives the estimator. */
export interface RouteSpace<S> {
  key(s: S): string;
  /** The rule's utility (NaN counts as worst). */
  u(s: S): number;
  /** The single mutations from y, each with its naming bits (which move, which number, the argument's digits, "continue"). */
  moves(y: S): Iterable<{ readonly to: S; readonly bits: number }>;
  /** The turn's surprise from x to z, in bits, beyond naming (0 on grids). */
  surprise(x: S, z: S): number;
  /** The naming bits of the cheapest mutation list from x onto t (Infinity when no list names it). */
  name(x: S, t: S): number;
}

/** −log2 Σ 2^−c: the soft minimum of route costs (Infinity for none). */
export function softMinBits(costs: Iterable<number>): number {
  let lo = Infinity;
  const cs: number[] = [];
  for (const c of costs) if (Number.isFinite(c)) { cs.push(c); if (c < lo) lo = c; }
  if (!cs.length) return Infinity;
  let s = 0;
  for (const c of cs) s += 2 ** (lo - c);
  return lo - Math.log2(s);
}

const uOf = <S,>(sp: RouteSpace<S>, s: S) => { const x = sp.u(s); return Number.isNaN(x) ? -Infinity : x; };

/**
 * The universal climb (a type may supply a faster one with the same result, e.g. grids' incremental climb): from x, repeatedly take the mutation with the best utility gain per marginal bit of the turn's
 * cost (gain capped at what is still needed, so a finishing move is chosen by price) until u ≥ uStar. The route's
 * cost is the cheaper of the path's naming and the direct naming of where it ends, plus the turn's surprise. It gives up
 * once its cost passes `bound` (a route that dear adds under 2^−16 of the cheapest to the soft minimum).
 */
export function greedyClimb<S>(x: S, uStar: number, sp: RouteSpace<S>, bound = Infinity, maxSteps = 24): { readonly target: S; readonly bits: number } | null {
  let y = x, uy = uOf(sp, x), naming = 0, sy = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (uy >= uStar - 1e-9) break;
    if (naming + sy > bound) return null;
    let best: { to: S; u: number; bits: number; s: number } | null = null, bestRate = 0;
    for (const mv of sp.moves(y)) {
      const uz = uOf(sp, mv.to);
      if (!(uz > uy + 1e-12)) continue;
      const sz = sp.surprise(x, mv.to), marginal = Math.max(mv.bits + sz - sy, 0.05 * mv.bits, 1e-6);
      const rate = Math.min(uz - uy, uStar - uy) / marginal;
      if (rate > bestRate) { bestRate = rate; best = { to: mv.to, u: uz, bits: mv.bits, s: sz }; }
    }
    if (!best) return null;
    y = best.to; uy = best.u; naming += best.bits; sy = best.s;
  }
  if (uy < uStar - 1e-9) return null;
  return { target: y, bits: Math.min(naming, sp.name(x, y)) + sp.surprise(x, y) };
}

export interface StartCost<S> {
  /** c(x): the soft minimum over the distinct routes found. */
  readonly cost: number;
  /** The cheapest single route, and which kind found it. */
  readonly best: number;
  readonly by: "already" | "climb" | "direct" | "candidate" | "none";
  /** The cheapest route of the universal kinds alone (climb and direct; a climb given up past the bound counts as none). */
  readonly universal: number;
  readonly routes: number;
}

/** c(x) for one start: the universal routes and the rule's candidates, summed by distinct target (the climb last, bounded; `extra`: further routes the climber reports). */
export function startCost<S>(x: S, s: S, uStar: number, sp: RouteSpace<S>, candidates: readonly S[] = [], climber: typeof greedyClimb<S> = greedyClimb, extra: readonly { readonly target: S; readonly bits: number }[] = []): StartCost<S> {
  if (uOf(sp, x) >= uStar - 1e-9) return { cost: 0, best: 0, by: "already", universal: 0, routes: 0 };
  const routes = new Map<string, number>();
  let best = Infinity, by: StartCost<S>["by"] = "none";
  const add = (t: S, bits: number, kind: StartCost<S>["by"]) => {
    if (!Number.isFinite(bits)) return;
    const k = sp.key(t), had = routes.get(k);
    if (had === undefined || bits < had) routes.set(k, bits);
    if (bits < best) { best = bits; by = kind; }
  };
  add(s, sp.name(x, s) + sp.surprise(x, s), "direct");
  let universal = best;
  for (const t of candidates) if (uOf(sp, t) >= uStar - 1e-9) add(t, sp.name(x, t) + sp.surprise(x, t), "candidate");
  const climb = climber(x, uStar, sp, best + 16);
  if (climb) { add(climb.target, climb.bits, "climb"); universal = Math.min(universal, climb.bits); }
  // Routes the climber met on its way (a type may report them in `extra` while it climbs): each a distinct target.
  for (const r of extra) { add(r.target, r.bits, "climb"); universal = Math.min(universal, r.bits); }
  return { cost: softMinBits(routes.values()), best, by, universal, routes: routes.size };
}

/** The mean of per-start costs and its standard error (the spread a viewer sees). */
export function meanAndSpread(costs: readonly number[]): { readonly energy: number; readonly spread: number } {
  const n = costs.length, m = costs.reduce((t, c) => t + c, 0) / n;
  if (n < 2) return { energy: m, spread: 0 };
  const v = costs.reduce((t, c) => t + (c - m) ** 2, 0) / (n - 1);
  return { energy: m, spread: Math.sqrt(v / n) };
}

/** K stratified unit draws per coordinate (a Latin hypercube): column i of row j is in [j', j' + 1)/K, j' a shuffle. */
export function latinHypercube(K: number, dims: number, unit: () => number, below: (n: number) => number): number[][] {
  const out = Array.from({ length: K }, () => Array<number>(dims).fill(0));
  for (let d = 0; d < dims; d++) {
    const perm = Array.from({ length: K }, (_, i) => i);
    for (let i = K - 1; i > 0; i--) { const j = below(i + 1); [perm[i], perm[j]] = [perm[j]!, perm[i]!]; }
    for (let j = 0; j < K; j++) out[j]![d] = (perm[j]! + unit()) / K;
  }
  return out;
}
