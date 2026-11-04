/**
 * Annotations by scoring unit (owner, 2026-11-03: "the fundamental unit around which we construct the annotation [is]
 * each scoring unit"). A board's explanation is its list of scoring units (the lens's parts); the renderer lists them,
 * sorted by what they score, and links each to its board region both ways: hovering a unit's box highlights its cells,
 * and hovering the board selects the unit under the pointer.
 *
 * Board hover is declared per lens as data (`HoverGeometry`), never as view code: a lens tags each part with a `group`
 * ("row", "column", "block", "pair", "cell", …) and offers one or more hover modes, each a set of groups. When a lens
 * offers several modes the renderer shows an auxiliary toggle ([Row | Column], [→ ↓ ↘ ↙]). Within a mode the unit under
 * the pointer is the one whose cells are nearest it, ties broken by the unit's centre: so the board is carved into a
 * Voronoi-like map of unit centres (2×2 blocks: the block whose centre is nearest; touching pairs: the nearest shared
 * edge; rows: the row containing the pointer; regions and cells: the one containing it).
 */
import type { Part } from "./model.ts";

/** A point on the board in cell units: cell (r, c) covers x ∈ [c, c + 1), y ∈ [r, r + 1). */
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

/** One hover mode: a label for the auxiliary toggle and the part groups it picks among. */
export interface HoverMode {
  readonly id: string;
  /** "Row", "Column", "↘", "Touching pairs". */
  readonly label: string;
  readonly groups: readonly string[];
}

/** How the board picks a scoring unit under the pointer: one mode (no toggle) or several (an auxiliary toggle). */
export interface HoverGeometry {
  readonly modes: readonly HoverMode[];
}

/** The group a part hovers in: its `group`, or "unit" when the lens gives none. */
export const groupOf = (p: Part): string => p.group ?? "unit";

/** The single-mode geometry over every group the parts use (a lens that declares none). */
export function defaultGeometry(parts: readonly Part[]): HoverGeometry {
  return { modes: [{ id: "all", label: "All", groups: [...new Set(parts.map(groupOf))] }] };
}

const centre = (p: Part): BoardPoint => {
  const n = p.cells.length || 1;
  return { x: p.cells.reduce((s, c) => s + c.c + 0.5, 0) / n, y: p.cells.reduce((s, c) => s + c.r + 0.5, 0) / n };
};
/** Distance from a point to the nearest cell of a part (0 inside one). */
function cellDistance(p: Part, at: BoardPoint): number {
  let best = Infinity;
  for (const c of p.cells) {
    const dx = Math.max(c.c - at.x, 0, at.x - (c.c + 1)), dy = Math.max(c.r - at.y, 0, at.y - (c.r + 1));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/**
 * The scoring unit under a point in one hover mode: among the parts of the mode's groups, the one whose cells are
 * nearest the point, ties (within a hair) broken by the distance to the part's centre, then by list order. Null when
 * the mode has no parts.
 */
export function hitTest(parts: readonly Part[], mode: HoverMode, at: BoardPoint): Part | null {
  let best: Part | null = null, bd = Infinity, bc = Infinity;
  for (const p of parts) {
    if (!mode.groups.includes(groupOf(p))) continue;
    const d = cellDistance(p, at), cc = centre(p), dc = Math.hypot(cc.x - at.x, cc.y - at.y);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && dc < bc - 1e-9)) { best = p; bd = d; bc = dc; }
  }
  return best;
}

/** A point that selects this part in its mode (its cell nearest its centre, nudged towards the centre). */
export function aimAt(p: Part): BoardPoint {
  const cc = centre(p);
  let pick = p.cells[0], pd = Infinity;
  for (const c of p.cells) {
    const d = Math.hypot(c.c + 0.5 - cc.x, c.r + 0.5 - cc.y);
    if (d < pd) { pick = c; pd = d; }
  }
  // Inside that cell, as close to the centre as the cell allows.
  return { x: Math.min(Math.max(cc.x, pick.c + 0.01), pick.c + 0.99), y: Math.min(Math.max(cc.y, pick.r + 0.01), pick.r + 0.99) };
}

/** -1, 0 or 1: the sign of a tuple's first non-zero entry (positive tuples gain, negative lose, all-zero neither). */
export const tupleSign = (points: readonly number[]): number => Math.sign(points.find(x => x !== 0) ?? 0);
/** Lexicographic comparison of two point tuples. */
export function compareTuples(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The scoring units in display order: positive tuples first, highest first; then negative ones, lowest (most negative)
 * first; then all-zero ones. Stable within equal tuples (the lens's order).
 */
export function sortUnits(parts: readonly Part[]): Part[] {
  const cls = (p: Part) => { const s = tupleSign(p.points); return s > 0 ? 0 : s < 0 ? 1 : 2; };
  return parts.map((p, i) => [p, i] as const).sort(([a, i], [b, j]) => {
    const ca = cls(a), cb = cls(b);
    if (ca !== cb) return ca - cb;
    const t = ca === 0 ? compareTuples(b.points, a.points) : ca === 1 ? compareTuples(a.points, b.points) : 0;
    return t || i - j;
  }).map(([p]) => p);
}
