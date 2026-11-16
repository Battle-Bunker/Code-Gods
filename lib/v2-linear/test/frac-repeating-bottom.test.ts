/** Repeating Bottom (frac-repeating-bottom.ts). Every expected value below was worked out by hand from the card. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, type Evaluation, type TieBreaker } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType, lineZ, nearestRepeatTarget, presets, REPEATING_BASES, repeatingBottom } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const f = Qn.q;
const ev = (s: Parameters<typeof evaluateSite>[3], tb: TieBreaker = null, B = 3) =>
  evaluateSite(lineType, repeatingBottom, { B } as never, s as never, lineQ, 0, tb);
const term = (e: Evaluation, id: string) => { const v = e.terms.find(x => x.id === id)!.value; return v && typeof v === "object" && "n" in v ? Qn.toWire(v as never) : JSON.stringify(v); };

test("on the line type, in no pool or preset, dealable only on rational lines, five bases", () => {
  assert.ok(lineType.families.some(x => x.id === "repeating-bottom"));
  assert.ok(!beginnerPool.some(x => x.id === "repeating-bottom"));
  assert.ok(!presets.some(p => p.rules.some(r => r.family === "repeating-bottom")));
  assert.equal(repeatingBottom.dealable(lineZ).length, 0);
  assert.deepEqual(repeatingBottom.dealable(lineQ).map(p => p.B), [...REPEATING_BASES]);
  assert.equal(repeatingBottom.tieBreakers.length, 4);
});

test("nearest target: one less than a power of the base; halfway goes to the bigger", () => {
  const t = (L: bigint, B: bigint) => nearestRepeatTarget(L, B).T;
  assert.equal(t(1n, 10n), 9n);
  assert.equal(t(50n, 10n), 9n);      // 41 from 9, 49 from 99
  assert.equal(t(54n, 10n), 99n);     // 45 from each: the bigger
  assert.equal(t(600n, 10n), 999n);
  assert.equal(t(1n, 2n), 3n);        // B = 2 starts at 3
  assert.equal(t(5n, 2n), 7n);        // 2 from 3 and from 7
  assert.equal(t(10n, 2n), 7n);
});

test("main and secondary read the common bottom of the gradient and the y-intercept (base 3: targets 2, 8, 26, 80, …)", () => {
  // 5/26 and 7/13: common bottom 26 = 3³ − 1, on the target: power 3.
  const a = ev(mc(f(5, 26), f(7, 13)), "near");
  assert.equal(term(a, "target"), "3");
  assert.equal(term(a, "near"), "0");
  // 23/25 and 3/25: 25 is 1 from 26.
  assert.equal(term(ev(mc(f(23, 25), f(3, 25)), "near"), "near"), "1");
  // 5/6 and 3/4: common bottom 12, nearest 8 (4 away; 26 is 14 away): power 2.
  const b = ev(mc(f(5, 6), f(3, 4)), "near");
  assert.equal(term(b, "target"), "2");
  assert.equal(term(b, "near"), "4");
  // A whole line has common bottom 1: the lowest target 2, 1 from it.
  assert.equal(term(ev(mc(2, 5), "near"), "near"), "1");
});

test("robust: whole moves, three reflections and a nudge of the y-intercept's coefficient keep main and secondary", () => {
  const base = mc(f(5, 79), f(7, 79));
  const want = ev(base, "near").score;
  for (const s of [mc(f(84, 79), f(7, 79)), mc(f(5, 79), f(86, 79)), mc(f(-5, 79), f(7, 79)), mc(f(5, 79), f(-7, 79)), mc(f(-5, 79), f(-7, 79)), mc(f(5, 79), f(8, 79))])
    assert.deepEqual(ev(s, "near").score, want);
  // A nudge of b (79 → 80) moves the secondary by 1 (onto the target 80) and keeps the power 4.
  const e = ev(abc(-5, 80, -7), "near");
  assert.equal(term(e, "target"), "4");
  assert.equal(term(e, "near"), "0");
});

test("thirds: x-intercept times target, the gradient's top against the ones-number, the remainder by the power", () => {
  // y = (5/26)x + 7/13: x-intercept −14/5, × 26 = −72.8, 1/5 from −73.
  const s = mc(f(5, 26), f(7, 13));
  assert.equal(term(ev(s, "x-whole"), "x-whole"), "1/5");
  assert.equal(term(ev(s, "top-repunit"), "top-repunit"), "8");   // |5 − 26/2|
  // y = (5/26)x + 61/13: whole part 4, power 3: remainder 1.
  assert.equal(term(ev(mc(f(5, 26), f(61, 13)), "remainder"), "remainder"), "1");
  // A flat line has no x-intercept.
  assert.ok(term(ev(mc(0, f(1, 26)), "x-whole"), "x-whole").includes("undefined"));
});

test("a vertical line is worst", () => {
  assert.equal(ev(abc(1, 0, -3)).score, null);
});
