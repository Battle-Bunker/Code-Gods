/**
 * The threshold-free layer helpers the beginner and rational families share (owner decisions 13, 14 and 23): a layer is
 * a distance (smaller is better) or a count or size (bigger is better), never a ladder of thresholds. Internal to
 * v2-linear (not exported from the package root).
 */
import { Qn, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import type { LineState } from "./line.ts";

export type Ctx = EvalContext<LineState>;
export type L<P> = Layer<P>;

/** A distance layer: smaller is better. */
export function distance<P>(id: string, title: string, sentence: string, rep: string): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "min" };
}
/** A count or size layer: bigger is better. */
export function more<P>(id: string, title: string, sentence: string, rep: string | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max" };
}

export const undef = (v: ElementValue): Undef => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
export const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
export const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));

export interface Shape<P> { main: L<P>; tieBreakers: readonly L<P>[] }
/** Record the main layer and every tie-breaker as undefined (the main layer's input does not exist) and say why. */
export function allUndefined<P>(ctx: Ctx, f: Shape<P>, why: ElementValue, from: ElementRef): void {
  for (const l of [f.main, ...f.tieBreakers]) ctx.term(l.id, l.title, undef(why), [from]);
  ctx.mark({ kind: "note", ref: from, text: undef(why).undefined });
}
/** The card: the main layer's sentence, then the dealt tie-breaker's. */
export function card<P>(f: Shape<P>, p: P, tb: TieBreaker): string {
  const t = tb === null ? undefined : f.tieBreakers.find(x => x.id === tb);
  return t ? `${f.main.sentence(p)} Tie-breaker: ${t.sentence(p)}` : f.main.sentence(p);
}
/** A family: its dealable parameter sets on every variant, or `dealable` to choose them per variant. */
export function family<P extends object>(id: string, title: string, depends: string[], shape: Shape<P>, params: P[] | ((v: Parameters<RuleFamily<LineState, P>["dealable"]>[0]) => P[]), evaluate: (ctx: Ctx, p: P) => void): RuleFamily<LineState, P> {
  const dealable = typeof params === "function" ? params : () => params;
  return { id, title, card: (p, tb) => card(shape, p, tb), params: [], dealable, depends, ...shape, evaluate };
}
