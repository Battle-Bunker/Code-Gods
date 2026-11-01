/**
 * Every object is an independent universe (product rule, .agents/memory/code-gods-product.md): an object's utility is a
 * pure function of that object's own value. By construction the host evaluator takes one wire value; this test checks
 * that no family's card keeps state across calls, on every playable shape: each family (a sampled parameter set) scores a
 * set of values the same in any order and interleaved with other families' calls on other values.
 *
 * What would break: a card with a module-level cache, counter or randomness that leaks one object's evaluation into
 * another's, or one that reads anything but its argument.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { objectType, type ObjectValue } from "@workspace/game-types";
import { available, context, evaluator, familiesFor, playableInstantiations } from "../src/index.ts";

let seed = 12345;
const rng = { int: (b: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % b; }, big: (b: bigint) => BigInt(rng.int(Number(b))) };

test("an object's utility depends only on that object's own value, for every family on every playable shape", () => {
  // Every playable shape of every object type (Grid sizes × symbols × colours, Int ranges, string lengths).
  const shapes = ["Grid", "Int", "string"].flatMap(t => [...playableInstantiations(t)]);
  let checked = 0;
  for (const inst of shapes) {
    const T = objectType(inst.objectType), codec = T.codec(inst), ctx = context(inst);
    const values = Array.from({ length: 8 }, () => codec.encode(T.spawn(inst, rng)) as ObjectValue);
    const draws = familiesFor(inst.objectType).filter(f => available(f, inst).ok).map(f => ({ familyId: f.id, params: f.sample(rng, ctx) }));
    const forward = draws.map(d => values.map(v => JSON.stringify(evaluator(d, inst)(v))));
    // Reverse order, each call interleaved with every other family on another value.
    for (const [i, d] of draws.entries()) {
      for (let t = values.length - 1; t >= 0; t--) {
        const other = draws[(i + t + 1) % draws.length];
        evaluator(other, inst)(values[(t + 3) % values.length]);
        assert.equal(JSON.stringify(evaluator(d, inst)(values[t])), forward[i][t], `${inst.key} ${d.familyId}: same ordinal whatever was evaluated before`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked} evaluations`);
});
