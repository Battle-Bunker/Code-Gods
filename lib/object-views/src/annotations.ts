/**
 * Object annotations: marks that draw the eye to the parts of an object that make up a player's score (a family's
 * counted cells, the patch it measures, the digits it likes). The vocabulary (types) lives in
 * `@workspace/game-utilities` beside the per-family annotators that produce it, and is re-exported here; this module
 * holds the framework-free helpers the renderers draw with, unit tested under Node.
 *
 * Encodings are quiet, so they never fight the digits' own colours: no washes, no glyphs and no tone hues. Tone sets
 * the cue's SHAPE (good: a solid underline or outline, bad: dotted, neutral: dashed), drawn in the page's ink; weight
 * sets the cue's strength (its thickness and its opacity). Legends draw the same cues inline, and screen readers get
 * the words ("solid underline: supports your score").
 */
import type { Annotation, AnnotationTone, BadgeAnnotation } from "@workspace/game-utilities";

export type {
  Annotation, AnnotationKind, AnnotationTone, AnnotatedCell, AnnotatedSpan, BadgeAnnotation, CellsAnnotation, DigitsAnnotation,
  RegionAnnotation, SpansAnnotation,
} from "@workspace/game-utilities";

/** What one cell or character is marked with after merging: the heaviest mark wins. */
export interface Mark {
  tone: AnnotationTone;
  /** 0..1 */
  weight: number;
  label?: string;
}

export interface LegendEntry {
  label: string;
  tone: AnnotationTone;
}

export const clampWeight = (w: number | undefined): number => (w === undefined ? 1 : Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : 0);

const isEmpty = (a: Annotation): boolean =>
  a.kind === "cells" || a.kind === "region" ? a.cells.length === 0
    : a.kind === "spans" ? a.spans.length === 0
      : a.kind === "digits" ? a.positions.length === 0
        : !a.text;

/** Several sources of annotations as one list: missing lists and empty marks are skipped; a repeated badge appears once. */
export function mergeAnnotations(...lists: readonly (readonly Annotation[] | null | undefined)[]): Annotation[] {
  const out: Annotation[] = [];
  const badges = new Set<string>();
  for (const list of lists) for (const a of list ?? []) {
    if (isEmpty(a)) continue;
    if (a.kind === "badge") {
      const key = `${a.tone}\0${a.text}`;
      if (badges.has(key)) continue;
      badges.add(key);
    }
    out.push(a);
  }
  return out;
}

/** The labelled marks, each label once with its tone (first seen wins), for the legend line and tooltip. Badges are not entries. */
export function annotationLegend(annotations: readonly Annotation[]): LegendEntry[] {
  const seen = new Set<string>();
  const out: LegendEntry[] = [];
  for (const a of annotations) {
    if (a.kind === "badge" || !a.label || seen.has(a.label)) continue;
    seen.add(a.label);
    out.push({ label: a.label, tone: a.tone });
  }
  return out;
}

/** A tone's cue: an underline (text, digits) or outline (tiles) of this style. Never hue alone. */
export const TONE_DECORATION: Readonly<Record<AnnotationTone, "solid" | "dotted" | "dashed">> = Object.freeze({ good: "solid", bad: "dotted", neutral: "dashed" });
/** A tone's cue in words, for tooltips and screen readers. */
export const TONE_CUE: Readonly<Record<AnnotationTone, string>> = Object.freeze({ good: "solid underline", bad: "dotted underline", neutral: "dashed underline" });

/** "solid underline: safe red · dotted underline: touching": the legend as one line (tooltips, screen readers). */
export function legendText(entries: readonly LegendEntry[]): string {
  return entries.map(e => `${TONE_CUE[e.tone]}: ${e.label}`).join(" · ");
}

export function annotationBadges(annotations: readonly Annotation[]): BadgeAnnotation[] {
  return annotations.filter((a): a is BadgeAnnotation => a.kind === "badge");
}

const heavier = (current: Mark | null, next: Mark): Mark => (current && current.weight >= next.weight ? current : next);
const mark = (tone: AnnotationTone, weight: number | undefined, label: string | undefined): Mark =>
  ({ tone, weight: clampWeight(weight), ...(label ? { label } : {}) });

/**
 * One mark per cell of a size×size grid from the `cells` annotations (regions are drawn as outlines instead, see
 * regionEdges): the heavier mark wins, weights default to 1 and are clamped to 0..1, cells off the board are ignored.
 */
export function cellWeightMap(annotations: readonly Annotation[], size: number): (Mark | null)[][] {
  const map: (Mark | null)[][] = Array.from({ length: size }, () => Array<Mark | null>(size).fill(null));
  for (const a of annotations) {
    if (a.kind !== "cells") continue;
    for (const { r, c, weight } of a.cells) {
      if (r < 0 || c < 0 || r >= size || c >= size || !Number.isInteger(r) || !Number.isInteger(c)) continue;
      map[r][c] = heavier(map[r][c], mark(a.tone, weight, a.label));
    }
  }
  return map;
}

export interface RegionEdge {
  tone: AnnotationTone;
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/** For each cell in a region, which of its sides lie on the region's outline (face a cell outside it, or the board's edge). */
export function regionEdges(annotations: readonly Annotation[], size: number): (RegionEdge | null)[][] {
  const out: (RegionEdge | null)[][] = Array.from({ length: size }, () => Array<RegionEdge | null>(size).fill(null));
  for (const a of annotations) {
    if (a.kind !== "region") continue;
    const inside = new Set(a.cells.filter(({ r, c }) => r >= 0 && c >= 0 && r < size && c < size).map(({ r, c }) => r * size + c));
    const has = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && inside.has(r * size + c);
    for (const i of inside) {
      const r = Math.floor(i / size), c = i % size;
      out[r][c] = { tone: a.tone, top: !has(r - 1, c), right: !has(r, c + 1), bottom: !has(r + 1, c), left: !has(r, c - 1) };
    }
  }
  return out;
}

/** Cue thickness in px for a weight: 1, 1.5 or 2 (thin: a cue, not a bar under the digit). */
export function underlinePx(weight: number): 1 | 1.5 | 2 {
  const w = clampWeight(weight);
  return w < 0.34 ? 1 : w < 0.67 ? 1.5 : 2;
}
/** Cue opacity for a weight: 0 for no weight, then 0.3 rising to 0.7 (a light mark is still visible, a strong one stays quiet). */
export function cueOpacity(weight: number): number {
  const w = clampWeight(weight);
  return w === 0 ? 0 : Math.round((0.3 + 0.4 * w) * 1000) / 1000;
}
/** A cue's colour: the page's ink (the theme's foreground, light-theme fallback) at the weight's opacity. */
export function cueColour(weight: number): string {
  return `hsl(var(--foreground, 232 38% 14%) / ${cueOpacity(weight)})`;
}

export interface TextSegment {
  /** Display text (strings JSON-escaped, so `"` shows as `\"`). */
  text: string;
  mark: Mark | null;
}

/**
 * The text renderers' display (numbers as-is, strings JSON-quoted) cut into segments: each marked character its own
 * segment, runs of unmarked text merged. String `spans` index the string's characters; Int `digits` count from the left
 * of the decimal digits, past a minus sign.
 */
export function textSegments(value: number | string, annotations: readonly Annotation[]): TextSegment[] {
  const chars = typeof value === "number" ? [...String(value)] : [...value];
  const marks: (Mark | null)[] = chars.map(() => null);
  const put = (i: number, m: Mark) => { if (i >= 0 && i < chars.length) marks[i] = heavier(marks[i], m); };
  for (const a of annotations) {
    if (a.kind === "spans" && typeof value === "string") {
      for (const s of a.spans) for (let i = Math.max(0, s.start); i < Math.min(chars.length, s.end); i++) put(i, mark(a.tone, s.weight, a.label));
    } else if (a.kind === "digits" && typeof value === "number") {
      const offset = chars[0] === "-" ? 1 : 0;
      a.positions.forEach((p, k) => { if (Number.isInteger(p) && p >= 0) put(p + offset, mark(a.tone, a.weights?.[k], a.label)); });
    }
  }
  const display = typeof value === "number" ? chars : chars.map(ch => JSON.stringify(ch).slice(1, -1));
  const pieces: TextSegment[] = typeof value === "number" ? [] : [{ text: '"', mark: null }];
  display.forEach((text, i) => pieces.push({ text, mark: marks[i] }));
  if (typeof value === "string") pieces.push({ text: '"', mark: null });
  const out: TextSegment[] = [];
  for (const p of pieces) {
    const last = out.at(-1);
    if (last && !last.mark && !p.mark) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}
