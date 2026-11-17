/** The deal knob every starter carries: the objects an agent leaves alone (src/leave.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLeave, setLeave } from "../src/leave.ts";
import { startersFor } from "../src/starters.ts";

test("every starter's leave-alone list reads and rewrites, in both languages, for lines and grids", () => {
  for (const [family, tb] of [["golden-path", null], ["row-multiples", null]] as const) {
    for (const language of ["typescript", "python"] as const) {
      const starters = startersFor(family, language, tb);
      assert.ok(starters.length > 0, `${family}/${language} has starters`);
      for (const s of starters) {
        if (s.kind === "naive") { assert.equal(readLeave(s.source), null, "the naive starter has no deal knob"); continue; }
        assert.deepEqual(readLeave(s.source), [], `${family}/${s.title}/${language} starts empty`);
        const edited = setLeave(s.source, [3, 19, 3])!;
        assert.deepEqual(readLeave(edited), [3, 19], "sorted, without repeats");
        assert.equal(edited.split("\n").length, s.source.split("\n").length, "only the one line changes");
        assert.deepEqual(readLeave(setLeave(edited, [])!), []);
      }
    }
  }
});

test("a program without the knob says so: nothing to read, nothing to set", () => {
  assert.equal(readLeave("export function act() { return null; }"), null);
  assert.equal(setLeave("def act(view):\n    return None\n", [3]), null);
});
