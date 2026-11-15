import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { headline, readDepth, upperSet } from "../src/pmi-estimate.ts";
import { pairIndex, pairPmi, pmiClass, type PmiTable } from "../src/pmi.ts";
import { PMI_TABLES } from "../src/pmi.gen.ts";

// Rules whose bits are −log2 of a uniform: P(bits ≥ t) = 2^−t exactly.
function sample(n: number, seed: string) {
  const r = rng("pmi-test", seed);
  const u = Float32Array.from({ length: n }, () => -Math.log2(1 - r.unit()));
  const v = Float32Array.from({ length: n }, () => -Math.log2(1 - r.unit()));
  return { u, v, w: new Float64Array(n).fill(1) };
}
const read = (a: Float32Array, b: Float32Array, w: Float64Array, t: number) =>
  readDepth(t, upperSet(a, w, t), upperSet(b, w, t), w, w.length, w.length, 30);

test("independent rules read PMI ≈ 0; the same rule reads PMI = its bits; thin joint sets are not read", () => {
  const { u, v, w } = sample(400_000, "a");
  const ind = read(u, v, w, 4);
  assert.ok(Math.abs(ind.pmi!) < 0.15, `independent PMI ${ind.pmi}`);
  assert.ok(ind.se! > 0 && ind.se! < 0.1);
  const same = read(u, u, w, 6);
  assert.ok(Math.abs(same.pmi! - same.bitsA!) < 1e-9 && Math.abs(same.bitsA! - 6) < 0.15);
  // Joint at 2^−20 of 400k draws: under 30 effective draws.
  assert.equal(read(u, v, w, 10).pmi, null);
  assert.equal(headline([read(u, v, w, 10), same]), same.pmi);
  assert.equal(headline([read(u, v, w, 10)]), null);
});

test("mutually exclusive rules: no joint draws where independence expects many reads as an upper bound, counted in the headline", () => {
  const { u, w } = sample(200_000, "c");
  const neg = Float32Array.from(u, x => (x >= 4 ? 0 : 4 + x));   // at least 4 bits exactly where u is not
  const r = read(u, neg, w, 4);
  assert.equal(r.pmi, null);
  assert.ok(r.bound !== null && r.bound < -3.3, `bound ${r.bound}`);
  assert.equal(headline([r]), r.bound);
  // A thin pair (independent at 10 bits: 2^−20 of 200k draws) is no exclusion.
  const { v } = sample(200_000, "d");
  assert.equal(read(u, v, w, 10).bound, null);
});

test("weights are self-normalised: duplicating every draw with half the weight changes nothing", () => {
  const { u, v } = sample(50_000, "b");
  const w = new Float64Array(u.length).fill(3);
  const a = read(u, v, w, 3);
  const u2 = Float32Array.from([...u, ...u]), v2 = Float32Array.from([...v, ...v]), w2 = new Float64Array(2 * u.length).fill(1.5);
  const t = 3, b = readDepth(t, upperSet(u2, w2, t), upperSet(v2, w2, t), w2, w2.reduce((x, y) => x + y, 0), w2.reduce((x, y) => x + y * y, 0), 30);
  const W = w.reduce((x, y) => x + y, 0), W2 = w.reduce((x, y) => x + y * y, 0);
  const a2 = readDepth(t, upperSet(u, w, t), upperSet(v, w, t), w, W, W2, 30);
  assert.ok(Math.abs(a2.pmi! - b.pmi!) < 1e-9);
  assert.ok(a.pmi !== null);
});

test("classes: independent within 1 bit, mild to 2, aligned and anti-aligned beyond", () => {
  assert.equal(pmiClass(0.4), "independent");
  assert.equal(pmiClass(-1), "independent");
  assert.equal(pmiClass(1.5), "mild");
  assert.equal(pmiClass(-1.5), "mild-anti");
  assert.equal(pmiClass(2.5), "aligned");
  assert.equal(pmiClass(-2.01), "anti-aligned");
});

test("pairPmi is symmetric, reads the upper triangle, and is null for unknown, same or unread pairs", () => {
  const t: Record<string, PmiTable> = { v: { rules: ["a/x", "b/y", "c/z"], depths: [4], draws: 1, ess: 1, pmi: [0.5, 3.2, null], classes: "iA." } };
  assert.equal(pairIndex(3, 0, 1), 0); assert.equal(pairIndex(3, 0, 2), 1); assert.equal(pairIndex(3, 1, 2), 2);
  assert.deepEqual(pairPmi("v", "a/x", "c/z", t), { pmi: 3.2, class: "aligned" });
  assert.deepEqual(pairPmi("v", "c/z", "a/x", t), { pmi: 3.2, class: "aligned" });
  assert.deepEqual(pairPmi("v", "b/y", "a/x", t), { pmi: 0.5, class: "independent" });
  assert.equal(pairPmi("v", "b/y", "c/z", t), null);
  assert.equal(pairPmi("v", "a/x", "a/x", t), null);
  assert.equal(pairPmi("v", "a/x", "q/q", t), null);
  assert.equal(pairPmi("w", "a/x", "b/y", t), null);
});

test("the generated table is well formed: one entry and one class per pair, classes agree with the values", () => {
  for (const t of Object.values(PMI_TABLES)) {
    const n = t.rules.length;
    assert.equal(new Set(t.rules).size, n);
    assert.equal(t.pmi.length, (n * (n - 1)) / 2);
    assert.equal(t.classes.length, t.pmi.length);
    t.pmi.forEach((x, k) => {
      const c = t.classes[k]!;
      if (x === null) assert.equal(c, ".");
      else assert.equal({ i: "independent", m: "mild", n: "mild-anti", A: "aligned", X: "anti-aligned" }[c], pmiClass(x));
    });
  }
});
