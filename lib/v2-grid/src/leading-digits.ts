/**
 * Leading Digits (grid-params.md §13; a readability playtest in "Grids · arithmetic"): the board's four readings, each
 * matched against the start of a power of a small base. Built like Divisibility (divisibility.ts), on the same readings.
 *
 * - The main part has no findable top: each reading should start with the same digits as some power of b (b^0 … b^1000),
 *   for as many digits as possible; every cell sits in two readings (a row half and a column half), so a board that
 *   starts all four readings like long powers is a search, not a formula. Repeated rows or columns are subtracted.
 * - The tie-breaker reads the attained powers: for each reading, the smallest exponent whose power starts with the
 *   digits it matched; the exponents' digits, added up. Stepping up the main part changes the power, so its climb starts
 *   again.
 * - Exact: the powers are BigInt, not k·log10(b) in floating point. A power with fewer digits than the reading shares
 *   only its own digits (2 = 2¹ starts 20000000 for one digit, not eight). A reading with leading 0s is the shorter number;
 *   a reading of 0 counts nothing.
 */
import { q as Q, ref, type RuleFamily, type Variant } from "@workspace/v2-core";
import { gridParams, type GridState } from "./grid.ts";
import { family, more, readCells, readNum, type Shape } from "./family-kit.ts";
import { NO_REPEATS, repeats } from "./param-families.ts";
import { divisibilityReadings, readingName, type DivisibilityLayout } from "./readings.ts";

export type LeadingDigitsParams = { b: number; layout: DivisibilityLayout };
/** The highest exponent matched against. */
export const LEAD_MAX_EXPONENT = 1000;
/** How many leading digits a reading can match (a reading is 8 cells). */
const LEAD_WIDTH = 8;

const tables = new Map<number, { starts: Map<string, number>; powers: { head: string; length: number }[] }>();
/** For base b: every start (1 to 8 leading digits) of b^0 … b^1000, to the smallest exponent with that start; and each power's first 8 digits and length. */
function leadTable(b: number) {
  let t = tables.get(b);
  if (!t) {
    const starts = new Map<string, number>(), powers: { head: string; length: number }[] = [];
    let x = 1n;
    for (let k = 0; k <= LEAD_MAX_EXPONENT; k++) {
      const s = x.toString(), head = s.slice(0, LEAD_WIDTH);
      powers.push({ head, length: s.length });
      for (let n = 1; n <= head.length; n++) if (!starts.has(head.slice(0, n))) starts.set(head.slice(0, n), k);
      x *= BigInt(b);
    }
    tables.set(b, t = { starts, powers });
  }
  return t;
}

/**
 * How many leading digits x shares with the start of some power b^k (k ≤ 1000), and the smallest such k; 0 digits and no
 * k for x = 0. The starts are closed under shortening, so the longest is found by lengthening one digit at a time.
 */
export function leadMatch(x: number, b: number): { digits: number; k: number | null } {
  if (x === 0) return { digits: 0, k: null };
  const { starts } = leadTable(b), s = String(Math.abs(x));
  let n = 0;
  while (n < s.length && starts.has(s.slice(0, n + 1))) n++;
  return n === 0 ? { digits: 0, k: null } : { digits: n, k: starts.get(s.slice(0, n))! };
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (k: number) => String(k).replace(/\d/g, d => SUP[d]!);
/** The note on one reading: the power it starts like and how many digits ("starts like 2¹²⁹ = 6805…: 4 digits"). */
export function leadingDigitsNote(x: number, b: number): string {
  const m = leadMatch(x, b);
  if (m.k === null) return x === 0 ? "0 counts nothing" : `starts like no power of ${b}`;
  const power = leadTable(b).powers[m.k]!;
  const shown = `${power.head.slice(0, m.digits)}${power.length > m.digits ? "…" : ""}`;
  return `starts like ${b}${sup(m.k)} = ${shown}: ${m.digits} digit${m.digits === 1 ? "" : "s"}`;
}
const digitSum = (x: number) => { let s = 0; for (x = Math.abs(x); x; x = Math.floor(x / 10)) s += x % 10; return s; };
const numberOf = (v: readonly number[], cells: readonly number[]) => cells.reduce((t, i) => t * 10 + v[i]!, 0);

const READ: Record<DivisibilityLayout, string> = {
  halves: "Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number",
  alternate: "Read the odd rows and the even rows row by row, and the odd columns and the even columns column by column, each as one number",
};

export function leadingDigits(n: number): RuleFamily<GridState, LeadingDigitsParams> {
  const shape: Shape<LeadingDigitsParams> = {
    main: more<LeadingDigitsParams>("digits", "the leading digits matched",
      p => `${READ[p.layout]}: each should start with the same digits as some power of ${p.b} (up to the ${LEAD_MAX_EXPONENT}th), for as many digits as possible${NO_REPEATS}.`, "readings"),
    tieBreakers: [
      more<LeadingDigitsParams>("exponent-digits", "the digits of the powers' exponents, added up",
        p => `For each number, take the smallest power of ${p.b} it starts like (to that many digits): the digits of those exponents, added up, should be as much as possible.`, "readings"),
    ],
  };
  const params = (v: Variant): LeadingDigitsParams[] => (gridParams(v).size === 4 ? [...LEADING_DIGITS_DEALT] : [{ b: 2, layout: "halves" }]);
  return family<LeadingDigitsParams>("leading-digits", "Leading Digits", ["cells", "readings"], shape, params, (ctx, p) => {
    const cells = readCells(ctx, n);
    const xs = divisibilityReadings(n, p.layout).map(c => numberOf(cells.v, c));
    const refs = [0, 1, 2, 3].map(k => ref("readings", readingName(p.layout, k)));
    for (const r of refs) readNum(ctx, r);
    const ms = xs.map(x => leadMatch(x, p.b));
    ctx.term("digits", "the leading digits each reading shares with a power, added up, less the repeated rows and columns", Q(ms.reduce((t, m) => t + m.digits, 0) - repeats(n, cells.v)), refs);
    ctx.term("exponent-digits", "the digits of each reading's smallest matching exponent, added up", Q(ms.reduce((t, m) => t + (m.k === null ? 0 : digitSum(m.k)), 0)), refs);
    xs.forEach((x, k) => ctx.mark({ kind: "note", ref: refs[k]!, text: leadingDigitsNote(x, p.b) }));
    // Focus the readings that match the most digits.
    const best = Math.max(...ms.map(m => m.digits));
    if (best > 0) ms.forEach((m, k) => { if (m.digits === best) ctx.mark({ kind: "focus", ref: refs[k]! }); });
  }, n);
}

/** Dealt on 4×4: bases 2 and 7 × two layouts (starter reach 10.3 and 10.6 bits; grid-params.md §13). */
export const LEADING_DIGITS_DEALT: readonly LeadingDigitsParams[] = [
  { b: 2, layout: "halves" }, { b: 2, layout: "alternate" }, { b: 7, layout: "halves" }, { b: 7, layout: "alternate" },
];
