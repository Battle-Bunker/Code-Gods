/**
 * Open-agent pricing, measurement side: universal codes, PRNG and seeds,
 * against Grid Lab's published vectors (archive/engine-v1:lib/grid-lab/gridlab/openagents/test_vectors.json, copied to
 * test/pricing-data; test/fixtures/ is gitignored).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SplitMix64, deriveSeed, floatBits, gammaBits, hmacSha256, pyFloatRepr, stringBits, toHex } from "../src/index.ts";

/** The vectors, with integers of 16+ digits kept exact (as strings): JSON.parse would round them. */
const V = JSON.parse(readFileSync(new URL("./pricing-data/test_vectors.json", import.meta.url), "utf8")
  .replace(/([\[:,]\s*)(\d{16,})(?=\s*[\],}])/g, '$1"$2"'));
const SALT = "gridlab-open-agents-v1";
const close = (a: number, b: number, tol = 1e-9, what = "") =>
  assert.ok(a === b || Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

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

