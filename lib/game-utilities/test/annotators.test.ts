/**
 * Per-family annotators (src/families/annotators.ts): each one on a literal value, with the expected marks derived by
 * hand from the family's card, and cross-checked against the card's own ordinal so an annotator cannot drift from the
 * rule it explains.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { instantiate } from "@workspace/game-types";
import { ANNOTATORS, annotatorFor, family, ordinal, type Annotation, type UtilityDescriptor } from "../src/index.ts";

const grid3 = instantiate("Grid", { size: 3, symbols: "base10", colours: "rgb" }); // colours: 0 red, 1 green, 2 blue
const run = (familyId: string, params: UtilityDescriptor["params"], value: string | number, inst = grid3): Annotation[] => {
  const annotate = annotatorFor(familyId);
  assert.ok(annotate, `${familyId} has an annotator`);
  return annotate(value, { familyId, params }, inst);
};
const cells = (list: readonly [number, number][]) => list.map(([r, c]) => ({ r, c }));
const find = (as: Annotation[], label: string) => as.find(a => "label" in a && a.label === label);

test("every registered annotator belongs to a real reward family", () => {
  assert.ok(Object.keys(ANNOTATORS).length >= 7);
  for (const id of Object.keys(ANNOTATORS)) assert.equal(family(id).role, "reward", id);
  assert.equal(annotatorFor("no_such_family"), undefined);
});

test("Green Ones (counting): the counted cells full weight, the halfway cells lighter", () => {
  const params = { colour: 1, value: 1 };
  const value = "1G,1R,2G/3B,1G,0B/2R,2R,1B";
  const as = run("seed3_green_ones", params, value);
  assert.deepEqual(find(as, "green 1s"), { kind: "cells", tone: "good", label: "green 1s", cells: cells([[0, 0], [1, 1]]) });
  assert.deepEqual(find(as, "halfway: green or a 1"), { kind: "cells", tone: "good", label: "halfway: green or a 1",
    cells: cells([[0, 1], [0, 2], [2, 2]]).map(c => ({ ...c, weight: 0.4 })) });
  assert.deepEqual(ordinal({ familyId: "seed3_green_ones", params }, grid3, value), [2, 3], "the card counts the same cells");
});

test("Homebody (edge): your colour at home is good, away from home is bad", () => {
  const params = { X: 0, zone: "rim" };
  const value = "0R,0G,0R/0B,0R,0G/0G,0G,0R";
  const as = run("homebody", params, value);
  assert.deepEqual(find(as, "red at home"), { kind: "cells", tone: "good", label: "red at home", cells: cells([[0, 0], [0, 2], [2, 2]]) });
  assert.deepEqual(find(as, "red away from home"), { kind: "cells", tone: "bad", label: "red away from home", cells: cells([[1, 1]]) });
  assert.equal(ordinal({ familyId: "homebody", params }, grid3, value), 3 - 1);
});

test("Picture Frame (edge): the wrong edge cells are bad, the right ones good", () => {
  const as = run("picture_frame", { X: 0 }, "0R,0G,0R/0R,0B,0R/0R,0R,0R");
  assert.deepEqual(find(as, "not red: breaks the frame"), { kind: "cells", tone: "bad", label: "not red: breaks the frame", cells: cells([[0, 1]]) });
  assert.equal((find(as, "red frame") as { cells: unknown[] }).cells.length, 7);
});

test("Feuding Families: safe cells good (the smaller family's count is the score), touching cells bad", () => {
  const params = { X: 0, Y: 2 };
  // Red (0,0),(0,1),(1,0); blue (1,1),(1,2),(2,1),(2,2). The blue centre touches red (0,1) and (1,0).
  const value = "0R,0R,0G/0R,0B,0B/0G,0B,0B";
  const as = run("feuding_families", params, value);
  assert.deepEqual(find(as, "safe red"), { kind: "cells", tone: "good", label: "safe red", cells: cells([[0, 0]]) });
  assert.deepEqual(find(as, "safe blue"), { kind: "cells", tone: "good", label: "safe blue", cells: cells([[1, 2], [2, 1], [2, 2]]).map(c => ({ ...c, weight: 0.5 })) });
  assert.deepEqual(find(as, "touching the other family"), { kind: "cells", tone: "bad", label: "touching the other family", cells: cells([[0, 1], [1, 0], [1, 1]]) });
  assert.deepEqual(as.find(a => a.kind === "badge"), { kind: "badge", tone: "neutral", text: "1 safe red · 3 safe blue" });
  assert.deepEqual(ordinal({ familyId: "feuding_families", params }, grid3, value), [1, 4]);
  // A tie: both families count fully.
  const tie = run("feuding_families", params, "0R,0R,0G/0R,0G,0B/0G,0B,0B");
  assert.ok((find(tie, "safe blue") as { cells: { weight?: number }[] }).cells.every(c => c.weight === undefined));
  assert.equal(find(tie, "touching the other family"), undefined);
});

test("Kingdom (region): the biggest patch of your colour as one region", () => {
  const params = { C: 2 };
  const value = "0B,0B,0R/0R,0B,0R/0B,0R,0B";
  const as = run("kingdom", params, value);
  assert.deepEqual(as, [{ kind: "region", tone: "good", label: "biggest blue patch (3)", cells: cells([[0, 0], [0, 1], [1, 1]]) }]);
  assert.equal(ordinal({ familyId: "kingdom", params }, grid3, value), 3);
  assert.deepEqual(run("kingdom", params, "0R,0R,0R/0R,0R,0R/0R,0R,0R"), [{ kind: "badge", tone: "neutral", text: "no blue yet" }]);
});

test("Stripe Painter (rows or columns): scoring stripes as regions, repeats neutral, the cells that break a stripe bad", () => {
  const value = "0R,0R,0R/0R,0R,0R/0G,0B,0G";
  const as = run("stripe_painter", { axis: "rows" }, value);
  assert.deepEqual(as.filter(a => a.kind === "region"), [{ kind: "region", tone: "good", label: "stripe", cells: cells([[0, 0], [0, 1], [0, 2]]) }]);
  assert.deepEqual(find(as, "same colour as the stripe before"), { kind: "cells", tone: "neutral", label: "same colour as the stripe before", cells: cells([[1, 0], [1, 1], [1, 2]]) });
  assert.deepEqual(find(as, "breaks a stripe"), { kind: "cells", tone: "bad", label: "breaks a stripe", cells: [{ r: 2, c: 1, weight: 0.6 }] });
  assert.deepEqual(ordinal({ familyId: "stripe_painter", params: { axis: "rows" } }, grid3, value), [1, 8]);
  // Columns: the same grid has no solid column; each column's odd one out breaks it.
  const cols = run("stripe_painter", { axis: "cols" }, value);
  assert.deepEqual(cols.filter(a => a.kind === "region"), []);
  assert.deepEqual((find(cols, "breaks a stripe") as { cells: { r: number; c: number }[] }).cells.map(c => [c.r, c.c]), [[2, 0], [2, 1], [2, 2]]);
});

test("Digit Devotee (Int): your digit's positions, counted from the left, the sign not a digit", () => {
  const int = instantiate("Int", {});
  assert.deepEqual(run("digit-devotee", { d: 7 }, -1707, int), [{ kind: "digits", tone: "good", label: "your 7s", positions: [1, 3] }]);
  assert.deepEqual(run("digit-devotee", { d: 7 }, 1234, int), []);
});

test("Glyph Glutton (string): runs of your character as spans", () => {
  const str = instantiate("string", { maxLength: 16 });
  assert.deepEqual(run("glyph-glutton", { c: "a" }, "banana", str), [{ kind: "spans", tone: "good", label: 'your "a"s', spans: [{ start: 1, end: 2 }, { start: 3, end: 4 }, { start: 5, end: 6 }] }]);
  assert.deepEqual(run("glyph-glutton", { c: "a" }, "aab", str), [{ kind: "spans", tone: "good", label: 'your "a"s', spans: [{ start: 0, end: 2 }] }]);
});

test("an annotator given a value it cannot read returns nothing instead of throwing", () => {
  for (const id of ["seed3_green_ones", "homebody", "picture_frame", "feuding_families", "kingdom", "stripe_painter"]) {
    assert.deepEqual(run(id, { colour: 1, value: 1, X: 0, Y: 2, C: 2, zone: "rim", axis: "rows" }, "not a grid"), [], id);
  }
});
