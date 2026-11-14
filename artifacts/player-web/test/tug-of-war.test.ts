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
    "Your agent spent 9.50 ⚡ on it, and theirs spent energy too, so neither of you is getting anywhere. Talk to them in chat about this line.");
});

test("contested lines are the lines of the folded entries", () => {
  const moves = [m(4, "L7", false, 30), m(3, "L7", true, 28), m(2, "L7", false, 26), m(1, "L2", true, 24)];
  assert.deepEqual([...contestedLines(foldTugs(moves))], ["L7"]);
});

test("the entry names the other player when the moves say who moved, and both when two pull against you", () => {
  const by = (name: string) => ({ memberId: name, name });
  const tug = (others: string[]) => foldTugs([
    { ...m(4, "L7", false, 30), by: by(others[0]!) }, { ...m(3, "L7", true, 28), by: by("Sam") },
    { ...m(2, "L7", false, 26), by: by(others[1] ?? others[0]!) }, { ...m(1, "L7", true, 24, 4.5), by: by("Sam") },
  ])[0]!;
  const one = tug(["Ada"]);
  assert.ok(one.kind === "tug");
  assert.match(tugSentence(one), /^Tug-of-war on line 7: your agent and Ada's agent moved it back and forth 4 times .* Talk to Ada in chat about this line\.$/);
  const two = tug(["Ada", "Bo"]);
  assert.ok(two.kind === "tug");
  assert.match(tugSentence(two), /your agent and the agents of Ada and Bo moved it .* Talk to Ada and Bo in chat about this line\.$/);
});

test("against practice partners or AI players only, the entry does not tell you to chat with them", () => {
  const by = (name: string) => ({ memberId: name, name });
  const tug = foldTugs([
    { ...m(4, "L7", false, 30), by: by("Practice partner 1") }, { ...m(3, "L7", true, 28), by: by("Sam") },
    { ...m(2, "L7", false, 26), by: by("Practice partner 1") }, { ...m(1, "L7", true, 24), by: by("Sam") },
  ])[0]!;
  assert.ok(tug.kind === "tug");
  const kinds = new Map([["Practice partner 1", "practice"]]);
  const s = tugSentence(tug, kinds);
  assert.doesNotMatch(s, /Talk to/);
  assert.match(s, /Practice partners do not read chat: with people, this is when you would talk to them\.$/);
  assert.match(tugSentence(tug, new Map([["Practice partner 1", "human"]])), /Talk to Practice partner 1 in chat/);
});

test("a grid game's tug-of-war says grid, never line (ux-lessons 2.8)", () => {
  const s = tugSentence({ kind: "tug", objectId: "o1", number: 10, from: 0, to: 20, mySpend: 3, moves: [{ seq: 1, mine: true, at: 0 }, { seq: 2, mine: false, at: 10, by: { memberId: "m2", name: "Ada" } }] } as never, undefined, "grid");
  assert.match(s, /^Tug-of-war on grid 10: .* Talk to Ada in chat about this grid\.$/);
  assert.doesNotMatch(s, /\bline\b/);
});

test("with the world's length, a tug-of-war's times read as the countdown does (persona walk: 0:13 beside 3:39 left)", () => {
  const s = tugSentence({ kind: "tug", objectId: "o1", number: 7, from: 12, to: 17, mySpend: 3, moves: [{ seq: 1, mine: true, at: 12 }, { seq: 2, mine: false, at: 17, by: { memberId: "m2", name: "Ada" } }] } as never, undefined, "line", 300);
  assert.match(s, /\(from 4:48 left to 4:43 left\)/);
});

test("live, a tug-of-war names no one and says nothing of what the other side spent (v1 public log: no attribution)", () => {
  const by = (name: string) => ({ memberId: name, name });
  const tug = foldTugs([
    { ...m(4, "L7", false, 30), by: by("Ada") }, { ...m(3, "L7", true, 28), by: by("Sam") },
    { ...m(2, "L7", false, 26), by: by("Ada") }, { ...m(1, "L7", true, 24, 4.5), by: by("Sam") },
  ])[0]!;
  assert.ok(tug.kind === "tug");
  assert.equal(tugSentence(tug, undefined, "line", null, { anonymous: true }),
    "Tug-of-war on line 7: your agent and another player moved it back and forth 4 times (0:24 to 0:30). " +
    "Your agent spent 9.50 ⚡ on it, and every pull costs the other side too, so neither of you is getting anywhere. Ask in chat who else wants this line.");
  // Live, nothing hints at who pulls, not even that they are a practice partner (round 10).
  const bots = tugSentence(tug, undefined, "grid", null, { anonymous: true });
  assert.doesNotMatch(bots, /Ada|Practice partner/);
  assert.match(bots, /Ask in chat who else wants this grid\.$/);
});
