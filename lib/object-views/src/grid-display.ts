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
  const palette = args ? COLOUR_COMPONENTS[args.colours] : undefined;
  const set = args?.colours;
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
// Display shades. Each colour SET has its own shades, derived together (scripts/derive-palettes.ts) so the set's
// colours are as far apart as text can make them: the smallest pairwise CIEDE2000 plus the smallest OKLab ΔE×100
// under protanopia, deuteranopia and tritanopia (small-field tritanopia stands in for digit-size text, where a blue
// and a green of one lightness collapse) is maximised, with every shade at 4.5:1 or better on both apps' page, card,
// popover and muted surfaces of its scheme, inside the hue window where it still reads as its name (no set needed a
// rename), vivid (OKLCH C ≥ 0.1) and in a lightness band that keeps it a colour. test/text-shades.test.ts holds the
// floors. Both apps' index.css carry them as `--cg-ink-<set>-<letter>` (and rainbow6's, which covers every letter, as
// `--cg-ink-<letter>` for grids whose set is unknown); keep the three in step.

export type ShadeScheme = "light" | "dark";

/** OKLCH hue windows (degrees) inside which each colour still reads as its name; the shades stay inside them. */
export const NAME_HUES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  red: [18, 38], orange: [45, 68], yellow: [82, 108], green: [130, 165], blue: [240, 272], violet: [295, 330],
});
type Shades = Readonly<Record<ShadeScheme, Readonly<Record<string, string>>>>;

export const DIGIT_SHADES: Readonly<Record<GridColourSet, Shades>> = Object.freeze({
  rgb: Object.freeze({
    light: Object.freeze({ R: "#b73305", G: "#247148", B: "#2900df" }),
    dark: Object.freeze({ R: "#fb5422", G: "#a9fb25", B: "#129fe7" }),
  }),
  rgby: Object.freeze({
    light: Object.freeze({ R: "#900f21", Y: "#7c5a03", G: "#086f4e", B: "#1707f9" }),
    dark: Object.freeze({ R: "#f35868", Y: "#edae12", G: "#29fcb7", B: "#1c91fa" }),
  }),
  rainbow6: Object.freeze({
    light: Object.freeze({ R: "#c20d39", O: "#773a0e", Y: "#695f01", G: "#1d7242", B: "#0555e7", V: "#aa01bc" }),
    dark: Object.freeze({ R: "#fb4d63", O: "#fe8c1a", Y: "#ecdc1e", G: "#31f9a9", B: "#5cbefe", V: "#cb56f9" }),
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
