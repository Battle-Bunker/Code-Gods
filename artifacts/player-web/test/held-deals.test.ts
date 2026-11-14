/** Held deals for the end summary (src/panes/held-deals.ts): from the act log and the agents' TARGET/SETTLE. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { heldDeals, type HeldMove } from "../src/panes/held-deals.ts";

// States as plain targets for the test: the decode is the identity on these wires' targets.
const target = (w: string) => (w.includes(",") ? { m: Number(w.split(",")[0]), c: Number(w.split(",")[1]) } : w);
let seq = 0;
const mv = (number: number, stateAfter: string, before: number, after: number, by: { mine: boolean; name: string }): HeldMove =>
  ({ seq: ++seq, number, worldSeconds: seq * 10, stateAfter, before: { points: before }, after: { points: after }, mine: by.mine, by: { memberId: by.name, name: by.name } });
const you = { mine: true, name: "Cy" }, ada = { mine: false, name: "Ada" };

test("a hold reached: who brought it back to the target, my points before it and at the end", () => {
  // Oldest first here; the act log gives newest first.
  const log = [
    mv(8, "1,1", 1, 2, ada),
    mv(8, "2,7", 3.1, 20, you),      // the hold starts: reached the target
    mv(8, "5,5", 20, 4, ada),
    mv(8, "2,7", 4, 22.4, ada),      // Ada brought it back: she holds it too
    mv(5, "9,9", 0, 1, you),         // never reached its target
  ].reverse();
  const deals = heldDeals(log, [{ target: { m: 2, c: 7 }, numbers: [8, 5] }], w => target(w));
  assert.deepEqual(deals, [{ number: 8, stateAfter: "2,7", by: ["you", "Ada"], before: 3.1, after: 22.4 }]);
});

test("SETTLE [] holds every object that reached the target; a board's sixteen digits compare as the target", () => {
  const b = "9779855879979779";
  const log = [mv(3, b, 1, 2, you), mv(4, "1,1", 0, 1, you)].reverse();
  assert.deepEqual(heldDeals(log, [{ target: b, numbers: [] }], w => target(w)), [{ number: 3, stateAfter: b, by: ["you"], before: 1, after: 2 }]);
  assert.deepEqual(heldDeals(log, [{ target: null, numbers: [3] }], w => target(w)), [], "no target: nothing held");
});
