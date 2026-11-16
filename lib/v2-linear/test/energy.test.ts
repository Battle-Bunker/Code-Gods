/**
 * The line energy measure's descent and size (src/energy.ts): rounding is a move, starts match the state's information
 * content (top and bottom digits), and padding a number with digits does not pay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, q, Qn, rng, type Q } from "@workspace/v2-core";
import { changeCharge } from "@workspace/v2-economy";
import { describeLine, estimateLine, fromMC, lineQ, lineType, sameSize, type LineRule, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const call = (s: LineState, mutator: string, args: Record<string, string>) => applyCall(lineType, lineQ, s, { mutator, site: 0, args });

test("si.round rounds the gradient or the y-intercept, priced as choices whatever the distance; rounding in place is refused", () => {
  const r = call(mc(q(7, 3), q(8670001, 10000)), "si.round", { which: "c", to: "whole" });
  assert.ok(!isInvalid(r));
  assert.equal(describeLine(r.result.lines[0]!), "y = 7/3x + 867");
  const m = call(mc(q(7, 3), 5), "si.round", { which: "m", to: "tenths" });
  assert.ok(!isInvalid(m));
  assert.equal(describeLine(m.result.lines[0]!), "y = 23/10x + 5");
  assert.equal(describeLine((call(mc(1, q(-35, 2)), "si.round", { which: "c", to: "whole" }) as { result: LineState }).result.lines[0]!), "y = x - 18");   // halves away from 0
  const far = call(mc(1, q(123456789, 1000)), "si.round", { which: "c", to: "tens" });
  assert.ok(!isInvalid(far) && far.price.total === (r as { price: { total: number } }).price.total, "the same price however far it moves");
  assert.ok(isInvalid(call(mc(1, 867), "si.round", { which: "c", to: "whole" })));
});

test("starts have the state's information content: as many top and bottom digits", () => {
  const r = rng("t", "size");
  for (let i = 0; i < 200; i++) {
    const v = sameSize(q(8670001, 10000), 0.5, r), top = Number(v.n < 0n ? -v.n : v.n);
    assert.ok(Math.log2(top) >= Math.log2(8670001) - 0.5 && Math.log2(top) < Math.log2(8670001) + 1, `${Qn.toWire(v)}`);
    assert.ok(Math.log2(Number(v.d)) >= Math.log2(10000) - 1 && Math.log2(Number(v.d)) < Math.log2(10000) + 1, `${Qn.toWire(v)}`);
    assert.equal(sameSize(q(867), 0.5, r).d, 1n);
  }
});

/** A test rule: the y-intercept near 867 (u = −|c − 867|). */
const near867: LineRule = { u: l => -Math.abs(Qn.toNumber(q(-l.c, l.b)) - 867), reads: ["c"], propose: () => [] };

test("padding 867 to 8,670,001/10,000 gains less energy than the padding costs (REPORTED ratio)", () => {
  const plain = fromMC(q(2), q(867)), padded = fromMC(q(2), q(8670001, 10000)), K = 400;
  const e0 = estimateLine(plain, near867, lineQ, { K, seed: "pad" }).energy, e1 = estimateLine(padded, near867, lineQ, { K, seed: "pad" }).energy;
  // The cheapest single move that pads: a shift by 1/10,000 or a stretch by 8,670,001/8,670,000.
  // The cheapest padding found: a shift by 1/10,000, a stretch by 8,670,001/8,670,000, or a stretch up to 8,670,001
  // then one by 1/10,000 (each act charged on its own).
  const cost = (s: LineState, steps: [string, Record<string, string>][]): number => {
    let total = 0;
    for (const [m, a] of steps) { const r = call(s, m, a); if (isInvalid(r)) return Infinity; total += changeCharge([r.price.total]); s = r.result; }
    return total;
  };
  const st = { lines: [plain] };
  const padCost = Math.min(cost(st, [["si.shift", { k: "1/10000" }]]), cost(st, [["mach.stretch", { f: "8670001/8670000" }]]),
    cost(st, [["mach.stretch", { f: "8670001/867" }], ["mach.stretch", { f: "1/10000" }]]));
  const roundCost = changeCharge([(call({ lines: [padded] }, "si.round", { which: "c", to: "whole" }) as { price: { total: number } }).price.total]);
  const ratio = (e1 - e0) / padCost;
  console.log(`padding: E(867) = ${e0.toFixed(2)}, E(8670001/10000) = ${e1.toFixed(2)}, gain ${(e1 - e0).toFixed(2)}, pad cost ${padCost.toFixed(2)}, one rounding ${roundCost.toFixed(2)}, ratio ${ratio.toFixed(3)}`);
  assert.ok(ratio < 1, `ratio ${ratio}`);
  // About the plain state plus a rounding: the padded starts round to numbers within a binary digit of 867's starts.
  assert.ok(e1 <= e0 + 4 * roundCost, `the padded state scores about the plain one plus a rounding: ${e1} against ${e0} + ${roundCost}`);
});
void (null as unknown as Q);
