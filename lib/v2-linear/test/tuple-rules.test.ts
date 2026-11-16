/**
 * The tuple families (tuple-rules.ts; design-principles.md principle 3b): the nearest target's size, how close, a third
 * part against that target. Every line has a nearest target, so a bump inside its basin keeps the primary and loses only
 * closeness (row 10); the reading's size is read, so a reflection keeps the score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateSite, isInvalid, Qn, scoreToWire, type RuleFamily } from "@workspace/v2-core";
import { fromMC, landingTuple, lineQ, lineType, powerArea, primeIntercept, tupleFamilies, type LineState } from "../src/index.ts";

const mc = (m: string, c: string): LineState => ({ lines: [fromMC(Qn.parse(m), Qn.parse(c))] });
const tuple = <P,>(f: RuleFamily<LineState, P>, p: P, s: LineState) =>
  scoreToWire(evaluateSite(lineType, f, p, s, lineQ, 0, f.tieBreakers.map(t => t.id).join(">")).score);

test("Prime Intercept: the prime ending in k nearest |c|, how close, the gradient times it in doublings", () => {
  assert.deepEqual(tuple(primeIntercept, { ends: 1 }, mc("1/31", "31")), ["31", "0", "0"]);
  assert.deepEqual(tuple(primeIntercept, { ends: 1 }, mc("1/31", "32")), ["31", "-1", "0"]);
  // The reflection y → −y reads the same size.
  assert.deepEqual(tuple(primeIntercept, { ends: 1 }, mc("-1/31", "-31")), ["31", "0", "0"]);
  assert.equal(tuple(primeIntercept, { ends: 1 }, mc("2/7", "103/2"))![0], "61");   // 61 is nearer 51½ than 41
});

test("Power Area: the power of k nearest the area, how close, the area over the crossing near a multiple of k", () => {
  assert.deepEqual(tuple(powerArea, { k: 2 }, mc("-1/2", "8")), ["6", "0", "0"]);   // area 64 = 2⁶; 64 ÷ 16 = 4
  assert.deepEqual(tuple(powerArea, { k: 2 }, mc("-1/2", "9")), ["6", "-17", "-1/2"]);
});

test("a cheap bump inside the target's basin keeps the primary of every tuple family", () => {
  for (const f of tupleFamilies as readonly RuleFamily<LineState, object>[]) {
    const p = f.dealable(lineQ)[0]!;
    let kept = 0, tried = 0;
    for (const [m, c] of [["1/3", "31/2"], ["2/5", "47/3"], ["-3/7", "101/4"]] as const) {
      const s = mc(m, c), before = tuple(f, p, s);
      const a = applyCall(lineType, lineQ, s, { mutator: "gen.nudge", site: 0, args: { which: "c", k: "1" } });
      if (before === null || isInvalid(a)) continue;
      tried++;
      if (tuple(f, p, a.result as LineState)?.[0] === before[0]) kept++;
    }
    assert.ok(tried === 0 || kept >= tried - 1, `${f.id}: ${kept} of ${tried} nudges kept the primary`);
  }
});

test("each tuple family's card says every part, and Prime Landing's reads the crossing's size", () => {
  for (const f of tupleFamilies as readonly RuleFamily<LineState, object>[]) {
    const card = f.card(f.dealable(lineQ)[0]!, f.tieBreakers.map(t => t.id).join(">"));
    assert.match(card, /Secondary: .*Third: /, f.id);
  }
  assert.deepEqual(tuple(landingTuple, { ends: 1 }, mc("-1", "31"))?.slice(0, 2), ["31", "0"]);
  assert.deepEqual(tuple(landingTuple, { ends: 1 }, mc("1", "31"))?.slice(0, 2), ["31", "0"]);   // crosses at −31
});
