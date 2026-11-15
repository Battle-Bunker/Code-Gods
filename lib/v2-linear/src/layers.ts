/**
 * The threshold-free layer helpers the beginner and rational families share (owner decisions 13, 14 and 23): a layer is
 * a distance (smaller is better) or a count or size (bigger is better), never a ladder of thresholds. Internal to
 * v2-linear (not exported from the package root).
 */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Layer, type Q, type RuleFamily, type TieBreaker, type Undef } from "@workspace/v2-core";
import { lineParams, type LineState } from "./line.ts";
import { nearestSquareRoot } from "./numbers.ts";

export type Ctx = EvalContext<LineState>;
export type L<P> = Layer<P>;

/** A distance layer: smaller is better. */
export function distance<P>(id: string, title: string, sentence: string, rep: string): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "min" };
}
/**
 * A tie-breaker dealt on no variant: a candidate (line-rules-v3-proposals.md §A2) added to a family that is already in a
 * pool, kept out of the deal until it passes the collapse check (§A5). It is still evaluated and valued.
 */
export const undealt = <P,>(l: L<P>): L<P> => ({ ...l, dealtOn: () => false });
/** A count or size layer: bigger is better. */
export function more<P>(id: string, title: string, sentence: string, rep: string | "size" = "size"): L<P> {
  return { id, title, sentence: () => sentence, rep, sense: "max" };
}
/**
 * A layer whose value is a prime or a prime factor, bigger better: its value function keeps rising past the measured
 * knots at the code's own cost of a prime, ½ bit per unit (owner decisions 26 and 30).
 */
export const prime = <P,>(l: L<P>): L<P> => ({ ...l, measure: "prime" });

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

// ---------------------------------------------------------------- helpers shared by the beginner families (beginner.ts, beginner-areas.ts)

/** The square nearest x, and how far x is from it. */
export const squareGap = (x: Q): { root: bigint; d: Q } => { const r = nearestSquareRoot(x); return { root: r, d: gap(x, q(r * r)) }; };

// ---------------------------------------------------------------- vertical lines (the coordinator's call, 15 Nov)
// A vertical line x = k is a real line a 12-year-old knows. Rules with an honest reading of it score it (its main part
// read through another lens); its tie-breakers that need a gradient or a y-intercept stay undefined (the worst).
export const VERTICAL_NO = "a vertical line has no gradient or y-intercept";
/** Where a vertical line stands (x = −c/a), read from the general form; null for any other line. */
export function verticalAt(ctx: Ctx): { x: Q; from: ElementRef[] } | null {
  const bRef = ref("gen", "b");
  if (num(ctx.read(bRef))!.n !== 0n) return null;
  const aRef = ref("gen", "a"), cRef = ref("gen", "c");
  const a = num(ctx.read(aRef))!, c = num(ctx.read(cRef))!;
  return { x: Qn.neg(Qn.div(c, a)), from: [aRef, bRef, cRef] };
}
/** Score only the main part (the tie-breakers undefined) for a vertical line. */
export function verticalMain<P>(ctx: Ctx, f: Shape<P>, label: string, value: Q, from: ElementRef[]): void {
  ctx.term(f.main.id, label, value, from);
  for (const l of f.tieBreakers) ctx.term(l.id, l.title, { undefined: VERTICAL_NO }, from);
  ctx.mark({ kind: "note", ref: from[0]!, text: `a vertical line: ${label}` });
}

/** Not dealt on whole-number lines, where it cannot decide anything (Ruler's distance is never whole there; b is always 1). */
export const notOnWhole = <P,>(l: L<P>): L<P> => ({ ...l, dealtOn: v => lineParams(v).domain !== "Z" });

/**
 * A prime-factor term's label: 0, 1, −1 and fractions have no prime factor, and the term then counts as 1 (the lowest
 * a whole number with a factor can score is 2), so the label says so rather than showing a bare "smallest prime factor: 1".
 */
export function factorLabel(which: "smallest" | "largest", what: string, x: Q): string {
  if (x.d !== 1n) return `${what} (${Qn.toWire(x)}) is not a whole number, so it has no prime factor: counts as 1`;
  if (x.n >= -1n && x.n <= 1n) return `${what} (${x.n}) has no prime factor: counts as 1`;
  return `${what}'s ${which} prime factor`;
}
