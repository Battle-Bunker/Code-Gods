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

test("a row without notes (an older replay file) shows none rather than failing the act log", () => {
  assert.deepEqual(noteLines([{ seq: 1, agentId: "a1" } as never, mv(2, ["hi"])]), new Map([[2, ["hi"]]]));
});

test("a tug-of-war note names its object, so the act log can offer to leave it alone (round 10)", async () => {
  const { tugNoteNumber } = await import("../src/panes/move-notes.ts");
  assert.equal(tugNoteNumber("Tug-of-war on line 7: another player keeps pulling it back. Make a deal with them; to keep your side, leave line 7 alone (Leave alone, in Agent code)."), 7);
  assert.equal(tugNoteNumber("Tug-of-war on grid 12: another player keeps pulling it back. (said 3 times)"), 12);
  assert.equal(tugNoteNumber("Climbing line 3."), null);
});
