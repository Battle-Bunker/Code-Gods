/** One row of the public log in words (src/panes/log-line.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logLine } from "../src/panes/log-line.ts";

const row = (o: Partial<Parameters<typeof logLine>[0]> = {}) => ({
  kind: "move" as const, number: 7, mine: false, by: null, points: 16.32, pointsBefore: 8.16, others: 2.4, own: 6.8, ...o,
});

test("another player's move, live: unattributed, your points before → after as an estimate", () => {
  assert.equal(logLine(row(), { noun: "line", change: { before: "y = x", after: "y = x + 1" }, approx: true }),
    "Line 7 changed: y = x → y = x + 1. Your points about 8.16 → 16.32.");
});

test("your agent's move, a move after the end named by its mover, and a birth", () => {
  assert.equal(logLine(row({ mine: true }), { noun: "line", approx: false }), "Your agent moved line 7. Your points 8.16 → 16.32.");
  assert.equal(logLine(row({ by: { name: "Ada" } }), { noun: "grid", approx: false }), "Ada moved grid 7. Your points 8.16 → 16.32.");
  assert.equal(logLine(row({ kind: "born", pointsBefore: null }), { noun: "line", change: { before: "", after: "y = 3" }, approx: false }), "Line 7 was born: y = 3. Your points 16.32.");
});

test("a move that left your points where they were says so; a spectator gets no points", () => {
  assert.equal(logLine(row({ pointsBefore: 16.32 }), { noun: "line", approx: false }), "Line 7 changed. Your points stayed 16.32.");
  assert.equal(logLine(row({ points: null, pointsBefore: null }), { noun: "line", approx: false }), "Line 7 changed.");
});
