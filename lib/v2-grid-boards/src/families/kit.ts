/** Building blocks of the board families: a family from its shape, and readers of a board's cells and colours. */
import { cardText, q, ref, type ElementRef, type EvalContext, type Layer, type Q, type RuleFamily, type Variant } from "@workspace/v2-core";
import type { BoardState } from "../board.ts";
import { COLOURS } from "../board.ts";
import { cellName } from "../units.ts";

export type Ctx = EvalContext<BoardState>;
export interface Shape<P> { readonly main: Layer<P>; readonly tieBreakers: readonly Layer<P>[] }

export const more = <P,>(id: string, title: string, sentence: string | ((p: P) => string), rep = "cells"): Layer<P> =>
  ({ id, title, sentence: typeof sentence === "string" ? () => sentence : sentence, rep, sense: "max" });
export const less = <P,>(id: string, title: string, sentence: string | ((p: P) => string), rep = "cells"): Layer<P> =>
  ({ id, title, sentence: typeof sentence === "string" ? () => sentence : sentence, rep, sense: "min" });

/** A board family; `params` derives its dealable parameter sets from the variant. */
export function family<P extends object>(id: string, title: string, shape: Shape<P>, params: (v: Variant) => P[], evaluate: (ctx: Ctx, p: P) => void): RuleFamily<BoardState, P> {
  return {
    id, title, card: (p, tb) => cardText(shape.main, shape.tieBreakers, p, tb), params: [], dealable: params, depends: ["cells"], ...shape,
    evaluate: (ctx, p) => evaluate(ctx, p),
  };
}

/** Every cell's number and colour name, with each cell's refs. */
export interface Cells { readonly n: number; readonly v: number[]; readonly c: string[]; readonly refs: ElementRef[] }
export function readBoard(ctx: Ctx, n: number): Cells {
  const refs = Array.from({ length: n * n }, (_, i) => ref("cells", cellName(n, i)));
  const v = refs.map(r => Number((ctx.read(r) as { q: Q }).q.n));
  const c = Array.from({ length: n * n }, (_, i) => (ctx.read(ref("cells", `${cellName(n, i)}.colour`)) as { text: string }).text);
  return { n, v, c, refs };
}
export const term = (ctx: Ctx, id: string, label: string, x: number, refs: readonly ElementRef[]) => ctx.term(id, label, q(x), [...refs]);
/** The names of a board's colours, in rainbow order. */
export const colourNames = (palette: readonly number[]): string[] => palette.map(i => COLOURS[i]!.name);
export const an = (w: string) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
