/**
 * Shelter targeting (v1's `objectSelection: "shelter"`, restored; v1-audit.md table row 19, archive lib/world.ts
 * pickObject): an opportunity's object is drawn with weight 1/(1 + σ⁺), σ the object's salience (every seat's bits on it
 * added up), so salient objects are hit a little less; never weighted towards salience. "uniform" (the default) is
 * every object alike.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickObject, shelterWeight } from "../src/index.ts";

/** A deterministic unit stream for the draws. */
const units = (xs: number[]) => { let i = 0; return { unit: () => xs[i++ % xs.length]! }; };
const lcg = (seed: number) => { let s = seed >>> 0; return { unit: () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }; };

test("the shelter weight is 1/(1 + σ), σ below 0 counted as 0", () => {
  assert.equal(shelterWeight(0), 1);
  assert.equal(shelterWeight(3), 1 / 4);
  assert.equal(shelterWeight(-5), 1);
});

test("uniform: every object alike, the draw's index as v1 took it", () => {
  assert.equal(pickObject([0, 10, 100], "uniform", units([0])), 0);
  assert.equal(pickObject([0, 10, 100], "uniform", units([0.5])), 1);
  assert.equal(pickObject([0, 10, 100], "uniform", units([0.999])), 2);
  const n = new Array(3).fill(0), r = lcg(1);
  for (let i = 0; i < 30000; i++) n[pickObject([0, 10, 100], "uniform", r)]++;
  for (const c of n) assert.ok(Math.abs(c / 10000 - 1) < 0.05, `${n}`);
});

test("shelter: objects drawn in proportion to 1/(1 + σ⁺), the salient ones less, never more", () => {
  const sal = [0, 1, 3, -2], w = sal.map(shelterWeight), total = w.reduce((a, b) => a + b, 0);
  const n = new Array(sal.length).fill(0), r = lcg(7), runs = 60000;
  for (let i = 0; i < runs; i++) n[pickObject(sal, "shelter", r)]++;
  sal.forEach((_, i) => assert.ok(Math.abs(n[i] / runs - w[i]! / total) < 0.01, `${i}: ${n[i] / runs} against ${w[i]! / total}`));
  assert.ok(n[2] < n[1] && n[1] < n[0]);
});

test("one object, or none salient: shelter is uniform", () => {
  assert.equal(pickObject([42], "shelter", units([0.9])), 0);
  const n = new Array(4).fill(0), r = lcg(3);
  for (let i = 0; i < 40000; i++) n[pickObject([0, 0, 0, 0], "shelter", r)]++;
  for (const c of n) assert.ok(Math.abs(c / 10000 - 1) < 0.05, `${n}`);
});

test("no objects: no pick", () => assert.equal(pickObject([], "shelter", units([0.5])), undefined));
