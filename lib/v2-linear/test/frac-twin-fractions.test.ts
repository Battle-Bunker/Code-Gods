/** Twin Fractions (frac-twin-fractions.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, fractionPart, lineQ, lineType, lineZ, presets, twinFractions, TWIN_TARGETS } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const q15 = () => f(15);
const ev = (s: Parameters<typeof evaluateSite>[3], tb: TieBreaker = null, t = "golden") =>
  evaluateSite(lineType, twinFractions, { t }, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => e.terms.find(x => x.id === id)!.value;
const w = (x: unknown) => (x && typeof x === "object" && "n" in (x as object) ? Qn.toWire(x as never) : JSON.stringify(x));

test("on the line type, in no pool or preset, dealable only on rational lines, five targets", () => {
  assert.ok(lineType.families.some(x => x.id === "twin-fractions"));
  assert.ok(!beginnerPool.some(x => x.id === "twin-fractions"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "twin-fractions")));
  assert.equal(twinFractions.dealable(lineZ).length, 0);
  assert.deepEqual(twinFractions.dealable(lineQ).map(p => p.t), Object.keys(TWIN_TARGETS));
  assert.equal(twinFractions.tieBreakers.length, 3);
});

test("fraction part: the part after the whole number, between 0 and 1, also for negatives", () => {
  assert.equal(Qn.toWire(fractionPart(f(7, 3))), "1/3");
  assert.equal(Qn.toWire(fractionPart(f(-5, 4))), "3/4");     // −5/4 = −2 + 3/4
  assert.equal(Qn.toWire(fractionPart(f(4))), "0");
});

test("main part: the gap between the two fraction parts, measured from the target", () => {
  // y = (7/3)x + 1/2: fraction parts 1/3 and 1/2, gap 1/6; golden target 0.6180339887…
  const e = ev(mc(f(7, 3), f(1, 2)));
  const d = 1 / Qn.toNumber(term(e, "twin") as never);
  assert.ok(Math.abs(d - (0.6180339887498949 - 1 / 6)) < 1e-12, String(d));
  // A whole-number line has gap 0: as far from the target as the target itself.
  assert.ok(Math.abs(1 / Qn.toNumber(term(ev(mc(2, 5)), "twin") as never) - 0.6180339887498949) < 1e-12);
  // 5/8 is closer than 3/5 to 0.618…: y = (5/8)x + 0 scores a smaller distance than y = (3/5)x.
  const a = 1 / Qn.toNumber(term(ev(mc(f(5, 8), 0)), "twin") as never), b = 1 / Qn.toNumber(term(ev(mc(f(3, 5), 0)), "twin") as never);
  assert.ok(a < b, `${a} < ${b}`);
});

test("robust to whole moves: a unit shift, a unit tilt and the reflection in the x-axis keep the main part", () => {
  const base = term(ev(mc(f(13, 21), f(1, 3))), "twin");
  for (const [m, c] of [[f(34, 21), f(1, 3)], [f(13, 21), f(4, 3)], [f(-13, 21), f(-1, 3)]] as const)
    assert.equal(w(term(ev(mc(m, c)), "twin")), w(base));
});

test("tie-breakers read the gap P/Q the main part reached", () => {
  // y = (23/8)x + 61/4: fraction parts 7/8 and 1/4, gap 5/8 (P = 5, Q = 8); whole parts 2 and 15.
  const s = mc(f(23, 8), f(61, 4));
  assert.equal(w(term(ev(s, "whole-to-bottom"), "whole-to-bottom")), "6");    // |2 − 8|
  assert.equal(w(term(ev(s, "ratio-echo"), "ratio-echo")), "55/8");          // |15/2 − 5/8|
  assert.equal(w(term(ev(s, "remainder"), "remainder")), "7");               // 15 mod 8
  // Stepping up the main part (gap 5/8 → 13/21, closer to 0.618…) changes Q from 8 to 21: the same whole parts now
  // score worse on whole-to-bottom (|2 − 21| = 19) and the remainder (15 mod 21 = 15 of a possible 20).
  const t = mc(f(2 * 21 + 13, 21), q15());
  assert.equal(w(term(ev(t, "whole-to-bottom"), "whole-to-bottom")), "19");
  assert.equal(w(term(ev(t, "remainder"), "remainder")), "15");
});

test("a vertical line is worst; a flat line is scored (gradient 0 has fraction part 0)", () => {
  assert.equal(ev(abc(1, 0, -3)).score, null);
  assert.notEqual(ev(mc(0, f(5, 8))).score, null);
});
