// The virtualised list's window (src/lib/virtual-window.ts): only the rows in view, plus a few either side, mount, so
// only they hold a per-row subscription (docs/convex-read-architecture.md R1). What would break: rows off screen
// mounting (a subscription per object in the world), a visible row missing (a blank gap), the skeleton never asking for
// its next page, or a window past the loaded rows.
import test from "node:test";
import assert from "node:assert/strict";
import { visibleWindow, wantsMore } from "../src/lib/virtual-window.ts";

test("the window covers the rows in view plus the overscan, clamped to the loaded rows", () => {
  // 32 px rows, a 320 px viewport: rows 0-9 are in view; overscan 3 adds rows 10-12.
  assert.deepEqual(visibleWindow({ scrollTop: 0, viewport: 320, rowHeight: 32, count: 1000, overscan: 3 }), { start: 0, end: 13 });
  // Scrolled to 3,200 px: rows 100-109 in view, 97-112 with overscan.
  assert.deepEqual(visibleWindow({ scrollTop: 3200, viewport: 320, rowHeight: 32, count: 1000, overscan: 3 }), { start: 97, end: 113 });
  // A partly visible row counts: 3,210 px shows part of row 100 and part of row 110.
  assert.deepEqual(visibleWindow({ scrollTop: 3210, viewport: 320, rowHeight: 32, count: 1000, overscan: 0 }), { start: 100, end: 111 });
  // Near the end: clamped to the loaded rows.
  assert.deepEqual(visibleWindow({ scrollTop: 3200, viewport: 320, rowHeight: 32, count: 105, overscan: 3 }), { start: 97, end: 105 });
  assert.deepEqual(visibleWindow({ scrollTop: 0, viewport: 320, rowHeight: 32, count: 0, overscan: 3 }), { start: 0, end: 0 });
  // Before the first layout (no viewport measured yet) a screenful is assumed, never the whole list.
  assert.deepEqual(visibleWindow({ scrollTop: 0, viewport: 0, rowHeight: 32, count: 1000, overscan: 3 }), { start: 0, end: 23 });
});

test("the skeleton asks for its next page when the window nears the end of the loaded rows", () => {
  assert.equal(wantsMore({ end: 13, count: 50 }), false);
  assert.equal(wantsMore({ end: 40, count: 50 }), true, "within a screenful of the end");
  assert.equal(wantsMore({ end: 0, count: 0 }), true, "nothing loaded yet");
});
