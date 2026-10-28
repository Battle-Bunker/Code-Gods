import test from "node:test";
import assert from "node:assert/strict";
import { encodeUuid } from "@workspace/game-core";
import { resolveGameLink } from "../src/game/game-links.ts";

const id = "12345678-1234-4234-8234-123456789abc";
const other = "22345678-1234-4234-8234-123456789abc";
const room = { id: "room-id", shortCode: "ROOM", game: { id } };
const games = [{ id, room_id: room.id, prefix_length: 4 }];
const actor = { scope: "browser" };
const code = encodeUuid(id).slice(0, 4);

test("game UUIDs and case-insensitive short codes resolve to the current game's canonical codes", () => {
  for (const query of [id, id.toUpperCase(), code.toLowerCase()]) {
    assert.deepEqual(resolveGameLink(query, games, [room], actor), {
      id, shortCode: code, roomShortCode: "ROOM", status: "current",
    });
  }
});

test("archived games never resolve as the room's replacement game", () => {
  assert.equal(resolveGameLink(code, games, [{ ...room, game: { id: other } }], actor).status, "historical");
  assert.equal(resolveGameLink(code, games, [{ ...room, game: null }], actor).status, "historical");
  assert.deepEqual(resolveGameLink(code, games, [], actor), {
    id, shortCode: code, roomShortCode: null, status: "unavailable",
  });
});

test("player credentials cannot resolve links outside their room", () => {
  assert.throws(() => resolveGameLink(code, games, [room], { scope: "player", roomId: "other-room" }), { status: 403 });
  assert.equal(resolveGameLink(code, games, [room], { scope: "player", roomId: room.id }).status, "current");
});

test("unknown, invalid and ambiguous game identifiers fail explicitly", () => {
  for (const query of ["!", other, "ZZZZ"]) {
    assert.throws(() => resolveGameLink(query, games, [room], actor), { status: 404 });
  }
  const collision = "12345678-1234-4234-8234-123456789abd";
  assert.throws(() => resolveGameLink(code, [...games, { ...games[0], id: collision }], [room], actor), /Ambiguous identifier/);
});
