/**
 * The Lines, One line and goal card panes' pure parts (src/panes/lines.ts, src/panes/worked-example.ts): the server
 * sort, the payoff rectangle, the row's "Why?", the switcher in the human's view state, and the worked example.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, levelOf, objectLadder } from "@workspace/v2-core";
import { lineType, type LineState } from "@workspace/v2-linear";
import { activeOp, compareOp, digestScale, partsNote, payoffRect, serverSort, SORTS, switcherOf, whyLine, widen } from "../src/panes/lines.ts";
import { workedExample } from "../src/panes/worked-example.ts";

test("every order the human can pick pages by a server sort; a step up is a higher ✨ rarity", () => {
  // Catches: "level" sent to the server, which has no such index (the pane would throw on its first page).
  assert.equal(serverSort("points"), "points");
  assert.equal(serverSort("level"), "rarity");
  assert.equal(serverSort("recent"), "recent");
  assert.equal(serverSort(undefined), "points");
  for (const s of SORTS) assert.ok(["points", "rarity", "recent"].includes(serverSort(s.sort)));
  assert.ok(SORTS.every(s => !/bits|payoff|object/i.test(s.label)));
});

test("payoff rectangle: one scale for both sides from the digest, so the area is the points", () => {
  // Digest packed [number, rarity, want, …]: the largest of any rarity or want fills the side.
  const scale = digestScale([1, 2, 4, 2, 8, 1, 3, 0, 0]);
  assert.equal(scale.max, 8);
  const r = payoffRect({ rarity: 4, want: 2 }, scale, 40);
  assert.deepEqual(r, { kind: "gain", width: 20, height: 10 });
  // Equal values make a square.
  const sq = payoffRect({ rarity: 3, want: 3 }, scale, 40);
  assert.equal(sq.width, sq.height);
  // A line that scores nothing for you has no rectangle; one nobody else wants is flat.
  assert.equal(payoffRect({ rarity: 0, want: 5 }, scale, 40).kind, "none");
  assert.deepEqual(payoffRect({ rarity: 2, want: 0 }, scale, 40), { kind: "flat", width: 10, height: 0 });
  // A tiny value stays visible; nothing overflows the box when a row is ahead of the digest.
  assert.equal(payoffRect({ rarity: 0.01, want: 8 }, scale, 40).width, 3);
  assert.equal(payoffRect({ rarity: 16, want: 8 }, scale, 40).width, 40);
  assert.equal(widen(scale, 16, 1).max, 16);
  // Before the first digest: no scale, flat rectangles, never NaN.
  assert.deepEqual(payoffRect({ rarity: 2, want: 3 }, digestScale(undefined), 40), { kind: "none", width: 0, height: 0 });
});

test("Why?: the formula in the house words with the line's numbers, then the main part or why it does not score", () => {
  const v = { rarity: 3.4, want: 2, points: 6.8 };
  assert.equal(whyLine(v, { sentence: "Distance from the gradient to the nearest prime: 1" }),
    "your ✨ rarity 3.4 × how much the others want it 2.0 = your points 6.8. Main part: Distance from the gradient to the nearest prime: 1.");
  assert.match(whyLine(v, { worst: "the line and the axes make no triangle" }), /This line does not score for your rule: the line and the axes make no triangle\.$/);
  assert.doesNotMatch(whyLine(v, {}), /bits|payoff|object/);
});

test("the goal card names a rule's parts in plain words (main part, tie-breaker)", () => {
  assert.equal(partsNote(1), null);
  assert.match(partsNote(2)!, /in 2 parts \(main part, tie-breaker\)/);
  assert.doesNotMatch(partsNote(3)!, /primary|secondary/);
});

test("the expanded face's switcher lives in the human's view: none shown → the primary; switched; compared", () => {
  assert.deepEqual(switcherOf([], "cart"), { active: "cart", compare: null });
  assert.deepEqual(switcherOf(["si"], "cart"), { active: "si", compare: null });
  assert.deepEqual(switcherOf(["si", "gen", "mach"], "cart"), { active: "si", compare: "gen" });
  // Switching keeps a comparison open; switching to the compared one drops it.
  assert.deepEqual(activeOp("o1", "mach", "gen"), { id: "view.compareRepresentations", args: { objectId: "o1", reps: ["mach", "gen"] } });
  assert.deepEqual(activeOp("o1", "gen", "gen"), { id: "view.showRepresentation", args: { objectId: "o1", rep: "gen" } });
  assert.deepEqual(activeOp("o1", "si", null), { id: "view.showRepresentation", args: { objectId: "o1", rep: "si" } });
  // Comparing with nothing goes back to the one shown (compare needs two: the affordance refuses one).
  assert.deepEqual(compareOp("o1", "si", "tri"), { id: "view.compareRepresentations", args: { objectId: "o1", reps: ["si", "tri"] } });
  assert.deepEqual(compareOp("o1", "si", null), { id: "view.showRepresentation", args: { objectId: "o1", rep: "si" } });
});

test("worked example: every family gets a line that scores for it, below the top when one was found, the same each time", () => {
  const variant = lineType.variants[0]!;
  for (const family of lineType.families) {
    const params = family.dealable(variant)[0];
    const rule = { type: lineType, family, params, variant };
    const line = workedExample<LineState, unknown>(rule);
    assert.deepEqual(lineType.encode(workedExample<LineState, unknown>(rule)), lineType.encode(line), family.id);
    if (family.examples) continue;
    const score = evaluateObject(lineType, family, params, line, variant).score;
    assert.notEqual(score, null, `${family.id}: the example scores`);
    const ladder = objectLadder(lineType, family, params, variant);
    assert.ok(levelOf(score, ladder) >= 1, `${family.id}: on the ladder`);
  }
});
