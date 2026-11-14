import { test } from "node:test";
import assert from "node:assert/strict";
import { contestedLines, foldTugs, tugSentence } from "../src/panes/tug-of-war.ts";

// Newest first, as the act log lists them.
const m = (seq: number, objectId: string, mine: boolean, t: number, charge: number | null = mine ? 5 : null) =>
  ({ seq, objectId, number: Number(objectId.slice(1)), mine, worldSeconds: t, charge });

test("a back-and-forth on one line folds into one entry at its newest move; other moves stay as they are", () => {
  const moves = [m(9, "L7", false, 30), m(8, "L3", true, 29), m(7, "L7", true, 28), m(6, "L7", false, 26), m(5, "L7", true, 24), m(4, "L1", false, 20)];
  const items = foldTugs(moves);
  assert.deepEqual(items.map(i => i.kind === "tug" ? `tug:${i.moves.map(x => x.seq).join(",")}` : `move:${i.move.seq}`), ["tug:9,7,6,5", "move:8", "move:4"]);
  const tug = items[0]!;
  assert.ok(tug.kind === "tug");
  assert.equal(tug.flips, 3);
  assert.equal(tug.mySpend, 10);
  assert.deepEqual([tug.from, tug.to], [24, 30]);
});

test("two moves, one side only, or moves far apart in time are not a tug-of-war", () => {
  const kinds = (ms: ReturnType<typeof m>[]) => foldTugs(ms).map(i => i.kind);
  assert.deepEqual(kinds([m(2, "L7", false, 10), m(1, "L7", true, 9)]), ["move", "move"], "one exchange is just a reply");
  assert.deepEqual(kinds([m(3, "L7", true, 12), m(2, "L7", true, 10), m(1, "L7", true, 9)]), ["move", "move", "move"], "your agent alone");
  assert.deepEqual(kinds([m(3, "L7", false, 120), m(2, "L7", true, 60), m(1, "L7", false, 1)]), ["move", "move", "move"], "a minute apart");
});

test("the entry says who pulls, how often, what it cost you, and to talk", () => {
  const tug = foldTugs([m(4, "L7", false, 30), m(3, "L7", true, 28), m(2, "L7", false, 26), m(1, "L7", true, 24, 4.5)])[0]!;
  assert.ok(tug.kind === "tug");
  assert.equal(tugSentence(tug),
    "Tug-of-war on line 7: your agent and another player's agent moved it back and forth 4 times (0:24 to 0:30). " +
    "Your agent spent 9.5 ⚡ on it, and theirs spent energy too, so neither of you is getting anywhere. Talk to them in chat about this line.");
});

test("contested lines are the lines of the folded entries", () => {
  const moves = [m(4, "L7", false, 30), m(3, "L7", true, 28), m(2, "L7", false, 26), m(1, "L2", true, 24)];
  assert.deepEqual([...contestedLines(foldTugs(moves))], ["L7"]);
});
