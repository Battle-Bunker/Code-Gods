/** A seated player's dock survives a timed-out room query (a walker lost a summon in flight when it was torn down). */
import test from "node:test";
import assert from "node:assert/strict";
import { dockRoomId } from "../src/site/lib/routes.ts";

test("the dock runs in the header's room: loaded, or through a transient failure of the room query", () => {
  const base = { active: true, seated: true, roomId: "r1", roomLoaded: true, roomFailedTransiently: false };
  assert.equal(dockRoomId(base), "r1");
  assert.equal(dockRoomId({ ...base, roomLoaded: false, roomFailedTransiently: true }), "r1", "a timeout keeps the dock");
  assert.equal(dockRoomId({ ...base, roomLoaded: false }), null, "still loading (or refused): the page waits or explains");
  assert.equal(dockRoomId({ ...base, seated: false }), null, "a spectator");
  assert.equal(dockRoomId({ ...base, active: false }), null, "an ended game: its replay");
  assert.equal(dockRoomId({ ...base, roomId: null }), null, "a game whose room was deleted");
});
