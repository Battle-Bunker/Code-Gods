/**
 * Rule difficulty estimators (scripts/rule-difficulty-lib.ts, docs/rule-difficulty.md): pinned on hand-checkable rules,
 * on an ad-hoc rule compiled from card source, and on the owner's anchors (honest_minesweeper is harder to write an
 * algorithm for, and harder to combine, than mirrormancer).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, type GridValue } from "@workspace/game-types";
import {
  QUICK_BUDGET, adHocRule, compileSource, familyParams, familyRule, givenRule, measurePair, measureRule, space, summarise, verdict,
  type Budget, type Rule,
} from "../scripts/rule-difficulty-lib.ts";
import { rules as exampleRules } from "../scripts/rule-difficulty-example.mjs";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const numbers = space(inst, "symbol"), cells = space(inst, "cell");
const TINY: Budget = { ...QUICK_BUDGET, starts: 4, longSteps: 20, entangleBoards: 6, entangleMoves: 2 };

// Hand-checkable rules (symbol index = digit in base10). Bits = the ordinal itself, so shares are easy to read.
const sevens = () => givenRule("sevens", g => g.sym.filter(s => s === 7).length, o => o as number, 16);
const parity = () => givenRule("parity", g => (g.sym.reduce((a, s) => a + s, 0) % 2 === 0 ? 1 : 0), o => o as number, 1);
const cornerPair = () => givenRule("corner_pair", g => (g.sym[0] === g.sym[3] ? 1 : 0), o => o as number, 1);

test("count of 7s: greedy reaches the top, never blind or trapped, and a move's effect depends on no other cell", () => {
  const r = measureRule(sevens(), { sp: numbers, budget: TINY });
  assert.equal(r.reachEnd, 1);
  assert.equal(r.plateau, 0);
  assert.equal(r.trap, 0);
  assert.equal(r.entangle, 0);
  assert.equal(r.difficulty, 0);
  assert.equal(r.rate8, 1, "one more 7 per move");
  assert.ok(r.movesTo90 >= 11 && r.movesTo90 <= 15, `15 minus the starting 7s (about 1.6): ${r.movesTo90}`);
});

test("whole-board parity: blind on about half the boards, and every other cell decides whether a move helps", () => {
  const r = measureRule(parity(), { sp: numbers, budget: TINY });
  assert.ok(r.plateau > 0.3 && r.plateau < 0.7, `plateau ${r.plateau}`);
  assert.equal(r.entangle, 15);
  assert.equal(r.reachEnd, 1, "one move always fixes an odd total");
  assert.equal(r.trap, 0);
});

test("a mirrored corner pair: a move's effect depends on exactly the partner cell", () => {
  const r = measureRule(cornerPair(), { sp: numbers, budget: TINY });
  assert.equal(r.entangle, 1);
  assert.equal(r.trap, 0);
});

test("an ad-hoc rule compiled from card source scores exactly like the hand-written one", () => {
  const src = exampleRules.find(x => x.id === "count_sevens")!.utility.toString();
  const score = compileSource(src, inst), ref = sevens();
  const rng = { s: 1, int(n: number) { this.s = (this.s * 1103515245 + 12345) % 2 ** 31; return this.s % n; } };
  for (let k = 0; k < 50; k++) {
    const g = numbers.spawn(rng as never) as GridValue;
    assert.equal(score(g), ref.score(g));
  }
  const rule = adHocRule("count_sevens", src, inst, { top: 16 });
  assert.equal(rule.calibration, "calibrated");
  assert.ok(rule.bits(16) > rule.bits(8) && rule.bits(8) > rule.bits(2), "calibrated bits increase with the ordinal");
});

test("measurement is deterministic", () => {
  const a = measureRule(cornerPair(), { sp: numbers, budget: TINY }), b = measureRule(cornerPair(), { sp: numbers, budget: TINY });
  assert.deepEqual(a, b);
});

test("anchor: honest_minesweeper is clearly harder to write an algorithm for, and to combine, than mirrormancer", () => {
  const rule = (id: string): Rule => familyRule(id, familyParams(id, inst)[0], inst);
  const ctx = { sp: cells, budget: QUICK_BUDGET };
  const mine = measureRule(rule("honest_minesweeper"), ctx), mirror = measureRule(rule("mirrormancer"), ctx);
  assert.equal(mirror.difficulty, 0, "greedy solves mirrormancer");
  assert.ok(mine.difficulty >= 20, `minesweeper difficulty ${mine.difficulty}`);
  assert.ok(mine.trap >= 0.3, `minesweeper trap ${mine.trap}`);
  assert.ok(mine.entangle >= 3 * mirror.entangle, `entanglement ${mine.entangle} vs ${mirror.entangle}`);
  const partners = ["magic_accountant", "parity_painter", "number_bonds"].map(rule);
  const syn = (r: Rule) => partners.reduce((s, p) => s + measurePair(r, p, ctx).difficulty, 0) / partners.length;
  const sMine = syn(rule("honest_minesweeper")), sMirror = syn(rule("mirrormancer"));
  assert.ok(sMine >= sMirror + 10, `synergy difficulty ${sMine} vs ${sMirror}`);
});

test("rate4 is the mean bits per move over the first four moves; the pool verdict flags a slow, hard rule", () => {
  const ctx = { sp: numbers, budget: TINY };
  const s7 = measureRule(sevens(), ctx);
  assert.equal(s7.rate4, 1);
  // A rule whose bits come only at the very end: one point for a full board of 7s. Greedy is blind on it.
  const late = measureRule(givenRule("all_sevens", g => (g.sym.every(s => s === 7) ? 1 : 0), o => o as number, 1), ctx);
  assert.equal(late.rate4, 0);
  assert.equal(late.plateau, 1);
  assert.equal(late.trap, 1);
  const fails = verdict({ rules: [s7, late], pairs: [], partners: [], summary: summarise([s7, late], []) });
  assert.ok(fails.some(x => x.startsWith("all_sevens: DIFF")), fails.join("\n"));
  assert.ok(fails.some(x => x.startsWith("all_sevens: dominated")), fails.join("\n"));
  assert.ok(fails.includes("pair thresholds not checked (no pairs measured)"));
  assert.ok(!fails.some(x => x.startsWith("sevens:")), "count of 7s passes every per-rule threshold");
});
