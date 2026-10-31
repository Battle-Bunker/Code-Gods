/**
 * The payoff rectangle of the objects panel (src/core/panels/payoff-geometry.ts): width ∝ your net bits, height ∝ the
 * others' care, so the area is the payoff; one scale for every row shown; a loss drawn left of the axis.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { payoffRect, payoffScale } from "../src/core/panels/payoff-geometry.ts";

const box = { width: 120, height: 30 };

test("one scale for all rows: the largest own bits on each side of the axis and the largest care set the full box", () => {
  const rows = [{ own: 4, care: 2 }, { own: -2, care: 1 }, { own: 1, care: 0 }];
  const scale = payoffScale(rows);
  assert.deepEqual(scale, { maxGain: 4, maxLoss: 2, maxCare: 2 });
  // The axis sits where the losses end: 2 of 6 bits of span → 40 px.
  assert.deepEqual(payoffRect(rows[0], scale, box), { kind: "gain", axis: 40, x: 40, width: 80, y: 0, height: 30 });
  assert.deepEqual(payoffRect(rows[1], scale, box), { kind: "loss", axis: 40, x: 0, width: 40, y: 15, height: 15 });
  assert.deepEqual(payoffRect(rows[2], scale, box), { kind: "flat", axis: 40, x: 40, width: 20, y: 30, height: 0 }, "nobody else cares: no area");
});

test("the area is proportional to the payoff across rows", () => {
  const rows = [{ own: 3, care: 4 }, { own: 6, care: 1 }, { own: 1.5, care: 2 }];
  const scale = payoffScale(rows);
  const areas = rows.map(r => { const g = payoffRect(r, scale, box); return g.width * g.height; });
  const ratio = areas[0] / (3 * 4);
  rows.forEach((r, i) => assert.ok(Math.abs(areas[i] - ratio * r.own * r.care) < 1e-9, `row ${i}`));
  assert.equal(payoffRect(rows[0], scale, box).axis, 0, "no losses: the axis is the left edge");
});

test("nothing to draw when nobody has bits; negative care is treated as none", () => {
  const scale = payoffScale([{ own: 0, care: 0 }]);
  assert.deepEqual(payoffRect({ own: 0, care: 0 }, scale, box), { kind: "none", axis: 0, x: 0, width: 0, y: 30, height: 0 });
  assert.deepEqual(payoffScale([]), { maxGain: 0, maxLoss: 0, maxCare: 0 });
  assert.equal(payoffRect({ own: 2, care: -1 }, payoffScale([{ own: 2, care: -1 }]), box).height, 0);
});
