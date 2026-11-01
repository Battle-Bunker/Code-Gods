/**
 * Geometry for drawing a goal annotation over a board (docs/annotations-design.md §3, §6.3): where cells sit, how each
 * piece is outlined, where its numbered badge goes, which order the callouts take and the arrows' curves. Pure and
 * framework-free, unit tested under Node; the React component (GoalBoard.tsx) only measures and draws.
 */
import type { Cell, Part, PartShape, Tone } from "@workspace/game-utilities";

export interface BoardGeometry {
  /** Cell edge in px. */
  readonly cell: number;
  /** Gap between cells in px. */
  readonly gap: number;
  readonly size: number;
}

export const boardPx = (g: BoardGeometry) => g.size * g.cell + (g.size - 1) * g.gap;
export const cellX = (g: BoardGeometry, c: number) => c * (g.cell + g.gap);
export const cellY = (g: BoardGeometry, r: number) => r * (g.cell + g.gap);
export const centre = (g: BoardGeometry, x: Cell) => ({ x: cellX(g, x.c) + g.cell / 2, y: cellY(g, x.r) + g.cell / 2 });

/** Tone colours (with a non-colour cue: the stroke's dash, and the sign on the badge). */
export const TONE_COLOUR: Readonly<Record<Tone, string>> = Object.freeze({ gain: "#16a34a", loss: "#dc2626", zero: "#64748b" });
export const TONE_DASH: Readonly<Record<Tone, string | undefined>> = Object.freeze({ gain: undefined, loss: "6 4", zero: "2 4" });
export const TONE_MARK: Readonly<Record<Tone, string>> = Object.freeze({ gain: "✓", loss: "✗", zero: "·" });

/** Points as a kid reads them: "+1", "−2", "0". */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** Pieces drawn as a stroke through cell centres (pairs and lines, diagonals included); the rest are outlines. */
export const isStroke = (shape: PartShape) => shape === "pair" || shape === "line";

/** A polyline through the cells' centres: "M x y L x y …". */
export function strokePath(g: BoardGeometry, cells: readonly Cell[]): string {
  return cells.map((x, i) => { const p = centre(g, x); return `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`; }).join(" ");
}

/**
 * A pill around a straight run of cells (pairs and lines, diagonals included): two half-circles of radius `half` around
 * the end cells' centres joined by straight sides, so the glyphs inside stay clear.
 */
export function pillPath(g: BoardGeometry, cells: readonly Cell[], half = g.cell * 0.46): string {
  const a = centre(g, cells[0]), b = centre(g, cells[cells.length - 1]);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * half, ny = ((b.x - a.x) / len) * half;
  const p = (x: number, y: number) => `${round(x)} ${round(y)}`;
  return `M${p(a.x + nx, a.y + ny)} L${p(b.x + nx, b.y + ny)} A${round(half)} ${round(half)} 0 0 0 ${p(b.x - nx, b.y - ny)} `
    + `L${p(a.x - nx, a.y - ny)} A${round(half)} ${round(half)} 0 0 0 ${p(a.x + nx, a.y + ny)} Z`;
}

/**
 * The outline of a set of cells: every cell side that does not face another cell of the set, drawn `inset` px inside
 * the set (gaps between member cells are bridged, so a region reads as one shape). One "M … L …" per side.
 */
export function outlinePath(g: BoardGeometry, cells: readonly Cell[], inset = 2): string {
  const key = (r: number, c: number) => `${r},${c}`;
  const set = new Set(cells.map(x => key(x.r, x.c)));
  const has = (r: number, c: number) => set.has(key(r, c));
  const half = g.gap / 2, out: string[] = [];
  for (const { r, c } of cells) {
    // The cell's box, grown by half a gap on sides facing a member (bridging) and shrunk by `inset` on outline sides.
    const x0 = cellX(g, c) + (has(r, c - 1) ? -half : inset), x1 = cellX(g, c) + g.cell + (has(r, c + 1) ? half : -inset);
    const y0 = cellY(g, r) + (has(r - 1, c) ? -half : inset), y1 = cellY(g, r) + g.cell + (has(r + 1, c) ? half : -inset);
    if (!has(r - 1, c)) out.push(`M${round(x0)} ${round(y0)} L${round(x1)} ${round(y0)}`);
    if (!has(r + 1, c)) out.push(`M${round(x0)} ${round(y1)} L${round(x1)} ${round(y1)}`);
    if (!has(r, c - 1)) out.push(`M${round(x0)} ${round(y0)} L${round(x0)} ${round(y1)}`);
    if (!has(r, c + 1)) out.push(`M${round(x1)} ${round(y0)} L${round(x1)} ${round(y1)}`);
  }
  return out.join(" ");
}

/**
 * Where a piece's numbered badge sits: at the top-right corner of one of its cells, preferring a cell that is not the
 * focus (the focus has its own ring) and has no badge yet, then the cell nearest the callout column (the right edge),
 * then the top. Badges that still share a cell are stacked so they never overlap.
 */
export function badgePoints(g: BoardGeometry, parts: readonly Pick<Part, "cells">[], focus?: Cell): { x: number; y: number }[] {
  const used = new Map<string, number>(), key = (x: Cell) => `${x.r},${x.c}`;
  const isFocus = (x: Cell) => !!focus && x.r === focus.r && x.c === focus.c;
  return parts.map(p => {
    const best = [...p.cells].sort((a, b) =>
      Number(isFocus(a)) - Number(isFocus(b)) || (used.get(key(a)) ?? 0) - (used.get(key(b)) ?? 0) || b.c - a.c || a.r - b.r)[0];
    const n = used.get(key(best)) ?? 0;
    used.set(key(best), n + 1);
    return { x: round(cellX(g, best.c) + g.cell - 7), y: round(cellY(g, best.r) + 7 + n * 13) };
  });
}

/**
 * A connector arc between two cells (a mirror pair): a quadratic curve bowing to the left of the direction of travel
 * (above a row read left to right), by a third of the distance, so nested pairs nest instead of overlapping.
 */
export function linkPath(g: BoardGeometry, from: Cell, to: Cell): string {
  const a = centre(g, from), b = centre(g, to);
  const dx = b.x - a.x, dy = b.y - a.y, bow = 0.34;
  const mx = (a.x + b.x) / 2 + dy * bow, my = (a.y + b.y) / 2 - dx * bow;
  return `M${round(a.x)} ${round(a.y)} Q${round(mx)} ${round(my)} ${round(b.x)} ${round(b.y)}`;
}

/** Callout order: by the badge's height on the board, so arrows to a column beside it rarely cross. Stable. */
export function calloutOrder(points: readonly { y: number }[]): number[] {
  return points.map((p, i) => [p.y, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
}

/**
 * An arrow from a badge to a callout's attachment point, as a cubic curve that leaves the badge horizontally (or
 * vertically, when the callout is below the board) and arrives the same way.
 */
export function arrowPath(from: { x: number; y: number }, to: { x: number; y: number }, below = false): string {
  if (below) {
    const dy = Math.max(24, (to.y - from.y) / 2);
    return `M${round(from.x)} ${round(from.y)} C${round(from.x)} ${round(from.y + dy)} ${round(to.x)} ${round(to.y - dy)} ${round(to.x)} ${round(to.y)}`;
  }
  const dx = Math.max(24, (to.x - from.x) / 2);
  return `M${round(from.x)} ${round(from.y)} C${round(from.x + dx)} ${round(from.y)} ${round(to.x - dx)} ${round(to.y)} ${round(to.x)} ${round(to.y)}`;
}

/** The focus after an arrow key (clamped to the board), or null for a key that does not move it. */
export function moveFocus(focus: Cell, key: string, size: number): Cell | null {
  const clamp = (n: number) => Math.max(0, Math.min(size - 1, n));
  switch (key) {
    case "ArrowUp": return { r: clamp(focus.r - 1), c: focus.c };
    case "ArrowDown": return { r: clamp(focus.r + 1), c: focus.c };
    case "ArrowLeft": return { r: focus.r, c: clamp(focus.c - 1) };
    case "ArrowRight": return { r: focus.r, c: clamp(focus.c + 1) };
    case "Home": return { r: 0, c: 0 };
    case "End": return { r: size - 1, c: size - 1 };
    default: return null;
  }
}

/** Cells drawn at full strength: the focus and every cell of a selected piece (the rest are dimmed, A7). */
export function litCells(focus: Cell, parts: readonly Pick<Part, "cells">[], size: number): boolean[][] {
  const lit = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  lit[focus.r][focus.c] = true;
  for (const p of parts) for (const x of p.cells) if (x.r >= 0 && x.c >= 0 && x.r < size && x.c < size) lit[x.r][x.c] = true;
  return lit;
}

const round = (n: number) => Math.round(n * 10) / 10;
