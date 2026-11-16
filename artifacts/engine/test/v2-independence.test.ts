/**
 * Every object is an independent universe (v1's rule; v1-audit §2.2): an object's values change only when that object
 * changes. Live: in a game with drift off (drift revalues every object by design), each `values` event follows the
 * birth or a committed act of that same object, and every stored value agrees with its own object's state.
 *
 * What would break: a commit that revalues other objects after a change (values depending on another object's state).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

test("an object's values change only when that object changes (each object an independent universe)", { timeout: 180_000 }, async () => {
  const [ada] = await humans("Independent Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Independence" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.equal((await perform(ada!, "room.settings", { overrides: { driftSeconds: 0 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  let events: any[] = [];
  for (let i = 0; events.filter(e => e.kind === "act" && e.data.outcome === "committed").length < 5; i++) {
    assert.ok(i < 240, "the partners' agents change some objects");
    await new Promise(r => setTimeout(r, 500));
    events = await admin.query("v2/testing:events", { gameId, after: -1 });
  }
  await perform(ada!, "game.pause", {}, { gameId });
  events = await admin.query("v2/testing:events", { gameId, after: -1 });
  assert.ok(!events.some(e => e.kind === "drift"), "no drift in this game");
  for (const [i, e] of events.entries()) {
    if (e.kind !== "values") continue;
    const cause = events[i - 1];
    const changed = cause && cause.data.objectId === e.data.objectId && (cause.kind === "objectBorn" || (cause.kind === "act" && cause.data.outcome === "committed"));
    assert.ok(changed, `values of object ${e.data.number} at seq ${e.seq} without its own change (after ${cause?.kind} on ${cause?.data?.objectId})`);
  }
  const { rows, stale } = await admin.query("v2/testing:staleValues", { gameId });
  assert.ok(rows > 0 && stale === 0, `every stored value agrees with its own object's state: ${stale} of ${rows} stale`);
  await perform(ada!, "game.end", {}, { gameId });
});
