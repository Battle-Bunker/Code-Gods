/**
 * Defence goals' arithmetic (v1, restored: archive lib/grid-lab/docs/defence-goals.md §3; owner-decisions call 1):
 * a seat's signed bits n = s⁺ − w·(η(h) − E_π η(h)), η the soft hinge at the median, h the penalty's badness bits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defenceNet, hinge, meanHinge } from "../src/index.ts";

test("the soft hinge: η(0) = 0, about 0.42 at a typical 1 bit, strictly increasing, about s − 1.58 when bad", () => {
  assert.equal(hinge(0), 0);
  assert.ok(Math.abs(hinge(1) - 0.415) < 0.001);
  for (let s = 0; s < 40; s += 0.25) assert.ok(hinge(s + 0.25) > hinge(s));
  assert.ok(Math.abs(hinge(30) - (30 - Math.log2(1.5) - 1)) < 1e-6);
  assert.ok((hinge(1) - hinge(0)) / 1 < 1 / 2, "cleaning an already typical object earns little (slope 1/3 at 0, 1/2 at 1)");
});

test("E_π η(h) from a value function's knots: P(bits ≥ b) = 2^−b at each knot", () => {
  // A fine-grained badness: bits continuous with P(B ≥ b) = 2^−b, E η(B) = ∫ η(b) ln2 2^−b db.
  let exact = 0;
  for (let b = 0; b < 60; b += 0.001) exact += hinge(b + 0.0005) * Math.LN2 * 2 ** -(b + 0.0005) * 0.001;
  const knots = Array.from({ length: 6001 }, (_, i) => ({ bits: i / 100 }));
  assert.ok(Math.abs(meanHinge(knots) - exact) < 0.01, `${meanHinge(knots)} against ${exact}`);
  assert.ok(exact > 0.5 && exact < 1, `under a bit: ${exact}`);
  // A coarse badness: half the states at 0 bits, half at 1, none rarer.
  assert.ok(Math.abs(meanHinge([{ bits: 0 }, { bits: 1 }]) - 0.5 * hinge(1)) < 1e-12);
});

test("signed bits: the reward less w times the penalty above its own mean; zero-mean penalty on fresh objects", () => {
  const h̄ = meanHinge([{ bits: 0 }, { bits: 1 }, { bits: 2 }, { bits: 3 }]);
  assert.equal(defenceNet(5, 0, 1, h̄), 5 + h̄, "a clean object: a little above the reward");
  assert.ok(Math.abs(defenceNet(5, 10, 1, h̄) - (5 - hinge(10) + h̄)) < 1e-12);
  assert.ok(defenceNet(0, 12, 1, h̄) < 0, "a bad object with no reward is negative");
  assert.equal(defenceNet(5, 10, 0, h̄), 5, "w = 0: the reward alone");
  assert.ok(defenceNet(5, 10, 2, h̄) < defenceNet(5, 10, 1, h̄), "more weight, more penalty");
});
