import test from "node:test";
import assert from "node:assert/strict";
import { fmtWhen, isoWhen, fmtDuration } from "../src/lib/time.ts";

test("missing and malformed server timestamps cannot crash date rendering", () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, 1e30]) {
    assert.equal(isoWhen(value), undefined);
    assert.equal(fmtWhen(value), "Unknown date");
  }
});

test("current milliseconds and legacy seconds render the same instant", () => {
  const ms = Date.UTC(2026, 9, 28, 6, 0);
  assert.equal(isoWhen(ms), "2026-10-28T06:00:00.000Z");
  assert.equal(isoWhen(ms / 1000), isoWhen(ms));
  assert.equal(fmtWhen(ms), fmtWhen(ms / 1000));
  assert.equal(isoWhen(0), "1970-01-01T00:00:00.000Z");
});

test("missing history timestamps do not produce NaN duration labels", () => {
  assert.equal(fmtDuration(NaN), "Unknown duration");
  assert.equal(fmtDuration(Infinity), "Unknown duration");
  assert.equal(fmtDuration(61000), "1m 1s");
});
