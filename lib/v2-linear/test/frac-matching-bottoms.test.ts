/** Matching Bottoms (frac-matching-bottoms.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType, lineZ, matchingBottoms, presets, type BottomsParams } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], r: BottomsParams["r"] = "2", tb: TieBreaker = "match>gradient-top") =>
  evaluateSite(lineType, matchingBottoms, { r }, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return "n" in (v as object) ? Qn.toWire(v as never) : v; };

test("on the line type, in no pool or preset, rational lines only, four versions, three thirds", () => {
  assert.ok(lineType.families.some(x => x.id === "matching-bottoms"));
  assert.ok(!beginnerPool.some(x => x.id === "matching-bottoms"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "matching-bottoms")));
  assert.equal(matchingBottoms.dealable(lineZ).length, 0);
  assert.deepEqual(matchingBottoms.dealable(lineQ).map(p => p.r), ["1", "2", "3", "1/2"]);
  assert.deepEqual(matchingBottoms.tieBreakers.map(t => t.id), ["match", "gradient-top", "at-bottom", "crossing-bottom"]);
});

test("the card's example: 3/8 beside 5/4", () => {
  const s = mc(f(3, 8), f(5, 4));
  const e = ev(s);
  assert.equal(term(e, "bottom"), "4");
  assert.equal(term(e, "match"), "0");            // 8 = 2 × 4
  assert.equal(term(e, "gradient-top"), "1");     // 3 against 4
  assert.equal(term(ev(s, "2", "match>at-bottom"), "at-bottom"), "1/4");          // 3/2 + 5/4 = 11/4
  assert.equal(term(ev(s, "2", "match>crossing-bottom"), "crossing-bottom"), "1"); // −(5/4)/(3/8) = −10/3
  assert.equal(term(ev(s, "1"), "match"), "4");
  assert.equal(term(ev(s, "1/2"), "match"), "6");
  assert.equal(term(ev(mc(f(3, 4), f(5, 8)), "1/2"), "match"), "0");
});

test("a whole-number line is the foot; whole moves and the mirrors keep both bottoms", () => {
  assert.equal(term(ev(mc(2, 7)), "bottom"), "1");
  for (const s of [mc(f(3, 8), f(9, 4)), mc(f(11, 8), f(5, 4)), mc(f(-3, 8), f(-5, 4)), mc(f(-3, 8), f(5, 4))]) {
    assert.equal(term(ev(s), "bottom"), "4");
    assert.equal(term(ev(s), "match"), "0");
  }
});

test("a vertical line is worst", () => assert.equal(ev(abc(1, 0, -3)).score, null));
