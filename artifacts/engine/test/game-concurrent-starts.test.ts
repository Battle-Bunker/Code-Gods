/**
 * Many rooms starting at once (a class, a tournament): each start must not write a document every other start
 * writes, or Convex's optimistic concurrency fails some of them permanently (the global activity row: activity.ts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { api, gods, roomWith, startedGame, touch } from "./game-helpers.ts";

const settings = { languages: ["typescript"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600 };
const ROOMS = 20;

test(`${ROOMS} rooms starting at the same moment all start`, { timeout: 300000 }, async () => {
  const rooms: { host: Awaited<ReturnType<typeof gods>>[number]; roomId: string }[] = [];
  for (let i = 0; i < ROOMS; i++) {
    const trio = await gods(`Rush ${i}a`, `Rush ${i}b`, `Rush ${i}c`);
    rooms.push({ host: trio[0], roomId: (await roomWith(trio, settings)).roomId });
  }
  await touch(rooms[0].host);
  const results = await Promise.allSettled(rooms.map(r => r.host.c.action(api.owner.start, { roomId: r.roomId })));
  const failed = results.flatMap(r => (r.status === "rejected" ? [String(r.reason).slice(0, 200)] : []));
  assert.deepEqual(failed, [], `every start succeeds (${failed.length} failed)`);
  const games = await Promise.all(results.map((r, i) => startedGame(rooms[i].host, rooms[i].roomId, (r as PromiseFulfilledResult<unknown>).value)));
  assert.equal(new Set(games.map(g => g.gameId)).size, ROOMS);
});
