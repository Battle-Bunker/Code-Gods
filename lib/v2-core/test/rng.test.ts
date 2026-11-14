import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "../src/rng.ts";
import { hashHex, canonicalJson } from "../src/hash.ts";

test("streams are deterministic and depend on every part of their name", () => {
  const a = rng("v2", "k", 1), b = rng("v2", "k", 1), c = rng("v2", "k", 2);
  const xs = Array.from({ length: 8 }, () => a.uint32());
  assert.deepEqual(Array.from({ length: 8 }, () => b.uint32()), xs);
  assert.notDeepEqual(Array.from({ length: 8 }, () => c.uint32()), xs);
  // A pinned value: any change to the generator shows here (and would change every artefact).
  assert.equal(rng("pin").uint32(), PINNED);
});
const PINNED = 2983596313;

test("below is uniform and chance(bits) has probability 2^−bits", () => {
  const r = rng("uniform");
  const counts = [0, 0, 0];
  for (let i = 0; i < 30_000; i++) counts[r.below(3)]!++;
  for (const c of counts) assert.ok(Math.abs(c - 10_000) < 400);
  let hits = 0;
  for (let i = 0; i < 100_000; i++) if (r.chance(1.5)) hits++;
  assert.ok(Math.abs(hits / 100_000 - 2 ** -1.5) < 0.006);
});

test("canonical JSON sorts keys; hashes are stable", () => {
  assert.equal(canonicalJson({ b: 1, a: [2n, { d: 1, c: 2 }] }), '{"a":["2",{"c":2,"d":1}],"b":1}');
  assert.equal(hashHex("abc"), "e71fa2190541574b");
});
