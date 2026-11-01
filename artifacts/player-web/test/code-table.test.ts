/**
 * The code-output panel's table reading (src/core/panels/code-table.ts): which results become a table, which columns
 * show, and how cells read. What would break: a ranking returned as rows shown as raw JSON, a {summary, rows} result
 * losing its summary, columns past the cap, or numbers printed with long float tails.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_COLUMNS, cellText, columnsOf, tableOf } from "../src/core/panels/code-table.ts";

test("a list of objects, an object's rows, or its first list of objects is the table; anything else is not", () => {
  assert.deepEqual(tableOf([{ id: "a", payoff: 1 }, { id: "b" }]), { rows: [{ id: "a", payoff: 1 }, { id: "b" }] });
  assert.deepEqual(tableOf({ summary: "Top 2", rows: [{ id: "a" }], other: [{ x: 1 }] }), { rows: [{ id: "a" }], summary: "Top 2" });
  assert.deepEqual(tableOf({ n: 3, top: [{ id: "a" }] }), { rows: [{ id: "a" }] });
  for (const value of [[], [1, 2], [{ id: "a" }, 3], { n: 1 }, "text", 42, null, { rows: [] }]) assert.equal(tableOf(value as never), null, JSON.stringify(value));
});

test("columns in first-seen order across rows, capped", () => {
  assert.deepEqual(columnsOf([{ b: 1, a: 2 }, { a: 3, c: 4 }]), ["b", "a", "c"]);
  const wide = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
  assert.equal(columnsOf([wide]).length, MAX_COLUMNS);
});

test("cells: integers whole, other numbers short, booleans in words, nested values as short JSON", () => {
  assert.equal(cellText(42), "42");
  assert.equal(cellText(3.14159), "3.14");
  assert.equal(cellText(0.000123456), "0.000123");
  assert.equal(cellText(12345.678), "12346");
  assert.equal(cellText(true), "yes");
  assert.equal(cellText(null), "");
  assert.equal(cellText(undefined), "");
  assert.equal(cellText([1, 2]), "[1,2]");
  assert.equal(cellText({ long: "x".repeat(100) }).length, 60);
});
