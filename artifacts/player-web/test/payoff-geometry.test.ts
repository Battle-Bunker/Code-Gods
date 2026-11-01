/**
 * The payoff rectangle of the objects panel (src/core/panels/payoff-geometry.ts): width ∝ |your net bits| and height ∝
 * the others' care on ONE linear scale for both axes (so equal values make a square and the area is the payoff), the
 * largest value shown sets the scale, tiny values keep a few pixels, and the two labels sit on their edges.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_PX, payoffLabels, payoffRect, payoffScale } from "../src/core/panels/payoff-geometry.ts";

const SIDE = 48;

test("one linear scale for both axes: equal values make a square, and the largest value shown fills the side", () => {
  const rows = [{ own: 6, care: 6 }, { own: 3, care: 1.5 }, { own: 7.2, care: 7.8 }];
  const scale = payoffScale(rows);
  assert.equal(scale.max, 7.8);
  const sq = payoffRect(rows[0], scale, SIDE);
  assert.equal(sq.width, sq.height, "equal yours and others: a square");
  assert.ok(Math.abs(sq.width - (6 / 7.8) * SIDE) < 1e-9);
  // 7.2 × 7.8 is nearly square (the old two-scale box drew it as a wide, short bar).
  const top = payoffRect(rows[2], scale, SIDE);
  assert.equal(top.height, SIDE);
  assert.ok(Math.abs(top.width - (7.2 / 7.8) * SIDE) < 1e-9);
  // 3 × 1.5: twice as wide as tall, and a quarter of the 6 × 6 square's area.
  const half = payoffRect(rows[1], scale, SIDE);
  assert.ok(Math.abs(half.width - 2 * half.height) < 1e-9);
  assert.ok(Math.abs(half.width * half.height - (sq.width * sq.height) / 8) < 1e-9);
});

test("tiny values keep a few pixels; zero stays zero", () => {
  const scale = payoffScale([{ own: 100, care: 100 }]);
  const tiny = payoffRect({ own: 0.01, care: 0.02 }, scale, SIDE);
  assert.deepEqual([tiny.width, tiny.height], [MIN_PX, MIN_PX]);
  assert.ok(MIN_PX >= 2 && MIN_PX <= 4);
  assert.deepEqual(payoffRect({ own: 5, care: 0 }, scale, SIDE), { kind: "flat", width: MIN_PX, height: 0 }, "nobody else cares: no area");
  assert.deepEqual(payoffRect({ own: 0, care: 5 }, scale, SIDE), { kind: "none", width: 0, height: MIN_PX });
});

test("a loss is drawn at the size of its magnitude, marked as a loss", () => {
  const scale = payoffScale([{ own: -4, care: 2 }, { own: 2, care: 1 }]);
  assert.equal(scale.max, 4, "a loss's magnitude counts for the scale");
  assert.deepEqual(payoffRect({ own: -4, care: 2 }, scale, SIDE), { kind: "loss", width: 48, height: 24 });
});

test("degenerate input: no rows, non-finite values, negative care", () => {
  assert.deepEqual(payoffScale([]), { max: 0 });
  const none = payoffRect({ own: 0, care: 0 }, payoffScale([]), SIDE);
  assert.deepEqual(none, { kind: "none", width: 0, height: 0 });
  const s = payoffScale([{ own: Number.NaN, care: -3 }, { own: 2, care: Number.POSITIVE_INFINITY }]);
  assert.equal(s.max, 2, "non-finite values are ignored, negative care is no care");
  assert.equal(payoffRect({ own: 2, care: -1 }, s, SIDE).height, 0);
});

test("labels sit on their edges: the width's value centred under the bottom edge, the height's beside the right edge", () => {
  const g = { kind: "gain" as const, width: 30, height: 20 };
  const l = payoffLabels(g, SIDE, { gap: 3, below: 11, halfLabel: 9 });
  assert.equal(l.width.x, 15, "centred under the bottom edge");
  assert.equal(l.width.y, SIDE + 11);
  assert.equal(l.height.x, 33, "just right of the right edge");
  assert.equal(l.height.y, SIDE - 10, "level with the middle of the right edge");
  // A sliver keeps its bottom label on the box: the label's half-width is the least x.
  const sliver = payoffLabels({ kind: "gain", width: MIN_PX, height: 40 }, SIDE, { gap: 3, below: 11, halfLabel: 9 });
  assert.equal(sliver.width.x, 9);
});
