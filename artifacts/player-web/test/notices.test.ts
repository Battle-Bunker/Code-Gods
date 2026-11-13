/** How long a notice stays (src/core/notices.ts noticeMs). What would break: a sentence gone before it can be read. */
import test from "node:test";
import assert from "node:assert/strict";
import { noticeMs } from "../src/core/notices.ts";

test("a notice stays long enough to read: 4 s at least, about a second for every 12 characters, 15 s at most", () => {
  assert.equal(noticeMs("The world starts now."), 4000);
  assert.equal(noticeMs("Rejected.", "error"), 6000);
  // 60 characters: 5 s.
  assert.equal(noticeMs("x".repeat(60)), 5000);
  // 96 characters: 8 s, for an error too.
  assert.equal(noticeMs("x".repeat(96), "error"), 8000);
  assert.equal(noticeMs("x".repeat(500)), 15000);
});
