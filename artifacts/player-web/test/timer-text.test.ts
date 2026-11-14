/** The game clock's words (src/core/timer-text.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERDUE_MS, timerText } from "../src/core/timer-text.ts";

const live = (endsAt: number) => ({ phase: "live", endsAt, worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 }) as never;

test("a running game counts down to its end", () => {
  assert.deepEqual([timerText(live(70_000), 0)!.label, timerText(live(70_000), 0)!.value], ["Game ends in", "1:10"]);
  assert.equal(timerText(live(1_000), 5_000)!.note, "", "just past the end: the server finishes it within a tick");
});

test("well past its end and still running, the clock says the server is late (round 9: RUNNING 0:00 forever, silent)", () => {
  const x = timerText(live(1_000), 1_000 + OVERDUE_MS + 1)!;
  assert.equal(x.value, "0:00");
  assert.match(x.note, /should have ended: waiting for the server/);
});
