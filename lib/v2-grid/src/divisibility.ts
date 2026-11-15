/**
 * Divisibility (the rule design check, docs/engine-v2/design-principles.md; grid-params.md §12): the board's halves read
 * as long numbers, climbing toward high powers of a small prime. Undealt until the coordinator replaces the beginner pool.
 *
 * - The main part has no findable top (row 1): each reading is an 8-digit number and every cell sits in two readings
 *   (a row half and a column half), so the levels (each further q dividing a reading) get rarer by about log2 q bits each
 *   and no formula writes down a board that meets all four readings at once.
 * - The tie-breaker reads the attained number (row 3): what is left of each reading after dividing out its power of q.
 *   Stepping up the main part changes those numbers, so the tie-breaker's climb starts again.
 * - Lenses: powers (each reading divisible by a high power of q) and matching (a half and its opposite half differing by
 *   a number divisible by a high power of q); layouts: halves (top / bottom row by row, left / right column by column) or
 *   alternate (odd and even rows, odd and even columns).
 */
import { q as Q, type RuleFamily, type Variant } from "@workspace/v2-core";
import { gridParams, type GridState } from "./grid.ts";
import { family, more, readCells, type Shape } from "./family-kit.ts";
import { NO_REPEATS, repeats } from "./param-families.ts";

export type DivisibilityLens = "powers" | "matching";
export type DivisibilityLayout = "halves" | "alternate";
export type DivisibilityParams = { lens: DivisibilityLens; q: number; layout: DivisibilityLayout };

/** The four readings, each a list of cells in reading order: [first rows, second rows, first columns, second columns]. */
export function divisibilityReadings(n: number, layout: DivisibilityLayout): number[][] {
  const half = n / 2, idx = [...Array(n).keys()];
  const pick = (k: number) => (layout === "halves" ? k < half : k % 2 === 0);
  const rowsOf = (first: boolean) => idx.filter(r => pick(r) === first).flatMap(r => idx.map(c => r * n + c));
  const colsOf = (first: boolean) => idx.filter(c => pick(c) === first).flatMap(c => idx.map(r => r * n + c));
  return [rowsOf(true), rowsOf(false), colsOf(true), colsOf(false)];
}
const numberOf = (v: readonly number[], cells: readonly number[]) => cells.reduce((t, i) => t * 10 + v[i]!, 0);
/** How many times q divides x (0 for x = 0: a reading of all zeros counts nothing). */
export function powerOf(x: number, q: number): number {
  if (x === 0) return 0;
  let v = 0;
  for (x = Math.abs(x); x % q === 0; x /= q) v++;
  return v;
}
const digitSum = (x: number) => { let s = 0; for (x = Math.abs(x); x; x = Math.floor(x / 10)) s += x % 10; return s; };

/** The numbers the main part reads (four readings, or the two differences) and each one's power of q. */
export function divisibilityNumbers(n: number, p: DivisibilityParams, v: readonly number[]): { x: number; v: number }[] {
  const r = divisibilityReadings(n, p.layout).map(c => numberOf(v, c));
  const xs = p.lens === "powers" ? r : [r[0]! - r[1]!, r[2]! - r[3]!];
  return xs.map(x => ({ x, v: powerOf(x, p.q) }));
}

const READ: Record<DivisibilityLayout, string> = {
  halves: "Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number",
  alternate: "Read the odd rows and the even rows row by row, and the odd columns and the even columns column by column, each as one number",
};
const WANT: Record<DivisibilityLens, (q: number) => string> = {
  powers: q => `each should be divisible by as high a power of ${q} as possible (count the ${q}s that divide it)`,
  matching: q => `the two row numbers should differ, and so should the two column numbers, by numbers divisible by as high a power of ${q} as possible (count the ${q}s)`,
};

export function divisibility(n: number): RuleFamily<GridState, DivisibilityParams> {
  const shape: Shape<DivisibilityParams> = {
    main: more<DivisibilityParams>("powers", "the powers counted", p => `${READ[p.layout]}: ${WANT[p.lens](p.q)}${NO_REPEATS}.`, "cells"),
    tieBreakers: [
      more<DivisibilityParams>("leftover-digits", "the digits of what is left, added up",
        p => `What is left of those numbers after dividing out their ${p.q}s should have digits adding up to as much as possible.`, "cells"),
    ],
  };
  const params = (v: Variant): DivisibilityParams[] => (gridParams(v).size === 4 ? [...DIVISIBILITY_DEALT] : [{ lens: "powers", q: 3, layout: "halves" }]);
  return family<DivisibilityParams>("divisibility", "Divisibility", ["cells"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), nums = divisibilityNumbers(n, p, cells.v);
    ctx.term("powers", "the powers of q dividing the numbers, added up, less the repeated rows and columns", Q(nums.reduce((t, x) => t + x.v, 0) - repeats(n, cells.v)), cells.refs);
    ctx.term("leftover-digits", "the digits of what is left after dividing out the powers, added up", Q(nums.reduce((t, x) => t + (x.x === 0 ? 0 : digitSum(x.x / p.q ** x.v)), 0)), cells.refs);
    // Focus the cells of the readings (both halves of a difference) that carry the highest power.
    const best = Math.max(...nums.map(x => x.v));
    if (best > 0) {
      const rs = divisibilityReadings(n, p.layout), seen = new Set<number>();
      nums.forEach((x, k) => {
        if (x.v !== best) return;
        for (const c of p.lens === "powers" ? [rs[k]!] : [rs[2 * k]!, rs[2 * k + 1]!]) for (const i of c) if (!seen.has(i)) { seen.add(i); ctx.mark({ kind: "focus", ref: cells.refs[i]! }); }
      });
    }
  }, n);
}

/** Dealt on 4×4: two lenses × two layouts (the gate of grid-params.md §12: starters reach 9–10 bits on each). */
export const DIVISIBILITY_DEALT: readonly DivisibilityParams[] = [
  { lens: "powers", q: 3, layout: "halves" }, { lens: "powers", q: 3, layout: "alternate" },
  { lens: "matching", q: 2, layout: "halves" }, { lens: "matching", q: 2, layout: "alternate" },
];
