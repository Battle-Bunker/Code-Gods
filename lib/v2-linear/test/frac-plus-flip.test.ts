/** Plus Its Flip (frac-plus-flip.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type Q, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, flipTarget, lineQ, lineType, lineZ, plusFlip, presets, type FlipParams } from "../src/index.ts";
import { abc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], p: FlipParams = { k: 1 }, tb: TieBreaker = "close>y-near-n") =>
  evaluateSite(lineType, plusFlip, p, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return "n" in (v as object) ? Qn.toWire(v as never) : v; };

test("on the line type, in no pool or preset, dealable only on rational lines, four versions, three thirds", () => {
  assert.ok(lineType.families.some(x => x.id === "plus-flip"));
  assert.ok(!beginnerPool.some(x => x.id === "plus-flip"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "plus-flip")));
  assert.equal(plusFlip.dealable(lineZ).length, 0);
  assert.deepEqual(plusFlip.dealable(lineQ).map(p => p.k), [1, -1, 2, -2]);
  assert.deepEqual(plusFlip.tieBreakers.map(t => t.id), ["close", "y-near-n", "gradient-flip", "at-n"]);
});

test("the nearest target n + k/n: never a whole number; halfway, the smaller", () => {
  const t = (x: Q | number, k: number) => { const r = flipTarget(typeof x === "number" ? f(x) : x, k); return `${r.n}:${Qn.toWire(r.t)}`; };
  assert.equal(t(f(10, 3), 1), "3:10/3");
  assert.equal(t(3, 1), "3:10/3");          // 5/2 is 1/2 away, 10/3 is 1/3
  assert.equal(t(0, 1), "2:5/2");           // n = 1 gives 2, a whole number: not a target
  assert.equal(t(f(21, 5), 1), "4:17/4");
  assert.equal(t(f(15, 4), -1), "4:15/4");  // 4 − 1/4
  assert.equal(t(f(9, 2), 2), "4:9/2");     // 4 + 2/4
  assert.equal(t(3, 2), "3:11/3");          // n = 2 gives 3, whole: skipped; 11/3 is 2/3 away, n = 1 gives 3 (whole)
  assert.equal(t(1000, 1), "1000:1000001/1000");
});

test("main part, closeness and the thirds on the line 3x + y − 10 = 0 (crossing 10/3 = 3 + 1/3)", () => {
  const s = abc(3, 1, -10);
  const e = ev(s);
  assert.equal(term(e, "level"), "3");
  assert.equal(term(e, "close"), "0");
  assert.equal(term(e, "y-near-n"), "7");                                       // y-intercept 10, 7 from 3
  assert.equal(term(ev(s, { k: 1 }, "close>gradient-flip"), "gradient-flip"), "8/3");  // gradient −3: 3 against 1/3
  assert.equal(term(ev(s, { k: 1 }, "close>at-n"), "at-n"), "0");                // y at x = 3 is 1
});

test("a near miss keeps the level; the crossing's size is read, so the mirrors keep everything", () => {
  // x + y − 3 = 0 crosses at 3: level 3, 1/3 from 10/3, one step of 1/3.
  const e = ev(abc(1, 1, -3));
  assert.equal(term(e, "level"), "3");
  assert.equal(term(e, "close"), "1");
  // 2x + y − 7 = 0 crosses at 7/2: 1/6 from 10/3, half a step of 1/3.
  assert.equal(term(ev(abc(2, 1, -7)), "close"), "1/2");
  for (const s of [abc(3, -1, -10), abc(-3, 1, -10), abc(3, 1, 10)]) {
    assert.equal(term(ev(s), "level"), "3");
    assert.equal(term(ev(s), "close"), "0");
  }
});

test("a flat line never crosses: worst; a vertical line is scored on where it stands", () => {
  assert.equal(ev(abc(0, 1, -2)).score, null);
  const v = ev(abc(4, 0, -17));   // x = 17/4 = 4 + 1/4
  assert.equal(term(v, "level"), "4");
  assert.equal(term(v, "close"), "0");
});
