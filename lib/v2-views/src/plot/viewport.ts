/**
 * The plane's window, fitted to the points that matter (docs/engine-v2/annotations-design.md §6). The caller supplies
 * the interesting points (what the rule reads, its targets, the representation's own landmarks); d3-scale, the scale
 * library under Observable Plot, Vega and Recharts, turns their extent into a padded window and picks the nice ticks.
 *
 * Policy: one scale for both axes when that keeps every point readable (a gradient then looks like itself); otherwise
 * each axis its own scale, and the caller says so in words. Pure: no DOM, so tests run under Node.
 */
import { scaleLinear } from "d3-scale";

export interface XY { readonly x: number; readonly y: number }
export interface Box { readonly w: number; readonly h: number }

export interface Viewport {
  /** World window. */
  readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number;
  readonly box: Box;
  readonly pad: number;
  /** True when one world unit is as long across as up. */
  readonly equal: boolean;
  /** World units per tick step across and up. */
  readonly xStep: number; readonly yStep: number;
  readonly xTicks: readonly number[]; readonly yTicks: readonly number[];
  sx(x: number): number;
  sy(y: number): number;
  /** The world point under a box point. */
  invert(px: number, py: number): XY;
}

/** Equal scales are kept while the narrower content still fills at least 1/8 of its axis (a gradient then looks like itself). */
export const MAX_DISTORTION = 8;

export interface FitInput {
  readonly points: readonly XY[];
  readonly box: Box;
  /** Room in px kept free at every edge (for the points' marks and the nearest labels). */
  readonly pad: number;
}

function extent(vs: number[]): [number, number] {
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (!(hi > lo)) {
    const half = Math.max(Math.abs(lo) * 0.1, 2);
    lo -= half; hi += half;
  }
  return [lo, hi];
}

/** A window holding every point, padded, with nice ticks. */
export function fitViewport({ points, box, pad }: FitInput): Viewport {
  const finite = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const pts = finite.length ? finite : [{ x: 0, y: 0 }];
  let [x0, x1] = extent(pts.map(p => p.x));
  let [y0, y1] = extent(pts.map(p => p.y));
  const iw = box.w - 2 * pad, ih = box.h - 2 * pad;
  const kx = iw / (x1 - x0), ky = ih / (y1 - y0);
  const equal = Math.max(kx, ky) / Math.min(kx, ky) <= MAX_DISTORTION;
  const ticksX = Math.max(3, Math.round(box.w / 64)), ticksY = Math.max(3, Math.round(box.h / 48));
  if (equal) {
    // One scale: the tighter axis sets it, the other is widened about its middle.
    const k = Math.min(kx, ky), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - iw / k / 2; x1 = cx + iw / k / 2; y0 = cy - ih / k / 2; y1 = cy + ih / k / 2;
  } else {
    // Own scales: each axis niced to round numbers (the domain grows to the ticks, never shrinks).
    [x0, x1] = scaleLinear().domain([x0, x1]).nice(ticksX).domain() as [number, number];
    [y0, y1] = scaleLinear().domain([y0, y1]).nice(ticksY).domain() as [number, number];
  }
  const X = scaleLinear().domain([x0, x1]).range([pad, box.w - pad]);
  const Y = scaleLinear().domain([y0, y1]).range([box.h - pad, pad]);
  // The domain including the padding, so ticks and the line run to the box's edges.
  const ex0 = X.invert(0), ex1 = X.invert(box.w), ey0 = Y.invert(box.h), ey1 = Y.invert(0);
  const xs = scaleLinear().domain([ex0, ex1]), ys = scaleLinear().domain([ey0, ey1]);
  let xTicks = xs.ticks(ticksX), yTicks = ys.ticks(ticksY);
  if (equal) {
    // One scale, one step: the coarser of the two (fewer, rounder ticks), so squares are squares.
    const step = Math.max(xTicks[1]! - xTicks[0]!, yTicks[1]! - yTicks[0]!);
    const at = (a: number, b: number) => { const out: number[] = []; for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(Math.round(t / step) * step); return out; };
    xTicks = at(ex0, ex1); yTicks = at(ey0, ey1);
  }
  const step = (t: number[]) => (t.length > 1 ? t[1]! - t[0]! : 1);
  return {
    x0: ex0, x1: ex1, y0: ey0, y1: ey1, box, pad, equal,
    xStep: step(xTicks), yStep: step(yTicks), xTicks, yTicks,
    sx: x => X(x), sy: y => Y(y), invert: (px, py) => ({ x: X.invert(px), y: Y.invert(py) }),
  };
}

/** The infinite line a·x + b·y + c = 0 clipped to the window, in box coordinates; null when it misses. */
export function clipLine(v: Viewport, a: number, b: number, c: number): { x1: number; y1: number; x2: number; y2: number } | null {
  const pts: XY[] = [];
  const push = (x: number, y: number) => {
    if (x >= v.x0 - 1e-9 && x <= v.x1 + 1e-9 && y >= v.y0 - 1e-9 && y <= v.y1 + 1e-9 && !pts.some(p => Math.abs(p.x - x) < 1e-12 && Math.abs(p.y - y) < 1e-12)) pts.push({ x, y });
  };
  if (b !== 0) for (const x of [v.x0, v.x1]) push(x, (-a * x - c) / b);
  if (a !== 0) for (const y of [v.y0, v.y1]) push((-b * y - c) / a, y);
  if (pts.length < 2) return null;
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const p = pts[0]!, q = pts[pts.length - 1]!;
  return { x1: v.sx(p.x), y1: v.sy(p.y), x2: v.sx(q.x), y2: v.sy(q.y) };
}
