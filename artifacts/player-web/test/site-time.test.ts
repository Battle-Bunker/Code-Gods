import test from "node:test";
import assert from "node:assert/strict";
import { fmtWhen, isoWhen, fmtDuration } from "../src/site/lib/time.ts";

test("missing and malformed server timestamps cannot crash date rendering", () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, 1e30]) {
    assert.equal(isoWhen(value), undefined);
    assert.equal(fmtWhen(value), "Unknown date");
  }
});

test("current milliseconds and legacy seconds render the same instant", () => {
  const ms = Date.UTC(2026, 9, 28, 6, 0);
  assert.equal(isoWhen(ms), "2026-10-28T06:00:00.000Z");
  assert.equal(isoWhen(ms / 1000), isoWhen(ms));
  assert.equal(fmtWhen(ms), fmtWhen(ms / 1000));
  assert.equal(isoWhen(0), "1970-01-01T00:00:00.000Z");
});

test("missing history timestamps do not produce NaN duration labels", () => {
  assert.equal(fmtDuration(NaN), "Unknown duration");
  assert.equal(fmtDuration(Infinity), "Unknown duration");
  assert.equal(fmtDuration(61000), "1m 1s");
});

test("world time runs on from the last published scoreboard while the world runs, and holds otherwise", async () => {
  // What would break: the spectator's world clock frozen between scoreboards (it has no per-tick clock query), or
  // running on while the game is paused, in planning or ended.
  const { worldSecondsAt } = await import("../src/site/lib/time.ts");
  const at = Date.UTC(2026, 10, 3, 12, 0, 0);
  assert.equal(worldSecondsAt({ world: 40, at, running: true }, at + 2500), 42.5, "hand: 40 s + 2.5 s of wall time");
  assert.equal(worldSecondsAt({ world: 40, at, running: false }, at + 2500), 40, "paused, planning or ended: as published");
  assert.equal(worldSecondsAt({ world: 40, at, running: true }, at - 1000), 40, "a client clock behind the server's never runs time backwards");
  assert.equal(worldSecondsAt({ world: 0, at, running: true, resumedAt: at + 60_000 }, at + 62_000), 2, "the world started when planning ended, not when the start's scoreboard was published");
  assert.equal(worldSecondsAt({ world: 40, at, running: true, resumedAt: at - 5000 }, at + 2500), 42.5, "a resume before the publication changes nothing");
  // The next publication comes within one interval of world time while the world runs: past that, the world stood
  // still (recovery, idle parking, a restart), so the clock holds there instead of running off and snapping back.
  assert.equal(worldSecondsAt({ world: 40, at, running: true, interval: 10 }, at + 7_200_000), 50, "hand: capped at 40 + 10");
  assert.equal(worldSecondsAt({ world: 40, at, running: true, interval: 10 }, at + 2500), 42.5);
  assert.equal(worldSecondsAt(null, at), null, "nothing published yet");
});
