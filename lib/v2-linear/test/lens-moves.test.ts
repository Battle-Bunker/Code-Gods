/** The whole-number lens moves and the turn price (owner, 17 Nov). Breaks caught: a wrong lens read or build, a pair
 * left unreduced, a mixed-lens turn accepted, a price that is not naming bits + surprise. */
import { lineQ, lineZ } from "./config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCalls, argBits, infoSize, isInvalid, rng, turnSurprise, type Call } from "@workspace/v2-core";
import { lineType } from "../src/type.ts";
import { fromMC, describeLine } from "../src/line.ts";
import { lensById, lenses, LENS_BITS, newbornLine, readLens } from "../src/lens-moves.ts";
import { q } from "@workspace/v2-core";

const st = (m: [number, number], c: [number, number]) => ({ lines: [fromMC(q(BigInt(m[0]), BigInt(m[1])), q(BigInt(c[0]), BigInt(c[1])))] });
const call = (mutator: string, args: Record<string, string>): Call => ({ mutator, site: 0, args });
const turn = (s: ReturnType<typeof st>, calls: Call[], v = lineQ) => applyCalls(lineType, v, s, calls);

test("every lens reads and rebuilds the line it came from", () => {
  const s = st([2, 3], [5, 7]);
  for (const lens of lenses) {
    const n = readLens(lens, s.lines[0]!);
    assert.ok(!isInvalid(n), lens.id);
    const back = lens.build(n as bigint[], s.lines[0]!);
    assert.deepEqual(back, s.lines[0], lens.id);
  }
});

test("you cannot add 1/2 to 1/3, but you can multiply the bottom by 3 and add to the top", () => {
  // Each number of a pair is mutated on its own: add to the top, or multiply the bottom.
  const s = st([0, 1], [1, 2]);
  const r = turn(s, [call("add", { lens: "mc", at: "3", k: "2" })]);   // c: 1/2 → 3/2
  assert.ok(!isInvalid(r));
  assert.equal(describeLine(r.result.lines[0]!), "y = 3/2");
  const r2 = turn(s, [call("mul", { lens: "mc", at: "4", k: "3" })]);  // c: 1/2 → 1/6
  assert.ok(!isInvalid(r2));
  assert.equal(describeLine(r2.result.lines[0]!), "y = 1/6");
});

test("cancelling is a real way down: lowest terms after every mutation", () => {
  const s = st([0, 1], [3, 4]);
  const r = turn(s, [call("add", { lens: "mc", at: "3", k: "3" })]);   // 3/4 → 6/4 = 3/2
  assert.ok(!isInvalid(r));
  assert.equal(describeLine(r.result.lines[0]!), "y = 3/2");
});

test("swap, round, negate, divide (exact only), and the abc and intercept lenses", () => {
  const s = st([2, 3], [7, 2]);
  const sw = turn(s, [call("swap", { lens: "mc", at: "1" })]);
  assert.ok(!isInvalid(sw)); assert.equal(describeLine(sw.result.lines[0]!), "y = 3/2x + 7/2");
  const ro = turn(s, [call("round", { lens: "mc", at: "2" })]);
  assert.ok(!isInvalid(ro)); assert.equal(describeLine(ro.result.lines[0]!), "y = 2/3x + 4");
  const ng = turn(s, [call("neg", { lens: "mc", at: "1" })]);
  assert.ok(!isInvalid(ng)); assert.equal(describeLine(ng.result.lines[0]!), "y = -2/3x + 7/2");
  assert.ok(isInvalid(turn(s, [call("div", { lens: "mc", at: "3", k: "2" })])));   // 7 is not a multiple of 2
  const xy = turn(st([1, 1], [2, 1]), [call("add", { lens: "xy", at: "1", k: "-1" })]);   // X: −2 → −3, Y = 2
  assert.ok(!isInvalid(xy)); assert.equal(describeLine(xy.result.lines[0]!), "y = 2/3x + 2");
  const abc = turn(st([1, 1], [2, 1]), [call("add", { lens: "abc", at: "3", k: "4" })]);   // −x + y − 2 = 0 → c = 2
  assert.ok(!isInvalid(abc)); assert.equal(describeLine(abc.result.lines[0]!), "y = x - 2");
});

test("a bottom stays ≥ 1, and an undefined lens cannot be pinned", () => {
  assert.ok(isInvalid(turn(st([1, 2], [1, 1]), [call("add", { lens: "mc", at: "2", k: "-2" })])));
  assert.ok(isInvalid(turn(st([1, 1], [0, 1]), [call("add", { lens: "xy", at: "1", k: "1" })])));   // through the origin
});

test("a turn pins one lens, and its price is naming bits plus the surprise of its overall change", () => {
  const s = st([2, 1], [5, 1]);
  assert.ok(isInvalid(turn(s, [call("add", { lens: "mc", at: "3", k: "1" }), call("add", { lens: "abc", at: "3", k: "1" })])));
  const r = turn(s, [call("add", { lens: "mc", at: "3", k: "1" })]);
  assert.ok(!isInvalid(r));
  // naming: log2 6 (menu) + log2 4 (which number) + argBits(1, signed) + 1 (continue)
  assert.ok(Math.abs(r.naming - (Math.log2(6) + 2 + argBits(1, true) + 1)) < 1e-9);
  assert.ok(Math.abs(r.surprise - (turnSurprise(1, [2n, 1n, 5n, 1n], [2n, 1n, 6n, 1n]) + LENS_BITS)) < 1e-9);
  assert.ok(Math.abs(r.total - r.naming - r.surprise) < 1e-9);
  // doubling 5 → 10 by multiply: the surprise of a one-bit rise is more than a small add's
  const d = turn(s, [call("mul", { lens: "mc", at: "3", k: "2" })]);
  assert.ok(!isInvalid(d) && d.surprise > r.surprise);
  assert.ok(Math.abs(infoSize(10) - infoSize(5) - Math.log2(11 / 6)) < 1e-12);
});

test("a whole-number board refuses a mutation that leaves a fraction", () => {
  assert.ok(isInvalid(turn(st([2, 1], [5, 1]), [call("mul", { lens: "mc", at: "4", k: "2" })], lineZ)));
});

test("newborns are modest and valid on every line board", () => {
  const r = rng("test", "newborn");
  let big = 0;
  for (let i = 0; i < 400; i++) {
    const l = newbornLine(r, lineQ);
    assert.ok(lineType.canonical({ lines: [l] }, lineQ));
    if (infoSize(l.a) + infoSize(l.b) + infoSize(l.c) > 30) big++;
    const z = newbornLine(r, lineZ);
    assert.equal(z.b, 1n);
  }
  assert.ok(big < 40, `${big} of 400 newborns over 30 bits`);
  assert.equal(lensById("mc")!.numbers.length, 4);
});
