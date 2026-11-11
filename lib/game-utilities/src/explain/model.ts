/**
 * The goal annotation model (docs/annotations-design.md §4): what a utility's rule looks at on one board, piece by piece,
 * and what each piece scores. Types only, dependency-free, so the lenses (which produce it) and the renderer in
 * lib/object-views (which draws it) share one vocabulary without game-utilities depending on React.
 *
 * Cells are `{ r, c }`, zero-based row and column (row 0 is the top row).
 */
import type { Ordinal } from "../types.ts";

export interface Cell {
  readonly r: number;
  readonly c: number;
}

/** A piece's tone, always derived from its points (gain > 0, loss < 0, zero), never stated separately. */
export type Tone = "gain" | "loss" | "zero";

/** A condition the rule checks on a piece, in the card's words with the actual symbols: shown with ✓ or ✗. */
export interface Fact {
  readonly text: string;
  readonly ok: boolean;
  /** The points tier this check derives (0 primary, 1 secondary…; src/tuples.ts). Default 0. */
  readonly tier?: number;
}

/** A cell inside a piece worth pointing at (a mine, a frame breaker), with a short label. */
export interface Spot {
  readonly cell: Cell;
  readonly label: string;
  readonly tone: Tone;
}

/** A connector between two cells of a piece (a mirror pair, a knight's jump), drawn as an arc, ✓ or ✗. */
export interface Link {
  readonly from: Cell;
  readonly to: Cell;
  readonly ok: boolean;
}

/** How a piece is drawn: one cell, a capsule (pair, line), a block (2×2, a window), an outline (region, ring). */
export type PartShape = "cell" | "pair" | "line" | "block" | "window" | "region" | "ring";

/** One piece of the rule: one thing the card's loops look at, and what it scores. */
export interface Part {
  /** Stable within an explanation ("trio:1,0:right"). */
  readonly id: string;
  readonly shape: PartShape;
  /** The piece's cells, in order for lines and pairs. */
  readonly cells: readonly Cell[];
  /** Points per explained ordinal component (length = the explanation's `components`). */
  readonly points: readonly number[];
  /** "SET", "not a SET", "3 + 7 = 10". */
  readonly title: string;
  readonly facts: readonly Fact[];
  readonly spots?: readonly Spot[];
  readonly links?: readonly Link[];
  /**
   * Which hover mode picks this unit on the board ("row", "column", "block", "pair", "cell"…): see units.ts. Units of
   * one group never share a centre, so the board can point at each of them.
   */
  readonly group?: string;
  /** The cell the board picks this unit by, when its cells overlap other units' (a minesweeper number's 3×3 window). */
  readonly anchor?: Cell;
}

/** Where one ★ tier of a tiered draw stands on a board (docs/layered-rules-design.md §4). */
export interface TierStatus {
  /** The interaction's id (the card's `tiers[].id`). */
  readonly id: string;
  /** Where the tier's points sit in the ordinal, and how many components it has. */
  readonly index: number;
  readonly arity: number;
  /** The tier counts once the first component reaches this. */
  readonly gate: number;
  /** Whether the board has reached the gate (its tier units are then among the parts). */
  readonly open: boolean;
  /** How many more primary points open the tier (0 when open). */
  readonly short: number;
  /** "2 more opposite pairs to open ★: rows, columns and long diagonals adding up to 18." */
  readonly note: string;
}

/** The whole board's explanation: its scoring units and what they add up to. */
export interface Explanation {
  readonly familyId: string;
  readonly size: number;
  readonly parts: readonly Part[];
  /**
   * What each tier of the points tuple counts, in order (a prefix of the card's ordinal): ["SETs"], or
   * ["lines adding up to 16", "how far the totals are from 16"]. Shown as "primary points: …", "secondary points: …".
   */
  readonly components: readonly string[];
  /** The card's own score of this board, evaluated by the card program. */
  readonly ordinal: Ordinal;
  /** Σ part.points[k] === ordinal[k] for every explained component k. Unverified explanations are never drawn. */
  readonly verified: boolean;
  /** A tiered draw's ★ tiers on this board, in the ordinal's order (absent for a base draw). */
  readonly tiers?: readonly TierStatus[];
}

/** One line of the raw-score breakdown: a kind of piece, how many there are, and what they add up to. */
export interface BreakdownItem {
  /** "4 best-friend pairs", "2 lines miss 10 by 5 in all". */
  readonly text: string;
  /** What these pieces add to each explained component (length = the explanation's `components`). */
  readonly points: readonly number[];
}

/**
 * The raw score of a whole board in words (every lens must give one): the pieces tallied by kind. The items' points
 * add up to the card's ordinal on every explained component (tested for every lens), so the breakdown is the score.
 */
export interface Breakdown {
  /** What the first component counts, for "at least 4 friend pairs": [one, many]. */
  readonly unit: readonly [one: string, many: string];
  readonly items: readonly BreakdownItem[];
}

/** A goal card's example board: a board of the room's own size, symbols and colours, and a caption. */
export interface GoalExample {
  readonly value: string;
  readonly size: number;
  readonly caption: string;
}

export const toneOf = (points: readonly number[]): Tone => {
  const first = points.find(x => x !== 0) ?? 0;
  return first > 0 ? "gain" : first < 0 ? "loss" : "zero";
};
export const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
export const hasCell = (cells: readonly Cell[], x: Cell) => cells.some(c => sameCell(c, x));
