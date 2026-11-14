/**
 * probeFutility (src/pricing/futility.ts): summon-time warnings for agents whose acts mostly fail in a world, because
 * every object gets the same result (constant), a second application changes nothing (idempotent), or nothing ever
 * changes (identity), with the success rate of two passes over a sample world.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, probeFutility, seededRng, type GridValue, type RunActs } from "../src/index.ts";

const inst = GRID.instantiate({ size: 4, symbols: "base10", colours: "mono" }), codec = GRID.codec(inst);
const boards = (seed: string) => { const rng = seededRng(seed); return Array.from({ length: 8 }, () => codec.encode(GRID.spawn(inst, rng)) as string); };
const SAMPLE = boards("futility-sample");
const agent = (f: (g: GridValue) => unknown, usedRandom = false): RunActs =>
  value => ({ calls: JSON.stringify(f(codec.decode(value) as GridValue)), usedRandom });
const probe = (run: RunActs, values = SAMPLE) => probeFutility(run, inst, values, { salt: "test" });
/** Every cell shows the same symbol: one board, whatever the input. */
const writeAll = (symbol: number) => [["write", { kind: "all", symbol }]];

test("a constant agent: only one object can hold its value, every other act collides", async () => {
  const p = await probe(agent(() => writeAll(7)));
  assert.equal(p.constant, true);
  assert.equal(p.identity, false);
  // Pass one: one object takes 7, seven collide; pass two: the holder changes nothing, the others collide again.
  assert.equal(p.firstPass, 1 / 8);
  assert.equal(p.secondPass, 0);
  assert.equal(p.successRate, 1 / 16);
  assert.match(p.warnings.join(" "), /only one object can ever hold/);
});

test("an idempotent agent: it acts once per object, then wastes acts", async () => {
  const p = await probe(agent(() => [["sort_line", { line: [0, 0], dir: 1 }]]));
  assert.equal(p.idempotent, true);
  assert.equal(p.constant, false);
  assert.equal(p.secondPass, 0);
  assert.match(p.warnings.join(" "), /acts once per object, then wastes acts/);
});

test("an identity agent: it never changes an object", async () => {
  const p = await probe(agent(g => [["write", { kind: "cell", region: [0, 0], symbol: g.sym[0] }]]));
  assert.equal(p.identity, true);
  assert.equal(p.successRate, 0);
  assert.match(p.warnings.join(" "), /never changes an object/);
});

test("a skipper is not futile: skips are choices, left out of the success rate and every flag", async () => {
  const always = await probe(agent(() => []));
  assert.deepEqual([always.identity, always.constant, always.idempotent, always.successRate], [false, false, false, 1]);
  assert.deepEqual(always.warnings, []);
  // It acts once on an object, then skips its own results: the ideal incremental agent, not an idempotent waster.
  const once = await probe(agent(g => (g.sym[0] === 0 ? [] : [["write", { kind: "cell", region: [0, 0], symbol: 0 }]])));
  assert.equal(once.idempotent, false);
  assert.equal(once.successRate, 1);
  assert.deepEqual(once.warnings, []);
});

test("a working agent: no warning, every act succeeds", async () => {
  const p = await probe(agent(() => [["shift_line", { layer: "both", line: [0, 0], k: 1 }]]));
  assert.deepEqual([p.constant, p.idempotent, p.identity], [false, false, false]);
  assert.equal(p.successRate, 1);
  assert.deepEqual(p.warnings, []);
});

test("a randomized agent is not called constant or idempotent: its next act may differ", async () => {
  const p = await probe(agent(() => writeAll(7), true));
  assert.equal(p.deterministic, false);
  assert.deepEqual([p.constant, p.idempotent], [false, false]);
  // The sample world still shows the collisions it will meet.
  assert.ok(p.successRate < 0.5);
  assert.match(p.warnings.join(" "), /of its acts succeed/);
});

test("a deterministic agent is run once per distinct value", async () => {
  let runs = 0;
  const counting: RunActs = () => { runs++; return { calls: JSON.stringify([["sort_line", { line: [0, 0], dir: 1 }]]), usedRandom: false }; };
  await probe(counting);
  // Each sample value once, then each distinct result once (the second pass reuses both).
  assert.ok(runs <= 2 * SAMPLE.length, `${runs} runs`);
});
