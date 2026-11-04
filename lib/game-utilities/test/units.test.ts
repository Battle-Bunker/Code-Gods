/**
 * Annotations by scoring unit (src/explain/units.ts): the unit list's order and the board's hover hit-testing. What would
 * break: a gain listed after a loss, a 2×2 block or a touching pair that the pointer cannot reach, a row picked when the
 * toggle says column.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aimAt, compareTuples, hitTest, sortUnits, type HoverMode } from "../src/explain/units.ts";
import type { Cell, Part } from "../src/explain/model.ts";

const part = (id: string, cells: Cell[], points: number[], group?: string): Part =>
  ({ id, shape: "cell", cells, points, title: id, facts: [], ...(group ? { group } : {}) });
const mode = (groups: string[]): HoverMode => ({ id: groups.join("+"), label: groups.join("+"), groups });
const N = 4, range = (n: number) => Array.from({ length: n }, (_, i) => i);

test("units sort by tuple: gains highest first, then losses most negative first, then zeros", () => {
  const units = [part("z1", [], [0, 0]), part("g1", [], [1, 0]), part("l1", [], [0, -2]), part("g4", [], [4, 0]),
    part("l4", [], [-4, 0]), part("g0", [], [0, 3]), part("z2", [], [0, 0]), part("l0", [], [0, -5])];
  assert.deepEqual(sortUnits(units).map(p => p.id), ["g4", "g1", "g0", "l4", "l0", "l1", "z1", "z2"]);
  assert.ok(compareTuples([1, -3], [1, -2]) < 0 && compareTuples([2], [1, 9]) > 0);
});

test("2×2 blocks: the block whose centre is nearest the pointer", () => {
  const blocks = range(N - 1).flatMap(r => range(N - 1).map(c =>
    part(`b${r}${c}`, [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }], [1], "block")));
  const m = mode(["block"]);
  assert.equal(hitTest(blocks, m, { x: 1.05, y: 1.05 })!.id, "b00", "just past cell (1,1)'s top-left corner: the block centred there");
  assert.equal(hitTest(blocks, m, { x: 1.9, y: 1.9 })!.id, "b11");
  assert.equal(hitTest(blocks, m, { x: 0.2, y: 3.8 })!.id, "b20", "a corner cell: its only block");
  for (const b of blocks) assert.equal(hitTest(blocks, m, aimAt(b))!.id, b.id, `${b.id} is reachable`);
});

test("touching pairs: the nearest shared edge", () => {
  const pairs = range(N).flatMap(r => range(N).flatMap(c => [
    ...(c + 1 < N ? [part(`h${r}${c}`, [{ r, c }, { r, c: c + 1 }], [1], "pair")] : []),
    ...(r + 1 < N ? [part(`v${r}${c}`, [{ r, c }, { r: r + 1, c }], [1], "pair")] : []),
  ]));
  const m = mode(["pair"]);
  assert.equal(hitTest(pairs, m, { x: 1.95, y: 1.5 })!.id, "h11", "near the right edge of (1,1)");
  assert.equal(hitTest(pairs, m, { x: 1.5, y: 1.95 })!.id, "v11", "near its bottom edge");
  for (const p of pairs) assert.equal(hitTest(pairs, m, aimAt(p))!.id, p.id, `${p.id} is reachable`);
});

test("rows and columns: the toggle picks the direction, the pointer the line", () => {
  const lines = [...range(N).map(r => part(`row${r}`, range(N).map(c => ({ r, c })), [1], "row")),
    ...range(N).map(c => part(`col${c}`, range(N).map(r => ({ r, c })), [1], "column"))];
  assert.equal(hitTest(lines, mode(["row"]), { x: 3.5, y: 2.5 })!.id, "row2");
  assert.equal(hitTest(lines, mode(["column"]), { x: 3.5, y: 2.5 })!.id, "col3");
  assert.equal(hitTest(lines, mode(["diagonal"]), { x: 3.5, y: 2.5 }), null, "a mode with no units picks nothing");
});

test("cells and regions: the one containing the pointer", () => {
  const regions = [part("L", [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }], [3], "region"), part("dot", [{ r: 0, c: 1 }], [1], "region")];
  assert.equal(hitTest(regions, mode(["region"]), { x: 1.5, y: 0.5 })!.id, "dot", "inside the dot, though the L's centre is close");
  assert.equal(hitTest(regions, mode(["region"]), { x: 1.5, y: 1.5 })!.id, "L");
  for (const p of regions) assert.equal(hitTest(regions, mode(["region"]), aimAt(p))!.id, p.id);
});
