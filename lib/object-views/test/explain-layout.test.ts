/** The goal annotation's drawing geometry (src/explain/layout.ts), with expectations worked out by hand. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrowPath, badgePoints, boardPx, calloutOrder, litCells, moveFocus, groupRows, linkPath, outlinePath, pillPath, signed, strokePath } from "../src/explain/layout.ts";

const g = { cell: 40, gap: 2, size: 4 };

test("board size: 4 cells of 40 and 3 gaps of 2", () => {
  assert.equal(boardPx(g), 166);
});

test("a line is a stroke through the cell centres, diagonals included", () => {
  assert.equal(strokePath(g, [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }]), "M20 20 L62 20 L104 20");
  assert.equal(strokePath(g, [{ r: 0, c: 2 }, { r: 1, c: 1 }]), "M104 20 L62 62");
});

test("a pill wraps a run of cells: half-circles round the end centres, straight sides between", () => {
  // Cells (0,0)..(0,2): centres x 20 and 104, y 20; half-width 18 → sides at y 38 and y 2.
  assert.equal(pillPath(g, [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], 18), "M20 38 L104 38 A18 18 0 0 0 104 2 L20 2 A18 18 0 0 0 20 38 Z");
});

test("a link bows above a row and to the left of a column, by a third of its length", () => {
  // (0,0)→(0,3): centres 20 and 146 at y 20; the control point is 126 × 0.34 ≈ 42.8 above the midpoint.
  assert.equal(linkPath(g, { r: 0, c: 0 }, { r: 0, c: 3 }), "M20 20 Q83 -22.8 146 20");
  assert.equal(linkPath(g, { r: 0, c: 0 }, { r: 3, c: 0 }), "M20 20 Q62.8 83 20 146", "a column read downwards bows to the right of the page");
});

test("an outline goes round the set, bridging the gap between its cells", () => {
  // One cell: its box inset by 2 → 2..38 on both axes.
  assert.equal(outlinePath(g, [{ r: 0, c: 0 }]), "M2 2 L38 2 M2 38 L38 38 M2 2 L2 38 M38 2 L38 38");
  // Two side by side: no side between them; the top edge of the left cell runs to the middle of the gap (41).
  const two = outlinePath(g, [{ r: 0, c: 0 }, { r: 0, c: 1 }]);
  assert.ok(two.includes("M2 2 L41 2") && two.includes("M41 2 L80 2"), two);
  assert.ok(!two.includes("L38 38 M38"), "no inner side");
  assert.equal(two.split("M").length - 1, 6, "top and bottom of each cell, plus the two outer ends");
});

test("badges avoid the focus and each other, then sit on the piece's rightmost cell, then its top", () => {
  const pts = badgePoints(g, [
    { cells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }] },
    { cells: [{ r: 0, c: 2 }, { r: 1, c: 2 }, { r: 2, c: 2 }] },
    { cells: [{ r: 1, c: 2 }, { r: 2, c: 2 }] },
  ]);
  // Line 1 takes (1,2); line 2 then prefers an unbadged cell: (0,2); the pair's (1,2) is taken, so (2,2).
  assert.deepEqual(pts, [{ x: 117, y: 49 }, { x: 117, y: 7 }, { x: 117, y: 91 }]);
  assert.deepEqual(calloutOrder(pts), [1, 0, 2], "callouts follow the badges top to bottom");
  // With the focus on (1,2), the pair's badge goes to its other cell.
  assert.deepEqual(badgePoints(g, [{ cells: [{ r: 1, c: 2 }, { r: 1, c: 1 }] }], { r: 1, c: 2 }), [{ x: 75, y: 49 }]);
  const crowded = badgePoints(g, [{ cells: [{ r: 0, c: 0 }] }, { cells: [{ r: 0, c: 0 }] }]);
  assert.equal(crowded[1].y - crowded[0].y, 13, "badges on one cell stack");
});

test("arrows leave sideways to a column beside the board, downwards to callouts below it", () => {
  assert.equal(arrowPath({ x: 0, y: 0 }, { x: 100, y: 50 }), "M0 0 C50 0 50 50 100 50");
  assert.equal(arrowPath({ x: 0, y: 0 }, { x: 10, y: 200 }, true), "M0 0 C0 100 10 100 10 200");
  assert.equal(arrowPath({ x: 0, y: 0 }, { x: 10, y: 0 }), "M0 0 C24 0 -14 0 10 0", "a short hop still curves");
});

test("keyboard focus moves by arrows and stays on the board", () => {
  assert.deepEqual(moveFocus({ r: 0, c: 0 }, "ArrowLeft", 4), { r: 0, c: 0 });
  assert.deepEqual(moveFocus({ r: 0, c: 0 }, "ArrowDown", 4), { r: 1, c: 0 });
  assert.deepEqual(moveFocus({ r: 2, c: 3 }, "ArrowRight", 4), { r: 2, c: 3 });
  assert.deepEqual(moveFocus({ r: 2, c: 3 }, "Home", 4), { r: 0, c: 0 });
  assert.deepEqual(moveFocus({ r: 0, c: 0 }, "End", 4), { r: 3, c: 3 });
  assert.equal(moveFocus({ r: 0, c: 0 }, "a", 4), null);
});

test("lit cells: the focus and its pieces' cells; everything else is dimmed", () => {
  const lit = litCells({ r: 3, c: 3 }, [{ cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }] }], 4);
  assert.deepEqual(lit.flat().filter(Boolean).length, 3);
  assert.equal(lit[3][3], true);
  assert.equal(lit[1][1], false);
});

test("points read with a sign and a real minus", () => {
  assert.deepEqual([signed(2), signed(-3), signed(0)], ["+2", "−3", "0"]);
});

test("what-if rows that score alike merge, and the cell's own entry stays visible", () => {
  const e = (sym: number, col: number, delta: number, current = false) =>
    ({ sym, col, value: "", ordinal: delta, delta, verdict: Math.sign(delta) as -1 | 0 | 1, current });
  const rows = [[e(0, 0, 0), e(0, 1, -2)], [e(1, 0, 0, true), e(1, 1, -2)], [e(2, 0, 1), e(2, 1, -2)], [e(3, 0, 1), e(3, 1, -2)]];
  const g = groupRows(rows);
  assert.deepEqual(g.map(x => x.syms), [[0, 1], [2, 3]], "runs of identical rows only");
  assert.equal(g[0].row[0].current, true, "the merged row shows 'now'");
});
