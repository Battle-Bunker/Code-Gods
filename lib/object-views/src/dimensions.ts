/**
 * The two dimensions of a payoff and its strength, colour coded the same way everywhere they appear (pure; tested in
 * test/palette-metrics.test.ts):
 *
 *   yours  — your bits on an object (its width in the payoff rectangle): a petrol blue;
 *   others — what the others care, or their summed bits (its height): a raspberry;
 *   the score ramp — how high an object's payoff is relative to the best one shown: one amber hue, muted to strong.
 *
 * Validated with the dataviz method (OKLab ΔE×100 under Machado 2009 protanopia/deuteranopia, all pairs): yours,
 * others and the ramp's strong end stay ≥ 8 apart under both deficiencies and ≥ 15 for normal vision, and the two
 * dimension colours read as text at 4.5:1 or better on every surface of their scheme. Hues sit in the gaps of the
 * digit palettes (petrol between green and blue, raspberry between violet and red, amber as an area colour), and the
 * rectangle and bar always carry a non-hue cue too (position, the labelled edges, the number).
 *
 * Both apps' index.css carry them as --cg-yours, --cg-others, --cg-ramp-low and --cg-ramp-high (light under :root,
 * the engine UI's dark theme under .dark); keep them in step with DIMENSION_COLOURS.
 */
import { hexOfLinear, linearOf, type Rgb } from "./colour-science.ts";
import type { ShadeScheme } from "./grid-display.ts";

export type Dimension = "yours" | "others";

export const DIMENSION_COLOURS: Readonly<Record<ShadeScheme, Readonly<Record<Dimension, string>>>> = Object.freeze({
  light: Object.freeze({ yours: "#026b85", others: "#b62268" }),
  dark: Object.freeze({ yours: "#25afd2", others: "#de6d9b" }),
});
/** The score ramp's ends: low (muted, recedes toward the surface) and high (strong). */
export const SCORE_RAMP: Readonly<Record<ShadeScheme, Readonly<{ low: string; high: string }>>> = Object.freeze({
  light: Object.freeze({ low: "#e2c5a0", high: "#9a6005" }),
  dark: Object.freeze({ low: "#614826", high: "#e9aa4e" }),
});

const TOKEN: Readonly<Record<Dimension, string>> = { yours: "--cg-yours", others: "--cg-others" };
/** CSS colour of a dimension: its custom property, falling back to the light shade. */
export const dimensionVar = (d: Dimension): string => `var(${TOKEN[d]}, ${DIMENSION_COLOURS.light[d]})`;

/** A payoff's strength 0..1 relative to the best shown: losses and nothing score 0; at or past the best, 1. */
export function relativeStrength(payoff: number, best: number): number {
  if (!Number.isFinite(payoff) || !Number.isFinite(best) || best <= 0 || payoff <= 0) return 0;
  return Math.min(1, payoff / best);
}

/** The ramp's colour at strength t (0..1), interpolated in linear light, as hex (for SVG and the tests). */
export function rampHex(t: number, scheme: ShadeScheme = "light"): string {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const [a, b] = [linearOf(SCORE_RAMP[scheme].low), linearOf(SCORE_RAMP[scheme].high)];
  return hexOfLinear(a.map((x, i) => x + (b[i] - x) * k) as Rgb);
}
/** The ramp's colour at strength t as CSS that follows the theme (the two tokens mixed in linear light). */
export function rampVar(t: number): string {
  const k = Math.round(Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * 100);
  return `color-mix(in srgb-linear, var(--cg-ramp-high, ${SCORE_RAMP.light.high}) ${k}%, var(--cg-ramp-low, ${SCORE_RAMP.light.low}))`;
}
