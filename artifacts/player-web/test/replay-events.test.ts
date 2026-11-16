/** The replay's event list (src/replay/events.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { around, replayEvents } from "../src/replay/events.ts";

const move = (seq: number, number: number, by: { memberId: string; name: string } | null, worldSeconds: number) => ({ seq, number, by, worldSeconds }) as never;
const ix = {
  roster: [{ memberId: "a", name: "Ada" }, { memberId: "b", name: "Bo" }],
  world: [0, 1, 2, 3, 4, 5, 6],
  objects: [{ number: 1, born: 1, bornAt: 0 }] as never,
  moves: new Map([
    ["a", [{ at: 4, move: move(10, 1, { memberId: "a", name: "Ada" }, 3) }, { at: 6, move: move(11, 1, { memberId: "b", name: "Bo" }, 5) }]],
    ["b", [{ at: 6, move: move(11, 1, { memberId: "b", name: "Bo" }, 5) }]],
  ]),
  commands: new Map([["a", [{ at: 2, kind: "summon", agentId: "x", name: "Climber", worldSeconds: 1 }, { at: 7, kind: "destroy", agentId: "x", worldSeconds: 6 }]]]),
} as never;

test("births, every move once, and commands, in event order, in words", () => {
  assert.deepEqual(replayEvents(ix).map(r => [r.at, r.text]), [
    [1, "Line 1 is born"], [2, "Ada summoned Climber"], [4, "Ada's agent changed line 1"], [6, "Bo's agent changed line 1"], [7, "Ada destroyed Climber"],
  ]);
});

test("around the playhead: the applied ones before, the next ones after", () => {
  const rows = replayEvents(ix);
  assert.deepEqual(around(rows, 4, 1, 1).map(r => r.at), [4, 6]);
  assert.deepEqual(around(rows, 0, 2, 2).map(r => r.at), [1, 2]);
});

test("a summon whose program the record keeps links to it; one without does not", () => {
  const withPrograms = { ...(ix as object), commands: new Map([["a", [{ at: 2, kind: "summon", agentId: "x", name: "Climber", version: 1, worldSeconds: 1 }, { at: 3, kind: "summon", agentId: "y", name: "Other", version: 1, worldSeconds: 2 }]]]),
    programs: new Map([["x@1", { agentId: "x", memberId: "a", name: "Climber", version: 1, language: "typescript", source: "code", summonedAt: 1 }]]) } as never;
  const rows = replayEvents(withPrograms).filter(r => r.kind === "command");
  assert.deepEqual(rows.map(r => r.program ?? null), [{ agentId: "x", version: 1 }, null]);
});
