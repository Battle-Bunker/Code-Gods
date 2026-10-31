/**
 * Family constructor for one object type with a typed view of the instantiation (`spec`), plus the hook that
 * lets exemplars score candidates with the family's own host-evaluated card (installed by catalog.ts).
 */
import type { Constraint, ObjectValue, Rng } from "@workspace/game-types";
import type { FamilyContext, Ordinal, Params, ScoreShape, UtilityFamily } from "../types.ts";
import type { AnalyticSurvival } from "../analytic.ts";

type HostEval = (familyId: string, params: Params, ctx: FamilyContext) => (wire: ObjectValue) => Ordinal;
let host: HostEval | null = null;
export function setHostEval(f: HostEval): void { host = f; }
export function hostEval(familyId: string, params: Params, ctx: FamilyContext): (wire: ObjectValue) => Ordinal {
  if (!host) throw new Error("host evaluator not installed (import the catalog)");
  return host(familyId, params, ctx);
}
export function cmp(a: Ordinal, b: Ordinal): number {
  const x = typeof a === "number" ? [a] : a, y = typeof b === "number" ? [b] : b;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
/** The first value with the highest ordinal. */
export function bestValue(familyId: string, p: Params, ctx: FamilyContext, values: readonly ObjectValue[]): ObjectValue {
  const u = hostEval(familyId, p, ctx);
  let best = values[0], bv = u(best);
  for (const v of values.slice(1)) {
    const o = u(v);
    if (cmp(o, bv) > 0) { best = v; bv = o; }
  }
  return best;
}

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[rng.int(items.length)];
export const SCALAR: ScoreShape = { kind: "scalar" };
export const tuple = (arity: number): ScoreShape => ({ kind: "tuple", arity });

export interface FamilyDef<P extends Params, S> {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly theme: string;
  readonly requires?: readonly Constraint[];
  readonly shape: ScoreShape;
  readonly role?: "reward" | "penalty";
  readonly tags?: readonly string[];
  readonly support: (s: S) => readonly P[];
  /** Defaults to uniform over the support. */
  readonly sample?: (rng: Rng, s: S) => P;
  readonly canonical?: (p: P, s: S) => P;
  readonly summary: (p: P, s: S) => string;
  readonly python: (p: P, s: S) => string;
  readonly typescript: (p: P, s: S) => string;
  readonly exemplar?: (p: P, s: S, ctx: FamilyContext) => ObjectValue;
  /** The analytic survival function (src/analytic.ts), or null for params/instantiations it does not cover. */
  readonly analytic?: (p: P, s: S, ctx: FamilyContext) => AnalyticSurvival | null;
}

export function defineFamilies<S>(objectType: string, spec: (ctx: FamilyContext) => S) {
  return <P extends Params>(d: FamilyDef<P, S>): UtilityFamily<P> => ({
    id: d.id, name: d.name, emoji: d.emoji, objectType, theme: d.theme,
    requires: d.requires ?? [], role: d.role ?? "reward", tags: d.tags ?? [],
    shape: () => d.shape,
    support: ctx => d.support(spec(ctx)),
    sample: (rng, ctx) => (d.sample ? d.sample(rng, spec(ctx)) : pick(rng, d.support(spec(ctx)))),
    canonical: (p, ctx) => (d.canonical ? d.canonical(p, spec(ctx)) : p),
    summary: (p, ctx) => d.summary(p, spec(ctx)),
    card: { python: (p, ctx) => d.python(p, spec(ctx)), typescript: (p, ctx) => d.typescript(p, spec(ctx)) },
    ...(d.exemplar ? { exemplar: (p: P, ctx: FamilyContext) => d.exemplar!(p, spec(ctx), ctx) } : {}),
    ...(d.analytic ? { analytic: (p: P, ctx: FamilyContext) => d.analytic!(p, spec(ctx), ctx) } : {}),
  });
}
