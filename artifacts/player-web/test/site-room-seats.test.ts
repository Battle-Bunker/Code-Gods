/** Seating AI players without one too many, and the second Start button in the Members header (src/site/lib/room-seats.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiSeats, membersStart } from "../src/site/lib/room-seats.ts";

type Member = { id: string; spectator?: boolean };
/** A room whose rendered members lag behind the engine until `render()`. */
function fakeRoom(initial: Member[]) {
  const engine = [...initial];
  let rendered: readonly Member[] = [...initial], n = 0;
  const releases: (() => void)[] = [];
  return {
    engine, members: () => rendered, render: () => { rendered = [...engine]; },
    addNow: async () => { const godId = `ai${++n}`; engine.push({ id: godId }); return { godId }; },
    addSlow: () => new Promise<{ godId: string }>(done => releases.push(() => { const godId = `ai${++n}`; engine.push({ id: godId }); done({ godId }); })),
    release: () => releases.shift()?.(),
  };
}

test("a practice game right after + Add AI player seats only what is still missing, though the page has not shown the new seat yet", async () => {
  const room = fakeRoom([{ id: "me" }]);
  const seats = aiSeats(room.addNow);
  await seats.addOnce();
  // The rendered room still shows one player; the engine has two.
  await seats.fill(3, room.members);
  assert.equal(room.engine.length, 3, "one more seat, not two");
  room.render();
  await seats.fill(3, room.members);
  assert.equal(room.engine.length, 3, "nothing to add once the room is full");
});

test("a practice game clicked while an AI player is still being added waits for that seat", async () => {
  const room = fakeRoom([{ id: "me" }]);
  const seats = aiSeats(room.addSlow);
  const first = seats.addOnce();
  const filled = seats.fill(3, room.members);
  room.release(); await first;
  await new Promise(r => setTimeout(r, 0));
  room.release(); await filled;
  assert.equal(room.engine.length, 3);
});

test("a double click on + Add AI player seats one AI player; a later click another; a failed add frees the button", async () => {
  const room = fakeRoom([{ id: "me" }]);
  const seats = aiSeats(room.addSlow);
  const first = seats.addOnce();
  assert.equal(await seats.addOnce(), undefined, "the second click of a double click is dropped");
  room.release(); await first;
  const second = seats.addOnce();
  room.release(); await second;
  assert.equal(room.engine.length, 3);
  let calls = 0;
  const failing = aiSeats(async () => { calls++; throw new Error("The AI library is empty"); });
  await assert.rejects(failing.addOnce());
  await assert.rejects(failing.addOnce());
  assert.equal(calls, 2);
  await assert.rejects(failing.fill(3, () => [{ id: "me" }]), "a failed seat stops the practice game");
});

test("spectators do not count as players when filling the seats", async () => {
  const room = fakeRoom([{ id: "me" }, { id: "watcher", spectator: true }]);
  await aiSeats(room.addNow).fill(3, room.members);
  assert.equal(room.engine.filter(m => !m.spectator).length, 3);
});

test("the owner gets a second Start in the Members header once enough players are in, and only then", () => {
  const base = { isOwner: true, hasGame: false, players: 3, minPlayers: 3, startUnavailable: null };
  assert.equal(membersStart(base), true);
  assert.equal(membersStart({ ...base, players: 2 }), false, "not enough players yet");
  assert.equal(membersStart({ ...base, isOwner: false }), false, "only the owner starts");
  assert.equal(membersStart({ ...base, hasGame: true }), false, "a game is running");
  assert.equal(membersStart({ ...base, startUnavailable: "The next game is preparing." }), false);
});
