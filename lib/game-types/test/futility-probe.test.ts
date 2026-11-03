/**
 * probeFutility (src/pricing/futility.ts): summon-time warnings for agents whose acts mostly fail in a world, because
 * every object gets the same result (constant), a second application changes nothing (idempotent), or nothing ever
 * changes (identity), with the success rate of two passes over a sample world.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INT, probeFutility, type RunActs } from "../src/index.ts";

const inst = INT.instantiate({ min: -1000, max: 1000 });
const SAMPLE = [3, 18, -250, 77, 404, 999, -1, 12];
const agent = (f: (x: number) => unknown, usedRandom = false): RunActs => value => ({ calls: JSON.stringify(f(value as number)), usedRandom });
const probe = (run: RunActs, values = SAMPLE) => probeFutility(run, inst, values, { salt: "test" });

test("a constant agent: only one object can hold its value, every other act collides", async () => {
  const p = await probe(agent(() => [["set", { value: 7 }]]));
  assert.equal(p.constant, true);
  assert.equal(p.identity, false);
  // Pass one: one object takes 7, seven collide; pass two: the holder changes nothing, the others collide again.
  assert.equal(p.firstPass, 1 / 8);
  assert.equal(p.secondPass, 0);
  assert.equal(p.successRate, 1 / 16);
  assert.match(p.warnings.join(" "), /only one object can ever hold/);
});

test("an idempotent agent: it acts once per object, then wastes acts", async () => {
  const p = await probe(agent(() => [["round", { places: 2 }]]), [3, 180, -251, 774, 404, 990, -12, 125]);
  assert.equal(p.idempotent, true);
  assert.equal(p.constant, false);
  assert.equal(p.secondPass, 0);
  assert.match(p.warnings.join(" "), /acts once per object, then wastes acts/);
});

test("an identity agent: it never changes an object", async () => {
  const p = await probe(agent(() => []));
  assert.equal(p.identity, true);
  assert.equal(p.successRate, 0);
  assert.match(p.warnings.join(" "), /never changes an object/);
});

test("a working agent: no warning, every act succeeds", async () => {
  const p = await probe(agent(() => [["add", { k: 1 }]]));
  assert.deepEqual([p.constant, p.idempotent, p.identity], [false, false, false]);
  assert.equal(p.successRate, 1);
  assert.deepEqual(p.warnings, []);
});

test("a randomized agent is not called constant or idempotent: its next act may differ", async () => {
  const p = await probe(agent(() => [["set", { value: 7 }]], true));
  assert.equal(p.deterministic, false);
  assert.deepEqual([p.constant, p.idempotent], [false, false]);
  // The sample world still shows the collisions it will meet.
  assert.ok(p.successRate < 0.5);
  assert.match(p.warnings.join(" "), /of its acts succeed/);
});

test("a deterministic agent is run once per distinct value", async () => {
  let runs = 0;
  const counting: RunActs = value => { runs++; return { calls: JSON.stringify([["round", { places: 1 }]]), usedRandom: false }; };
  await probe(counting);
  // Each sample value once, then each distinct result once (the second pass reuses both).
  assert.ok(runs <= 2 * SAMPLE.length, `${runs} runs`);
});
