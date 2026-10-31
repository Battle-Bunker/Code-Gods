/**
 * The objects panel's payoff rectangle (pure): payoff = your net bits × the others' care, drawn as a rectangle whose
 * width is your bits and whose height is the others' care, so its area is the payoff. One scale for every row shown:
 * the largest gain and loss set the horizontal span (losses to the left of the axis), the largest care the full height.
 * A loss (negative own bits) is an unfilled outline left of the axis in the destructive tone: visible, but it adds no
 * filled area; an object nobody else cares about is a flat line (no area: no payoff).
 */

export interface PayoffRow {
  /** Your net bits on the object (`own.netBits`). */
  own: number;
  /** What the others care (`peerCare`, ≥ 0). */
  care: number;
}
export interface PayoffScale {
  maxGain: number;
  maxLoss: number;
  maxCare: number;
}
export interface PayoffRect {
  /** gain: a filled rectangle; loss: an outline left of the axis; flat: bits but nobody else cares (a line); none: no bits. */
  kind: "gain" | "loss" | "flat" | "none";
  /** x of the zero axis. */
  axis: number;
  x: number;
  width: number;
  /** Rectangles stand on the bottom edge. */
  y: number;
  height: number;
}

const finite = (x: number) => (Number.isFinite(x) ? x : 0);

export function payoffScale(rows: readonly PayoffRow[]): PayoffScale {
  let maxGain = 0, maxLoss = 0, maxCare = 0;
  for (const r of rows) {
    const own = finite(r.own), care = Math.max(0, finite(r.care));
    if (own > maxGain) maxGain = own;
    if (-own > maxLoss) maxLoss = -own;
    if (care > maxCare) maxCare = care;
  }
  return { maxGain, maxLoss, maxCare };
}

export function payoffRect(row: PayoffRow, scale: PayoffScale, box: { width: number; height: number }): PayoffRect {
  const span = scale.maxGain + scale.maxLoss;
  const px = span > 0 ? box.width / span : 0;
  const axis = scale.maxLoss * px;
  const own = finite(row.own), care = Math.max(0, finite(row.care));
  const width = Math.abs(own) * px;
  const height = scale.maxCare > 0 ? (care / scale.maxCare) * box.height : 0;
  const kind = own === 0 || width === 0 ? "none" : own < 0 ? "loss" : height > 0 ? "gain" : "flat";
  return { kind, axis, x: own < 0 ? axis - width : axis, width, y: box.height - height, height };
}
