/**
 * Display model for Grid values: cells with glyphs, readable names, colours and a non-hue cue
 * (a per-colour pattern, or the colour letter). Framework-free so it is unit tested under Node.
 */
import {
  COLOUR_COMPONENTS, COLOUR_LETTERS, SYMBOL_COMPONENTS, decodeGrid, glyphForCode, isGridTypeArgs,
  parseGridForDisplay, type GridTypeArgs,
} from "@workspace/game-types";
import type { GridSettings, ObjectValue } from "./registry.ts";

export interface GridCellModel {
  code: string;
  letter: string;
  /** Full glyph, e.g. "10♥" or "7". */
  glyph: string;
  /** Glyph for compact cells: card rank only ("10"), digits unchanged. */
  compactGlyph: string;
  symbolName: string;
  colourName: string;
  /** e.g. "ten of hearts, blue". */
  name: string;
  css: string;
  ink: string;
}

export interface GridModel {
  size: number;
  rows: GridCellModel[][];
  /** The value exactly as received (the canonical wire string). */
  canonical: string;
  /** True when settings were known and the value is a strict, canonical grid of that type. */
  strict: boolean;
}

const cardNames = new Map(SYMBOL_COMPONENTS.cards.codes.map((c, i) => [c, SYMBOL_COMPONENTS.cards.names[i]]));
const digitNames = new Map(SYMBOL_COMPONENTS.base16.codes.map((c, i) => [c, SYMBOL_COMPONENTS.base16.names[i]]));

export function symbolName(code: string): string {
  return cardNames.get(code) ?? digitNames.get(code) ?? code;
}

function compactGlyph(code: string): string {
  const g = glyphForCode(code);
  return cardNames.has(code) ? g.slice(0, -1) : g;
}

function settingsArgs(s: GridSettings | undefined): GridTypeArgs | undefined {
  return s && isGridTypeArgs(s as Partial<GridTypeArgs>) ? (s as GridTypeArgs) : undefined;
}

/** Display model for a value, or null when it is not a grid (callers then show the raw string). */
export function gridModel(value: unknown, settings?: GridSettings): GridModel | null {
  const cells = parseGridForDisplay(value);
  if (!cells) return null;
  const args = settingsArgs(settings);
  let strict = false;
  if (args) { try { decodeGrid(value as string, args); strict = true; } catch { strict = false; } }
  const palette = args ? COLOUR_COMPONENTS[args.colours] : undefined;
  const rows = cells.map(row => row.map(({ code, letter }): GridCellModel => {
    const idx = palette ? palette.letters.indexOf(letter) : -1;
    const base = COLOUR_LETTERS[letter];
    const colourName = idx >= 0 ? palette!.names[idx] : base.name;
    const sName = symbolName(code);
    return {
      code, letter, glyph: glyphForCode(code), compactGlyph: compactGlyph(code),
      symbolName: sName, colourName, name: `${sName}, ${colourName}`,
      css: idx >= 0 ? palette!.css[idx] : base.css, ink: idx >= 0 ? palette!.ink[idx] : base.ink,
    };
  }));
  return { size: rows.length, rows, canonical: value as string, strict };
}

/**
 * Whether an untyped string should be shown as a grid. A 1×1 "grid" ("AB") is far more likely to
 * be an ordinary string, so inference needs at least 2×2; known Grid games render any size.
 */
export function looksLikeGrid(value: ObjectValue): boolean {
  if (typeof value !== "string") return false;
  const cells = parseGridForDisplay(value);
  return !!cells && cells.length >= 2;
}

/** Text summary for screen readers. */
export function gridSummary(model: GridModel): string {
  const counts = new Map<string, number>();
  for (const row of model.rows) for (const c of row) counts.set(c.colourName, (counts.get(c.colourName) ?? 0) + 1);
  const tally = [...counts].map(([name, n]) => `${n} ${name}`).join(", ");
  const rows = model.rows.map((row, r) => `Row ${r + 1}: ${row.map(c => c.name).join("; ")}.`).join(" ");
  return `Grid, ${model.size} by ${model.size} (${tally}). ${rows}`;
}

/** Cells that differ between two grids of the same size; null when they cannot be compared. */
export function changedCells(a: GridModel | null, b: GridModel | null): boolean[][] | null {
  if (!a || !b || a.size !== b.size) return null;
  return a.rows.map((row, r) => row.map((c, k) => c.code !== b.rows[r][k].code || c.letter !== b.rows[r][k].letter));
}

// ---------------------------------------------------------------------------------------------
// The "digits" renderer: the grid as lines of raw glyphs, each coloured by its cell's colour.

export interface DigitsCell {
  /** Leading spaces that right-align this glyph with the widest one in the grid, in the plain-text line. */
  pad: string;
  /** "7", or rank and suit for cards ("10♥"); with the letter cue, the colour letter follows ("7R"). */
  glyph: string;
  letter: string;
  /** Differs from the compared grid: drawn underlined and bold, never by colour alone. */
  changed: boolean;
}
export interface DigitsLine {
  /** The row as plain text, cells separated by one space, e.g. "7 3 0 1". */
  text: string;
  cells: DigitsCell[];
}

/** One line per row of the grid, for the digits renderer (and its tests). */
export function gridDigitsLines(model: GridModel, changes?: boolean[][] | null, opts: { letters?: boolean } = {}): DigitsLine[] {
  const glyph = (c: GridCellModel) => (opts.letters ? `${c.glyph}${c.letter}` : c.glyph);
  const width = Math.max(...model.rows.flatMap(row => row.map(c => glyph(c).length)));
  return model.rows.map((row, r) => {
    const cells = row.map((c, k): DigitsCell => {
      const g = glyph(c);
      return { pad: " ".repeat(width - g.length), glyph: g, letter: c.letter, changed: !!changes?.[r]?.[k] };
    });
    return { text: cells.map(c => c.pad + c.glyph).join(" "), cells };
  });
}

/**
 * Text colours of the digits renderer, per colour letter, for light and for dark pages. Each reads at 4.5:1 or
 * better on both apps' page, card, popover and muted surfaces of its scheme, and the six of a scheme are at
 * least ΔE76 25 and 25° of hue apart (test/text-shades.test.ts). Yellow on a light page is a dark gold. Both
 * apps' index.css carry them as `--cg-ink-<letter>`; keep the three in step.
 */
export const TEXT_SHADES: Readonly<{ light: Readonly<Record<string, string>>; dark: Readonly<Record<string, string>> }> = Object.freeze({
  light: Object.freeze({ R: "#c4102c", O: "#9c4c00", Y: "#725f00", G: "#147137", B: "#1d5bbd", V: "#8e2ca8" }),
  dark: Object.freeze({ R: "#ff6f7d", O: "#ff9b47", Y: "#ecd43f", G: "#52d273", B: "#6ea8ff", V: "#d68cfa" }),
});

/** CSS colour of a glyph: the theme's custom property, falling back to the light shade (or the text colour). */
export function textShadeVar(letter: string): string {
  const light = TEXT_SHADES.light[letter];
  return light ? `var(--cg-ink-${letter}, ${light})` : "currentColor";
}

// ---------------------------------------------------------------------------------------------
// Non-hue colour cues. Every colour letter gets a distinct pattern, drawn in its ink colour, and
// the letter itself is always available (shown in the detail view, or in compact cells in
// "letter" mode). Hue is never the only cue.

export type PatternId = "diagonal-up" | "dots" | "horizontal" | "grid" | "vertical" | "cross";

export const COLOUR_PATTERNS: Readonly<Record<string, PatternId>> = Object.freeze({
  R: "diagonal-up", O: "dots", Y: "horizontal", G: "grid", B: "vertical", V: "cross",
});

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** CSS background-image (and size) drawing a colour's pattern in `ink` over its fill. */
export function patternStyle(letter: string, ink: string, period = 5): { backgroundImage: string; backgroundSize?: string } {
  const c = rgba(ink, 0.32);
  const line = (deg: number) => `repeating-linear-gradient(${deg}deg, ${c} 0 1px, transparent 1px ${period}px)`;
  switch (COLOUR_PATTERNS[letter]) {
    case "diagonal-up": return { backgroundImage: line(45) };
    case "dots": return { backgroundImage: `radial-gradient(${c} 0 1px, transparent 1.4px)`, backgroundSize: `${period - 1}px ${period - 1}px` };
    case "horizontal": return { backgroundImage: line(0) };
    case "grid": return { backgroundImage: `${line(0)}, ${line(90)}` };
    case "vertical": return { backgroundImage: line(90) };
    case "cross": return { backgroundImage: `${line(45)}, ${line(-45)}` };
    default: return { backgroundImage: "none" };
  }
}

// WCAG 2.x relative luminance and contrast ratio.
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// CIE L*a*b* (D65) and the CIE76 colour difference, for keeping the text shades apart.
function srgbLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function labOf(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map(srgbLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
/** Euclidean distance in Lab: about 2.3 is just noticeable; 25 or more reads as a different colour. */
export function deltaE76(a: string, b: string): number {
  const [p, q] = [labOf(a), labOf(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
/** Hue angle in degrees (0–360) in Lab's a*b* plane. */
export function labHue(hex: string): number {
  const [, a, b] = labOf(hex);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------------------------------
// The viewer's choice of compact cue, remembered per browser. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded and the default still works.

export type ColourCue = "pattern" | "letter";
export const COLOUR_CUE_KEY = "code-gods.object-views.colour-cue";
let cue: ColourCue | undefined;
const listeners = new Set<() => void>();

export function getColourCue(): ColourCue {
  if (cue) return cue;
  let stored: string | null = null;
  try { stored = globalThis.localStorage?.getItem(COLOUR_CUE_KEY) ?? null; } catch { stored = null; }
  cue = stored === "letter" ? "letter" : "pattern";
  return cue;
}
export function setColourCue(next: ColourCue): void {
  cue = next;
  try { globalThis.localStorage?.setItem(COLOUR_CUE_KEY, next); } catch { /* not remembered */ }
  listeners.forEach(l => l());
}
export function subscribeColourCue(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
