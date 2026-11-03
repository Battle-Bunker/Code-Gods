/**
 * The owner's "next game's setup" from the dock (src/core/game/save-setup.ts): owner.settings is an optimistic write
 * guarded by the room's revision, so the client must send the revision the owner actually saw (useRoomInfo), never
 * one it fetched just before writing (which always matches, so the last writer silently wins).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { saveSetup } from "../src/core/game/save-setup.ts";

/** The engine's guard, as convex/owner.ts states it: a revision other than the room's is refused with CONFLICT. */
function engineRoom(revision: number) {
  const room = { revision, setupId: "first-steps" };
  const settings = async (args: { roomId: string; revision: number; setupId: string }) => {
    if (args.revision !== room.revision) throw Object.assign(new Error("Settings changed; refresh before saving"), { data: { code: "CONFLICT" } });
    room.revision += 1;
    room.setupId = args.setupId;
    return { revision: room.revision };
  };
  return { room, settings };
}

test("a setup chosen on a stale view of the room is refused with CONFLICT, and leaves the other owner's change", async () => {
  // Catches: the client re-reading rooms.get for a fresh revision before writing (owner.ts did), which overwrote a
  // change made in another tab since the owner last saw the room.
  const { room, settings } = engineRoom(3);
  const seen = { revision: 3 };
  await settings({ roomId: "r1", revision: 3, setupId: "grid-7" }); // another tab saves first: revision 4
  await assert.rejects(saveSetup(settings, "r1", seen, "int-classic"), (e: { data?: { code?: string } }) => e.data?.code === "CONFLICT");
  assert.deepEqual(room, { revision: 4, setupId: "grid-7" });
});

test("a setup chosen on the current view of the room is saved with that view's revision", async () => {
  const { room, settings } = engineRoom(7);
  await saveSetup(settings, "r1", { revision: 7 }, "int-classic");
  assert.deepEqual(room, { revision: 8, setupId: "int-classic" });
});

test("before the room has loaded, nothing is sent", async () => {
  let sent = 0;
  await assert.rejects(saveSetup(async () => { sent += 1; return {}; }, "r1", undefined, "int-classic"), /still loading/);
  assert.equal(sent, 0);
});
