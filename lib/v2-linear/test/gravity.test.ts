/**
 * Gravity (docs/engine-v2/gravity.md): line-q's φ is a size code with strength g, so neighbours cost nearly the same,
 * height costs g bits a unit, fractions pay modestly for their bottom number, the law is complete and drawn exactly,
 * and climbing pays heightPrice ⚡ per bit of φ gained (falling is free).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, rng } from "@workspace/v2-core";
import { fromMC, gravityLineCode, lineBits, lineLaw, lineParams, lineQ, lineType, type LineState } from "../src/index.ts";
import { Qn } from "@workspace/v2-core";

const p = lineParams(lineQ);
const at = (m: string, c: string) => fromMC(Qn.parse(m), Qn.parse(c));
const phi = (m: string, c: string) => lineBits(at(m, c), p);

test("line-q is under gravity by default (g 0.25, a constant field)", () => {
  assert.deepEqual(p.gravity, { g: 0.25, alpha: 1 });
});

test("height costs g bits a unit, and a neighbour of a prime costs about the same as the prime", () => {
  const g = p.gravity!.g;
  assert.ok(Math.abs(phi("0", "101") - phi("0", "100") - g) < 1e-9, "one unit up is g bits");
  assert.ok(Math.abs(phi("0", "101") - phi("0", "96") - 5 * g) < 1e-9, "a smooth neighbour is not cheaper than its size");
  const half = phi("0", "201/2") - phi("0", "100");
  assert.ok(half > 0 && half < 4, `a half pays modestly for its bottom number: ${half}`);
  assert.ok(phi("0", "1001") - phi("0", "11") > 200, "far is dear");
});

test("the code is complete for each bottom number and the law draws it exactly", () => {
  const code = gravityLineCode(p.gravity!);
  assert.ok(Math.abs(code.log2Norm(1)) < 1e-9, "Kraft sum 1");
  for (const t of [0.6, 0.2]) assert.ok(code.log2Norm(t) > 0, "a tilted law is heavier");
  const r = rng("gravity-test"), N = 200_000, target = at("0", "1"), key = `${target.a},${target.b},${target.c}`;
  let hits = 0;
  const law = lineLaw(lineQ);
  for (let i = 0; i < N; i++) { const d = law.draw(r, 1); const l = d.state?.lines[0]; if (l && `${l.a},${l.b},${l.c}` === key) hits++; }
  const want = N * 2 ** -lineBits(target, p);
  assert.ok(Math.abs(hits - want) < 5 * Math.sqrt(want), `drawn ${hits}, expected ${want.toFixed(0)}`);
});

test("climbing pays heightPrice per bit of φ gained; falling pays none", () => {
  const w = lineQ.heightPrice!;
  assert.equal(w, 10);
  const s: LineState = { lines: [at("1/2", "20")] };
  const up = applyCall(lineType, lineQ, s, { mutator: "si.shift", site: 0, args: { k: "1" } });
  assert.ok(!isInvalid(up));
  const dphi = lineType.readLength(up.result, lineQ) - lineType.readLength(s, lineQ);
  assert.ok(Math.abs(up.price.surcharge - w * dphi) < 1e-9);
  const down = applyCall(lineType, lineQ, s, { mutator: "si.shift", site: 0, args: { k: "-1" } });
  assert.ok(!isInvalid(down));
  assert.equal(down.price.surcharge, 0);
});
