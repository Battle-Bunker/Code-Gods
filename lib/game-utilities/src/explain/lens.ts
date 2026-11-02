/**
 * A lens: one family's annotation spec (docs/annotations-design.md §6.1). Pure functions of the dealt params and a decoded
 * board. `parts` is the whole-board decomposition of the card's score into pieces; the focus cell selects some of them.
 * A lens never throws on a board of its instantiation; the tests check its parts add up to the card's own score.
 */
import type { Params } from "../types.ts";
import type { Board } from "./board.ts";
import { hasCell, type Breakdown, type BreakdownItem, type Cell, type OutcomeTable, type Part } from "./model.ts";

export interface Lens<P extends Params = Params> {
  readonly familyId: string;
  /** Names of the ordinal components the parts explain, in order (a prefix of the card's ordinal). */
  components(p: P, b: Board): string[];
  parts(p: P, b: Board): Part[];
  /**
   * REQUIRED: the whole board's raw score in words, the parts tallied by kind (see `tally`). The tests check the items
   * add up to the card's ordinal, and the "How this scores" view starts from it.
   */
  breakdown(p: P, b: Board, parts: readonly Part[]): Breakdown;
  /** The pieces the focus expands, in display order. Default: the pieces containing the focus, scoring first. */
  select?(parts: readonly Part[], focus: Cell, p: P, b: Board): Part[];
  /** Per-cell rules: the outcome table, with the focus cell's entry. */
  table?(p: P, b: Board, focus: Cell): OutcomeTable | null;
  /** A sentence for the focus when no piece says it. */
  note?(parts: readonly Part[], focus: Cell, p: P, b: Board): string | null;
  /** Boards worth trying as goal examples (wire values of the room's shape), besides the generic search. */
  seeds?(p: P, b: Board): string[];
}

/** Most pieces drawn for one focus (A1: one anchor, a few pieces). */
export const MAX_FOCUS_PARTS = 6;

/** The default selection: pieces containing the focus, scoring ones first, then losing, then zero; capped. */
export function containing(parts: readonly Part[], focus: Cell): Part[] {
  return orderParts(parts.filter(p => hasCell(p.cells, focus)));
}

const rank = (p: Part) => {
  const first = p.points.find(x => x !== 0) ?? 0;
  return first > 0 ? 0 : first < 0 ? 1 : 2;
};
/** Scoring pieces first, then losing, then the rest; stable; at most `max` (MAX_FOCUS_PARTS by default). */
export function orderParts(parts: readonly Part[], max = MAX_FOCUS_PARTS): Part[] {
  return parts.map((p, i) => [p, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([p]) => p).slice(0, max);
}

/** Lenses are written against their family's params; the registry stores them untyped. */
export const lens = <P extends Params>(l: Lens<P>): Lens => l as unknown as Lens;

/** "1 pair", "4 pairs". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Tally parts into breakdown lines: each group claims the parts its `of` accepts (first match wins), its points are
 * the sum of theirs, and a group with no parts is left out. Parts no group claims are a lens bug (the sum test fails).
 */
export function tally(parts: readonly Part[], groups: readonly { of: (p: Part) => boolean; text: (n: number, points: readonly number[]) => string }[]): BreakdownItem[] {
  const left = parts.slice(), out: BreakdownItem[] = [];
  for (const g of groups) {
    const mine = left.filter(g.of);
    for (const p of mine) left.splice(left.indexOf(p), 1);
    if (!mine.length) continue;
    const points = mine[0].points.map((_, k) => mine.reduce((s, p) => s + p.points[k], 0));
    out.push({ text: g.text(mine.length, points), points });
  }
  return out;
}
