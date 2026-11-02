/**
 * Fixed-width cell glyphs (GlyphParts in grid-display.ts). Every rank takes one character cell of the monospace digit
 * font and every suit a box of SUIT_EM, so a row of cards is the same width whether or not it holds a ten, and grid
 * columns never shift. The ten is a custom glyph: "1" and "0" condensed side by side into one cell, drawn in
 * currentColor, so it takes the cell's colour in both schemes and scales with the font size.
 */
import type { CSSProperties } from "react";
import type { GlyphParts } from "./grid-display.ts";

/**
 * Width of the suit box, in em of the cell's font. The suits come from a fallback font whose advance varies (DejaVu
 * Sans: ♦ 0.51 to ♣ 0.66 em), so the box takes the widest and centres each one.
 */
export const SUIT_EM = 0.66;

const box = (width: string): CSSProperties => ({ display: "inline-block", width, textAlign: "center" });
/** The ten's stroke scale per font weight, so it matches the ranks beside it (tiles draw 600, digits 700, changed 800). */
const tenScale = (weight: number) => (weight <= 600 ? 0.88 : weight >= 800 ? 1.12 : 1);
/** Visually hidden, inline so it holds without the app's stylesheet (Tailwind's sr-only). */
const HIDDEN: CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 };

/**
 * "10" in one character cell. The box is JetBrains Mono's: advance 600 units (1ch), digits 0 to 730 units with 10 of
 * overshoot each way, so the glyph sits on the baseline at the digits' height. Stems are a little lighter than the
 * font's bold (105 and 95 units against 115) so the 0 keeps an open counter at 19 px; the 0 is the font's rounded
 * rectangle, the 1 its flagged stem without the foot, which there is no room for. `weight` is the surrounding font
 * weight. Text shadows do not reach SVG, so a cell that haloes its glyph sets `--cg-glyph-halo` to a CSS filter.
 */
export function TenGlyph({ weight = 700 }: { weight?: number }) {
  const k = tenScale(weight);
  return (
    <>
      <svg viewBox="0 -10 600 750" aria-hidden="true" focusable="false" data-glyph="ten"
        style={{ display: "inline-block", width: "1ch", height: "0.75em", verticalAlign: "-0.01em", overflow: "visible", filter: "var(--cg-glyph-halo, none)" }}>
        <path d="M135 730V0L20 120" fill="none" stroke="currentColor" strokeWidth={105 * k} strokeLinejoin="round" />
        <rect x={305} y={47} width={240} height={636} rx={120} fill="none" stroke="currentColor" strokeWidth={95 * k} />
      </svg>
      {/* The text stays "10" for anything that reads it (selection, find, tests); the visible glyph is the SVG. */}
      <span style={HIDDEN}>10</span>
    </>
  );
}

/** A rank in one character cell: the custom ten, or the rank's own character. */
export function RankGlyph({ parts, weight }: { parts: GlyphParts; weight?: number }) {
  return <span style={{ ...box("1ch"), position: "relative" }} data-rank={parts.rank}>{parts.ten ? <TenGlyph weight={weight} /> : parts.rank}</span>;
}

/** Rank and (for cards) suit, each at its fixed width; `letter` appends the colour letter in one more cell. */
export function CellGlyph({ parts, letter, weight }: { parts: GlyphParts; letter?: string; weight?: number }) {
  return (
    <>
      <RankGlyph parts={parts} weight={weight} />
      {parts.suit && <span style={box(`${SUIT_EM}em`)}>{parts.suit}</span>}
      {letter && <span style={box("1ch")}>{letter}</span>}
    </>
  );
}
