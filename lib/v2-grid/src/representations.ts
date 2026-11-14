/**
 * The grid's six representations (docs/engine-v2/grids.md §3), each a way a 12-year-old can read the board. Every scene
 * is a `grid`: the cells, with the representation's own elements in the margins or on groups of cells. Cells are named
 * r0c0 … (0-based); every derived element says in its label which cells it is made of.
 */
import { q, ref, type ElementDecl, type ElementValue, type Representation } from "@workspace/v2-core";
import { at, cellLabel, cellName, type GridState } from "./grid.ts";
import { boxes, cols, pairs, rows } from "./units.ts";

type Decl = ElementDecl<GridState>;
const num = (x: number): ElementValue => ({ kind: "number", q: q(x) });
const sizeOf = (s: GridState): number => Math.round(Math.sqrt(s.cells.length));
const sum = (s: GridState, cells: readonly number[]): number => cells.reduce((t, i) => t + s.cells[i]!, 0);
const derived = (name: string, label: string, f: (s: GridState) => number, meaning?: string): Decl =>
  ({ name, label, kind: "number", role: "derived", ...(meaning ? { meaning } : {}), value: s => num(f(s)) });
const cellRefs = (n: number) => Array.from({ length: n * n }, (_, i) => ref("cells", cellName(n, i)));

/**
 * Representations are built per board size (element names enumerate the cells, rows, pairs and boxes of that size).
 * `gridRepresentations(4)` is the beginner board's.
 */
export function gridRepresentations(n: number): readonly Representation<GridState>[] {
  const N2 = n * n;
  const total = derived("total", "the total of every cell", s => sum(s, Array.from({ length: N2 }, (_, i) => i)), "total");

  const cells: Representation<GridState> = {
    id: "cells", title: "the board", scene: "grid", perSite: false,
    elements: [
      ...Array.from({ length: N2 }, (_, i): Decl => ({
        name: cellName(n, i), label: cellLabel(n, i), kind: "number", role: "coordinate", meaning: `cell:${cellName(n, i)}`,
        value: s => num(s.cells[i]!),
      })),
      total,
    ],
    layout: () => ({ kind: "grid", rows: n, cols: n, cells: cellRefs(n) }),
  };

  const tally: Representation<GridState> = {
    id: "tally", title: "the board with each row's and column's total", scene: "grid", perSite: false,
    elements: [
      ...rows(n).map((cs, r) => derived(`row${r}`, `row ${r + 1}'s total`, s => sum(s, cs), `rowTotal:${r}`)),
      ...cols(n).map((cs, c) => derived(`col${c}`, `column ${c + 1}'s total`, s => sum(s, cs), `colTotal:${c}`)),
      total,
    ],
    layout: () => ({
      kind: "grid", rows: n, cols: n, cells: cellRefs(n),
      right: rows(n).map((_, r) => ref("tally", `row${r}`)), bottom: cols(n).map((_, c) => ref("tally", `col${c}`)),
      rightTitle: "total", bottomTitle: "total",
    }),
  };

  const ps = pairs(n);
  const turn: Representation<GridState> = {
    id: "turn", title: "each cell and its opposite (a half turn away)", scene: "grid", perSite: false,
    elements: ps.map(([a, b], k) => derived(`pair${k}`, `${cellLabel(n, a)} plus its opposite (${cellLabel(n, b)})`, s => s.cells[a]! + s.cells[b]!, `pairTotal:${k}`)),
    layout: () => ({ kind: "grid", rows: n, cols: n, cells: cellRefs(n), groups: ps.map(([a, b], k) => ({ cells: [a, b], el: ref("turn", `pair${k}`) })), groupTitle: "pair totals" }),
  };

  const half = Math.floor(n / 2);
  const gap = (s: GridState, r: number) => { let g = 0; for (let c = 0; c < half; c++) g += Math.abs(s.cells[at(n, r, c)]! - s.cells[at(n, r, n - 1 - c)]!); return g; };
  const mirror: Representation<GridState> = {
    id: "mirror", title: "each row beside itself read backwards", scene: "grid", perSite: false,
    elements: rows(n).map((_, r) => derived(`gap${r}`, `how far row ${r + 1} is from reading the same backwards`, s => gap(s, r), `mirrorGap:${r}`)),
    layout: () => ({ kind: "grid", rows: n, cols: n, cells: cellRefs(n), right: rows(n).map((_, r) => ref("mirror", `gap${r}`)), rightTitle: "gap" }),
  };

  const stepOf = (s: GridState, r: number, j: number) => s.cells[at(n, r, j + 1)]! - s.cells[at(n, r, j)]!;
  const bend = (s: GridState, r: number) => { let b = 0; for (let j = 0; j + 2 < n; j++) b += Math.abs(stepOf(s, r, j + 1) - stepOf(s, r, j)); return b; };
  const stepNames: { name: string; r: number; j: number }[] = [];
  for (let r = 0; r < n; r++) for (let j = 0; j + 1 < n; j++) stepNames.push({ name: `s${r}${j}`, r, j });
  const steps: Representation<GridState> = {
    id: "steps", title: "the step from each number to the next along a row", scene: "grid", perSite: false,
    elements: [
      ...stepNames.map(({ name, r, j }) => derived(name, `row ${r + 1}: the step from column ${j + 1} to column ${j + 2}`, s => stepOf(s, r, j))),
      ...rows(n).map((_, r) => derived(`bend${r}`, `how far row ${r + 1}'s steps are from all being equal`, s => bend(s, r), `bend:${r}`)),
    ],
    layout: () => ({
      kind: "grid", rows: n, cols: n, cells: cellRefs(n),
      groups: stepNames.map(({ name, r, j }) => ({ cells: [at(n, r, j), at(n, r, j + 1)], el: ref("steps", name) })),
      right: rows(n).map((_, r) => ref("steps", `bend${r}`)),
      rightTitle: "uneven", groupTitle: "steps",
    }),
  };

  const bx = n % 2 === 0 ? boxes(n) : [];
  const BOX = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const boxRep: Representation<GridState> = {
    id: "boxes", title: "the board cut into four corner boxes", scene: "grid", perSite: false,
    elements: bx.map((cs, k) => derived(`box${k}`, `the ${BOX[k]} box's total`, s => sum(s, cs), `boxTotal:${k}`)),
    layout: () => ({ kind: "grid", rows: n, cols: n, cells: cellRefs(n), groups: bx.map((cs, k) => ({ cells: cs, el: ref("boxes", `box${k}`) })), groupTitle: "box totals" }),
  };

  return [cells, tally, turn, mirror, steps, boxRep];
}
