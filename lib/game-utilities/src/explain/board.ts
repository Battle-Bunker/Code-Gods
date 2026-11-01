/**
 * A decoded Grid board as the lenses read it: the same per-cell view the card prelude gives (`cell.value`, the colour's
 * name, the glyph), plus the shape's phrasebook for words, so a lens says exactly what the card computes.
 */
import { decodeGrid, gridArgs, type Instantiation } from "@workspace/game-types";
import { context } from "../catalog.ts";
import { an } from "../families/say.ts";
import { glyph as glyphOf, gridSpec, type GridSpec } from "../families/grid/_util.ts";
import type { Phrasebook } from "../families/say.ts";
import type { Cell } from "./model.ts";

export interface Board {
  readonly N: number;
  readonly spec: GridSpec;
  readonly say: Phrasebook;
  /** Every cell, row by row (the prelude's `grid.cells` order). */
  readonly cells: readonly Cell[];
  inside(r: number, c: number): boolean;
  sym(x: Cell): number;
  col(x: Cell): number;
  /** The prelude's `cell.value`: digits the digit, cards A = 1 .. K = 13. */
  value(x: Cell): number;
  /** The prelude's `cell.colour`: the colour's name. */
  colour(x: Cell): string;
  /** What the tile shows: "7", "B", "10♥". */
  glyph(x: Cell): string;
  /** "a green 7". */
  describe(x: Cell): string;
  /** "Row 2, column 3". */
  where(x: Cell): string;
  /** Side neighbours, in the prelude's order (left, right, up, down). */
  neighbours(x: Cell): Cell[];
  /** The 8 cells around (the prelude's `cell.surrounding`). */
  surrounding(x: Cell): Cell[];
  /** Joined-up groups of side-touching cells for which `same` holds, in the prelude's `grid.regions` order. */
  regions(same: (a: Cell, b: Cell) => boolean): Cell[][];
  row(r: number): Cell[];
  column(c: number): Cell[];
  isEdge(x: Cell): boolean;
}

/** Decode a wire value of this instantiation, or null when it is not one. */
export function readBoard(inst: Instantiation, value: unknown): Board | null {
  if (inst.objectType !== "Grid" || typeof value !== "string") return null;
  let g: { size: number; sym: Uint8Array; col: Uint8Array };
  try { g = decodeGrid(value, gridArgs(inst)); } catch { return null; }
  return boardOf(gridSpec(context(inst)), g.sym, g.col);
}

/** A board from symbol and colour indices (row-major), for searches that build candidates directly. */
export function boardOf(spec: GridSpec, sym: ArrayLike<number>, col: ArrayLike<number>): Board {
  const N = spec.N;
  const i = (x: Cell) => x.r * N + x.c;
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < N && c < N;
  const cells: Cell[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push({ r, c });
  const cell = (r: number, c: number): Cell => cells[r * N + c];
  const keep = (list: [number, number][]) => list.filter(([r, c]) => inside(r, c)).map(([r, c]) => cell(r, c));
  const b: Board = {
    N, spec, say: spec.say, cells, inside,
    sym: x => sym[i(x)],
    col: x => col[i(x)],
    value: x => spec.value[sym[i(x)]],
    colour: x => spec.colourNames[col[i(x)]],
    glyph: x => glyphOf(spec, sym[i(x)]),
    describe: x => `${an(spec.colourNames[col[i(x)]])} ${glyphOf(spec, sym[i(x)])}`,
    where: x => `Row ${x.r + 1}, column ${x.c + 1}`,
    neighbours: ({ r, c }) => keep([[r, c - 1], [r, c + 1], [r - 1, c], [r + 1, c]]),
    surrounding: ({ r, c }) => keep([[r - 1, c - 1], [r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c], [r + 1, c + 1]]),
    regions(same) {
      const group = new Map<number, number>(), out: Cell[][] = [];
      for (const start of cells) {
        if (group.has(i(start))) continue;
        const members = [start], todo = [start];
        group.set(i(start), out.length);
        while (todo.length) {
          const x = todo.pop()!;
          for (const n of b.neighbours(x)) {
            if (!group.has(i(n)) && same(x, n)) { group.set(i(n), out.length); members.push(n); todo.push(n); }
          }
        }
        out.push(members.sort((p, q) => p.r - q.r || p.c - q.c));
      }
      return out;
    },
    row: r => cells.slice(r * N, r * N + N),
    column: c => Array.from({ length: N }, (_, r) => cell(r, c)),
    isEdge: ({ r, c }) => r === 0 || c === 0 || r === N - 1 || c === N - 1,
  };
  return b;
}
