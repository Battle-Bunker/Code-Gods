/**
 * Rule difficulty estimators (scripts/rule-difficulty-lib.ts, docs/rule-difficulty.md): pinned on hand-checkable rules,
 * on an ad-hoc rule compiled from card source, and on the owner's anchors (honest_minesweeper is harder to write an
 * algorithm for, and harder to combine, than mirrormancer).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCost, instantiate, objectType, seededRng, type GridValue } from "@workspace/game-types";
import {
  QUICK_BUDGET, adHocRule, apply, compileSource, energyClimb, familyParams, familyRule, givenRule, measurePair, measureRule, moveEnergy,
  space, summarise, verdict,
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
  assert.ok(!fails.some(x => /^sevens: (DIFF|K|card|dominated)/.test(x)), "count of 7s passes the difficulty, locality and size thresholds");
});

test("uniform-board maximum: all 7s tops count-of-7s; the corner pair is topped by every uniform board", () => {
  const ctx = { sp: numbers, budget: TINY };
  assert.deepEqual(measureRule(sevens(), ctx).uniformTop, [7]);
  assert.deepEqual(measureRule(cornerPair(), ctx).uniformTop, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(measureRule(parity(), ctx).uniformTop, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "16 equal digits always add to an even total");
});

// ------------------------------------------------------------------------------------------------
// energy: the cost-aware greedy and rateE (docs/rule-difficulty.md §2.6)
// ------------------------------------------------------------------------------------------------

const mono = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const board = (sym: number[]): GridValue => ({ size: 4, sym: Uint8Array.from(sym), col: new Uint8Array(16) });
const near = board([6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 8]);

test("a move's energy is changeCost(callWork) of the room's cost model", () => {
  const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.05, `${a} vs ${b}`);
  const G = objectType("Grid"), call = { id: "", params: null };
  for (const inst of [mono, instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" })]) {
    for (const model of ["set-v1", "distance-v1"] as const) {
      for (const m of [{ cell: 0, layer: 0, value: 7 }, { cell: 15, layer: 0, value: 0 }, { cell: 3, layer: 1, value: 1 }] as const) {
        const h = apply(near, m);
        assert.equal(moveEnergy(inst, near, h, model), changeCost(G.callWork(near, h, call, inst, model)));
      }
    }
  }
  // The design's table (docs/mutation-cost-design.md §0), numbers-only board: where 4 bits; a nudge 1.585 bits a step.
  close(moveEnergy(mono, near, apply(near, { cell: 0, layer: 0, value: 7 }), "distance-v1"), 7.1);
  close(moveEnergy(mono, near, apply(near, { cell: 1, layer: 0, value: 7 }), "distance-v1"), 19.0);
  close(moveEnergy(mono, near, apply(near, { cell: 0, layer: 0, value: 7 }), "set-v1"), 16.3);
  close(moveEnergy(mono, near, apply(near, { cell: 1, layer: 0, value: 7 }), "set-v1"), 16.3);
  assert.equal(moveEnergy(mono, near, near), 0);
});

test("under set-v1 the per-energy greedy is the steepest greedy: every number change costs the same", () => {
  const sp = space(mono), cost = (g: GridValue, h: GridValue) => moveEnergy(mono, g, h, "set-v1");
  for (const rule of [sevens(), cornerPair()]) {
    for (const start of [near, sp.spawn(seededRng("energy-test"))]) {
      const a = energyClimb(rule, sp, start, cost, [32, 64, 128], "per-energy"), b = energyClimb(rule, sp, start, cost, [32, 64, 128], "steepest");
      assert.deepEqual(a.bitsAt, b.bitsAt);
      assert.deepEqual(a.boards, b.boards, "the same moves in the same order");
      assert.equal(a.spent, b.spent);
    }
  }
  // 64 energy bits buy three changes at 16.3 each: three more 7s.
  assert.deepEqual(energyClimb(sevens(), sp, near, cost, [32, 64], "steepest").bitsAt, [1, 3]);
});

test("under distance-v1, on a rule fixed by ±1 moves, the per-energy greedy holds more per energy than the steepest", () => {
  const sp = space(mono), cost = (g: GridValue, h: GridValue) => moveEnergy(mono, g, h, "distance-v1");
  const careful = energyClimb(sevens(), sp, near, cost, [16, 1000], "per-energy"), blind = energyClimb(sevens(), sp, near, cost, [16, 1000], "steepest");
  assert.equal(careful.bitsAt[0], 2, "the two cells one step from 7 first (7.1 energy each)");
  assert.equal(blind.bitsAt[0], 1, "the cost-blind agent's second move is a jump of 5 (19 energy)");
  assert.deepEqual([careful.bitsAt[1], blind.bitsAt[1]], [16, 16]);
  assert.ok(Math.abs(careful.spent - blind.spent) < 1e-9, "each cell moved once, straight to 7, in either order");
  // Odd digits on every cell: every fix is a nudge, but the first better digit the blind agent finds is a 1, up to 7 steps away.
  const odd = givenRule("odd", g => g.sym.filter(s => s % 2 === 1).length, o => o as number, 16);
  const evens = board([0, 2, 4, 6, 8, 0, 2, 4, 6, 8, 0, 2, 4, 6, 8, 0]), nudge = cost(evens, apply(evens, { cell: 0, layer: 0, value: 1 }));
  const c = energyClimb(odd, sp, evens, cost, [64], "per-energy"), b = energyClimb(odd, sp, evens, cost, [64], "steepest");
  assert.equal(c.bitsAt[0], Math.floor(64 / nudge), "only nudges");
  assert.ok(b.bitsAt[0] < c.bitsAt[0], `${b.bitsAt[0]} < ${c.bitsAt[0]}`);
});

test("rateE is the bits the per-energy greedy gains per energy bit over the first 64; e32 and e64 are shares of the top", () => {
  const sp = space(mono, "symbol");
  const flat = measureRule(sevens(), { sp, budget: TINY }), dist = measureRule(sevens(), { sp, budget: TINY, costModel: "distance-v1" });
  assert.equal(flat.rateE, 3 / 64, "three changes at 16.3");
  assert.ok(Math.abs(flat.e64 - flat.e32 - 2 / 16) < 1e-9, "one change by 32, three by 64");
  assert.deepEqual(flat.energyBits["per-energy"], flat.energyBits.steepest);
  assert.ok(dist.rateE > flat.rateE, `nudges first: ${dist.rateE}`);
  assert.ok(dist.energyBits["per-energy"][0] >= dist.energyBits.steepest[0]);
  for (const k of ["rate4", "greedy16", "trap", "difficulty", "entangle"] as const) assert.equal(dist[k], flat[k], `${k} does not depend on the cost model`);
  // The pool check is reported, never a failing gate.
  const late = measureRule(givenRule("all_sevens", g => (g.sym.every(s => s === 7) ? 1 : 0), o => o as number, 1), { sp, budget: TINY });
  const s = summarise([flat, { ...flat, id: "half", rateE: flat.rateE / 2, e32: flat.e32 / 2, e64: flat.e64 / 2 }], []);
  assert.equal(s.rateERatio, 2);
  assert.ok(Math.abs(s.e32.ratio - 2) < 1e-9 && Math.abs(s.e32.cv - 1 / 3) < 1e-9, JSON.stringify(s.e32));
  assert.ok(!verdict({ rules: [flat, late], pairs: [], partners: [], summary: summarise([flat, late], []) }).some(x => /rateE|energy/.test(x)));
});
