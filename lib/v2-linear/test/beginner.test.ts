import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, Qn, q, rng, spaceHas, walkStep, type Evaluation, type Q, type RuleFamily } from "@workspace/v2-core";
import { nearestPalindrome } from "../src/beginner-rulers.ts";
import { digitLevel } from "../src/numbers.ts";
import { LINE_Q_CODES, primeGradient, beginnerFamilies, beginnerPool, presets, divisibilityLadder, exactChange, lineQ, lineType, lineZ, primeLanding, primeStaircase, ruler, sameOnBothRulers, treasure, wholeCrossing, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

/** Every layer's term, as wire strings, for one evaluation. */
function terms<P>(f: RuleFamily<LineState, P>, p: P, s: LineState, v = lineZ): Record<string, string> {
  const e: Evaluation = evaluateSite(lineType, f, p, s, v, 0, null);
  const out: Record<string, string> = {};
  for (const l of [f.main, ...f.tieBreakers]) {
    const t = e.terms.find(x => x.id === l.id)!.value;
    out[l.id] = "undefined" in t ? "—" : Qn.toWire(t);
  }
  return out;
}

test("the beginner pool: the curator's eight families and two restored ones (Exact Change undealt), each a textbook main layer and secondaries", () => {
  assert.deepEqual(beginnerPool.map(f => f.id), ["prime-landing", "smooth-intercept", "square-area", "whole-crossing", "treasure", "same-on-both-rulers", "prime-gradient", "prime-staircase", "ruler", "pythagorean-area"]);
  // How many secondaries each deals (row 3a: at least three) is checked on the dealt pools, with its known exemptions:
  // artifacts/engine test/unit/v2-rule-check.test.ts.
  for (const f of beginnerPool) assert.ok(f.tieBreakers.length >= 1, f.id);
});

test("restored families (decision 22), worked by hand", () => {
  // Ruler's worked lines: test/ruler.test.ts.
  // 2x + y = 12: coins 2 and 1 pay 12 in 7 ways (x = 0 … 6), the smallest pile 0; coin 1 is 1 from the prime 2.
  assert.deepEqual(terms(exactChange, { ways: 6 }, mc(-2, 12), lineQ), { change: "1", "big-piles": "0", "big-bill": "12", "prime-coins": "1" });
  // A rising line reads as a negative coin: not coins at all.
  assert.deepEqual(terms(exactChange, { ways: 6 }, mc(2, 12), lineQ), { change: "—", "big-piles": "—", "big-bill": "—", "prime-coins": "—" });
  // Pythagorean Area's worked lines: test/pythagorean-area.test.ts.
});

test("worked examples, one line per family", () => {
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(30, 7)), { run: "73/12", "shared-factor": "6", "step-back": "6", "near-miss": "11" });   // 7, 37, …, 157 (run 6), then 187 = 11·17, 10 from 197: 6 + 1/12; gcd(156, 6) = 6; |y(−1)| = 23, 6 from 17; 187's smallest prime factor 11
  // Square Area's worked lines: test/square-area.test.ts.
  // Treasure: y(2) = 10 is the pile 4 coins high (level 1 + (1 + 0.10)/2); 4 and the gradient 2 share 2.
  assert.deepEqual(terms(treasure, { k: 2 }, mc(2, 6)), { pile: "31/20", "shared-factor": "2" });
  // y(2) = 7 rounds to no pile: ½ past rounding to 6 (3 coins high); 3 and 1 share 1.
  assert.deepEqual(terms(treasure, { k: 2 }, mc(1, 5)), { pile: "-1/2", "shared-factor": "1" });
  // y(3) = 21 = 6·7/2; a whole part of 0 shares nothing.
  assert.deepEqual(terms(treasure, { k: 3 }, mc(Qn.q(1, 2), Qn.q(39, 2))), { pile: "321/200", "shared-factor": "0" });
  assert.deepEqual(terms(primeLanding, { ends: 1 }, mc(-1, 11)), { landing: "311/200", "shared-factor": "1" });   // lands on 11 (level 1 + (1 + 0.11)/2); 10 and 11 share 1
  assert.deepEqual(terms(primeLanding, { ends: 9 }, mc(-2, 38)), { landing: "319/200", "shared-factor": "2" });   // lands on 19; 18 and 38 share 2
  assert.deepEqual(terms(primeLanding, { ends: 1 }, mc(-3, 100)), { landing: "-11/6", "shared-factor": "10" });   // lands at 33⅓: 7/3 from 31, so 11/6 from rounding to it; 30 and 100 share 10
  assert.deepEqual(terms(primeLanding, { ends: 1, side: -1 }, mc(1, 11)), { landing: "311/200", "shared-factor": "1" });   // the mirror: lands on −11
  assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits: "odd" }, mc(-4, 605)), { palindrome: "6121/3000", "shared-factor": "4" });   // −4x + 605 = x at 121: level 2 + (0 + 0.121)/3; 1 + 2 + 1 and 4 share 4
  assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits: "odd" }, mc(-4, 655)), { palindrome: "6131/3000", "shared-factor": "1" });   // one rung up, at 131: 5 and 4 share 1 (the climb starts again)
  assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits: "even" }, mc(3, -2442)), { palindrome: "71221/30000", "shared-factor": "3" });   // 3x − 2442 = x at 1221; 1 + 2 + 2 + 1 and 3 share 3
  assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits: "odd" }, mc(0, 50)), { palindrome: "-81/2", "shared-factor": "0" });   // 50: 41 from 9 (101 is 51 away), so 40½ from rounding to it; a flat line shares nothing
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(4, -24)), { ladder: "0", "shared-factor": "1" });   // crosses at 6 (leaves 1 divided by 5): level 0; 7 and 4 share 1
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(-1, 5)), { ladder: "1", "shared-factor": "1" });    // at 5 = 5 × 1: level 1; 2 and 1 share 1
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(-2, 50)), { ladder: "3/2", "shared-factor": "2" });   // at 25 = 5² × 1: two 5s, halfway to level 2 (three); 2 and 2 share 2
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 1 }, mc(3, 1)), { ladder: "-4/3", "shared-factor": "1" });  // at −⅓: 1 is the nearest (4/3 away)
  assert.deepEqual(terms(divisibilityLadder, {}, mc(5, 60)), { ladder: "3", "next-rung": "1" });   // 1 … 6 divide 60, 7 does not: a run of 6 is level 3; y(7) = 95 shares 1 with 7
});

test("each family's main layer is undefined only where its lens is (and then the score is WORST)", () => {
  assert.equal(evaluateSite(lineType, sameOnBothRulers, { meets: 1, digits: "odd" }, mc(1, 3), lineZ).score, null); // parallel to y = x
  assert.equal(evaluateSite(lineType, wholeCrossing, { q: 5, r: 1 }, mc(0, 3), lineZ).score, null);          // flat: never crosses
  assert.equal(evaluateSite(lineType, divisibilityLadder, {}, mc(2, 0), lineZ).score, null);     // through (0, 0)
});

test("every tie-breaker is dealable on a walk of lines: no throw, marks cite reads", () => {
  const r = rng("beginner-walk");
  let s = mc(1, 1);
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    for (const f of beginnerFamilies) {
      const p = f.dealable(lineQ)[0]!;
      for (const tb of f.tieBreakers) evaluateSite(lineType, f as RuleFamily<LineState, unknown>, p, s, lineQ, 0, tb.id);
    }
  }
  assert.ok(q(1));
});

test("presets: four pools over the beginner families, every named tie-breaker exists", async () => {
  const { presets, families, lineType: t } = await import("../src/index.ts");
  assert.deepEqual(presets.map(p => p.id), ["lines-beginner", "lines-whole", "lines-four", "lines-lenses"]);
  for (const p of presets) {
    assert.ok(t.variants.some(v => v.id === p.variant), p.id);
    for (const r of p.rules) {
      const f = families.find(x => x.id === r.family)!;
      assert.ok(f, r.family);
      // null: the main part alone (a dynamic family has no tie-breakers).
      for (const tb of r.tieBreakers) assert.ok(tb === null || f.tieBreakers.some(x => x.id === tb), `${r.family}.${tb}`);
    }
  }
});

test("Prime Staircase: a repeated prime stops the run; no run, no first prime", () => {
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(0, 7)), { run: "3/2", "shared-factor": "0", "step-back": "0", "near-miss": "7" });   // 7, then 7 again: a run of one, broken on a prime (1 + 1/2); one prime shares nothing; the repeat 7 is its own smallest factor
  assert.deepEqual(terms(primeStaircase, { ends: 7 }, mc(1, 1000)), { run: "1/5", "shared-factor": "0", "step-back": "2", "near-miss": "2" });  // 1000 is not prime, 3 from 997 (0 + 1/5); 999 is 2 from 997; 1000 = 2³·5³
});


test("Whole Crossing is a ladder of 5s on the crossing: every level has a higher one, a stretch by 5 apart, and its tie-breaker restarts on a new level (design-principles.md rows 1 to 3)", () => {
  const wc = (p: object, m: Q | number, c: Q | number) => terms(wholeCrossing, p as never, mc(m, c), lineQ);
  // Row 1: no attained top. Crossing at 2, 10, 50, 250, … (5^j × 2, r = 2) the level keeps rising.
  // In triangular levels (level L needs L(L + 1)/2 fives), so each 5 adds less than the one before (a zoom chain bends).
  const along = [0, 1, 2, 3, 4, 5, 6, 7].map(j => wc({ q: 5, r: 2 }, -1, 2 * 5 ** j).ladder);
  assert.deepEqual(along, ["0", "1", "3/2", "2", "7/3", "8/3", "3", "13/4"]);
  // Row 2: a stretch of the x-axis by 5 (the gradient divided by 5, the y-intercept kept) is the next level.
  assert.equal(wc({ q: 5, r: 2 }, 2, -14).ladder, "0");    // crosses at 7 (leaves 2): level 0
  assert.equal(wc({ q: 5, r: 2 }, q(2, 5), -14).ladder, "1");    // the stretch: crosses at 35 = 5 × 7, level 1
  // Row 3: on level 0 at 7 the gradient 8 shares 8 with 7 + 1; after the stretch (gradient 8/5, whole part 1) it shares 1.
  assert.equal(wc({ q: 5, r: 2 }, 8, -56)["shared-factor"], "8");
  assert.equal(wc({ q: 5, r: 2 }, q(8, 5), -56)["shared-factor"], "1");
  // Off the ladder: y = (2/5)x − 13/5 crosses at 13/2, ½ from 7 (leaving 2); the gradient's whole part is 0: nothing shared.
  assert.deepEqual(wc({ q: 5, r: 2 }, q(2, 5), q(-13, 5)), { ladder: "-1/2", "shared-factor": "0" });
  // x = 17/2, leaving 4: of 4 and 9, 9 is ½ away; a vertical line has no gradient: its tie-breaker is undefined.
  assert.deepEqual(terms(wholeCrossing, { q: 5, r: 4 }, { lines: [{ a: 2n, b: 0n, c: -17n }] }, lineQ), { ladder: "-1/2", "shared-factor": "—" });
});

test("vertical lines score where the rule has an honest reading (the coordinator's call, 15 Nov)", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });   // a·x + c = 0: x = −c/a
  // x = 13/2: Treasure passes (13/2, 37), 9/2 across from (2, 37); Prime Landing lands on the x-axis at 6½, which rounds to 7; it meets
  // y = x at 13/2, ½ from T = 6. Tie-breakers stay undefined.
  assert.deepEqual(terms(treasure, { k: 2 }, x(-2n, 13n), lineQ), { pile: "—", "shared-factor": "—" });   // a vertical line has no y(2)
  assert.equal(terms(primeLanding, { ends: 7 }, x(-2n, 13n), lineQ).landing, "27/20");   // x = 6½ rounds to 7 (ties up): level 1 + 0.7/2
  assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits: "odd" }, x(-2n, 13n), lineQ), { palindrome: "27/20", "shared-factor": "—" });   // meets y = x at 6½, which rounds to 7
  assert.deepEqual(terms(sameOnBothRulers, { meets: -1, digits: "even" }, x(-2n, 13n), lineQ), { palindrome: "-4", "shared-factor": "—" });   // 4½ from 11
  // Ruler: distance² 169/4 = 42¼, ¼ above the window [41, 42) of ending 1; no y-intercept.
  assert.deepEqual(terms(ruler, { ends: 1 }, x(-2n, 13n), lineQ), { ruler: "-1/4", "shared-factor": "—" });
  // x = 3: on the prime 3, distance² 9 exactly.
  assert.equal(terms(primeLanding, { ends: 3 }, x(-1n, 3n), lineQ).landing, "23/20");
  assert.equal(terms(ruler, { ends: 3 }, x(-1n, 3n), lineQ).ruler, "-4");   // distance² 9: 4 below ending 3's window [13, 14)
  assert.notEqual(evaluateSite(lineType, ruler, { ends: 3 }, x(-1n, 3n), lineQ, 0, null).score, null, "a vertical line scores");
});

test("Prime Landing is a ladder on the x-axis: every rung has a higher one, a small tilt apart, and its tie-breaker restarts on a new rung (design-principles.md rows 1, 2 and 3)", () => {
  const land = (m: Q | number, c: Q | number, p: object = { ends: 1 }) => terms(primeLanding, p as never, mc(m, c), lineQ);
  // Row 1: no attained top. With c = 30 kept, tilting to land on 11, 31, 41, 61, … (primes ending in 1) keeps rising, in
  // levels of digits (landingLevel), each dearer than the last.
  const rungs = [11, 31, 41, 61, 71, 101, 131, 151, 181, 191, 211, 241];
  const along = rungs.map(p => { const [n, d = "1"] = land(q(-30, p), 30).landing!.split("/"); return Number(n) / Number(d); });
  for (let i = 1; i < along.length; i++) assert.ok(along[i]! > along[i - 1]!, `${along}`);
  // Row 2: a rung is a window (the landing rounds to the prime), so the next one is a small tilt that keeps c.
  assert.equal(land(q(-300, 314), 30).landing, "331/200");   // lands at 31.4: on 31
  assert.equal(land(q(-300, 316), 30).landing, "-1/10");   // lands at 31.6: 1/10 beyond rounding to 31
  // Row 3: with c = 30 the rung 31 shares 30; stepping up to 41 drops it to 10 (the climb starts again); c = 40 shares 40.
  assert.equal(land(q(-30, 31), 30)["shared-factor"], "30");
  assert.equal(land(q(-30, 41), 30)["shared-factor"], "10");
  assert.equal(land(q(-40, 41), 40)["shared-factor"], "40");
  assert.equal(land(q(-1, 62), q(1, 2))["shared-factor"], "0");   // a whole part of 0 shares nothing
  // The mirror (side −1) is an exact peer: it scores the line reflected x → −x as side 1 scores the line.
  for (const ends of [1, 9]) for (const mm of [-7, -2, -1, 1, 3]) for (const cc of [-40, -17, 3, 11, 19, 97]) {
    assert.deepEqual(land(-mm, cc, { ends, side: -1 }), land(mm, cc, { ends }), `ends ${ends}: y = ${mm}x + ${cc}`);
  }
  assert.deepEqual(primeLanding.dealable(lineQ), [{ ends: 1 }, { ends: 1, side: -1 }, { ends: 9 }, { ends: 9, side: -1 }]);
});

test("Same on Both Rulers reads the meeting point without its sign: a half turn pays nothing, and y = −x is an exact peer of y = x", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  const neg = (v: number | ReturnType<typeof Qn.q>) => (typeof v === "number" ? -v : Qn.neg(v));
  for (const digits of ["odd", "even"] as const) for (const mm of [-7, -2, 0, 2, 3, 14, Qn.q(9, 10)]) for (const cc of [-40, -17, -3, 0, 5, 17, 23, 97, 2002, Qn.q(7, 2)]) {
    // The half turn (m, c) → (m, −c) sends the meeting point x to −x: the same reading (no income from flipping back).
    assert.deepEqual(terms(sameOnBothRulers, { meets: 1, digits }, mc(mm, neg(cc)), lineQ), terms(sameOnBothRulers, { meets: 1, digits }, mc(mm, cc), lineQ), `${digits}: y = ${mm}x ± ${cc}`);
    // The reflection in the x-axis (m, c) → (−m, −c) takes y = x's meeting point to y = −x's: exact peers.
    assert.deepEqual(terms(sameOnBothRulers, { meets: -1, digits }, mc(neg(mm), neg(cc)), lineQ), terms(sameOnBothRulers, { meets: 1, digits }, mc(mm, cc), lineQ), `${digits}: y = ${mm}x + ${cc} reflected`);
  }
  for (const [a, c] of [[2n, -25n], [1n, 13n], [3n, 7n]] as const) assert.deepEqual(terms(sameOnBothRulers, { meets: -1, digits: "odd" }, x(a, c), lineQ), terms(sameOnBothRulers, { meets: 1, digits: "odd" }, x(a, c), lineQ));
  assert.equal(evaluateSite(lineType, sameOnBothRulers, { meets: -1, digits: "odd" }, mc(-1, 3), lineZ).score, null);   // parallel to y = −x
  assert.match(sameOnBothRulers.card({ meets: -1, digits: "even" }, "shared-factor"), /^Where the line meets y = −x should round to a number reading the same backwards with 2, 4, 6… digits, like 44 or −1221\. Bigger is better\./);
  assert.deepEqual(sameOnBothRulers.dealable(lineQ), [{ meets: 1, digits: "odd" }, { meets: 1, digits: "even" }, { meets: -1, digits: "odd" }, { meets: -1, digits: "even" }]);
});

test("Same on Both Rulers is a ladder: every palindrome of the parity is a rung, a bigger one always wins, and the nearest is exact", () => {
  for (const [x, d, t] of [[56, "odd", 101n], [6, "even", 11n], [16, "even", 11n], [999, "odd", 999n], [1000, "even", 1001n], [123456, "even", 123321n], [12345, "odd", 12321n], [150, "odd", 151n]] as const) assert.equal(nearestPalindrome(Qn.q(x), d), t, `${x}, ${d}`);
  assert.equal(nearestPalindrome(Qn.q(55), "odd"), 101n);   // 9 and 101 are 46 away: the bigger on a tie, as 55 would round
  assert.equal(nearestPalindrome(Qn.q(13, 2), "odd"), 7n);  // 6½ rounds to 7
  const at = (digits: "odd" | "even", c: number) => { const [n, d = "1"] = terms(sameOnBothRulers, { meets: 1, digits }, mc(0, c), lineQ).palindrome!.split("/"); return Number(n) / Number(d); };
  for (const [digits, rungs] of [["odd", [1, 2, 9, 101, 111, 191, 999, 10001, 10101, 1000001]], ["even", [11, 22, 99, 1001, 1111, 9999, 100001, 101101]]] as const) {
    for (let i = 1; i < rungs.length; i++) assert.ok(at(digits, rungs[i]!) > at(digits, rungs[i - 1]!), `${digits}: ${rungs[i]} above ${rungs[i - 1]}`);
  }
  assert.ok(at("odd", 50) < 0 && at("odd", 1) > 0 && at("even", 5) < 0);
});

test("Treasure's mirror is an exact peer: it scores the reflected line y → −y as Treasure scores the line, but the words say minus", () => {
  // Fractional gradients too: the tie-breaker reads the whole part of |m|, which the reflection keeps.
  for (const k of [3, 4]) for (const mm of [-7, -2, 0, 1, 3, 14, Qn.q(7, 2), Qn.q(-5, 3)]) for (const cc of [-40, -17, -3, 0, 5, 17, 23, 97, Qn.q(1, 2)]) {
    const a = terms(treasure, { k, side: -1 }, mc(typeof mm === "number" ? -mm : Qn.neg(mm), typeof cc === "number" ? -cc : Qn.neg(cc)), lineQ), b = terms(treasure, { k }, mc(mm, cc), lineQ);
    // The gradient's whole part flips sign with the line (ignored by the tie-breaker), so the values agree.
    assert.deepEqual(a, b, `k = ${k}, y = ${mm}x + ${cc}`);
  }
  assert.match(treasure.card({ k: 3, side: -1 }, "shared-factor"), /minus a coin pile/);
  assert.deepEqual(treasure.dealable(lineQ), [{ k: 3 }, { k: 3, side: -1 }, { k: 4 }, { k: 4, side: -1 }]);
});

test("Prime Gradient reads a drawn suffix and ignores the gradient's sign (owner, 16 Nov)", () => {
  const p = { suffix: "13" };
  const t = (m: number | Q, c: number) => terms(primeGradient, p, mc(m, c), lineQ);
  // On a rung: |m| rounds (halves up) to a prime ending in 13; its level is digitLevel(p).
  assert.equal(t(113, 0).gradient, Qn.toWire(digitLevel(113n)));
  assert.equal(t(Qn.q(225, 2), 0).gradient, Qn.toWire(digitLevel(113n)));   // 112.5 rounds up to 113
  // Off the rungs: minus (the distance to the nearest such prime − ½); 200 is 87 from 113 (313 is 113 away).
  assert.equal(t(200, 0).gradient, "-173/2");
  assert.equal(t(13, 0).gradient, Qn.toWire(digitLevel(13n)));
  assert.equal(t(3, 0).gradient, "-19/2");                                      // 3 is 10 from 13
  // The tie-breaker: the factor 113 + 1 = 114 = 2·3·19 shares with the y-intercept's whole part.
  assert.equal(t(113, 57)["shared-factor"], "57");
  // The sign is unconstrained: a reflection of the gradient, of the intercept, or of both, scores the same.
  for (const mm of [-200, -113, -13, -2, 0, 3, 13, 113, Qn.q(-339, 3)]) for (const cc of [-40, -19, 0, 5, 57, 114]) {
    const neg = (x: number | Q) => (typeof x === "number" ? -x : Qn.neg(x));
    assert.deepEqual(t(neg(mm), cc), t(mm, cc));
    assert.deepEqual(t(mm, -cc), t(mm, cc));
  }
  // Leading zeros are written digits: "007" is met by 4007, not by 7.
  assert.equal(terms(primeGradient, { suffix: "007" }, mc(7, 0), lineQ).gradient, Qn.toWire(Qn.neg(q(4000 * 2 - 1, 2))));
  assert.match(primeGradient.card(p, "shared-factor"), /ignoring its sign, should round to a prime whose last digits are 13 \(13, 113, 313, 613, …\)/);
  assert.doesNotMatch(primeGradient.card(p, null), /minus/);
  // A large space: dealable is the dealt peers within it, and the space checks, parses and labels.
  assert.deepEqual(primeGradient.dealable(lineQ), [{ suffix: "1" }, { suffix: "9" }]);
  const sp = primeGradient.space!;
  assert.equal(sp.size, 444);
  for (const x of primeGradient.dealable(lineQ)) assert.ok(spaceHas(sp, x), JSON.stringify(x));
  assert.deepEqual(sp.parse(" 013 "), { suffix: "013" });
  assert.ok("invalid" in (sp.parse("12") as object));
  assert.equal(spaceHas(sp, { suffix: "5" }), false);
  assert.equal(spaceHas(sp, { ends: 1 }), false);
  assert.equal(spaceHas(sp, { suffix: "13", extra: 1 }), false);
  assert.equal(sp.label({ suffix: "07" }), "07");
  assert.ok(spaceHas(sp, sp.draw(rng("pg"))));
  assert.deepEqual(primeGradient.dealable(lineZ), primeGradient.dealable(lineQ));
});

test("Whole Crossing's residues r and 5 − r are exact peers: r scores the line reflected x → −x as 5 − r scores the line", () => {
  const x = (a: bigint, c: bigint): LineState => ({ lines: [{ a, b: 0n, c }] });
  for (const r of [1, 2]) for (const mm of [-7, -2, 1, 3, 14]) for (const cc of [-40, -17, -3, 0, 5, 23]) {
    assert.deepEqual(terms(wholeCrossing, { q: 5, r: 5 - r }, mc(-mm, cc), lineQ), terms(wholeCrossing, { q: 5, r }, mc(mm, cc), lineQ), `r = ${r}: y = ${mm}x + ${cc}`);
  }
  for (const [a, c] of [[2n, -17n], [1n, 13n]] as const) assert.deepEqual(terms(wholeCrossing, { q: 5, r: 4 }, x(a, -c), lineQ), terms(wholeCrossing, { q: 5, r: 1 }, x(a, c), lineQ));
  assert.deepEqual(wholeCrossing.dealable(lineQ), [1, 2, 3, 4].map(r => ({ q: 5, r })));
  assert.match(wholeCrossing.card({ q: 5, r: 3 }, null), /on a whole number leaving 3 once its 5s are divided out \(like 8, 40 or 200\), with as many 5s as possible/);
});

test("Prime Staircase is a ladder: a longer run always wins, and its shared factor starts again on a longer run (design-principles.md)", () => {
  // 7, 37, 67 (run 3, then 97 is a prime: the run goes on) … the step 30 from 7 runs six; from 37 (37, 67, 97, 127, 157) five.
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 37), lineQ).run, "61/12");   // run 5, then 187: 10 from 197
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 7), lineQ)["shared-factor"], "6");     // gcd(157 − 1, 7 − 1)
  assert.equal(terms(primeStaircase, { ends: 7 }, mc(30, 37), lineQ)["shared-factor"], "12");   // gcd(157 − 1, 37 − 1)
  assert.deepEqual(primeStaircase.dealable(lineQ), [1, 3, 7, 9].map(ends => ({ ends })));
});

test("Prime Landing's levels of digits: level L needs L(L + 1)/2 digits, and a bigger prime is always higher", async () => {
  const { landingLevel } = await import("../src/index.ts");
  const u = (p: bigint) => { const x = landingLevel(p); return Number(x.n) / Number(x.d); };
  const ps = [3n, 7n, 11n, 31n, 101n, 991n, 1009n, 99991n, 100003n, 1000003n, 10000000019n];
  for (let i = 1; i < ps.length; i++) assert.ok(u(ps[i]!) > u(ps[i - 1]!), `${ps[i]} above ${ps[i - 1]}`);
  assert.deepEqual([7n, 11n, 101n, 1000003n, 10000000019n].map(p => Math.floor(u(p))), [1, 1, 2, 3, 4]);   // 1, 2, 3, 7, 11 digits
});

test("every dealt line card is one a child can act on: the main sentence at most 30 words, the tie-breaker at most 20, and a ladder's never says \"level\" (rounds 24 and 26)", () => {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  for (const f of beginnerPool) for (const p of f.dealable(lineQ)) {
    const s = f.main.sentence(p as never);
    assert.ok(words(s) <= 30, `${f.id} ${JSON.stringify(p)}: ${words(s)} words: ${s}`);
    if (f.keepsParams) assert.doesNotMatch(s, /level/i, `${f.id}: ${s}`);
    for (const t of f.tieBreakers) {
      const ts = t.sentence(p as never).replace(/^Tie-breaker: /, "");
      assert.ok(words(ts) <= 20, `${f.id}/${t.id}: ${words(ts)} words: ${ts}`);
    }
  }
});

test("a ladder's reading on a rung says where it stands and the next big step (the Why line; the card keeps only 'bigger is better')", () => {
  const label = (f: typeof primeLanding, p: object, s: LineState, id: string) => evaluateSite(lineType, f as never, p as never, s, lineQ, 0, null).terms.find(t => t.id === id)!.label;
  assert.equal(label(primeLanding, { ends: 1 }, mc(-1, 41), "landing"), "lands at 41, which rounds to the prime 41: 2 digits; the next big step is 3 digits");
  assert.equal(label(primeGradient as never, { suffix: "1" }, mc(11, 0), "gradient"), "the gradient 11 rounds to the prime 11: 2 digits; the next big step is 3 digits");
  assert.match(label(wholeCrossing as never, { q: 5, r: 2 }, mc(-1, 50), "ladder"), /: 2 fives; the next big step is 3 fives$/);
});

test("Divisibility Ladder is a ladder with no top: the run goes past 12, each extra n counts for less, and its tie-breaker restarts on a new rung", () => {
  const dl = (m: number | Q, c: number) => terms(divisibilityLadder, {}, mc(m, c), lineQ);
  // lcm(1 … 12) = 27720: a run of 12 (level 4 and 2/5); × 13 = lcm(1 … 15): 15 (level 5); × 2 = lcm(1 … 16): 16.
  assert.deepEqual([27720, 27720 * 13, 27720 * 26].map(c => dl(1, c).ladder), ["22/5", "5", "31/6"]);
  assert.equal(dl(q(1, 2), 3).ladder, "0");   // y(1) = 7/2 is not whole: no run
  // Tie-breaker: where the run stops, at n, the factor y(n) shares with n. y = 2x + 60 stops at 7 (y(7) = 74): 1;
  // y = 2x + 120 stops at 7 too, y(7) = 134: 1; y = x + 12 stops at 5 (y(5) = 17): 1; y = 3x + 12: 5 does not divide
  // 27, 1; y = 4x + 6 stops at 4 (y(4) = 22): shares 2 with 4. Never more than n, however far a stretch goes.
  assert.equal(dl(4, 6)["next-rung"], "2");
  assert.equal(dl(1, 12)["next-rung"], "1");
  assert.equal(dl(q(1, 2), 3)["next-rung"], "0");   // y(1) = 7/2: not whole
  assert.ok(divisibilityLadder.keepsParams);
});

test("Same on Both Rulers marks the meeting point and its palindrome on the plane without reading it: depends and reads unchanged (no scoring cost)", () => {
  const e = evaluateSite(lineType, sameOnBothRulers, { meets: 1, digits: "odd" }, mc(0, 120), lineQ, 0, null);
  assert.deepEqual([...sameOnBothRulers.depends], ["si", "gen"]);
  assert.ok(e.reads.every(r => r.rep !== "cart"), "the plane is not read");
  assert.ok(e.marks.some(m => m.kind === "focus" && m.ref.name === "pointAtX" && m.ref.args?.q === "120" && m.term === "palindrome"));
  assert.ok(e.marks.some(m => m.kind === "candidate" && m.ref.name === "xAxisMark" && m.ref.args?.x === "121" && m.term === "palindrome"));
});

test("a mark outside depends must still name a real element; inside depends it must still be read", () => {
  const bad = (cite: { rep: string; name: string }): RuleFamily<LineState, object> => ({
    ...sameOnBothRulers as unknown as RuleFamily<LineState, object>,
    evaluate(ctx) {
      for (const l of [sameOnBothRulers.main, ...sameOnBothRulers.tieBreakers]) ctx.term(l.id, l.id, q(0), []);
      ctx.mark({ kind: "focus", ref: cite });
    },
  });
  assert.throws(() => evaluateSite(lineType, bad({ rep: "cart", name: "nope" }), {}, mc(1, 2), lineQ), /Unknown element/);
  assert.throws(() => evaluateSite(lineType, bad({ rep: "si", name: "m" }), {}, mc(1, 2), lineQ), /without reading it/);
});
