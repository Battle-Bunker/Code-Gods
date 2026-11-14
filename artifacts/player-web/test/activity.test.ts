/** The activity throttle (src/core/activity.ts) and the parked clock (src/core/timer-text.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { touchGate, TOUCH_EVERY_MS } from "../src/core/activity.ts";
import { timerText } from "../src/core/timer-text.ts";

test("real interaction is reported at most once a minute", () => {
  const gate = touchGate();
  assert.deepEqual([gate(0), gate(1_000), gate(TOUCH_EVERY_MS - 1), gate(TOUCH_EVERY_MS), gate(TOUCH_EVERY_MS + 5)], [true, false, false, true, false]);
});

test("a parked game says why it is paused and that acting resumes it", () => {
  const x = timerText({ phase: "paused", parked: true, endsAt: null, worldSeconds: 300, planningEndsAt: null, planningSeconds: 60 } as never, 0)!;
  assert.equal(x.value, "paused");
  assert.match(x.note, /nobody was here for 30 minutes: it resumes when you act/);
  assert.equal(timerText({ phase: "paused", parked: false, worldSeconds: 300 } as never, 0)!.note, "", "an owner's pause says nothing of idleness");
});
