/**
 * Tangent Rings (tree-geo-rings.ts): the ring round (0, 0) nearest the line, how close, and a third part against that
 * ring's direction point. Every expectation is worked by hand from the card (docs/engine-v2/tree-families/tangent-rings.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, rng, scoreToWire } from "@workspace/v2-core";
import { lineQ, lineType, tangentRings, type LineState } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const P = { d: 2, u: 3, v: 4 };   // rings of radius ½, 1, 1½, …; direction point: radius × (3/5, 4/5)
const tuple = (s: LineState, third: string, p = P) => scoreToWire(evaluateSite(lineType, tangentRings, p, s, lineQ, 0, `closeness>${third}`).score);

test("a line touching ring 4 (radius 2) at its direction point scores (2, 0, 0) with every third", () => {
  // 3x + 4y = 10: distance² 100/25 = 4 = 2²; it touches at (6/5, 8/5) and crosses the y-axis at 5/2 = 2 × 5/4.
  for (const third of ["touch", "axis", "through"]) assert.deepEqual(tuple(abc(3, 4, -10), third), ["2", "0", "0"], third);
});

test("y = x + 3: distance² 4½, nearest ring radius 2 (4 against 6¼), ½ away", () => {
  // Nearest point to (0, 0): (−3/2, 3/2); the direction point flipped into that quarter: (−6/5, 8/5): 3/10 + 1/10 apart.
  assert.deepEqual(tuple(mc(1, 3), "touch"), ["2", "-1/2", "-2/5"]);
  assert.deepEqual(tuple(mc(1, 3), "axis"), ["2", "-1/2", "-1/2"]);      // y-intercept 3 against 5/2
  assert.deepEqual(tuple(mc(1, 3), "through"), ["2", "-1/2", "-13/5"]);  // at x = 6/5 the line is at 21/5, the point at 8/5
});

test("every line has a nearest ring: through the origin it is the first; a vertical line reads its distance", () => {
  // y = 2x: distance² 0, ring 1 (radius ½, squared ¼); the nearest point is (0, 0), 3/10 + 4/10 from (3/10, 4/10).
  assert.deepEqual(tuple(mc(2, 0), "touch"), ["1/2", "-1/4", "-7/10"]);
  assert.deepEqual(tuple(mc(2, 0), "axis"), ["1/2", "-1/4", "-5/8"]);
  assert.deepEqual(tuple(mc(2, 0), "through"), ["1/2", "-1/4", "-1/5"]);
  // x = 3: distance² 9, ring 6 (radius 3); nearest point (3, 0) against (9/5, 12/5); no y-intercept and no height.
  assert.deepEqual(tuple(abc(1, 0, -3), "touch"), ["3", "0", "-18/5"]);
  assert.deepEqual(tuple(abc(1, 0, -3), "axis"), ["3", "0", null]);
  assert.deepEqual(tuple(abc(1, 0, -3), "through"), ["3", "0", null]);
});

test("a tie between two rings goes to the bigger; a shift of 1 from a touching line keeps most of the ring", () => {
  // d = 1: squared distance 5/2 is 3/2 from both 1 and 4: ring 2. y = x + c has distance² c²/2: c² = 5.
  assert.equal(tuple(abc(1, 1, -5), "touch", { d: 1, u: 3, v: 4 })![0], "4");   // distance² 25/2: 9 is 3½ away, 16 is 3½ away → 4
  const before = tuple(abc(3, 4, -10), "touch")!, after = tuple(abc(3, 4, -14), "touch")!;   // shifted up by 1: 3x + 4y = 14
  assert.equal(before[0], "2");
  assert.equal(after[0], "3");   // distance² 196/25 = 7.84: ring 6 (radius 3, squared 9) is nearest: one bump moved it up, not to nothing
});

test("the card states every part, and the space draws, formats and parses its own parameters", () => {
  const card = tangentRings.card(P, "closeness>touch");
  assert.match(card, /radius 1\/2, 1, 3\/2/);
  assert.match(card, /3\/5 .* 4\/5/);
  assert.match(card, /Secondary: .*Third: /);
  const sp = tangentRings.space, r = rng("rings-space");
  assert.ok(sp.size >= 400);
  for (let i = 0; i < 200; i++) {
    const p = sp.draw(r), back = sp.parse(sp.label(p));
    assert.deepEqual(back, p);
    assert.equal(tuple(abc(3 * p.u, 3 * p.v, -7), "touch", p) === null, false);   // a target exists for every draw
  }
  assert.deepEqual(sp.parse("d = 5, u = 5, v = 12"), { d: 5, u: 5, v: 12 });
  assert.ok("invalid" in (sp.parse("d = 2, u = 2, v = 3") as object));   // 4 + 9 is not a square
  assert.ok("invalid" in (sp.parse("d = 0, u = 3, v = 4") as object));
  for (const p of tangentRings.dealable(lineQ)) assert.deepEqual(sp.parse(sp.label(p)), p);
});

test("every layer is drawn: the ring as a circle, the direction point, and a measure for each third", () => {
  const e = evaluateSite(lineType, tangentRings, P, mc(1, 3), lineQ, 0, "closeness>touch");
  const of = (term: string) => e.marks.filter(m => "term" in m && m.term === term);
  assert.ok(of("ring").some(m => m.kind === "candidate" && m.ref.rep === "norm" && m.ref.name === "circle" && m.ref.args?.r2 === "4"));
  assert.ok(of("closeness").length > 0);
  for (const t of ["touch", "axis", "through"]) assert.ok(of(t).some(m => m.kind === "measure"), t);
  assert.ok(e.reads.every(r => tangentRings.depends.includes(r.rep)), "marks on the plane are drawn, not read");
});
