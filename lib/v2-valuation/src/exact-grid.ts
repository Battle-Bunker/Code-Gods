/**
 * The exact law of a grid rule's terms (docs/engine-v2/grids.md §5), for its value function (value-grid.ts). Every grid price list is an exact potential, so the
 * walk's law is π(board) = Π cells p(v): the cells are independent. A family declares (lib/v2-grid's gridSums) disjoint
 * units of cells over which each of its layers adds up. The pair (main term, tie-breaker term) is then a sum of
 * independent pairs, one per unit, and its law is the convolution of the units' laws.
 *
 * No rule logic is duplicated: a unit's contribution is read by evaluating the rule itself on the reference board (the
 * empty board) with only that unit changed, and the declared additivity is checked on boards drawn from π before use.
 * On a bounded board the law is exact (no outside mass).
 */
import { evaluateSite, Qn, q, rng, ruleLayers, type ObjectType, type Q, type RuleFamily, type TieBreaker, type Undef, type Variant } from "@workspace/v2-core";
import { cellProbability, gridParams, gridSums, type GridState } from "@workspace/v2-grid";

const W = Qn.toWire;
const isUndef = (v: Q | Undef): v is Undef => typeof (v as Undef).undefined === "string";

/** How many boards the additivity check draws from π, and as many again uniformly (big numbers included). */
export const ADDITIVITY_CHECKS = 400;

/** Every layer's term per unit configuration, kept across a family's tie-breakers (the main layer's are shared). */
const unitCache = new WeakMap<object, Map<string, Map<string, Q[]>>>();

/**
 * The exact joint law of a rule's dealt layers' terms on a grid variant (main, then tie-breaker): every attainable pair of
 * term values with its stationary mass, by convolving the declared units' laws. The mass sums to 1 on a bounded board.
 */
export function gridJointLaw<P>(type: ObjectType<GridState>, family: RuleFamily<GridState, P>, params: P, variant: Variant, tieBreaker: TieBreaker):
  { readonly layers: readonly string[]; readonly entries: readonly { readonly terms: readonly Q[]; readonly w: number }[] } {
  const plan = gridSums[family.id];
  if (!plan) throw new Error(`${family.id}: no gridSums plan`);
  const { size, cap } = gridParams(variant);
  const layers = ruleLayers(family, tieBreaker).map(l => l.id);
  const allLayers = [family.main, ...family.tieBreakers].map(l => l.id);
  const pick = layers.map(id => allLayers.indexOf(id));
  const units = plan.units(variant);
  const seen = new Set<number>();
  for (const u of units) for (const i of u) { if (seen.has(i)) throw new Error(`${family.id}: units overlap at cell ${i}`); seen.add(i); }
  const p = Array.from({ length: cap + 1 }, (_, x) => cellProbability(x, variant));

  /** Every layer's term (main, then each tie-breaker in the family's order). */
  const allTermsOf = (cells: readonly number[]): Q[] => {
    const e = evaluateSite(type, family, params, { cells }, variant, 0, null);
    return allLayers.map(id => {
      const v = e.terms.find(t => t.id === id)!.value;
      if (isUndef(v)) throw new Error(`${family.id}: layer ${id} is undefined on a board; exact grid sums need defined terms`);
      return v;
    });
  };
  const termsOf = (cells: readonly number[]): Q[] => { const all = allTermsOf(cells); return pick.map(j => all[j]!); };
  const ref: number[] = Array(size * size).fill(0);
  const base = termsOf(ref);
  const byFamily = unitCache.get(family) ?? new Map<string, Map<string, Q[]>>();
  unitCache.set(family, byFamily);
  const cacheKey = `${variant.id}|${JSON.stringify(params)}`;
  const cache = byFamily.get(cacheKey) ?? new Map<string, Q[]>();
  byFamily.set(cacheKey, cache);

  // Each unit's law: configuration → (contribution of each layer, probability).
  const unitTables = units.map(u => {
    const table = new Map<string, Q[]>();
    const law = new Map<string, { c: Q[]; w: number }>();
    const cfg = Array(u.length).fill(0);
    const rec = (k: number, w: number): void => {
      if (k === u.length) {
        const cells = ref.slice();
        u.forEach((i, j) => { cells[i] = cfg[j]; });
        const ck = cells.join(",");
        let all = cache.get(ck);
        if (!all) { all = allTermsOf(cells); cache.set(ck, all); }
        const c = pick.map((j, k2) => Qn.sub(all![j]!, base[k2]!));
        table.set(cfg.join(","), c);
        const key = c.map(W).join("|");
        const e = law.get(key) ?? { c, w: 0 };
        e.w += w;
        law.set(key, e);
        return;
      }
      for (let x = 0; x <= cap; x++) { cfg[k] = x; rec(k + 1, w * p[x]!); }
    };
    rec(0, 1);
    return { table, law: [...law.values()] };
  });

  // The declaration is a contract: check it on boards drawn from the law.
  const r = rng("grid-additivity", family.id, W(q(units.length)));
  const draw = (): number => { let u = r.unit(), x = 0; while (x < cap && u >= p[x]!) { u -= p[x]!; x++; } return x; };
  for (let i = 0; i < 2 * ADDITIVITY_CHECKS; i++) {
    const cells = Array.from({ length: size * size }, () => (i < ADDITIVITY_CHECKS ? draw() : r.below(cap + 1)));
    const got = termsOf(cells);
    const want = base.slice();
    units.forEach((u, k) => {
      const c = unitTables[k]!.table.get(u.map(j => cells[j]).join(","))!;
      c.forEach((x, j) => { want[j] = Qn.add(want[j]!, x); });
    });
    if (got.some((g, j) => !Qn.eq(g, want[j]!))) {
      throw new Error(`${family.id}+${tieBreaker}: not additive over its declared units on the board ${type.encode({ cells })} (terms ${got.map(W).join(", ")}, the units add up to ${want.map(W).join(", ")})`);
    }
  }

  // Convolve the units' laws.
  let joint = new Map<string, { c: Q[]; w: number }>([[base.map(W).join("|"), { c: base, w: 1 }]]);
  for (const { law } of unitTables) {
    const next = new Map<string, { c: Q[]; w: number }>();
    for (const a of joint.values()) for (const b of law) {
      const c = a.c.map((x, j) => Qn.add(x, b.c[j]!));
      const key = c.map(W).join("|");
      const e = next.get(key) ?? { c, w: 0 };
      e.w += a.w * b.w;
      next.set(key, e);
    }
    joint = next;
  }

  return { layers, entries: [...joint.values()].map(({ c, w }) => ({ terms: c, w })) };
}
