/**
 * Display model for Grid values: cells with glyphs, readable names, colours and a non-hue cue
 * (a per-colour pattern, or the colour letter). Framework-free so it is unit tested under Node.
 */
import {
  COLOUR_COMPONENTS, COLOUR_LETTERS, SYMBOL_COMPONENTS, decodeGrid, glyphForCode, isGridTypeArgs,
  parseGridForDisplay, type GridColourSet, type GridTypeArgs,
} from "@workspace/game-types";
import { hexRgb } from "./colour-science.ts";

export { contrastRatio, deltaE76, hexRgb, labHue, labOf, relativeLuminance } from "./colour-science.ts";
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
  /** Tile fill: the set's display shade for this colour (TILE_FILLS), with `ink` the glyph colour on it. */
  css: string;
  ink: string;
}

export interface GridModel {
  /** The colour set when the settings are known (picks the set's display shades), else undefined. */
  colours?: GridColourSet;
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
  // The colour set also applies to boards of another size (a goal card's 2×2 example), so take it from the settings
  // whenever they name a known set.
  const set = args?.colours ?? (settings && Object.hasOwn(COLOUR_COMPONENTS, String(settings.colours)) ? settings.colours as GridColourSet : undefined);
  const palette = set ? COLOUR_COMPONENTS[set] : undefined;
  const rows = cells.map(row => row.map(({ code, letter }): GridCellModel => {
    const idx = palette ? palette.letters.indexOf(letter) : -1;
    const base = COLOUR_LETTERS[letter];
    const colourName = idx >= 0 ? palette!.names[idx] : base.name;
    const sName = symbolName(code);
    return {
      code, letter, glyph: glyphForCode(code), compactGlyph: compactGlyph(code),
      symbolName: sName, colourName, name: `${sName}, ${colourName}`,
      ...tileColours(letter, set, base),
    };
  }));
  return { size: rows.length, rows, canonical: value as string, strict, ...(set ? { colours: set } : {}) };
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

// ---------------------------------------------------------------------------------------------
// Display shades. Each colour SET has its own shades per scheme, derived together by scripts/derive-palettes.ts
// from established perception science, for the real viewing condition: small digits on a monitor, seen at a distance.
//
// - Small-field colour (S-CIELAB, Zhang and Wandell 1996; colour-science.ts). A 19 px bold stem is about 2 arcminutes
//   at 60 px per degree. The eye's blur keeps about 0.39 of a luminance difference there, 0.19 of a red–green one and
//   0.14 of a blue–yellow one, so colours must differ in luminance and along red–green, not along blue–yellow alone.
//   Shades are scored by CIEDE2000 between the S-CIELAB-filtered strokes on the page, not between large patches.
// - Foveal tritanopia (König 1894; Willmer and Wright 1945). The central ~20 arcminutes of the fovea has no S cones;
//   a fixated digit falls inside it, so every viewer is a tritanope for it. The objective therefore includes the
//   tritan simulation (Machado, Oliveira and Fernandes 2009) before the blur, with deuteranopia and protanopia. This is
//   what made the old greens and blues merge: they sat within 8 L* of each other and differed mostly blue–yellow.
// - Blue vs green. They differ by ≥ BLUE_GREEN_MIN_DL in L* and keep ≥ BLUE_GREEN_MIN_TRITAN as fixated strokes:
//   green is a light leaf green, blue a deep pure blue (no bluer than #0000ff, so not an indigo).
// - Size and weight first (Ware, Information Visualization, ch. 4: colour codes for small symbols need size, high
//   saturation and luminance contrast with the background; use few codes). The digits are 14 pt bold (DIGIT_TYPE),
//   which nearly doubles the stroke and is WCAG 2's large text, so the light shades need 3:1 rather than 4.5:1. That
//   frees the L* 43–54 band, which a light orange (not brown), a gold yellow and a light green need; the letter and
//   pattern cues remain the accessibility backstop for colour-blind players.
// - Names: each shade stays inside its SHADE_WINDOWS box, so red, orange, yellow, green, blue and violet read as
//   themselves (orange light enough not to be brown, red a deep red).
// - Search like Glasbey et al. (2007): maximise the smallest pairwise difference, here the small-field one. The
//   established qualitative palettes were the yardstick: Tol's bright, vibrant, high-contrast and muted schemes,
//   Okabe–Ito, Kelly's colours of maximum contrast and Trubetskoy's are designed for areas and lines, and none
//   reaches even 3:1 for text on this paper; Tol's high-contrast scheme shows the principle used here, separating
//   colours in luminance as well as in hue.
//
// test/text-shades.test.ts holds the floors. Both apps' index.css carry the shades as `--cg-ink-<set>-<letter>` (and
// rainbow6's, which covers every letter, as `--cg-ink-<letter>` for grids whose set is unknown); keep the three in step.

export type ShadeScheme = "light" | "dark";

/**
 * The digits' type: 14 pt (18.67 CSS px) bold or larger is WCAG 2's "large text", which needs 3:1 rather than 4.5:1.
 * `stemEm` is JetBrains Mono Bold's vertical stem width in em, measured from the font (semibold is 0.11).
 */
export const DIGIT_TYPE = Object.freeze({ px: 19, weight: 700, stemEm: 0.115 });
/**
 * The viewing condition the shades are designed for: 60 CSS px per degree of visual angle, a 96 dpi monitor seen from
 * about 90 cm (or a denser laptop panel nearer): "small and distant".
 */
export const VIEW_PX_PER_DEGREE = 60;
/** A digit stroke's width in degrees of visual angle under that condition. */
export const digitStrokeDeg = (px: number = DIGIT_TYPE.px, stemEm: number = DIGIT_TYPE.stemEm, pxPerDegree = VIEW_PX_PER_DEGREE): number =>
  (px * stemEm) / pxPerDegree;
/** Each scheme's main page, on which the small-field model judges the shades. */
export const PAGE: Readonly<Record<ShadeScheme, string>> = Object.freeze({ light: "#f5f1eb", dark: "#11131d" });
/** Contrast floors on every surface: light pages, WCAG large text (DIGIT_TYPE); dark pages and tiles, 4.5:1. */
export const MIN_CONTRAST: Readonly<Record<ShadeScheme, number>> = Object.freeze({ light: 3, dark: 4.5 });
/** Blue and green differ by at least this much CIE L*, so the pair never depends on the blue–yellow channel. */
export const BLUE_GREEN_MIN_DL = 15;
/**
 * …and, seen as a digit stroke by the tritanopic fovea (small-field CIEDE2000, tritan), by at least this much. L* alone
 * is not enough: the eye's blur acts in linear light, so two dark shades 15 L* apart still merge into the page alike.
 */
export const BLUE_GREEN_MIN_TRITAN = 3;

export interface ShadeWindow { hue: readonly [number, number]; L: readonly [number, number]; minChroma: number }
/**
 * The OKLCH box inside which each colour still reads as its name, per scheme: hue window, lightness range and a
 * chroma floor (vivid, not dusty). On a light page orange must be light (a dark orange is brown), red a deep red
 * (darker than the old crimson #c20d39, L 0.52), blue a blue not an indigo (hue ≤ 264, pure #0000ff, and OKLCH L ≥ 0.46:
 * the rejected #2900df was 0.42 and read near-black), yellow a gold (a light yellow cannot reach 3:1).
 */
export const SHADE_WINDOWS: Readonly<Record<ShadeScheme, Readonly<Record<string, ShadeWindow>>>> = Object.freeze({
  light: Object.freeze<Record<string, ShadeWindow>>({
    red: { hue: [22, 34], L: [0.46, 0.5], minChroma: 0.15 },
    orange: { hue: [46, 62], L: [0.62, 0.72], minChroma: 0.14 },
    yellow: { hue: [86, 96], L: [0.58, 0.66], minChroma: 0.1 },
    green: { hue: [134, 150], L: [0.4, 0.66], minChroma: 0.12 },
    blue: { hue: [250, 264], L: [0.46, 0.56], minChroma: 0.15 },
    violet: { hue: [300, 328], L: [0.4, 0.62], minChroma: 0.15 },
  }),
  dark: Object.freeze<Record<string, ShadeWindow>>({
    red: { hue: [22, 34], L: [0.62, 0.72], minChroma: 0.15 },
    orange: { hue: [46, 62], L: [0.68, 0.82], minChroma: 0.14 },
    yellow: { hue: [88, 108], L: [0.82, 0.96], minChroma: 0.12 },
    green: { hue: [134, 160], L: [0.7, 0.92], minChroma: 0.14 },
    blue: { hue: [240, 262], L: [0.6, 0.8], minChroma: 0.1 },
    violet: { hue: [298, 326], L: [0.62, 0.8], minChroma: 0.15 },
  }),
});
type Shades = Readonly<Record<ShadeScheme, Readonly<Record<string, string>>>>;

export const DIGIT_SHADES: Readonly<Record<GridColourSet, Shades>> = Object.freeze({
  rgb: Object.freeze({
    light: Object.freeze({ R: "#a50b25", G: "#3d9406", B: "#033ffe" }),
    dark: Object.freeze({ R: "#f7502a", G: "#b5fd83", B: "#4886fe" }),
  }),
  rgby: Object.freeze({
    light: Object.freeze({ R: "#ba0329", Y: "#9d7703", G: "#2a9446", B: "#0137ee" }),
    dark: Object.freeze({ R: "#dc6561", Y: "#fffa41", G: "#5fd598", B: "#4087fd" }),
  }),
  rainbow6: Object.freeze({
    light: Object.freeze({ R: "#ba0329", O: "#d55d0d", Y: "#987e0c", G: "#159425", B: "#0237e5", V: "#bc30fb" }),
    dark: Object.freeze({ R: "#fc463c", O: "#fea247", Y: "#f9f416", G: "#1ad48e", B: "#4886fe", V: "#d645fd" }),
  }),
});

/** The shades for a grid whose colour set is unknown: rainbow6's, which name every colour letter. */
export const TEXT_SHADES: Shades = DIGIT_SHADES.rainbow6;

/** The CSS custom property carrying a letter's shade in a set (rainbow6 and unknown sets use the plain one). */
export function textShadeToken(letter: string, set?: GridColourSet): string {
  return set && set !== "rainbow6" ? `--cg-ink-${set}-${letter}` : `--cg-ink-${letter}`;
}
/**
 * CSS colour of a glyph: the theme's custom property, falling back to the light shade. A letter outside its set (a
 * non-strict grid) takes the unknown-set shade, as its tile does; a letter no set names, the text colour.
 */
export function textShadeVar(letter: string, set?: GridColourSet): string {
  const light = set ? DIGIT_SHADES[set].light[letter] : undefined;
  if (light) return `var(${textShadeToken(letter, set)}, ${light})`;
  const any = TEXT_SHADES.light[letter];
  return any ? `var(${textShadeToken(letter)}, ${any})` : "currentColor";
}

/** Glyph colour on a tile: a dark ink (4.5:1 or better on every tile fill, as on the dark surfaces). */
export const TILE_INK = "#11131d";
/**
 * The tiles renderer's fills: the same sets, at their dark-scheme (bright) shades, so a tile reads as the colour its
 * digit is drawn in and a dark glyph sits on every one. Letters outside the set fall back to the wire table.
 */
function tileColours(letter: string, set: GridColourSet | undefined, base: { css: string; ink: string }): { css: string; ink: string } {
  const fill = (set ? DIGIT_SHADES[set] : TEXT_SHADES).dark[letter];
  return fill ? { css: fill, ink: TILE_INK } : { css: base.css, ink: base.ink };
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
