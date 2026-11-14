import { test } from "node:test";
import assert from "node:assert/strict";
import { noteLines } from "../src/panes/move-notes.ts";

// Newest first, as the act log lists them.
const mv = (seq: number, notes: string[], agentId: string | null = "a1") => ({ seq, agentId, notes });

test("a note shows once, on its newest move, with how often the agent said it; other notes stay with their moves", () => {
  const moves = [
    mv(5, ["Leaving line 7: another player keeps pulling it back. Talk to them?"]),
    mv(4, []),
    mv(3, ["Leaving line 7: another player keeps pulling it back. Talk to them?", "Line 2 is nearly at the top."]),
    mv(2, ["Leaving line 7: another player keeps pulling it back. Talk to them?"]),
  ];
  const lines = noteLines(moves);
  assert.deepEqual(lines.get(5), ["Leaving line 7: another player keeps pulling it back. Talk to them? (said 3 times)"]);
  assert.deepEqual(lines.get(3), ["Line 2 is nearly at the top."]);
  assert.equal(lines.get(2), undefined);
  assert.equal(lines.get(4), undefined);
});

test("the same words from two different agents are two notes; other players' moves carry none", () => {
  const lines = noteLines([mv(2, ["Stuck."], "a1"), mv(1, ["Stuck."], "a2"), mv(0, [], null)]);
  assert.deepEqual(lines.get(2), ["Stuck."]);
  assert.deepEqual(lines.get(1), ["Stuck."]);
});
