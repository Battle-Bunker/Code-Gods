/**
 * Geometry for drawing a goal annotation over a board (docs/annotations-design.md §3, §6.3): where cells sit, how each
 * scoring unit is outlined, where its badge goes and the arrow's curve to its box. Pure and
 * framework-free, unit tested under Node; the React component (GoalBoard.tsx) only measures and draws.
 */
import { signedPoints, type Cell, type Part, type PartShape, type Tone, type WhatIfEntry } from "@workspace/game-utilities";

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
export const signed = signedPoints;

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

/** Where a unit's badge sits on the board: the top-right corner of its cell nearest the list (the right edge), then the top. */
export function badgePoint(g: BoardGeometry, cells: readonly Cell[]): { x: number; y: number } {
  const best = [...cells].sort((a, b) => b.c - a.c || a.r - b.r)[0];
  return { x: round(cellX(g, best.c) + g.cell - 7), y: round(cellY(g, best.r) + 7) };
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

/** Cells drawn at full strength: every cell of the selected unit (the rest are dimmed), or all of them without one. */
export function litCells(part: Pick<Part, "cells"> | null, size: number): boolean[][] | null {
  if (!part) return null;
  const lit = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const x of part.cells) if (x.r >= 0 && x.c >= 0 && x.r < size && x.c < size) lit[x.r][x.c] = true;
  return lit;
}

/**
 * Rows of the what-if table that score alike, merged: symbols in runs whose entries have the same deltas and verdicts. A
 * merged row shows the entries of its first symbol, except that the cell's current entry wins, so "now" stays visible.
 */
export function groupRows(entries: readonly (readonly WhatIfEntry[])[]): { syms: number[]; row: readonly WhatIfEntry[] }[] {
  const out: { syms: number[]; row: WhatIfEntry[]; key: string }[] = [];
  entries.forEach((row, s) => {
    const key = row.map(e => `${e.delta}|${e.verdict}`).join(",");
    const last = out.at(-1);
    if (last && last.key === key) {
      last.syms.push(s);
      row.forEach((e, c) => { if (e.current) last.row[c] = e; });
    } else out.push({ syms: [s], row: [...row], key });
  });
  return out.map(({ syms, row }) => ({ syms, row }));
}

const round = (n: number) => Math.round(n * 10) / 10;
