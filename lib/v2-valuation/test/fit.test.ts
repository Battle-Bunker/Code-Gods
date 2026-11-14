import { test } from "node:test";
import assert from "node:assert/strict";
import { fit, evalCurve } from "../src/fit.ts";

test("a log-distance ladder is fitted and snapped; a ladder with a jump is refused", () => {
  const truth = (d: number) => 3.5 - 0.75 * Math.log2(d + 0.5);
  const pts = [8, 4, 2, 1, 0.5, 0.25, 0].map(t => ({ t, v: truth(t) + 0.004 * Math.sin(t * 7), err: 0.03 }));
  const f = fit("distance", pts)!;
  assert.ok(f.accepted && f.snapped);
  assert.equal(f.curve.model, "log-distance");
  assert.ok(Math.abs(evalCurve(f.curve, 3) - truth(3)) < 0.03);
  const jumpy = [13, 8, 5, 3, 2, 1, 0].map((t, i) => ({ t, v: i < 5 ? 0.1 * i : 2 + i, err: 0.02 }));
  assert.equal(fit("distance", jumpy)!.accepted, false);
});

test("a count ladder is fitted with a quadratic", () => {
  const pts = [1, 2, 3, 4, 5].map(t => ({ t, v: 0.5 * t + 0.1 * t * t, err: 0.03 }));
  const f = fit("count", pts)!;
  assert.ok(f.accepted && f.snapped);
});
