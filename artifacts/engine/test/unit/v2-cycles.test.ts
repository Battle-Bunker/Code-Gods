/**
 * Two-state cycles in a tug row (convex/v2/cycles.ts; playtest rounds 32–33). What would break: a toggle A→B→A→B not
 * counted, a walk A→B→C counted, a new pair continuing the old pair's count.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepCycle, type Cycle } from "../../convex/v2/cycles.ts";

const fold = (states: string[]) => states.reduce<{ lastStates: string[]; cycle: Cycle | null }>((acc, s) => stepCycle(acc.lastStates, acc.cycle, s), { lastStates: [], cycle: null });

test("a toggle counts every move within its pair", () => {
  // B, A, B, A, B: the moves into A, B, A, B all go between A and B (the first state is where it was born or first moved).
  assert.deepEqual(fold(["B", "A", "B", "A", "B"]), { lastStates: ["A", "B"], cycle: { a: "A", b: "B", moves: 4 } });
});

test("a walk is no cycle, and a repeated state is no return", () => {
  assert.deepEqual(fold(["A", "B", "C", "D"]).cycle, null);
  assert.deepEqual(fold(["A", "A", "A"]).cycle, null, "staying put is not a toggle");
});

test("a new pair starts its own count", () => {
  // A, B, A (pair AB: 2 moves), C, A (A → C → A: pair AC, 2 moves).
  assert.deepEqual(fold(["A", "B", "A", "C", "A"]).cycle, { a: "A", b: "C", moves: 2 });
});
