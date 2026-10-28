import assert from "node:assert/strict";
import { test } from "node:test";
import { GRID, INT, STRING, seededRng, type GridValue, type Instantiation, type ObjectTypeDef } from "../src/index.ts";
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

test("Int and string spawn are uniform (χ²)", () => {
  const rng = seededRng("spawn2");
  const ints = new Array(13).fill(0), small = INT.instantiate({ min: -3, max: 9 });
  for (let k = 0; k < 13000; k++) ints[INT.spawn(small, rng) + 3]++;
  assert.ok(chiSquare(ints) < chiCritical(12));
  const strs = new Map<string, number>(), one = STRING.instantiate({ maxLength: 1 });
  for (let k = 0; k < 129 * 60; k++) { const s = STRING.spawn(one, rng); strs.set(s, (strs.get(s) ?? 0) + 1); }
  assert.equal(strs.size, 129);
  assert.ok(chiSquare([...strs.values()]) < chiCritical(128));
  const lengths = [0, 0, 0], two = STRING.instantiate({ maxLength: 2 });
  for (let k = 0; k < 20000; k++) lengths[STRING.spawn(two, rng).length]++;
  assert.ok(lengths[2] > 19700, "almost every string has the full length");
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
    const rev = distribution(rng => type.propose(back(k), inst, rng), key).get(key(x)) ?? 0;
    assert.ok(Math.abs(p - rev) < 1e-12, `${inst.key}: q(${key(x)}→${k}) = ${p} but q(back) = ${rev}`);
    assert.ok(type.codec(inst).isValid(type.codec(inst).encode(back(k))));
  }
  assert.ok(Math.abs(total - 1) < 1e-9);
}

test("Int proposals are symmetric", () => {
  for (const [min, max] of [[0, 9], [-3, 12], [0, 0], [5, 6], [0, 1000]] as const) {
    const inst = INT.instantiate({ min, max });
    const xs = max - min < 40 ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [min, 7, 500, 999, max];
    for (const x of xs) assertSymmetric(INT, inst, x, String, Number);
  }
});

test("string proposals are symmetric", () => {
  const one = STRING.instantiate({ maxLength: 1 });
  for (const x of ["", "a", "\u0000", "\u007f"]) assertSymmetric(STRING, one, x, s => s, s => s);
  // Interior lengths, where insert and delete balance (and "aa" → "a" has two deletions): spot targets,
  // since each exact distribution enumerates all 16513 independence draws.
  const two = STRING.instantiate({ maxLength: 2 });
  assertSymmetric(STRING, two, "a", s => s, s => s, ["", "aa", "ba", "b", "xy"]);
  assertSymmetric(STRING, two, "aa", s => s, s => s, ["a", "ab", "zz"]);
});

test("grid proposals are symmetric", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "base10", colours: "rgb" }), codec = GRID.codec(inst);
  const key = (g: GridValue) => codec.encode(g) as string, back = (k: string) => codec.decode(k);
  const rng = seededRng("sym");
  for (let k = 0; k < 3; k++) assertSymmetric(GRID, inst, GRID.spawn(inst, rng), key, back);
});

test("random walks stay legal and never mutate their input", () => {
  for (const type of [GRID, INT, STRING] as ObjectTypeDef<unknown>[]) {
    for (const args of type.representatives().slice(0, 12)) {
      const inst = type.instantiate(args), codec = type.codec(inst), rng = seededRng(`walk:${inst.key}`);
      let v = type.spawn(inst, rng);
      for (let i = 0; i < 300; i++) {
        const before = codec.encode(v), next = type.propose(v, inst, rng);
        assert.equal(codec.encode(v), before);
        assert.ok(codec.isValid(codec.encode(next)), `${inst.key} step ${i}`);
        const bits = type.changedBits(v, next, inst), total = type.layerBits(inst);
        for (const layer of Object.keys(bits)) assert.ok(bits[layer] >= 0 && bits[layer] <= total[layer] + 1e-9, `${inst.key} ${layer}`);
        v = next;
      }
    }
  }
});

test("changedBits and layerBits", () => {
  const inst = GRID.instantiate({ size: 3, symbols: "cards", colours: "rgby" }), rng = seededRng(1);
  const g = GRID.spawn(inst, rng), h = { ...g, sym: g.sym.slice(), col: g.col.slice() };
  h.sym[0] = (h.sym[0] + 1) % 52; h.col[4] = (h.col[4] + 1) % 4; h.col[5] = (h.col[5] + 1) % 4;
  assert.deepEqual(GRID.changedBits(g, h, inst), { symbol: Math.log2(52), colour: 4 });
  assert.deepEqual(GRID.layerBits(inst), { symbol: 9 * Math.log2(52), colour: 18 });
  const i = INT.instantiate({ min: 0, max: 9999 });
  assert.deepEqual(INT.changedBits(5, 6, i), { value: 2 });
  assert.deepEqual(INT.layerBits(i), { value: 14 });
  assert.ok(Math.abs(STRING.layerBits(STRING.instantiate({ maxLength: 0 })).text) < 1e-9);
  assert.ok(Math.abs(STRING.layerBits(STRING.instantiate({ maxLength: 1 })).text - Math.log2(129)) < 1e-9);
});
