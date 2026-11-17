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

