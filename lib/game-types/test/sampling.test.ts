import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, seededRng, type GridValue, type Instantiation, type ObjectTypeDef } from "../src/index.ts";
import { chiCritical, chiSquare, distribution } from "./helpers.ts";

test("seeded rng is deterministic and in range", () => {
  const a = seededRng(7), b = seededRng(7);
  for (let i = 0; i < 100; i++) assert.equal(a.int(1000), b.int(1000));
  const r = seededRng("x");
  for (let i = 0; i < 1000; i++) { const x = r.int(3); assert.ok(x >= 0 && x < 3); }
  assert.ok(r.big(10n ** 40n) < 10n ** 40n);
});

test("grid spawn is uniform per cell and independent of position (χ²)", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "base10", colours: "rgb" }), rng = seededRng("spawn");
  const joint = new Array(30).fill(0), byCell = new Array(9 * 3).fill(0);
  for (let k = 0; k < 6000; k++) {
    const g = GRID.spawn(inst, rng);
    joint[g.sym[0] * 3 + g.col[0]]++;
    for (let i = 0; i < 9; i++) byCell[i * 3 + g.col[i]]++;
  }
  assert.ok(chiSquare(joint) < chiCritical(29), `joint χ² ${chiSquare(joint)}`);
  assert.ok(chiSquare(byCell) < chiCritical(26), `per-cell χ² ${chiSquare(byCell)}`);
});

/** q(x→y) == q(y→x) for every y the proposal can reach from x (exact enumeration). */
function assertSymmetric<V>(type: ObjectTypeDef<V>, inst: Instantiation, x: V, key: (v: V) => string, back: (k: string) => V,
  targets?: readonly string[]) {
  const from = distribution(rng => type.propose(x, inst, rng), key);
  const keys = targets ?? [...from.keys()], step = targets ? 1 : Math.max(1, Math.floor(keys.length / 150));
  let total = 0;
  for (const p of from.values()) total += p;
  for (const k of keys.filter((_, i) => i % step === 0)) {
    const p = from.get(k) ?? 0;
    if (targets) assert.ok(p > 0, `${k} is reachable`);
    const rev = distribution(rng => type.propose(back(k), inst, rng), key).get(key(x)) ?? 0;
    assert.ok(Math.abs(p - rev) < 1e-12, `${inst.key}: q(${key(x)}→${k}) = ${p} but q(back) = ${rev}`);
    assert.ok(type.codec(inst).isValid(type.codec(inst).encode(back(k))));
  }
  assert.ok(Math.abs(total - 1) < 1e-9);
}

test("grid proposals are symmetric", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "base10", colours: "rgb" }), codec = GRID.codec(inst);
  const key = (g: GridValue) => codec.encode(g) as string, back = (k: string) => codec.decode(k);
  const rng = seededRng("sym");
  for (let k = 0; k < 3; k++) assertSymmetric(GRID, inst, GRID.spawn(inst, rng), key, back);
});

test("random walks stay legal and never mutate their input", () => {
  for (const type of [GRID] as ObjectTypeDef<unknown>[]) {
    for (const args of type.representatives().slice(0, 12)) {
      const inst = type.instantiate(args), codec = type.codec(inst), rng = seededRng(`walk:${inst.key}`);
      let v = type.spawn(inst, rng);
      for (let i = 0; i < 300; i++) {
        const before = codec.encode(v), next = type.propose(v, inst, rng);
        assert.equal(codec.encode(v), before);
        assert.ok(codec.isValid(codec.encode(next)), `${inst.key} step ${i}`);
        if (codec.encode(next) !== before) {
          const w = type.callWork(v, next, { id: "propose", params: {} }, inst);
          assert.ok(Number.isFinite(w) && w > 0, `${inst.key} step ${i}: a change has a positive elementary cost (${w})`);
        }
        v = next;
      }
    }
  }
});

test("layerBits: the whole object's information (the read bound)", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "cards", colours: "rgby" });
  assert.deepEqual(GRID.layerBits(inst), { symbol: 9 * Math.log2(52), colour: 18 });
});
