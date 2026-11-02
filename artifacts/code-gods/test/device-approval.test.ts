import test from "node:test";
import assert from "node:assert/strict";
import { connectBlocker, kindLabel, permissionChoices } from "../src/lib/device-approval.ts";
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

test("connect: the permission may be lowered from the requested scope, never raised", () => {
  assert.deepEqual(permissionChoices("read"), ["read"]);
  assert.deepEqual(permissionChoices("act"), ["read", "act"]);
  assert.deepEqual(permissionChoices("owner"), ["read", "act", "owner"]);
});
test("connect: a room is required; an owner grant needs the room's owner and consent; expiry wins", () => {
  const base = { status: "pending", expiresAt: 300, now: 200, roomId: "r", permission: "act" as const, isRoomOwner: false, ownerConsent: false };
  assert.equal(connectBlocker(base), null);
  assert.match(connectBlocker({ ...base, roomId: "" })!, /Choose a room/);
  assert.match(connectBlocker({ ...base, permission: "owner" })!, /owner/);
  assert.match(connectBlocker({ ...base, permission: "owner", isRoomOwner: true })!, /consent/);
  assert.equal(connectBlocker({ ...base, permission: "owner", isRoomOwner: true, ownerConsent: true }), null);
  assert.match(connectBlocker({ ...base, now: 400 })!, /expired/);
  assert.match(connectBlocker({ ...base, status: "approved" })!, /no longer awaiting/);
});
test("credential kinds have plain labels", () => {
  assert.equal(kindLabel("oauth"), "MCP connection");
  assert.equal(kindLabel("device"), "player app");
  assert.equal(kindLabel(undefined), "player app");
  assert.equal(kindLabel("assistant"), "in-client assistant");
});

test("connect: the first choice follows the client's room hint, and lowers owner to act in a room the human does not own", async () => {
  const { initialConnectChoice } = await import("../src/lib/device-approval.ts");
  const rooms = [{ roomId: "r1", isOwner: true }, { roomId: "r2", isOwner: false }];
  assert.deepEqual(initialConnectChoice({ requested: "owner", rooms, hint: { roomId: "r2", member: true, isOwner: false } }), { roomId: "r2", permission: "act" });
  assert.deepEqual(initialConnectChoice({ requested: "owner", rooms, hint: { roomId: "r1", member: true, isOwner: true } }), { roomId: "r1", permission: "owner" });
  assert.deepEqual(initialConnectChoice({ requested: "read", rooms, hint: { roomId: "r1", member: true, isOwner: true } }), { roomId: "r1", permission: "read" });
  assert.deepEqual(initialConnectChoice({ requested: "act", rooms, hint: { roomId: "r9", member: false, isOwner: false } }), { roomId: "", permission: "act" }, "join first");
  assert.deepEqual(initialConnectChoice({ requested: "act", rooms: [rooms[1]], hint: null }), { roomId: "r2", permission: "act" }, "the only room");
  assert.deepEqual(initialConnectChoice({ requested: "owner", rooms, hint: null }), { roomId: "", permission: "owner" }, "no room chosen yet: as asked");
});
