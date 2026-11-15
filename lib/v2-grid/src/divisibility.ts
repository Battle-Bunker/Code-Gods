/**
 * Divisibility (the rule design check, docs/engine-v2/design-principles.md; grid-params.md §12): the board's halves read
 * as long numbers, climbing toward high powers of a small prime. Dealt only by the "Grids · arithmetic" playtest preset (§13).
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
import { q as Q, ref, type RuleFamily, type Variant } from "@workspace/v2-core";
import { gridParams, type GridState } from "./grid.ts";
import { family, more, readCells, readNum, type Shape } from "./family-kit.ts";
import { NO_REPEATS, repeats } from "./param-families.ts";
import { diffName, divisibilityReadings, readingName, type DivisibilityLayout } from "./readings.ts";

export { divisibilityReadings, type DivisibilityLayout } from "./readings.ts";

export type DivisibilityLens = "powers" | "matching";
export type DivisibilityParams = { lens: DivisibilityLens; q: number; layout: DivisibilityLayout };
const numberOf = (v: readonly number[], cells: readonly number[]) => cells.reduce((t, i) => t * 10 + v[i]!, 0);
/** How many times q divides x (0 for x = 0: a reading of all zeros counts nothing). */
export function powerOf(x: number, q: number): number {
  if (x === 0) return 0;
  let v = 0;
  for (x = Math.abs(x); x % q === 0; x /= q) v++;
  return v;
}
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (k: number) => String(k).replace(/\d/g, d => SUP[d]!);
const minus = (x: number) => (x < 0 ? `−${-x}` : String(x));
/** The notes on one number: its power and what is left ("= 3² × 1371742"), and what one more q needs: the number's remainder r when divided by q^(v+1); add q^(v+1) − r or take away r. */
export function divisibilityNotes(x: number, v: number, q: number): string[] {
  if (x === 0) return ["0 counts nothing"];
  const left = x / q ** v, next = q ** (v + 1), r = ((x % next) + next) % next;
  return [v === 0 ? `no ${q} divides it` : `= ${q}${sup(v)} × ${minus(left)}`, `one more ${q}: add ${next - r} or take away ${r}`];
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
    main: more<DivisibilityParams>("powers", "the powers counted", p => `${READ[p.layout]}: ${WANT[p.lens](p.q)}${NO_REPEATS}.`, "readings"),
    tieBreakers: [
      more<DivisibilityParams>("leftover-digits", "the digits of what is left, added up",
        p => `What is left of those numbers after dividing out their ${p.q}s should have digits adding up to as much as possible.`, "readings"),
    ],
  };
  const params = (v: Variant): DivisibilityParams[] => (gridParams(v).size === 4 ? [...DIVISIBILITY_DEALT] : [{ lens: "powers", q: 3, layout: "halves" }]);
  return family<DivisibilityParams>("divisibility", "Divisibility", ["cells", "readings"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n), nums = divisibilityNumbers(n, p, cells.v);
    // The elements the numbers are: the four readings, or the rows' and the columns' differences.
    const readingRefs = [0, 1, 2, 3].map(k => ref("readings", readingName(p.layout, k)));
    const els = p.lens === "powers" ? readingRefs : [0, 1].map(k => ref("readings", diffName(p.layout, k)));
    // Read what is cited (the view's elements hold the same numbers the cells give).
    for (const r of new Set([...els, ...readingRefs])) readNum(ctx, r);
    ctx.term("powers", "the powers of q dividing the numbers, added up, less the repeated rows and columns", Q(nums.reduce((t, x) => t + x.v, 0) - repeats(n, cells.v)), els);
    ctx.term("leftover-digits", "the digits of what is left after dividing out the powers, added up", Q(nums.reduce((t, x) => t + (x.x === 0 ? 0 : digitSum(x.x / p.q ** x.v)), 0)), els);
    nums.forEach((x, k) => { for (const text of divisibilityNotes(x.x, x.v, p.q)) ctx.mark({ kind: "note", ref: els[k]!, text }); });
    // Focus the readings (both readings of a difference) that carry the highest power.
    const best = Math.max(...nums.map(x => x.v));
    if (best > 0) nums.forEach((x, k) => {
      if (x.v !== best) return;
      for (const r of p.lens === "powers" ? [readingRefs[k]!] : [readingRefs[2 * k]!, readingRefs[2 * k + 1]!]) ctx.mark({ kind: "focus", ref: r });
    });
  }, n);
}

/**
 * Dealt on 4×4: each lens with two q's on each layout, so a redraw keeps the layout and the lens and changes q
 * (drift.ts keeps `lens` and `layout`; a layout switch would read four new numbers and reset the board's worth).
 * Starter reach (200 climbs, median stop): powers of 3 9.1 bits, of 7 6.7; matching by 2 8.2–9.2, by 3 7.3.
 */
export const DIVISIBILITY_DEALT: readonly DivisibilityParams[] = [
  { lens: "powers", q: 3, layout: "halves" }, { lens: "powers", q: 7, layout: "halves" },
  { lens: "powers", q: 3, layout: "alternate" }, { lens: "powers", q: 7, layout: "alternate" },
  { lens: "matching", q: 2, layout: "halves" }, { lens: "matching", q: 3, layout: "halves" },
  { lens: "matching", q: 2, layout: "alternate" }, { lens: "matching", q: 3, layout: "alternate" },
];
