/**
 * The objects panel's payoff rectangle (pure): payoff = your net bits × the others' care, drawn as a rectangle whose
 * width is your bits and whose height is the others' care on ONE linear scale for both axes, so equal values make a
 * square and the area is the payoff. One scale for every row shown: the largest value of either dimension (a loss
 * counts by its magnitude) sets the full side. Any non-zero dimension keeps at least MIN_PX so a tiny value stays
 * visible. A loss (negative own bits) is drawn at its magnitude and marked as a loss; an object nobody else cares
 * about is flat (no area: no payoff).
 */

export interface PayoffRow {
  /** Your net bits on the object (`own.netBits`). */
  own: number;
  /** What the others care (`peerCare`, ≥ 0). */
  care: number;
}
export interface PayoffScale {
  /** The largest |own| or care among the rows shown: the value that fills the side. */
  max: number;
}
export interface PayoffRect {
  /** gain: your bits and their care; loss: negative own bits; flat: bits but nobody else cares; none: no own bits. */
  kind: "gain" | "loss" | "flat" | "none";
  /** px, both on the one scale; the rectangle stands on the bottom-left corner of its box. */
  width: number;
  height: number;
}

/** The fewest pixels a non-zero dimension is drawn with. */
export const MIN_PX = 3;

const finite = (x: number) => (Number.isFinite(x) ? x : 0);

export function payoffScale(rows: readonly PayoffRow[]): PayoffScale {
  let max = 0;
  for (const r of rows) max = Math.max(max, Math.abs(finite(r.own)), Math.max(0, finite(r.care)));
  return { max };
}

export function payoffRect(row: PayoffRow, scale: PayoffScale, side: number): PayoffRect {
  const own = finite(row.own), care = Math.max(0, finite(row.care));
  const px = scale.max > 0 ? side / scale.max : 0;
  const size = (v: number) => (v === 0 || px === 0 ? 0 : Math.min(side, Math.max(MIN_PX, v * px)));
  const width = size(Math.abs(own)), height = size(care);
  const kind = width === 0 ? "none" : own < 0 ? "loss" : height > 0 ? "gain" : "flat";
  return { kind, width, height };
}

export interface LabelSpot {
  x: number;
  y: number;
}
/**
 * Where the two series labels go in a box of `side` whose rectangle stands on the bottom-left corner: the width's value
 * centred under the bottom edge (`below` px under it, never closer to the box's left than `halfLabel`), the height's
 * value `gap` px right of the right edge, level with its middle (a flat rectangle's, at the bottom edge).
 */
export function payoffLabels(g: PayoffRect, side: number, { gap, below, halfLabel }: { gap: number; below: number; halfLabel: number }):
  { width: LabelSpot; height: LabelSpot } {
  return {
    width: { x: Math.max(halfLabel, g.width / 2), y: side + below },
    height: { x: g.width + gap, y: side - g.height / 2 },
  };
}
