/**
 * Defence goals on the server (v1, restored; owner-decisions call 1; lib/v2-valuation defence.ts): a seat dealt a
 * penalty holds v1's signed bits n = s⁺ − w·(η(h) − E_π η(h)) on each object, and points are n × max(0, others).
 * Without defence goals nothing changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridType, grid4 } from "@workspace/v2-grid";
import { defenceNet, hinge, ruleKey } from "@workspace/v2-valuation";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";
import { penaltyMean, valueRecord } from "../../convex/v2/values.ts";
import { valueOf, valuesOf, type SeatRule } from "../../convex/v2/world.ts";

const pool = dealablePool(presetOf("grids-beginner"));
const [a, b] = [pool[0]!, pool.find(r => r.family !== pool[0]!.family)!];
const hate3 = { family: "hated-number", params: { value: 3 }, ruleKey: ruleKey(gridType as never, grid4, "hated-number", { value: 3 }, "none") };
const crowd = { family: "number-crowd", params: {}, ruleKey: ruleKey(gridType as never, grid4, "number-crowd", {}, "none") };
const board = (cells: number[]) => ({ cells });
const typical = board([1, 5, 2, 8, 0, 3, 9, 4, 7, 6, 2, 5, 1, 8, 3, 0]);
const threes = board(Array(16).fill(3));
const N = 30;

test("every penalty of the grid has a value function, and E_π η is a small positive constant", () => {
  for (const d of [hate3, crowd]) {
    assert.ok(valueRecord(d.ruleKey), d.family);
    const m = penaltyMean(d.ruleKey);
    assert.ok(m > 0 && m < 2, `${d.family}: ${m}`);
  }
});

test("without a defence goal the worth is the reward's, unchanged", () => {
  const plain = valueOf(typical, "grid-4-d10", a, N), same = valueOf(typical, "grid-4-d10", a, N, undefined);
  assert.deepEqual(plain, same);
  assert.ok(!("badnessBits" in plain));
});

test("with one, the worth is v1's signed bits, and a board full of the hated number costs the seat", () => {
  const plain = valueOf(threes, "grid-4-d10", a, N), d = valueOf(threes, "grid-4-d10", a, N, hate3);
  assert.ok(d.badnessBits! > 10, `16 threes is rare badness: ${d.badnessBits}`);
  assert.ok(Math.abs(d.rarityBits - defenceNet(plain.rarityBits, d.badnessBits!, 1, penaltyMean(hate3.ruleKey))) < 1e-9);
  assert.ok(d.rarityBits < plain.rarityBits - 5, `${d.rarityBits} against ${plain.rarityBits}`);
  // On a typical board the defence goal is about zero-mean: a small adjustment either way.
  const t = valueOf(typical, "grid-4-d10", a, N, hate3), tp = valueOf(typical, "grid-4-d10", a, N);
  assert.ok(Math.abs(t.rarityBits - tp.rarityBits) < 1.5, `${t.rarityBits} against ${tp.rarityBits}`);
  // w scales the penalty part.
  const w2 = valueOf(threes, "grid-4-d10", a, N, hate3, 2);
  assert.ok(Math.abs((plain.rarityBits - w2.rarityBits) - 2 * (plain.rarityBits - d.rarityBits)) < 1e-9);
  assert.ok(hinge(d.badnessBits!) > 5);
});

test("points are n × max(0, others): a negative seat never scores from others' shared negatives", () => {
  const seats: SeatRule[] = [{ memberId: "x", rule: a, defence: hate3 }, { memberId: "y", rule: b, defence: hate3 }, { memberId: "z", rule: a, defence: crowd }];
  const vs = valuesOf(threes, "grid-4-d10", seats, N);
  for (const v of vs) {
    assert.equal(v.points, v.want > 0 ? v.rarityBits * v.want : 0);
    if (v.rarityBits < 0 && v.want < 0) assert.equal(v.points, 0, "no farming of shared negatives");
  }
  assert.ok(vs.some(v => v.rarityBits < 0), "a board full of the hated number puts its haters below 0");
  // No defence goals: the same points as before the restoration (want ≥ 0, so the floor changes nothing).
  const plain = valuesOf(typical, "grid-4-d10", seats.map(s => ({ memberId: s.memberId, rule: s.rule })), N);
  for (const v of plain) assert.equal(v.points, v.rarityBits * v.want);
});
