/**
 * The object annotation vocabulary: marks that draw a player's eye to the parts of an object that make up their score.
 * Types only, dependency-free, so the utility families (which produce annotations) and the renderers in
 * lib/object-views (which draw them, and re-export these types with their helpers) share one source without
 * game-utilities depending on React.
 *
 * Positions:
 *   - Grid cells are `{ r, c }`, zero-based row and column (row 0 is the top row).
 *   - string spans are `[start, end)` indices into the string's characters (not into its JSON-quoted display).
 *   - Int digit positions count from the LEFT of the decimal digits, 0 = the most significant digit; the minus
 *     sign is not a digit (in -305, position 0 is the 3).
 *
 * `weight` (0..1, default 1) says how much a mark matters; renderers turn it into opacity AND a non-colour cue
 * (underline thickness or font weight), so colour is never the only signal. `tone` is good (helps your score),
 * bad (hurts it) or neutral (worth knowing). `label` names the mark in the legend.
 */

export type AnnotationTone = "good" | "bad" | "neutral";

export interface AnnotatedCell {
  readonly r: number;
  readonly c: number;
  /** 0..1, default 1. */
  readonly weight?: number;
}

export interface AnnotatedSpan {
  /** First character, inclusive. */
  readonly start: number;
  /** Last character, exclusive. */
  readonly end: number;
  /** 0..1, default 1. */
  readonly weight?: number;
}

/** Grid: individual cells, each drawn with its own weight. */
export interface CellsAnnotation {
  readonly kind: "cells";
  readonly cells: readonly AnnotatedCell[];
  readonly tone: AnnotationTone;
  readonly label?: string;
}

/** Grid: a connected group of cells drawn as one outline (a patch, a stripe). */
export interface RegionAnnotation {
  readonly kind: "region";
  readonly cells: readonly AnnotatedCell[];
  readonly tone: AnnotationTone;
  readonly label?: string;
}

/** string: runs of characters. */
export interface SpansAnnotation {
  readonly kind: "spans";
  readonly spans: readonly AnnotatedSpan[];
  readonly tone: AnnotationTone;
  readonly label?: string;
}

/** Int: decimal digit positions, from the left (0 = most significant digit; the sign is not counted). */
export interface DigitsAnnotation {
  readonly kind: "digits";
  readonly positions: readonly number[];
  /** Per position, 0..1 (same length as positions); every position weighs 1 when absent. */
  readonly weights?: readonly number[];
  readonly tone: AnnotationTone;
  readonly label?: string;
}

/** Any type: a short chip drawn after the object ("3 safe red · 5 safe blue"). */
export interface BadgeAnnotation {
  readonly kind: "badge";
  readonly text: string;
  readonly tone: AnnotationTone;
}

export type Annotation = CellsAnnotation | RegionAnnotation | SpansAnnotation | DigitsAnnotation | BadgeAnnotation;
export type AnnotationKind = Annotation["kind"];
