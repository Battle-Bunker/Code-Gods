/** Prices (spec §5.2) and the walk (§5.4). */
import type { Call, Invalid, Mutator, ObjectType, Price, Variant } from "./contracts.ts";
import { isInvalid } from "./contracts.ts";
import type { Rng } from "./rng.ts";

const resolved = new WeakMap<Variant, readonly Mutator<any, any>[]>();

/** The variant's mutators, in the variant's order. */
export function variantMutators<S>(type: ObjectType<S>, variant: Variant): readonly Mutator<S, any>[] {
  let ms = resolved.get(variant);
  if (!ms) {
    ms = variant.mutators.map(id => {
      const m = type.mutators.find(x => x.id === id);
      if (!m) throw new Error(`Variant ${variant.id} offers unknown mutator ${id}`);
      return m;
    });
    resolved.set(variant, ms);
  }
  return ms;
}

export interface Applied<S> {
  readonly result: S;
  readonly price: Price;
}

/** Apply one mutator with decoded arguments and price it. Unchanged results are invalid (a call must change the object). */
export function applyPriced<S, A>(type: ObjectType<S>, variant: Variant, state: S, mutator: Mutator<S, A>, site: number, args: A): Applied<S> | Invalid {
  const ms = variantMutators(type, variant);
  if (!ms.includes(mutator)) return { invalid: `${mutator.id} is not offered in ${variant.id}` };
  const k = type.sites(state, variant);
  if (mutator.perSite && (!Number.isInteger(site) || site < 0 || site >= k)) return { invalid: `there is no line ${site + 1}` };
  const result = mutator.apply(state, mutator.perSite ? site : 0, args, variant);
  if (isInvalid(result)) return result;
  if (type.encode(result) === type.encode(state)) return { invalid: "that call does not change the object" };
  const which = Math.log2(ms.length);
  const where = mutator.perSite ? Math.log2(k) : 0;
  const arg = mutator.args(variant).bits(args);
  const surcharge = Math.max(0, type.readLength(result, variant) - type.readLength(state, variant));
  return { result, price: { which, where, arg, surcharge, total: which + where + arg + surcharge } };
}

/** Apply a wire call (as an agent returns it). */
export function applyCall<S>(type: ObjectType<S>, variant: Variant, state: S, call: Call): Applied<S> | Invalid {
  const m = variantMutators(type, variant).find(x => x.id === call.mutator);
  if (!m) return { invalid: `${call.mutator} is not offered in ${variant.id}` };
  let args: unknown;
  try {
    args = m.args(variant).decode(call.args);
  } catch (e) {
    return { invalid: `${call.mutator}: ${(e as Error).message}` };
  }
  return applyPriced(type, variant, state, m, call.site, args);
}

/** Apply calls in order; the first invalid one fails the whole list. */
export function applyCalls<S>(type: ObjectType<S>, variant: Variant, state: S, calls: readonly Call[]):
  { readonly result: S; readonly prices: readonly Price[]; readonly total: number } | Invalid {
  let s = state;
  const prices: Price[] = [];
  for (const c of calls) {
    const a = applyCall(type, variant, s, c);
    if (isInvalid(a)) return a;
    s = a.result;
    prices.push(a.price);
  }
  return { result: s, prices, total: prices.reduce((t, p) => t + p.total, 0) };
}

/**
 * One step of the walk: a call with probability 2^−price, otherwise stay (§5.4). `accept` filters proposals (the
 * restricted walk of §7.2 refuses steps that leave an upper set).
 */
export function walkStep<S>(type: ObjectType<S>, variant: Variant, state: S, rng: Rng, accept?: (s: S) => boolean): S {
  const ms = variantMutators(type, variant);
  const m = ms[rng.below(ms.length)]!;
  const site = m.perSite ? rng.below(type.sites(state, variant)) : 0;
  const a = m.args(variant).sample(rng);
  if (a === null) return state;
  const r = m.apply(state, site, a, variant);
  if (isInvalid(r)) return state;
  const grow = type.readLength(r, variant) - type.readLength(state, variant);
  if (grow > 0 && !rng.chance(grow)) return state;
  if (accept && !accept(r)) return state;
  return r;
}
