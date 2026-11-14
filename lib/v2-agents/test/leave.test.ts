/** The deal knob every starter carries: the objects an agent leaves alone (src/leave.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readHold, readLeave, setHold, setLeave } from "../src/leave.ts";
import { startersFor } from "../src/starters.ts";

test("every starter's leave-alone list reads and rewrites, in both languages, for lines and grids", () => {
  for (const [family, tb] of [["prime-landing", null], ["opposite-nines", "top-half"]] as const) {
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

test("the hold knobs (TARGET and SETTLE) read and rewrite in every starter, lines and grids, both languages", () => {
  for (const [family, tb, target] of [["prime-landing", null, { m: -1, c: 59 }], ["opposite-nines", "top-half", "9779855879979779"]] as const) {
    for (const language of ["typescript", "python"] as const) {
      for (const s of startersFor(family, language, tb)) {
        if (s.kind === "naive") { assert.equal(readHold(s.source), null); continue; }
        assert.deepEqual(readHold(s.source), { target: null, numbers: [] }, `${family}/${s.title}/${language} starts off`);
        const held = setHold(s.source, { target, numbers: [5, 2] })!;
        assert.deepEqual(readHold(held), { target, numbers: [2, 5] });
        assert.equal(held.split("\n").length, s.source.split("\n").length, "only the two lines change");
        assert.deepEqual(readHold(setHold(held, { target: null, numbers: [] })!), { target: null, numbers: [] }, "and off again");
        assert.deepEqual(readLeave(held), [], "the leave-alone list is untouched");
      }
    }
  }
});

test("a line target takes negative and zero numbers", () => {
  const ts = 'const TARGET = null;   // a line\nconst SETTLE = [];     // the lines\n';
  assert.deepEqual(readHold(setHold(ts, { target: { m: 0, c: -7 }, numbers: [3] })!), { target: { m: 0, c: -7 }, numbers: [3] });
  const py = 'TARGET = None   # a line\nSETTLE = []     # the lines\n';
  assert.match(setHold(py, { target: { m: -1, c: 59 }, numbers: [] })!, /^TARGET = \{"m": -1, "c": 59\}   # a line$/m);
});
