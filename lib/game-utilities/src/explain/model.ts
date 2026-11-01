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
}

/**
 * Per-cell rules: every kind of cell the rule distinguishes, as a table of sample tiles with their points. `at` is the
 * focus cell's entry. Samples are (symbol index, colour index) of the room's own symbols and colours.
 */
export interface OutcomeTable {
  readonly title: string;
  readonly rows: readonly string[];
  readonly cols: readonly string[];
  readonly entries: readonly (readonly OutcomeEntry[])[];
  readonly at: readonly [row: number, col: number] | null;
}
export interface OutcomeEntry {
  readonly points: number;
  /** A tile that falls in this entry: symbol and colour indices of the room. */
  readonly sample: { readonly sym: number; readonly col: number };
}

/** The whole board's explanation, independent of the focus. */
export interface Explanation {
  readonly familyId: string;
  readonly size: number;
  readonly parts: readonly Part[];
  /** Names of the ordinal components the parts explain, in order: ["points"] or ["points", "tie-break: …"]. */
  readonly components: readonly string[];
  /** The card's own score of this board, evaluated by the card program. */
  readonly ordinal: Ordinal;
  /** Σ part.points[k] === ordinal[k] for every explained component k. Unverified explanations are never drawn. */
  readonly verified: boolean;
}

/** What the renderer draws for one focus cell. */
export interface FocusView {
  readonly focus: Cell;
  /** The focus cell in words: "Row 2, column 3: a green 7". */
  readonly headline: string;
  /** The selected pieces, in display order. */
  readonly parts: readonly Part[];
  readonly table?: OutcomeTable;
  /** A sentence about the focus when no piece says it ("This cell is not on the edge: it never changes your score."). */
  readonly note?: string;
}

/** A goal card's example board: a board of the room's own size, symbols and colours, its default focus and a caption. */
export interface GoalExample {
  readonly value: string;
  readonly size: number;
  readonly focus: Cell;
  readonly caption: string;
}

export const toneOf = (points: readonly number[]): Tone => {
  const first = points.find(x => x !== 0) ?? 0;
  return first > 0 ? "gain" : first < 0 ? "loss" : "zero";
};
export const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
export const hasCell = (cells: readonly Cell[], x: Cell) => cells.some(c => sameCell(c, x));
