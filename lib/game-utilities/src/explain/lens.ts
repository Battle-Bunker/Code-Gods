/**
 * A lens: one family's annotation spec (docs/annotations-design.md §6.1). Pure functions of the dealt params and a decoded
 * board. `parts` is the whole-board decomposition of the card's score into scoring units; the renderer lists them all
 * (sorted by what they score, units.ts) and the board picks one under the pointer by the lens's `hover` geometry.
 * A lens never throws on a board of its instantiation; the tests check its parts add up to the card's own score.
 */
import type { Params } from "../types.ts";
import type { Board } from "./board.ts";
import type { Breakdown, BreakdownItem, Part } from "./model.ts";
import type { HoverGeometry } from "./units.ts";

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
  /**
   * How the board picks a unit under the pointer: hover modes over the parts' groups (units.ts). Default: one mode over
   * every group the parts use. A lens whose units overlap (rows and columns, four line directions, blocks and pairs)
   * offers one mode per kind, which the renderer shows as an auxiliary toggle.
   */
  hover?(p: P, b: Board): HoverGeometry;
  /** Boards worth trying as goal examples (wire values of the room's shape), besides the generic search. */
  seeds?(p: P, b: Board): string[];
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
