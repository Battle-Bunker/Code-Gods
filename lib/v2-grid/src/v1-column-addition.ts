/**
 * Column Addition, ported from v1's column_addition (archive/engine-v1 lib/game-utilities/src/families/grid/arithmetic.ts):
 * two rows are added like a written sum and the row below them is the answer. v1 scored (right columns in the run from
 * the right-hand end, right columns anywhere), with no score when the top number is all zeros; v2 keeps the run as the
 * main part and v1's own secondary (right columns anywhere) as a tie-breaker. The others read the same sum.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { type GridState } from "./grid.ts";
import { rows } from "./units.ts";
import { term, markFor, family, more, distance, readCells, type Shape } from "./family-kit.ts";

type SumParams = { top: number };
const BASE = 10;
/** The rows of the sum, counted from 1 at the top as the card says them. */
const said = (p: SumParams) => ({ a: p.top + 1, b: p.top + 2, answer: p.top + 3 });

/** The written sum of rows top and top + 1 against row top + 2: each column's right digit and whether the answer shows it, right to left. */
export function columnSum(v: readonly number[], n: number, top: number): { right: number[]; ok: boolean[]; answer: number[]; blank: boolean } {
  const [a, b, ans] = [rows(n)[top]!, rows(n)[top + 1]!, rows(n)[top + 2]!].map(r => r.map(i => v[i]!));
  const right: number[] = Array(n).fill(0), ok: boolean[] = Array(n).fill(false);
  let carry = 0;
  for (let i = n - 1; i >= 0; i--) {
    const total = a![i]! + b![i]! + carry;
    right[i] = total % BASE;
    ok[i] = right[i] === ans![i];
    carry = Math.floor(total / BASE);
  }
  return { right, ok, answer: ans!, blank: a!.every(x => x === 0) };
}

export function columnAddition(n: number): RuleFamily<GridState, SumParams> {
  const shape: Shape<SumParams> = {
    main: more<SumParams>("column-addition", "right columns in the run from the right-hand end",
      p => { const r = said(p); return `Rows ${r.a} and ${r.b} (counting from the top) are added like a written sum, and row ${r.answer} should be the answer. Work from the right-hand end and carry 1 whenever a column adds up to ${BASE} or more; a column is right when row ${r.answer} shows the right digit. Count the right columns in an unbroken run from the right-hand end. If row ${r.a} is all 0s, nothing counts.`; }, "cells"),
    tieBreakers: [
      more<SumParams>("right-columns", "right columns anywhere in the sum", () => "As many columns as possible should be right, anywhere in the sum.", "cells"),
      distance<SumParams>("near-digits", "how far each answer digit is from the right digit, added up",
        p => `Each digit in row ${said(p).answer} should be as close as possible to the right digit (a 6 where 8 is right is 2 off); the gaps are added up.`, "cells"),
      more<SumParams>("big-answer", "the answer row's digits added up",
        p => `The digits of row ${said(p).answer} should add up to as much as possible.`, "cells"),
    ],
  };
  const params: SumParams[] = Array.from({ length: n - 2 }, (_, top) => ({ top }));   // v1's support: the sum's top row, 0 to N − 3
  return family<SumParams>("column-addition", "Column Addition", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n);
    const s = columnSum(cells.v, n, p.top);
    const ansRow = rows(n)[p.top + 2]!;
    let run = 0;
    for (let i = n - 1; i >= 0 && s.ok[i]; i--) run++;
    const refs = [p.top, p.top + 1, p.top + 2].flatMap(r => rows(n)[r]!.map(i => cells.refs[i]!));
    if (s.blank) {
      term(ctx, "column-addition", "right columns in the run from the right-hand end (none: the top row is all 0s)", 0, refs);
      term(ctx, "right-columns", "right columns anywhere (none: the top row is all 0s)", 0, refs);
      markFor(ctx, "near-digits", ansRow.map(i => cells.refs[i]!));
      term(ctx, "near-digits", "how far each answer digit is from the right digit, added up (all 9 off: the top row is all 0s)", 9 * n, refs);
      term(ctx, "big-answer", "the answer row's digits added up (none: the top row is all 0s)", 0, refs);
      return;
    }
    term(ctx, "column-addition", "right columns in the run from the right-hand end", run, refs);
    ansRow.forEach((i, k) => ctx.mark(s.ok[k] ? { kind: "focus", ref: cells.refs[i]! } : { kind: "note", ref: cells.refs[i]!, text: `${s.right[k]} is right` }));
    markFor(ctx, "right-columns", ansRow.filter((_, k) => s.ok[k]).map(i => cells.refs[i]!));
    ansRow.forEach((i, k) => { if (!s.ok[k]) ctx.mark({ kind: "note", ref: cells.refs[i]!, text: `${Math.abs(s.answer[k]! - s.right[k]!)} off`, term: "near-digits" }); });
    markFor(ctx, "big-answer", ansRow.filter((_, k) => s.answer[k]! > 0).map(i => cells.refs[i]!));
    term(ctx, "right-columns", "right columns anywhere in the sum", s.ok.filter(Boolean).length, refs);
    term(ctx, "near-digits", "how far each answer digit is from the right digit, added up", s.answer.reduce((t, x, k) => t + Math.abs(x - s.right[k]!), 0), refs);
    term(ctx, "big-answer", "the answer row's digits added up", s.answer.reduce((t, x) => t + x, 0), refs);
  }, n);
}
