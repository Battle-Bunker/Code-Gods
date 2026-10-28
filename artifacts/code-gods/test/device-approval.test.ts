import test from "node:test";
import assert from "node:assert/strict";
import { ownerApprovalBlocker } from "../src/lib/device-approval.ts";

test("expired request is not misreported as lack of ownership", () => {
  assert.match(ownerApprovalBlocker("expired", 100, 200, false)!, /request expired/);
  assert.match(ownerApprovalBlocker("pending", 100, 200, true)!, /request expired/);
});
test("only a live pending request can report an ownership restriction", () => {
  assert.equal(ownerApprovalBlocker("pending", 300, 200, true), null);
  assert.match(ownerApprovalBlocker("pending", 300, 200, false)!, /account that owns/);
  assert.match(ownerApprovalBlocker("approved", 300, 200, false)!, /no longer awaiting/);
  assert.match(ownerApprovalBlocker("denied", 300, 200, false)!, /no longer awaiting/);
  assert.match(ownerApprovalBlocker("pending", NaN, 200, true)!, /invalid expiry/);
});
