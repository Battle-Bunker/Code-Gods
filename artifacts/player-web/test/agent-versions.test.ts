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

test("the energy bar: how full the store is, and when it fills at this power (v1's 'full in 14 s')", async () => {
  const { energyBar } = await import("../src/panes/agents-words.ts");
  assert.deepEqual(energyBar({ energy: 30, capacity: 100, perSecond: 5 }), { fraction: 0.3, text: "full in 14 s" });
  assert.deepEqual(energyBar({ energy: 100, capacity: 100, perSecond: 5 }), { fraction: 1, text: "full: it gets no more until it spends" });
  assert.deepEqual(energyBar({ energy: -20, capacity: 100, perSecond: 5 }), { fraction: 0, text: "repaying a debt: full in 24 s" });
  assert.deepEqual(energyBar({ energy: 10, capacity: 100, perSecond: 0 }), { fraction: 0.1, text: "no power: it gets nothing" });
});

test("more power gives half of what you keep; less halves its share (v1's in-pane power buttons)", async () => {
  const { morePower, lessPower } = await import("../src/panes/agents-words.ts");
  assert.equal(morePower(0.2, 0.4), 0.4);
  assert.equal(morePower(0.5, 0.005), null, "nothing left to give");
  assert.equal(lessPower(0.4), 0.2);
  assert.equal(lessPower(0.004), null, "too little to halve");
});
