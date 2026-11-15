import { test } from "node:test";
import assert from "node:assert/strict";
import { versionRows, ENERGY_HOW } from "../src/panes/agents-words.ts";

test("each version: its number, moves, points gained and points a move, the running one marked", () => {
  const rows = versionRows([
    { version: 3, acts: 4, pointsGained: 10, price: 30 },
    { version: 2, acts: 0, pointsGained: 0, price: 12 },
    { version: 1, acts: 8, pointsGained: -4, price: 20 },
  ]);
  assert.deepEqual(rows.map(r => r.label), ["Version 3 (running)", "Version 2", "Version 1"]);
  assert.deepEqual(rows.map(r => r.perMove), ["2.50", "—", "−0.50"]);
  assert.equal(rows[2]!.gained, "−4.00");
});

test("how energy works names income, spending, the store and debt", () => {
  for (const w of [/power/, /second/, /store|capacity/i, /moves? cost/i, /borrow/]) assert.match(ENERGY_HOW, w);
});
