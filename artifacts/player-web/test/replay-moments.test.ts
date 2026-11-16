/** The replay's key moments (src/replay/moments.ts): lead changes and summons, and the jumps between them. */
import test from "node:test";
import assert from "node:assert/strict";
import { jumpTarget, keyMoments } from "../src/replay/moments.ts";

const tick = (at: number, a: number, b: number) => ({ at, standings: { rows: [{ memberId: "a", net: a }, { memberId: "b", net: b }] }, point: {} }) as never;
const ix = {
  roster: [{ memberId: "a", name: "Ada" }, { memberId: "b", name: "Bo" }],
  ticks: [tick(5, 1, 0), tick(9, 2, 2), tick(12, 1, 3), tick(20, 4, 3)],
  commands: new Map([["b", [{ at: 7, kind: "summon", agentId: "x", name: "Climber", worldSeconds: 1 }, { at: 8, kind: "destroy", agentId: "x", worldSeconds: 2 }]]]),
} as never;

test("each change of leader (a tie leads nobody) and each summon, in event order", () => {
  assert.deepEqual(keyMoments(ix), [
    { at: 7, kind: "summon", text: "Bo summons Climber" },
    { at: 12, kind: "lead", text: "Bo takes the lead" },
    { at: 20, kind: "lead", text: "Ada takes the lead" },
  ]);
});

test("jumps go to the next or previous moment, and nowhere past the ends", () => {
  const m = keyMoments(ix);
  assert.equal(jumpTarget(m, 0, 1), 7);
  assert.equal(jumpTarget(m, 12, 1), 20);
  assert.equal(jumpTarget(m, 12, -1), 7);
  assert.equal(jumpTarget(m, 20, 1), null);
  assert.equal(jumpTarget(m, 7, -1), null);
});
