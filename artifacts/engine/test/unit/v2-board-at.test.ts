/** The board at a moment (v1's get_board_at; call 36): each object's first log row at or before the time, newest first. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldBoard } from "../../convex/v2/boardFold.ts";

const row = (objectId: string, number: number, worldSeconds: number, state: string | null, own = 1) => ({ objectId, number, worldSeconds, state, own, others: 2, points: own * 2 });

test("an object's state at t is its last change at or before t; objects born later are absent", () => {
  // Newest first, as the log is read.
  const rows = [row("b", 2, 50, "B2"), row("a", 1, 40, "A3"), row("b", 2, 20, "B1"), row("a", 1, 15, "A2"), row("a", 1, 0, "A1"), row("b", 2, 10, "B0")];
  const at = (t: number) => Object.fromEntries([...foldBoard(rows, t).values()].map(o => [o.objectId, o.state]));
  assert.deepEqual(at(30), { a: "A2", b: "B1" });
  assert.deepEqual(at(5), { a: "A1" });
  assert.deepEqual(at(100), { a: "A3", b: "B2" });
  assert.deepEqual(at(15), { a: "A2", b: "B0" });
});

test("folding page by page gives the same board as one pass, and a hidden state stays hidden", () => {
  const rows = [row("a", 1, 30, null), row("a", 1, 10, "A1"), row("b", 2, 5, "B1")];
  const one = foldBoard(rows, 40), paged = foldBoard(rows.slice(2), 40, foldBoard(rows.slice(0, 2), 40));
  assert.deepEqual([...paged.entries()], [...one.entries()]);
  assert.equal(one.get("a")!.state, null, "a move hidden from the reader leaves the object's state unknown");
});
