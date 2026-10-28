/**
 * Open-agent pricing, measurement side: universal codes, PRNG, seeds and the decision estimators,
 * against Grid Lab's published vectors (lib/grid-lab/gridlab/openagents/test_vectors.json, copied to
 * test/pricing-data; test/fixtures/ is gitignored).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GRID, INT, STRING, SplitMix64, componentBits, decisionDeterministic, decisionRandomized, deriveSeed, entropyStats,
  floatBits, gammaBits, hmacSha256, jackknifeEntropy, moveSpace, namingBits, pyFloatRepr, resolveAct, stringBits, toHex,
  type Action, type GridMutator, type MoveSpace,
} from "../src/index.ts";

/** The vectors, with integers of 16+ digits kept exact (as strings): JSON.parse would round them. */
const V = JSON.parse(readFileSync(new URL("./pricing-data/test_vectors.json", import.meta.url), "utf8")
  .replace(/([\[:,]\s*)(\d{16,})(?=\s*[\],}])/g, '$1"$2"'));
const SALT = "gridlab-open-agents-v1";
const inst = GRID.instantiate({ size: 5, symbols: "base10", colours: "rgby" });
/** Grid Lab offers `flatten` (24 mutators); our port has 23. The vectors were made with 24. */
const LAB: MoveSpace = moveSpace(GRID, inst, { nMutators: 24 });
const OURS: MoveSpace = moveSpace(GRID, inst);
const close = (a: number, b: number, tol = 1e-9, what = "") =>
  assert.ok(a === b || Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
type Key = [string, [string, unknown][]];
const actions = (xs: Key[][]): Action[] => xs.map(a => a.map(k => LAB.fromKey(k)));
const num = (x: number | string) => (x === "inf" ? Infinity : (x as number));

// ------------------------------------------------------------------------------------------------
// codes, PRNG, seeds
// ------------------------------------------------------------------------------------------------

test("Elias gamma, the string code and the float code match the vectors", () => {
  for (const [n, b] of Object.entries(V.codes.gamma)) assert.equal(gammaBits(Number(n)), b, `gamma(${n})`);
  for (const [s, b] of Object.entries(V.codes.string)) close(stringBits(s), b as number, 1e-12, `string ${JSON.stringify(s)}`);
  for (const [f, b] of Object.entries(V.codes.float)) close(floatBits(Number(f)), b as number, 1e-12, `float ${f}`);
  assert.throws(() => gammaBits(0));
  assert.equal(gammaBits(2n ** 70n), 141);
});

test("pyFloatRepr follows Python's repr(float)", () => {
  const cases: [number, string][] = [
    [0, "0.0"], [-0, "-0.0"], [1.5, "1.5"], [1e-5, "1e-05"], [123456.789, "123456.789"], [1e16, "1e+16"],
    [1.5e16, "1.5e+16"], [1e15, "1000000000000000.0"], [0.0001, "0.0001"], [0.1, "0.1"], [-2.5e-7, "-2.5e-07"],
    [1 / 3, "0.3333333333333333"], [2 ** 60, "1.152921504606847e+18"], [Infinity, "inf"], [NaN, "nan"], [1e300, "1e+300"],
  ];
  for (const [x, r] of cases) assert.equal(pyFloatRepr(x), r);
});

test("SplitMix64 and its Fisher–Yates permutation match the vectors", () => {
  const r = new SplitMix64(12345);
  assert.deepEqual([r.next(), r.next(), r.next(), r.next()], V.rng.splitmix64_seed_12345_first4.map(BigInt));
  assert.deepEqual(new SplitMix64(1).permutation(8), V.rng.permutation_8_seed_1);
});

test("HMAC-SHA256 matches RFC 4231 and deriveSeed matches the vectors", () => {
  // RFC 4231 test cases 1 and 6 (a key longer than the block)
  assert.equal(toHex(hmacSha256(new Uint8Array(20).fill(0x0b), "Hi There")),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  assert.equal(toHex(hmacSha256(new Uint8Array(131).fill(0xaa), "Test Using Larger Than Block-Size Key - Hash Key First")),
    "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
  assert.equal(deriveSeed(SALT, ["measure", "Grid(5,base10,rgby)", 0, 0]), BigInt(V.seeds["derive_seed('measure', 'Grid(5,base10,rgby)', 0, 0)"]));
  assert.equal(deriveSeed(SALT, ["play", 7, 0]), BigInt(V.seeds["derive_seed('play', 7, 0)"]));
  assert.equal(deriveSeed(new TextEncoder().encode(SALT), ["play", 7n, 0]), BigInt(V.seeds["derive_seed('play', 7, 0)"]));
  assert.notEqual(deriveSeed("another salt", ["play", 7, 0]), deriveSeed(SALT, ["play", 7, 0]));
});

// ------------------------------------------------------------------------------------------------
// the move space
// ------------------------------------------------------------------------------------------------

test("the Grid move space enumerates mutators.py's space (flatten aside) with its keys and alphabets", () => {
  // gridlab: 7,822 moves with flatten's 39; field alphabets from measure.field_alphabets (flatten adds none)
  assert.equal([...OURS.mutators].reduce((s, m) => s + (m as GridMutator).space(inst).length, 0), 7822 - 39);
  const lab: Record<string, number> = { layer: 4, near: 3, pair: 352, line: 11, k: 10, axis: 3, kind: 9, region: 55, move: 8,
    dir: 3, side: 11, colour: 5, pattern: 3, start: 11, style: 4, symbol: 11, key: 3, shift: 5, recipe: 2 };
  assert.deepEqual(Object.fromEntries(OURS.fieldOrder.map(f => [f, OURS.fieldAlphabet(f)])), lab);
  assert.deepEqual([...OURS.fieldOrder], Object.keys(lab));
  const first = OURS.fromKey(["swap_cells", [["layer", "both"], ["near", "next door"], ["pair", [[0, 0], [0, 1]]]]]);
  assert.equal(OURS.rank(first), 0);
  // a region whose only choice is () in mutators.py keeps its place in the key, as []
  const all = OURS.fromKey(["paint", [["kind", "all"], ["region", []], ["colour", 2]]]);
  assert.equal(all.key, '["paint",[["kind","all"],["region",[]],["colour",2]]]');
  assert.deepEqual(all.params, { kind: "all", colour: 2 });
  assert.ok(OURS.rank(all)! > OURS.rank(first)!);
  assert.throws(() => OURS.fromKey(["paint", [["kind", "cell"], ["region", [9, 9]], ["colour", 0]]]));
  assert.throws(() => OURS.fromKey(["flatten", [["kind", "line"], ["region", [0, 0]]]]));
});

test("resolveAct maps wire calls to field-ordered moves and resolves line* to the line it hits", () => {
  const codec = GRID.codec(inst);
  // column 3 has the most blue (colour 2); paint's busiest line is the line with the most of its colour
  const sym = new Uint8Array(25), col = new Uint8Array(25);
  for (let r = 0; r < 5; r++) col[r * 5 + 3] = 2;
  col[0] = 2;
  const g = codec.encode({ size: 5, sym, col }) as string;
  const r = resolveAct(GRID, inst, g, JSON.stringify([["paint", { colour: 2, kind: "line*" }]]));
  assert.ok(r.valid);
  assert.equal(r.action[0].key, '["paint",[["kind","line"],["region",[1,3]],["colour",2]]]');
  // each call is resolved on the value it acts on: once column 3 is painted red, the only blue cell left is
  // (0, 0), so blue's busiest line is row 0 (rows before columns on ties), not column 3
  const two = resolveAct(GRID, inst, g, [["paint", { kind: "line", region: [1, 3], colour: 0 }], ["paint", { kind: "line*", colour: 2 }]]);
  assert.ok(two.valid);
  assert.deepEqual(two.action.map(m => m.items.find(([f]) => f === "region")![1]), [[1, 3], [0, 0]]);
  // majority_line and write resolve too; other mutators pass through
  assert.match(resolveAct(GRID, inst, g, [["majority_line", { kind: "line*" }]]).action[0].key, /"kind","line"\],\["region",\[1,1\]\]/);   // column 1: five reds
  assert.match(resolveAct(GRID, inst, g, [["write", { kind: "line*", symbol: 0 }]]).action[0].key, /"region",\[0,0\]/);
  // invalid acts are the empty action
  for (const bad of ["nope", "[[\"paint\", {}]]", [["flatten", { kind: "all" }]], [["paint", { kind: "cell", region: [7, 7], colour: 0 }]]]) {
    const x = resolveAct(GRID, inst, g, bad);
    assert.ok(!x.valid && x.action.length === 0, String(bad));
  }
  // a valid act that changes nothing keeps its moves (applyCalls would fail it as "no change")
  assert.equal(resolveAct(GRID, inst, g, [["paint", { kind: "cell", region: [0, 1], colour: 0 }]]).action.length, 1);
});

test("Int and string moves keep their parse field order; their spaces are not enumerated", () => {
  const ii = INT.instantiate({ min: 0, max: 9999 });
  const r = resolveAct(INT, ii, 1234, [["set_digit", { digit: 7, place: 2 }]]);
  assert.ok(r.valid);
  assert.equal(r.action[0].key, '["set_digit",[["place",2],["digit",7]]]');
  const sp = moveSpace(INT, ii);
  assert.equal(sp.enumerable, false);
  assert.equal(sp.fieldAlphabet("place"), Infinity);
  const si = STRING.instantiate({ maxLength: 16 });
  const s = resolveAct(STRING, si, "hello", [["swap_chars", { j: 3, i: 0 }]]);
  assert.equal(s.action[0].key, '["swap_chars",[["i",0],["j",3]]]');
  // the generic order: mutator order, then the fields
  const a = sp.move("set_digit", { place: 1, digit: 3 }), b = sp.move("set_digit", { place: 2, digit: 0 });
  assert.ok(sp.compare(a, b) < 0 && sp.compare(b, a) > 0 && sp.compare(a, a) === 0);
  // estimators run on non-enumerable spaces (the set bound uses that order)
  const acts: Action[] = Array.from({ length: 16 }, (_, i) => [sp.move("set_digit", { place: i % 2, digit: 3 })]);
  const d = decisionDeterministic(acts, sp);
  close(d.bits, 1 + 1 / (32 * Math.log(2)), 1e-12, "two equiprobable actions");
  assert.ok(Number.isFinite(d.estimates.set!));
});

// ------------------------------------------------------------------------------------------------
// estimators
// ------------------------------------------------------------------------------------------------

test("the deterministic estimators match the vectors (joint, positional, set, naming, decision, binding)", () => {
  for (const c of V.estimators.filter((e: { actions?: unknown }) => e.actions)) {
    const d = decisionDeterministic(actions(c.actions), LAB, 0.5);
    for (const k of ["joint", "positional", "set", "naming"] as const) close(d.estimates[k]!, num(c[k]), 1e-9, `${c.case} ${k}`);
    close(d.bits, c.decision, 1e-9, `${c.case} decision`);
    assert.equal(d.binding, c.binding, c.case);
  }
});

test("the randomized estimator matches the vectors (jackknife I, plug-in, Miller–Madow, shuffle)", () => {
  const c = V.estimators.find((e: { case: string }) => e.case === "randomized_half");
  const rows = c.actions_by_grid.map((row: Key[][]) => actions(row));
  const d = decisionRandomized(rows, LAB, 0.5, c.shuffles, BigInt(c.shuffle_seed));
  close(d.H_A_given_X, c.H_A_given_X_plugin, 1e-9, "H(A|X)");
  close(d.I_plugin, c.I_plugin, 1e-9, "I plug-in");
  close(d.I_mm, c.I_mm, 1e-9, "I Miller–Madow");
  close(d.I_shuffle, c.I_shuffle, 1e-9, "I shuffle");
  close(d.I_jackknife, c.I_jackknife, 1e-9, "I jackknife");
  close(d.bits, c.decision, 1e-9, "decision");
  assert.equal(d.binding, c.binding);
});

test("the jackknife and Miller–Madow on aabbbcd match (2.38961 bits)", () => {
  const c = V.estimators.find((e: { case: string }) => e.case === "jackknife");
  close(jackknifeEntropy(c.keys), c.jackknife, 1e-12, "jackknife");
  close(jackknifeEntropy([..."aabbbcd"]), 2.38961, 1e-5, "jackknife 2.38961");
  close(entropyStats(c.keys).mm, c.miller_madow, 1e-12, "Miller–Madow");
  // the closed form equals the leave-one-out definition
  const keys = [..."aabbbcdddde"], n = keys.length;
  const H = (xs: string[]) => entropyStats(xs).plugin;
  const loo = n * H(keys) - ((n - 1) / n) * keys.reduce((s, _, i) => s + H(keys.filter((_, j) => j !== i)), 0);
  close(jackknifeEntropy(keys), loo, 1e-12, "closed form");
  assert.equal(jackknifeEntropy(["x"]), 0);
});

test("estimator edge cases: coverage fallback, caps, the set bound needs canonical order", () => {
  assert.equal(componentBits(["a", "b", "c", "d"], 64, 0.5), 6);           // coverage 0 → log2 alphabet
  close(componentBits(["a", "a", "b", "b"], 64, 0.5), 1 + 1 / (8 * Math.log(2)), 1e-12);
  assert.equal(componentBits(["a", "a", "b", "b"], 2, 0.5), 1);            // capped at log2 alphabet
  const m = (r: number, c: number) => LAB.fromKey(["paint", [["kind", "cell"], ["region", [r, c]], ["colour", 0]]]);
  const fwd = decisionDeterministic([[m(0, 0), m(0, 1)], [m(0, 1)], [m(0, 0), m(0, 1)], [m(0, 1)]], LAB);
  assert.ok(Number.isFinite(fwd.estimates.set!));
  const back = decisionDeterministic([[m(0, 1), m(0, 0)], [m(0, 1)], [m(0, 1), m(0, 0)], [m(0, 1)]], LAB);
  assert.equal(back.estimates.set, Infinity);
  const dup = decisionDeterministic([[m(0, 0), m(0, 0)], [m(0, 0)]], LAB);  // not strictly increasing
  assert.equal(dup.estimates.set, Infinity);
  // naming: γ(len + 1) + Σ (log2 #mutators + D)
  close(namingBits([], OURS), 1, 0);
  close(namingBits([m(0, 0)], OURS), 3 + Math.log2(23) + 3 + Math.log2(25) + 2, 1e-12);
  // empty table
  assert.equal(decisionDeterministic([], OURS).bits, 0);
});
