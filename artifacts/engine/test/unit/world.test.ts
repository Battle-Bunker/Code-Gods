/**
 * Spawn planning (convex/lib/world.ts planSpawns): pure, no backend. Expectations are hand-derived with a
 * constant spawn gap, so every time below can be checked by eye.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { godEnergy, planSpawns } from "../../convex/lib/world.ts";

const every = (gap: number) => () => gap;
type Args = Omit<Parameters<typeof planSpawns>[0], "place">;
/** Plan with a placement that succeeds unless `fails` says otherwise; returns the times placed. */
const plan = (args: Args, fails: (time: number) => boolean = () => false) => {
  const times: number[] = [];
  const result = planSpawns({ ...args, place: t => { if (fails(t)) return false; times.push(t); return true; } });
  return { ...result, times };
};

test("a tick spawns only inside its window: a stalled interval's spawns are skipped, not owed", () => {
  // The loop stalled for 60 s; the tick simulates only the last 1.5 s (58.5–60).
  const p = plan({ nextSpawn: 0, windowStart: 58.5, until: 60, endAtWorld: 1000, room: 2000, interval: every(1) });
  assert.deepEqual(p.times, [59.5]);
  assert.equal(p.next, 60.5);
  assert.equal(p.full, false);
});

test("in normal running every spawn due by the end of the window happens, in order", () => {
  const p = plan({ nextSpawn: 10.2, windowStart: 9.5, until: 11, endAtWorld: 1000, room: 2000, interval: every(0.5) });
  assert.deepEqual(p.times, [10.2, 10.7]);
  assert.equal(p.next, 11.2);
});

test("nothing spawns at or after the lifetime end", () => {
  const p = plan({ nextSpawn: 10.2, windowStart: 9.5, until: 11, endAtWorld: 10.5, room: 2000, interval: every(0.5) });
  assert.deepEqual(p.times, [10.2]);
});

test("the object limit stops spawning and reports that the world is full", () => {
  const p = plan({ nextSpawn: 10, windowStart: 9.5, until: 11, endAtWorld: 1000, room: 1, interval: every(0.25) });
  assert.deepEqual(p.times, [10]);
  assert.equal(p.full, true);
});

test("exactly enough room for the due spawns is not full", () => {
  // Due: 10, 10.25, 10.5, 10.75, 11 (five); the next, 11.25, falls after the window.
  const p = plan({ nextSpawn: 10, windowStart: 9.5, until: 11, endAtWorld: 1000, room: 5, interval: every(0.25) });
  assert.equal(p.times.length, 5);
  assert.equal(p.full, false);
});

test("a spawn that finds no free value does not use up room, so it cannot fake a full world", () => {
  // Due: 10, 10.25, 10.5, 10.75, 11. The first four find no free value; only 11 is placed, in room 1.
  const p = plan({ nextSpawn: 10, windowStart: 9.5, until: 11, endAtWorld: 1000, room: 1, interval: every(0.25) }, t => t < 11);
  assert.deepEqual(p.times, [11]);
  assert.equal(p.full, false);
});

test("an ended game is frozen: a god's energy stops accruing at the end", () => {
  const settings = { startingEnergy: 100, energyPerSecond: 2 } as Parameters<typeof godEnergy>[0]["settings"];
  const live = { settings, createdAt: 0 };
  assert.equal(godEnergy(live, 10, 30_000), 100 + 60 - 10, "a live game accrues with wall time");
  const ended = { ...live, endedAt: 20_000 };
  assert.equal(godEnergy(ended, 10, 30_000), 100 + 40 - 10, "reading after the end gives the energy at the end");
  assert.equal(godEnergy(ended, 10, 3_600_000), godEnergy(ended, 10, 20_000), "and it does not move however late it is read");
});

test("the scoreboard publishes once per interval: at the first commit reaching the next multiple, never twice in one", async () => {
  const { scoreboardDue } = await import("../../convex/lib/world.ts");
  // Published at 0; commits at about 1 s apart with a 10 s interval: due at the first commit at or past 10, then 20.
  assert.equal(scoreboardDue(0, 9.99, 10), false);
  assert.equal(scoreboardDue(0, 10, 10), true, "exactly on the mark");
  assert.equal(scoreboardDue(0, 10.7, 10), true);
  assert.equal(scoreboardDue(10.7, 19.5, 10), false, "published at 10.7: not again before 20");
  assert.equal(scoreboardDue(10.7, 20.2, 10), true);
  assert.equal(scoreboardDue(10.7, 45, 10), true, "a long window publishes once, at its end");
  assert.equal(scoreboardDue(3, 3, 10), false, "no world time passed (a pause)");
  assert.equal(scoreboardDue(0.1 + 0.2, 30 * (0.1 + 0.2) / 0.3, 30), true, "floating-point marks still count");
});

