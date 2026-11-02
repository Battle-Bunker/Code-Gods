/**
 * Alternative interaction modes for rules a focus cell explains poorly (docs/annotations-design.md §11). Pure, beside
 * the lenses, so the renderer only draws.
 *
 *   whatIf     every way to repaint or renumber one cell, each scored by the card program itself: for global rules
 *              (a centroid, a maximum, a total) the clearest answer to "what does this cell do?" is "watch the score".
 *   story      a rule that runs a process (Castle Keeper's flood) told as numbered steps, ending on the score.
 *
 * (The third mode, the part scrubber, steps through an Explanation's parts and needs nothing new here.)
 */
import { decodeGrid, gridArgs, type Instantiation, type ObjectValue } from "@workspace/game-types";
import { context, evaluator, type Draw } from "../catalog.ts";
import { gridSpec, wire, type GridSpec } from "../families/grid/_util.ts";
import type { Ordinal } from "../types.ts";
import { readBoard } from "./board.ts";
import type { Cell } from "./model.ts";

const asArray = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);
/** −1, 0 or 1: how ordinal a compares with b (lexicographic). */
export function compareOrdinal(a: Ordinal, b: Ordinal): -1 | 0 | 1 {
  const x = asArray(a), y = asArray(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

function toWire(g: GridSpec, sym: ArrayLike<number>, col: ArrayLike<number>): string {
  const take = (v: ArrayLike<number>) => Array.from({ length: g.N }, (_, r) => Array.from({ length: g.N }, (_, c) => v[r * g.N + c]));
  return String(wire(g, take(sym), take(col)));
}

export interface WhatIfEntry {
  readonly sym: number;
  readonly col: number;
  /** The board with the cell changed (wire value). */
  readonly value: string;
  readonly ordinal: Ordinal;
  /** The first component's change ("+2" points). */
  readonly delta: number;
  /** Better (1), the same (0) or worse (−1) for you than the board as it is, by the card's whole ordinal. */
  readonly verdict: -1 | 0 | 1;
  /** The cell as it is now. */
  readonly current: boolean;
}

/**
 * Every symbol × colour the focus cell could show, with the card's score of the board it makes: `entries[sym][col]`.
 * Null when the value is not a board of this instantiation.
 */
export function whatIf(draw: Draw, inst: Instantiation, value: ObjectValue, cell: Cell): { readonly ordinal: Ordinal; readonly entries: WhatIfEntry[][] } | null {
  const b = readBoard(inst, value);
  if (!b || !b.inside(cell.r, cell.c)) return null;
  const g = gridSpec(context(inst)), score = evaluator(draw, inst), base = score(value);
  const d = decodeGrid(String(value), gridArgs(inst)), i = cell.r * g.N + cell.c;
  const entries = Array.from({ length: g.S }, (_, s) => Array.from({ length: g.C }, (_, c): WhatIfEntry => {
    const sym = Uint8Array.from(d.sym), col = Uint8Array.from(d.col);
    sym[i] = s; col[i] = c;
    const v = toWire(g, sym, col), o = score(v);
    return { sym: s, col: c, value: v, ordinal: o, delta: asArray(o)[0] - asArray(base)[0], verdict: compareOrdinal(o, base), current: d.sym[i] === s && d.col[i] === c };
  }));
  return { ordinal: base, entries };
}

// ------------------------------------------------------------------------------------------------
// stories: step-through narration of a process rule
// ------------------------------------------------------------------------------------------------

export type StoryRole = "wall" | "water" | "new-water" | "shut-in";
export interface StoryFrame {
  readonly text: string;
  /** Cells drawn as the process's state at this step, by role. */
  readonly marks: readonly { readonly cell: Cell; readonly role: StoryRole }[];
  /** The score, on the frame that settles it (the last). */
  readonly points?: number;
}
export interface Story {
  readonly familyId: string;
  readonly frames: readonly StoryFrame[];
  /** The card's own ordinal of the board; the last frame's points equal its first component (tests). */
  readonly ordinal: Ordinal;
}

/** 🏯 Castle Keeper (plain): walls, water pouring in at the edge and spreading step by step, then the shut-in cells. */
function castleKeeper(draw: Draw, inst: Instantiation, value: ObjectValue): Story | null {
  const p = draw.params as { W: number; mode: string };
  if (p.mode !== "plain") return null;
  const b = readBoard(inst, value);
  if (!b) return null;
  const wall = (x: Cell) => b.col(x) === p.W, name = b.spec.colourNames[p.W];
  const key = (x: Cell) => x.r * b.N + x.c, wet = new Set<number>();
  const walls = b.cells.filter(wall).map(cell => ({ cell, role: "wall" as const }));
  const frames: StoryFrame[] = [{ text: `The ${name} cells are walls. Water can't cross them.`, marks: walls }];
  let front = b.cells.filter(x => b.isEdge(x) && !wall(x));
  front.forEach(x => wet.add(key(x)));
  frames.push({
    text: front.length ? `Water pours in at every edge cell that isn't a wall: ${front.length} cell${front.length === 1 ? "" : "s"}.` : "The whole edge is wall: no water gets in.",
    marks: [...walls, ...front.map(cell => ({ cell, role: "new-water" as const }))],
  });
  while (front.length) {
    const next: Cell[] = [];
    for (const x of front) for (const n of b.neighbours(x)) if (!wall(n) && !wet.has(key(n))) { wet.add(key(n)); next.push(n); }
    if (!next.length) break;
    const fresh = new Set(next.map(key));
    frames.push({
      text: `The water spreads to ${next.length} more touching cell${next.length === 1 ? "" : "s"}.`,
      marks: [...walls, ...b.cells.filter(x => wet.has(key(x)) && !fresh.has(key(x))).map(cell => ({ cell, role: "water" as const })),
        ...next.map(cell => ({ cell, role: "new-water" as const }))],
    });
    front = next;
  }
  const shut = b.cells.filter(x => !wall(x) && !wet.has(key(x)));
  frames.push({
    text: shut.length ? `The water can't reach ${shut.length} cell${shut.length === 1 ? "" : "s"}: shut in, 1 point each.` : "The water reached every cell: nothing is shut in.",
    marks: [...walls, ...b.cells.filter(x => wet.has(key(x))).map(cell => ({ cell, role: "water" as const })), ...shut.map(cell => ({ cell, role: "shut-in" as const }))],
    points: shut.length,
  });
  return { familyId: draw.familyId, frames, ordinal: evaluator(draw, inst)(value) };
}

const STORIES: Readonly<Record<string, (draw: Draw, inst: Instantiation, value: ObjectValue) => Story | null>> = { castle_keeper: castleKeeper };

/**
 * The rule told as steps on this board, or null when the family (or this draw, or this value) has no story. A bug in a
 * story throws rather than passing for "no story".
 */
export function story(draw: Draw, inst: Instantiation, value: ObjectValue): Story | null {
  const tell = Object.hasOwn(STORIES, draw.familyId) ? STORIES[draw.familyId] : undefined;
  return tell ? tell(draw, inst, value) : null;
}
/** Families with a step-through story. */
export const STORY_FAMILIES: readonly string[] = Object.keys(STORIES);
