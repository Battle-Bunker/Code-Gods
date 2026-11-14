/** The list holds still under the pointer (src/panes/stable-order.ts; persona walk: a re-sort opened the wrong grid). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stableOrder } from "../src/panes/stable-order.ts";

const rows = (...ids: string[]) => ids.map(objectId => ({ objectId }));

test("while held, rows keep their places, rows gone drop out and new rows join at the end; not held, the live order", () => {
  const held = ["a", "b", "c"];
  assert.deepEqual(stableOrder(held, rows("c", "a", "d", "b")).map(r => r.objectId), ["a", "b", "c", "d"]);
  assert.deepEqual(stableOrder(held, rows("c", "a")).map(r => r.objectId), ["a", "c"]);
  assert.deepEqual(stableOrder(null, rows("c", "a")).map(r => r.objectId), ["c", "a"]);
});
