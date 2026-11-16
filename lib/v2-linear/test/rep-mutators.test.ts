/**
 * Moves in every representation (the owner, 16 Nov: "mutators for every representation ... to move the X intercept and
 * the params of ax+by+c=0 and the area (while keeping the line gradient and quadrant constant) directly as well as flips
 * around axis and expensively supplied lines to mirror around"). Each expected line was worked by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, isInvalid, Qn, q } from "@workspace/v2-core";
import { allMutators, describeLine, lineQ, lineType, lineZ, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const call = (s: LineState, mutator: string, args: Record<string, string>, v = lineQ) => applyCall(lineType, v, s, { mutator, site: 0, args });
const line = (r: ReturnType<typeof call>) => (isInvalid(r) ? r.invalid : describeLine((r.result as LineState).lines[0]!));
const price = (r: ReturnType<typeof call>) => (isInvalid(r) ? NaN : r.price.total);

test("the dealt line menus hold a move for the x-intercept, the area and a supplied mirror", () => {
  for (const v of [lineQ, lineZ]) for (const id of ["cross.shift", "area.shift", "cart.reflect"]) assert.ok(v.mutators.includes(id), `${v.id}: ${id}`);
});

test("cross.shift moves where the line crosses the x-axis, keeping its gradient; its inverse undoes it at the same fee", () => {
  const s = mc(2, -4);   // y = 2x − 4 crosses at 2
  const r = call(s, "cross.shift", { k: "3" });
  assert.equal(line(r), "y = 2x - 10");   // crosses at 5, gradient still 2
  const back = call((r as { result: LineState }).result, "cross.shift", { k: "-3" });
  assert.equal(line(back), "y = 2x - 4");
  // The same fee schedule as a shift (no privileged representation), and k and −k cost the same.
  const bits = (id: string, k: string) => allMutators.find(m => m.id === id)!.args(lineQ).bits({ k: Qn.parse(k) } as never);
  for (const k of ["3", "1/2", "-7/3"]) {
    assert.equal(bits("cross.shift", k), bits("si.shift", k), k);
    assert.equal(bits("area.shift", k), bits("si.shift", k), k);
    assert.equal(bits("cross.shift", k), bits("cross.shift", k.startsWith("-") ? k.slice(1) : `-${k}`), k);
  }
  assert.match(line(call(mc(0, 3), "cross.shift", { k: "1" })), /never crosses the x-axis|flat/);
  assert.equal(line(call(mc(q(1, 2), 1), "cross.shift", { k: "1/2" })), "y = 1/2x + 3/4");   // crosses at −2, moved to −3/2
});

test("area.shift changes the triangle's area, keeping the gradient and the quarter, and refuses what has no fraction answer", () => {
  const s = mc(-2, 4);   // X = 2, Y = 4: area 4
  const r = call(s, "area.shift", { k: "5" });
  assert.equal(line(r), "y = -2x + 6");   // area 9: c² = 2 × 2 × 9 = 36
  assert.equal(line(call((r as { result: LineState }).result, "area.shift", { k: "-5" })), "y = -2x + 4");
  assert.match(line(call(s, "area.shift", { k: "1" })), /not a fraction/);   // area 5 needs c = √20
  assert.match(line(call(s, "area.shift", { k: "-4" })), /area of 0|quarter/);   // would empty the triangle
  assert.match(line(call(s, "area.shift", { k: "-6" })), /area of 0|quarter/);   // would cross into another quarter
  assert.match(line(call(mc(3, 0), "area.shift", { k: "1" })), /no triangle/);   // through (0, 0)
  assert.match(line(call(mc(0, 3), "area.shift", { k: "1" })), /no triangle/);   // flat
  // Top-left quarter (m > 0, c > 0: X = −2 < 0): the signed area ½ × X × Y is −2; adding −6 makes it −8, c² = 2 × 1 × 8.
  const t = call(mc(1, 2), "area.shift", { k: "-6" });
  assert.equal(line(t), "y = x + 4");
});

test("cart.reflect mirrors the line in a supplied line, priced by that line's length; it is its own inverse", () => {
  const s = mc(1, 1);
  const r = call(s, "cart.reflect", { mirror: "1,-1,0" });   // the mirror y = x
  assert.equal(line(r), "y = x - 1");
  assert.equal(line(call((r as { result: LineState }).result, "cart.reflect", { mirror: "1,-1,0" })), "y = x + 1");
  // A longer mirror line costs more.
  const cheap = call(mc(2, 3), "cart.reflect", { mirror: "1,-1,0" }), dear = call(mc(2, 3), "cart.reflect", { mirror: "17,-23,401" });
  assert.ok(!isInvalid(dear) && price(dear) - price(cheap) > 10, `${price(dear)} against ${price(cheap)}`);
  void Qn;
});
