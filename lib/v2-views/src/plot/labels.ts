/**
 * Labels at rest, placed without overlap (docs/engine-v2/annotations-design.md §6): a greedy candidate-position placer in
 * the manner of Imhof and of d3fc-label-layout's greedy strategy, extended with obstacles (the line, the axes and the
 * points' own marks), which that library cannot take. Labels are placed in priority order; each tries eight positions
 * around its point at growing distances (a leader joins it when far) and takes the one with the least overlap. A
 * priority-1 label is always shown; a lower one only where it overlaps nothing. Pure and deterministic.
 */
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Seg { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }

export interface LabelRequest {
  readonly id: string;
  /** The point labelled, in box px. */
  readonly x: number; readonly y: number;
  readonly w: number; readonly h: number;
  readonly priority: 1 | 2 | 3;
  /** Prefer positions on this side first ("e": right of the point, "s": below …). */
  readonly prefer?: Side;
}
export type Side = "e" | "ne" | "se" | "n" | "s" | "w" | "nw" | "sw";

export interface Placed {
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly box: Rect;
  readonly shown: boolean;
  /** A leader from the point to the label is drawn when the label sits away from it. */
  readonly leader: boolean;
}

/** Overlapping area of two rectangles. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Whether a segment crosses a rectangle (Liang–Barsky). */
export function crosses(s: Seg, r: Rect): boolean {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, s.x1 - r.x], [dx, r.x + r.w - s.x1], [-dy, s.y1 - r.y], [dy, r.y + r.h - s.y1]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

/** An estimate of a label's width in px for an 11 px system sans (no DOM measuring, so Node tests agree). */
export function textWidth(text: string, font = 11): number {
  let w = 0;
  for (const ch of text) w += /[ .,:·()]/.test(ch) ? 0.32 : /[mwMW−—]/.test(ch) ? 0.86 : /[A-Z0-9²]/.test(ch) ? 0.64 : 0.56;
  return Math.ceil(w * font) + 2;
}

const SIDES: readonly Side[] = ["e", "ne", "se", "n", "s", "w", "nw", "sw"];
const RINGS = [5, 12, 22, 36, 54, 78];

function at(side: Side, x: number, y: number, w: number, h: number, d: number): Rect {
  const cx = side.includes("e") ? x + d : side.includes("w") ? x - d - w : x - w / 2;
  const cy = side.startsWith("n") ? y - d - h : side.startsWith("s") ? y + d : y - h / 2;
  return { x: cx, y: cy, w, h };
}

function inside(r: Rect, b: { w: number; h: number }): Rect {
  return { ...r, x: Math.min(Math.max(r.x, 1), b.w - r.w - 1), y: Math.min(Math.max(r.y, 1), b.h - r.h - 1) };
}

/**
 * Place labels: `obstacles` are segments to keep clear of (the line, the axes); every request's own point is an
 * obstacle for the others' labels (a 7 px square around it); `blocked` rectangles (an inset, a note) are kept clear too.
 */
export function placeLabels(requests: readonly LabelRequest[], obstacles: readonly Seg[], bounds: { w: number; h: number }, blocked: readonly Rect[] = []): Placed[] {
  const order = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.priority - b.r.priority || a.i - b.i);
  const dots: Rect[] = requests.map(r => ({ x: r.x - 3.5, y: r.y - 3.5, w: 7, h: 7 }));
  const placed: Rect[] = [...blocked];
  const out = new Map<string, Placed>();
  for (const { r } of order) {
    // The first clear position, nearest ring first; failing that, the least overlapping one.
    let best: { box: Rect; score: number; d: number } | null = null;
    const sides = r.prefer ? [r.prefer, ...SIDES.filter(s => s !== r.prefer)] : SIDES;
    search: for (const d of RINGS) {
      for (const side of sides) {
        const box = inside(at(side, r.x, r.y, r.w, r.h, d), bounds);
        let score = 0;
        for (const p of placed) score += overlap(box, p) * 20;
        for (const dot of dots) score += overlap(box, dot) * 12;
        for (const s of obstacles) if (crosses(s, box)) score += r.w * r.h * 0.5;
        if (!best || score < best.score) best = { box, score, d };
        if (score === 0) break search;
      }
    }
    const shown = r.priority === 1 || best!.score === 0;
    if (shown) placed.push(best!.box);
    out.set(r.id, { id: r.id, priority: r.priority, box: best!.box, shown, leader: best!.d > RINGS[1]! });
  }
  return requests.map(r => out.get(r.id)!);
}
