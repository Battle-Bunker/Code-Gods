/**
 * The room's past-games list (src/core/history/model.ts): newest first as the engine sends them; a game opens for the
 * gods who played in it and the room owner, matching the engine's rule (convex/lib/rooms requireHistoricReaderAs);
 * the others are listed but not linked.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { pastGames } from "../src/core/history/model.ts";

const record = (id: string, roster: string[], winners: string[]) => ({
  id, shortCode: id.toUpperCase(), startedAt: 1, endedAt: 2, endReason: "owner",
  roster: roster.map(r => ({ id: r, name: `God ${r}`, kind: "human" })), winners: winners.map(w => ({ deityId: w, name: `God ${w}`, kind: "human" })),
});

test("a past game opens for its players and the room owner only", () => {
  const records = [record("g2", ["a", "c"], ["c"]), record("g1", ["a", "b"], ["a", "b"]), null];
  assert.deepEqual(pastGames(records, "b", "a", true).map(g => [g.shortCode, g.played, g.canOpen, g.winners]), [
    ["G2", false, false, "God c"],
    ["G1", true, true, "God a, God b"],
  ]);
  assert.deepEqual(pastGames(records, "a", "a", true).map(g => g.canOpen), [true, true], "the owner opens every game");
  assert.deepEqual(pastGames(records, "z", "a", true).map(g => g.canOpen), [false, false]);
  assert.deepEqual(pastGames(undefined, "a", "a", true), []);
});

test("between games the newest finished game is still the room's current game, open to every member", () => {
  const records = [record("g2", ["a", "c"], ["c"]), record("g1", ["a", "c"], ["a"])];
  assert.deepEqual(pastGames(records, "z", "a", false).map(g => g.canOpen), [true, false]);
});
