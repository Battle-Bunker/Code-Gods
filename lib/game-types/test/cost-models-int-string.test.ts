/**
 * Int and string under cost models (src/int/index.ts, src/string/index.ts; docs/mutation-cost-design.md §4.3, §5.2,
 * §5.5): "set-v1" (today's prices, noise and cache keys, which must not move by one bit) and "distance-v1".
 *
 * Every expectation is derived by hand in the comment beside it, from
 *   w = ℓ_which + ℓ_where + argument bits + erased bits,      energy C = W + 0.05·W².
 *
 * Int (ℓ_which = 1: add or multiply), on the signed 32-bit range (P = 10 places, ℓ_where = log2 10 = 3.3219):
 *   a digit add d·10ᵖ:  1 + 3.3219 + λ·|d|,  λ = 1.58491 (the slider's Kraft root over the signed digits ±1 … ±9)
 *   ×m:                 1 + λ×·log2 |m|,      λ× = 2.18529 (2·(ζ(λ×) − 1) = 1)
 * string (ℓ_which = log2 3 = 1.58496), on maxLength L:
 *   substitute  log2 3 + log2 L + log2 127        insert  log2 3 + log2(L + 1) + 7        delete  log2 3 + log2 L + 7
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COST_MODELS, INT, MAGNITUDE_RATE, MAX_MULTIPLIER, NOISE_VERSION, STRING, addWork, changeCost, digitAddCost, digitWork,
  flatGenerator, intCostTable, intDigitGenerator, kraftRate, magnitudeBits, multiplyCost, multiplyWork, noise, noiseStep,
  noiseVersion, seededRng, sha256, signedDigitWork, signedDigits, stringCostTable, stringElementaryCosts, zeta,
  type CostModel, type Instantiation, type ObjectTypeDef, type TypeArgs,
} from "../src/index.ts";
import { placesOf } from "../src/int/mutators.ts";
import { applyCalls } from "../src/mutators.ts";

const D: CostModel = "distance-v1", S1: CostModel = "set-v1";
const L3 = Math.log2(3);
/** λ of a signed digit and λ× of a multiplier: the roots themselves (their values are checked below: 1.584914, 2.185285). */
const LAM = kraftRate([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k])), LAMX = MAGNITUDE_RATE;
const near = (a: number, b: number, tol: number, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
const i32 = INT.instantiate({ min: -2147483648, max: 2147483647 }), i4 = INT.instantiate({ min: 0, max: 9999 }), i3 = INT.instantiate({ min: 0, max: 999 });
const INTS: Instantiation[] = INT.representatives().map((a: TypeArgs) => INT.instantiate(a));
const STRINGS: Instantiation[] = STRING.representatives().map((a: TypeArgs) => STRING.instantiate(a));
const str = (maxLength: number) => STRING.instantiate({ maxLength });

function act<V>(type: ObjectTypeDef<V>, inst: Instantiation, x: unknown, calls: unknown[], model?: CostModel) {
  return model === undefined ? applyCalls(type, inst, x as never, JSON.stringify(calls)) : applyCalls(type, inst, x as never, JSON.stringify(calls), model);
}
function work<V>(type: ObjectTypeDef<V>, inst: Instantiation, x: unknown, calls: unknown[], model?: CostModel): number {
  const out = act(type, inst, x, calls, model);
  assert.ok(out.ok, `${JSON.stringify(calls)} on ${JSON.stringify(x)}: ${out.ok ? "" : out.reason}`);
  return out.cost.work;
}
const intWork = (inst: Instantiation, x: number, calls: unknown[], model?: CostModel) => work(INT, inst, x, calls, model);
const strWork = (inst: Instantiation, x: string, calls: unknown[], model?: CostModel) => work(STRING, inst, x, calls, model);

// ------------------------------------------------------------------------------------------------
// which models
// ------------------------------------------------------------------------------------------------

test("Int and string offer set-v1 and distance-v1, and no other model", () => {
  for (const [type, insts] of [[INT, INTS], [STRING, STRINGS]] as const) for (const inst of insts) {
    assert.deepEqual(COST_MODELS.filter(m => type.supportsCostModel!(inst, m)), ["set-v1", "distance-v1"], inst.key);
  }
});

// ------------------------------------------------------------------------------------------------
// set-v1 must not move: the closed forms of before cost models
// ------------------------------------------------------------------------------------------------

/** int/index.ts before cost models, verbatim. */
const oldDigitAddCost = (inst: Instantiation): number => 1 + Math.log2(placesOf(inst)) + Math.log2(18);
function oldIntCallWork(a: number, b: number, call: { id: string; params: unknown }, inst: Instantiation): number {
  if (call.id === "multiply") return multiplyCost((call.params as { m: number }).m);
  const { min, max } = inst.args as { min: number; max: number }, W = max - min + 1, d = b - a;
  const digits = Math.min(...[d, d - W, d + W].map(signedDigits)) * oldDigitAddCost(inst);
  const m = a !== 0 ? b / a : 0;
  const mult = Number.isInteger(m) && Math.abs(m) >= 2 && 3 + Math.log2(Math.abs(m)) < digits ? multiplyCost(m) : Infinity;
  return Math.min(digits, mult);
}
/** string/index.ts before cost models, verbatim. */
function oldStringCosts(inst: Instantiation): { set: number; insert: number; delete: number } {
  const op = Math.log2(3), at = Math.log2((inst.args.maxLength as number) + 1);
  return { set: op + at + 14, insert: op + at + 7, delete: op + at + 7 };
}
/** string/index.ts callWork before cost models, verbatim, at the prices `w`. */
function oldEditWork(a: string, b: string, w: { set: number; insert: number; delete: number }): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ea = a.length, eb = b.length;
  while (ea > i && eb > i && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const x = a.slice(i, ea), y = b.slice(i, eb);
  let prev = new Float64Array(y.length + 1), cur = new Float64Array(y.length + 1);
  for (let k = 0; k <= y.length; k++) prev[k] = k * w.insert;
  for (let r = 1; r <= x.length; r++) {
    cur[0] = r * w.delete;
    for (let k = 1; k <= y.length; k++) {
      const keep = prev[k - 1] + (x[r - 1] === y[k - 1] ? 0 : w.set);
      cur[k] = Math.min(keep, prev[k] + w.delete, cur[k - 1] + w.insert);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[y.length];
}
/** The weighted edit distance, the plain whole-table DP (no prefix or suffix trimming): an independent check. */
function editWork(a: string, b: string, w: { set: number; insert: number; delete: number }): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, r) => Array.from({ length: b.length + 1 }, (_, k) => (r === 0 ? k * w.insert : k === 0 ? r * w.delete : 0)));
  for (let r = 1; r <= a.length; r++) for (let k = 1; k <= b.length; k++)
    d[r][k] = Math.min(d[r - 1][k - 1] + (a[r - 1] === b[k - 1] ? 0 : w.set), d[r - 1][k] + w.delete, d[r][k - 1] + w.insert);
  return d[a.length][b.length];
}

test("set-v1 regression: digitAddCost and stringElementaryCosts are the old closed forms, to the last bit", () => {
  for (const inst of INTS) {
    assert.equal(digitAddCost(inst), oldDigitAddCost(inst), inst.key);
    for (let d = 1; d <= 9; d++) for (const s of [1, -1]) {
      assert.equal(digitWork(inst, s * d), oldDigitAddCost(inst), `${inst.key} ±${d}`);
      assert.equal(digitWork(inst, s * d, S1), oldDigitAddCost(inst), `${inst.key} ±${d} set-v1`);
    }
  }
  for (let m = 2; m <= 3000; m++) { assert.equal(multiplyWork(m), multiplyCost(m)); assert.equal(multiplyWork(-m, S1), multiplyCost(m)); }
  // by hand: ×7 = 1 (op) + 1 (sign) + log2 7 + 1 = 5.807; ×12 = 2 + 2·(1 + 1) + (log2 3 + 1) = 8.585
  near(multiplyCost(7), 5.807, 1e-3);
  near(multiplyCost(12), 8.585, 1e-3);
  for (const inst of STRINGS) {
    assert.deepEqual(stringElementaryCosts(inst), oldStringCosts(inst), inst.key);
    assert.deepEqual(stringElementaryCosts(inst, S1), oldStringCosts(inst), `${inst.key} set-v1`);
  }
  // by hand, maxLength 32: log2 3 + log2 33 = 1.58496 + 5.04439 = 6.62936; set + 14 = 20.629, insert and delete + 7 = 13.629
  near(stringElementaryCosts(str(32)).set, 20.629, 1e-3);
  near(stringElementaryCosts(str(32)).insert, 13.629, 1e-3);
});

test("set-v1 regression: Int and string callWork (model omitted, and \"set-v1\") are the old formulas on random pairs", () => {
  let pairs = 0;
  for (const inst of INTS) {
    const rng = seededRng(`int set-v1|${inst.key}`), { min, max } = inst.args as { min: number; max: number };
    if (min === max) continue;
    for (let t = 0; t < 400; t++) {
      const a = INT.spawn(inst, rng);
      let b = t % 4 === 0 ? a * (2 + rng.int(9)) * (rng.int(2) ? 1 : -1) : t % 4 === 1 ? a + (1 + rng.int(9)) * 10 ** rng.int(placesOf(inst)) : INT.spawn(inst, rng);
      if (b < min || b > max || b === a) b = INT.spawn(inst, rng);
      if (b === a) continue;
      for (const call of [{ id: "add", params: { k: b - a } }, { id: "multiply", params: { m: 2 + rng.int(40) } }]) {
        const old = oldIntCallWork(a, b, call, inst);
        assert.equal(INT.callWork(a, b, call, inst), old, `${inst.key} ${a} → ${b} (model omitted)`);
        assert.equal(INT.callWork(a, b, call, inst, S1), old, `${inst.key} ${a} → ${b} set-v1`);
        pairs++;
      }
    }
  }
  assert.ok(pairs > 4000, `${pairs}`);
  let texts = 0;
  for (const inst of STRINGS) {
    const rng = seededRng(`string set-v1|${inst.key}`), L = Math.min(inst.args.maxLength as number, 24), old = oldStringCosts(inst);
    for (let t = 0; t < 60; t++) {
      const word = () => Array.from({ length: rng.int(L + 1) }, () => "abc"[rng.int(3)]).join("");
      const a = word(), b = word();
      if (a === b) continue;
      const want = oldEditWork(a, b, old);
      near(want, editWork(a, b, old), 1e-9, "the old DP is the edit distance");
      assert.equal(STRING.callWork(a, b, { id: "x", params: {} }, inst), want, `${inst.key} ${a} → ${b}`);
      assert.equal(STRING.callWork(a, b, { id: "x", params: {} }, inst, S1), want, `${inst.key} ${a} → ${b} set-v1`);
      texts++;
    }
  }
  assert.ok(texts > 300, `${texts}`);
});

test("set-v1 regression: a real Int or string act is charged the old price, with the model omitted or named", () => {
  let acts = 0;
  for (const inst of [i32, i4, INT.instantiate({ min: 7, max: 1000 })]) {
    const rng = seededRng(`int acts|${inst.key}`);
    for (const m of INT.mutators) for (let s = 0; s < 12; s++) {
      const v = INT.spawn(inst, rng), p = m.sample(rng, inst);
      const a = applyCalls(INT, inst, v, [[m.id, p]]), b = applyCalls(INT, inst, v, [[m.id, p]], S1);
      assert.deepEqual(a, b, m.id);
      if (!a.ok) continue;
      const W = oldIntCallWork(v, a.value as number, { id: m.id, params: m.parse(p, inst) }, inst);
      assert.equal(a.cost.work, W, `${m.id} ${JSON.stringify(p)} on ${v}`);
      assert.equal(a.cost.total, W + 0.05 * W * W, m.id);
      acts++;
    }
  }
  for (const inst of [str(16), str(128)]) {
    const rng = seededRng(`string acts|${inst.key}`);
    for (const m of STRING.mutators) for (let s = 0; s < 12; s++) {
      const v = STRING.spawn(inst, rng).slice(0, 10);
      let p: unknown;
      try { p = m.sample(rng, inst); } catch { continue; }
      const a = applyCalls(STRING, inst, v, [[m.id, p]]), b = applyCalls(STRING, inst, v, [[m.id, p]], S1);
      assert.deepEqual(a, b, m.id);
      if (!a.ok) continue;
      const W = oldEditWork(v, a.value as string, oldStringCosts(inst));
      assert.equal(a.cost.work, W, `${m.id} ${JSON.stringify(p)}`);
      acts++;
    }
  }
  assert.ok(acts > 150, `${acts}`);
});

test("set-v1 noise is what it was on Int and string: the same 200 steps as before cost models", () => {
  // sha256 of JSON.stringify of the 200 values of one noise walk, recorded from the code before this change (commit ad9d026):
  //   x = spawn(seededRng(`cost-models|${key}`)); rng = seededRng(`cost-models-noise|${key}`); x = noise(inst, x, 1, rng) × 200
  const before: Record<string, string> = {
    "Int(-2147483648,2147483647)": "fa445e05ea6982ae3b814324d3a5308e04d5d530bedaaf63801fe1aaa17cafaa",
    "Int(0,9999)": "a136c778a2aecbdeec21d030592472c3b0c01fac2170bfdb9bc92494c393b253",
    "Int(7,1000)": "44ff00ed00b2cb372bc4bad8d2e13e2c06bdb1608c69f62a1a9d323d11847227",
    "string(16)": "801f327a7239b988cedcecd58c32a800df298f2765d35b6fe0de97244bea22fd",
    "string(128)": "db11bb3ff2eacd0868887609567748edb4cdb421a15576f2a4ae4684d4cd500a",
    "string(2)": "48f23a1d81d08c9debfd2943ab04d7f40e42cec749ff72b6626b611eb454b7dc",
  };
  const walk = (type: ObjectTypeDef<any>, inst: Instantiation, ...model: CostModel[]): string => {
    let v = type.spawn(inst, seededRng(`cost-models|${inst.key}`));
    const rng = seededRng(`cost-models-noise|${inst.key}`), out: unknown[] = [];
    for (let i = 0; i < 200; i++) { v = noise(inst, v, 1, rng, ...model); out.push(v); }
    return sha256(JSON.stringify(out));
  };
  for (const [type, inst] of [[INT, i32], [INT, i4], [INT, INT.instantiate({ min: 7, max: 1000 })], [STRING, str(16)], [STRING, str(128)], [STRING, str(2)]] as const) {
    assert.equal(walk(type, inst), before[inst.key], inst.key);
    assert.equal(walk(type, inst, S1), before[inst.key], `${inst.key} set-v1`);
    assert.notEqual(walk(type, inst, D), before[inst.key], `${inst.key}: distance-v1 draws from another distribution`);
    assert.equal(noiseStep(inst), noiseStep(inst, S1));
    assert.notEqual(noiseStep(inst), noiseStep(inst, D));
  }
  // The cache keys: set-v1 keeps the version of before cost models; distance-v1's is the one Grid already uses.
  assert.equal(noiseVersion(S1), NOISE_VERSION);
  assert.equal(NOISE_VERSION, "noise-v1|beta=0.05");
  assert.equal(noiseVersion(D), "noise-v1|beta=0.05|cost=distance-v1");
});

// ------------------------------------------------------------------------------------------------
// Int, distance-v1: the two argument codes
// ------------------------------------------------------------------------------------------------

test("the digit code: the signed digits ±1 … ±9 by their size, λ the slider's Kraft root; set-v1's is flat, log2 18", () => {
  const g = intDigitGenerator(D);
  // 18 arguments, two at each distance 1 … 9: 2·Σ_{k=1..9} x^k = 1 at x = 2^(−λ). The untruncated root is log2 3 =
  // 1.584963; cutting at 9 lowers it by 4.9e-5 (test/cost-models.test.ts): λ = 1.584914.
  assert.deepEqual([...g.argDistances].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(k => [k, k]));
  near(g.rate, 1.584914, 1e-6, "λ");
  assert.equal(g.rate, LAM);
  near(g.rate, kraftRate(g.argDistances), 1e-12);
  near(g.args.reduce((s, a) => s + 2 ** -a.bits, 0), 1, 1e-9, "Kraft-tight");
  // The design's table (§2) lists 1.577 for "base10 as a dial": that is the root of a dial's nine arguments (+9 and −1
  // are the same turn). On an Int they are not the same change (9·10ᵖ ≠ −10ᵖ), there are eighteen arguments, and
  // 1.577 would over-claim: 2·Σ_{k=1..9} 2^(−1.577·k) = 1.0085 > 1.
  const dial = kraftRate([1, 1, 2, 2, 3, 3, 4, 4, 5]);
  near(dial, 1.577, 5e-4);
  const claimed = 2 * [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((s, k) => s + 2 ** (-dial * k), 0);
  assert.ok(claimed > 1.008 && claimed < 1.009, `${claimed}`);
  // set-v1: one of 18, whatever its size.
  const flat = intDigitGenerator(S1);
  assert.equal(flat.args.length, 18);
  for (const a of flat.args) assert.equal(a.bits, Math.log2(18));
  near(flat.args.reduce((s, a) => s + 2 ** -a.bits, 0), 1, 1e-12, "flat code is complete");
  assert.equal(flatGenerator({ kind: "ordinal", n: 10 }).argBits(3, 3), 0);
});

test("the multiply code: λ× solves 2·(ζ(λ) − 1) = 1; it is a prefix code, additive in the factors", () => {
  near(MAGNITUDE_RATE, 2.185285, 1e-6, "λ×");
  // ζ, independently: the partial sum to M and the integral bounds of the tail,
  //   (M + 1)^(1−s)/(s − 1) ≤ Σ_{m > M} m^(−s) ≤ M^(1−s)/(s − 1).   At M = 200,000 they are 4.4e-7 and 3e-12 apart.
  const s = MAGNITUDE_RATE, M = 200000;
  let sum = 0;
  for (let m = M; m >= 2; m--) sum += m ** -s;
  const lo = 2 * (sum + (M + 1) ** (1 - s) / (s - 1)), hi = 2 * (sum + M ** (1 - s) / (s - 1));
  assert.ok(lo <= 1 + 1e-9 && hi >= 1 - 1e-9 && hi - lo < 1e-9, `${lo} … ${hi}`);
  near(2 * (zeta(s) - 1), 1, 1e-6, "the equation");
  near(zeta(2), Math.PI ** 2 / 6, 1e-12, "ζ(2)");
  near(zeta(4), Math.PI ** 4 / 90, 1e-12, "ζ(4)");
  // Kraft over the multipliers a range offers: below 1/2 with ℓ_which (the other half is the adds'), and it converges.
  const claim = (max: number) => { let t = 0; for (let m = max; m >= 2; m--) t += 2 * 2 ** -multiplyWork(m, D); return t; };
  near(claim(1000), 0.5 - 2.34e-4, 5e-6, "up to 10³");       // tail 2·1000^(−1.185)/1.185 = 4.69e-4, halved by ℓ_which
  assert.ok(claim(1000) < claim(100000) && claim(100000) < 0.5);
  // ×m: 1 + λ×·log2 m.  ×2 = 3.185;  ×7 = 1 + 2.18529·2.80735 = 7.135;  ×7⁴ = 1 + 4·6.13487 = 25.539
  near(multiplyWork(2, D), 3.185, 1e-3);
  near(multiplyWork(7, D), 7.135, 1e-3);
  near(multiplyWork(2401, D), 25.539, 1e-3);
  assert.equal(multiplyWork(-7, D), multiplyWork(7, D));
  // additive: w(×ab) = w(×a) + w(×b) − ℓ_which, so one ×ab is never dearer than ×a then ×b
  for (const [a, b] of [[2, 3], [7, 7], [12, 35], [-4, 9]]) near(multiplyWork(a * b, D), multiplyWork(a, D) + multiplyWork(b, D) - 1, 1e-9, `${a}·${b}`);
  // monotone in the magnitude
  for (let m = 2; m < 200; m++) assert.ok(multiplyWork(m + 1, D) > multiplyWork(m, D));
  near(magnitudeBits(8), 3 * MAGNITUDE_RATE, 1e-12);
});

test("regression case: set-v1's per-prime multiply code is not a prefix code (it stays, stored games were charged by it)", () => {
  // Σ over ±m of 2^(−multiplyCost(m)): each prime power pᵏ contributes (2p)^(−k), so the sum is
  // ½·(Π_p 1/(1 − 1/(2p)) − 1) over the m it reaches, and Π_p diverges with Σ 1/p. docs §4.3: 0.91 to 10³, 1.45 to 10⁶.
  const claim = (max: number) => { let t = 0; for (let m = max; m >= 2; m--) t += 2 * 2 ** -multiplyCost(m); return t; };
  near(claim(1000), 0.91, 0.005, "up to 10³");
  const million = claim(1000000);
  near(million, 1.45, 0.005, "up to 10⁶");
  assert.ok(million > 1, "over-claims by itself, before the adds' 0.5");
  // The new code never does: with the adds' half it is within 1 on every range.
  let t = 0;
  for (let m = 1000000; m >= 2; m--) t += 2 * 2 ** -multiplyWork(m, D);
  assert.ok(t < 0.5, `${t}`);
});

test("Kraft for a whole Int: every digit add and every multiplier, with ℓ_which, claims at most 1", () => {
  for (const inst of INTS) {
    const { min, max } = inst.args as { min: number; max: number };
    if (min === max) continue;
    let total = 0;
    for (let p = 0; p < placesOf(inst); p++) for (let d = 1; d <= 9; d++) total += 2 * 2 ** -digitWork(inst, d, D);
    near(total, 0.5, 1e-9, `${inst.key}: the adds are exactly half`);
    const big = Math.min(100000, Math.max(2, Math.abs(min), Math.abs(max)));
    for (let m = 2; m <= big; m++) total += 2 * 2 ** -multiplyWork(m, D);
    assert.ok(total <= 1, `${inst.key}: ${total}`);
  }
});

// ------------------------------------------------------------------------------------------------
// Int, distance-v1: the positional norm
// ------------------------------------------------------------------------------------------------

test("Int 32-bit distance-v1: +100 is 5.91 bits, +10101 17.72, ×7 7.13, ×7⁴ 25.54 (the design's table)", () => {
  // one place, one step: 1 + log2 10 + λ = 1 + 3.32193 + 1.58491 = 5.90684.  The design prints 5.91 and says "1.585·|digit|":
  // its numbers use the slider's λ (1.585), not the dial's 1.577 of its §2 table (which would give 5.899 → 5.90).
  near(digitWork(i32, 1, D), 5.90684, 1e-5);
  near(addWork(100, i32, D), 5.90684, 1e-5, "+100");
  near(intWork(i32, 123456, [["add", { k: 100 }]], D), 5.90684, 1e-5);
  near(changeCost(5.90684), 7.651, 1e-3);                                   // 5.90684 + 0.05·34.891 (the design: 7.7)
  // three places, one step each: 3·5.90684 = 17.72053; C = 17.72053 + 0.05·314.017 = 33.421 (the design: 17.72, 33.4)
  near(intWork(i32, 123456, [["add", { k: 10101 }]], D), 17.72053, 1e-4, "+10101");
  near(changeCost(17.72053), 33.421, 1e-3);
  // ×7 on 123456 = 864192 (Δ = 740736, six digits by adds): 1 + 2.18529·log2 7 = 7.13487; C = 7.13487 + 0.05·50.906 = 9.680
  const times7 = act(INT, i32, 123456, [["multiply", { m: 7 }]], D);
  assert.ok(times7.ok && times7.value === 864192);
  near(times7.cost.work, 7.13487, 1e-4, "×7");
  near(times7.cost.total, 9.680, 1e-3);
  // ×7⁴ on 123456 = 296417856: 1 + 2.18529·4·2.80735 = 25.53949; C = 25.53949 + 0.05·652.265 = 58.153 (the design: 58.1)
  const times2401 = act(INT, i32, 123456, [["multiply", { m: 2401 }]], D);
  assert.ok(times2401.ok && times2401.value === 296417856);
  near(times2401.cost.work, 25.53949, 1e-4, "×7⁴");
  near(times2401.cost.total, 58.153, 2e-3);
  // set-v1 beside it (unchanged): 8.49, 25.48, 5.81, 17.23
  near(intWork(i32, 123456, [["add", { k: 100 }]]), 8.492, 1e-3);
  near(intWork(i32, 123456, [["add", { k: 10101 }]]), 25.476, 1e-3);
  near(intWork(i32, 123456, [["multiply", { m: 7 }]]), 5.807, 1e-3);
  near(intWork(i32, 123456, [["multiply", { m: 2401 }]]), 17.229, 1e-3);
});

test("the owner's checks under distance-v1: ×7 is cheap whatever digits change; C(×7⁴) > 4·C(×7); one digit < ⅓ of three", () => {
  const C = (x: number, calls: unknown[]) => { const out = act(INT, i32, x, calls, D); assert.ok(out.ok); return out.cost.total; };
  // ×7 costs the same from any start, however many digits it turns over (as long as the adds are not cheaper).
  const sevens = [123456, 999999, 31415926, -271828].map(x => C(x, [["multiply", { m: 7 }]]));
  for (const c of sevens) near(c, 9.680, 1e-3, "×7");
  // 58.15 > 4 × 9.68 = 38.72
  assert.ok(C(123456, [["multiply", { m: 2401 }]]) > 4 * sevens[0]);
  // 7.65 < 33.42 / 3 = 11.14
  assert.ok(C(123456, [["add", { k: 100 }]]) < C(123456, [["add", { k: 10101 }]]) / 3);
});

test("the positional norm: a net change costs its cheapest signed-digit representation, each digit by its size", () => {
  const place = 1 + Math.log2(10), w = (...digits: number[]) => digits.reduce((s, d) => s + place + LAM * Math.abs(d), 0);
  const cases: [number, number[]][] = [
    [1, [1]], [-1, [1]], [5, [5]], [6, [6]],
    [9, [1, 1]],                       // +10 − 1: 2·5.907 = 11.81, cheaper than one digit of 9 (4.32 + 14.26 = 18.59)
    [8, [1, 2]],                       // +10 − 2
    [7, [1, 3]],                       // +10 − 3: 8.64 + 6.34 = 14.98, against a digit of 7: 4.32 + 11.09 = 15.42
    [999, [1, 1]],                     // +1000 − 1
    [1001, [1, 1]], [10101, [1, 1, 1]],
    [-56, [6, 4]],                     // −60 + 4: ten steps on two places (24.49); −50 − 6 is eleven (26.08)
    [1095, [1, 1, 5]],                 // +1000 + 100 − 5
    [28800, [3, 1, 2]],                // +30000 − 1000 − 200: 6 steps on 3 places, against 2 + 8 + 8 = 18 steps as written
    [5000000, [5]], [4999999, [5, 1]],
  ];
  for (const [n, digits] of cases) {
    near(addWork(n, i32, D), w(...digits), 1e-9, `${n}`);
    near(addWork(-n, i32, D), w(...digits), 1e-9, `${-n}: symmetric`);
  }
  // Not monotone in |k| (the design says so): +9 is cheaper than +5. Monotone in the steps of the representation.
  assert.ok(addWork(9, i32, D) < addWork(5, i32, D));
  assert.equal(addWork(0, i32, D), 0);
  // price ≡ 1 is the digit count of set-v1
  for (const n of [0, 6, 9, 10, 99, 999, 1001, 9999, -56, 1095, 123456789]) assert.equal(signedDigitWork(n, Array(10).fill(1)), signedDigits(n), `${n}`);
  // Adds wrap in the range: on 0..9999, 3 → 2 by add(9999) is one step down, not four nines (nor +10000 − 1).
  near(intWork(i4, 3, [["add", { k: 9999 }]], D), 1 + 2 + LAM, 1e-9, "wrap");           // P = 4: 1 + log2 4 + λ = 4.585
  near(intWork(i4, 9999, [["add", { k: 1 }]], D), 1 + 2 + LAM, 1e-9, "9999 + 1 wraps to 0");
});

test("the positional norm is the shortest path over digit adds: Dijkstra on 0..999 agrees with the DP for every Δ", () => {
  // Z_1000 with an edge ±d·10ᵖ (p < 3, d = 1 … 9) of weight 1 + log2 3 + λ·d: the cheapest program of elementary adds.
  const W = 1000, dist = new Float64Array(W).fill(Infinity), done = new Uint8Array(W);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < W; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = 1;
    for (let p = 0; p < 3; p++) for (let d = 1; d <= 9; d++) for (const s of [1, -1]) {
      const v = (((u + s * d * 10 ** p) % W) + W) % W, via = dist[u] + digitWork(i3, d, D);
      if (via < dist[v]) dist[v] = via;
    }
  }
  for (let delta = 1; delta < W; delta++) near(addWork(delta, i3, D), dist[delta], 1e-9, `Δ = ${delta}`);
  // and a call is charged it: every single digit add costs at most its own code (generator consistency), exactly so up
  // to 5 (a 6 is cheaper the other way round this range: +600 ≡ −400; 7, 8 and 9 by a carry)
  for (let p = 0; p < 3; p++) for (let d = 1; d <= 9; d++) for (const s of [1, -1]) {
    const k = s * d * 10 ** p, charged = intWork(i3, 500, [["add", { k }]], D);
    assert.ok(charged <= digitWork(i3, d, D) + 1e-9, `add(${k}): ${charged}`);
    if (d <= 5) near(charged, digitWork(i3, d, D), 1e-9, `add(${k})`);
  }
});

test("subadditive: one net change never costs more than two that make it", () => {
  const rng = seededRng("int triangle");
  for (let t = 0; t < 3000; t++) {
    const a = rng.int(2000001) - 1000000, b = rng.int(2000001) - 1000000;
    assert.ok(addWork(a + b, i32, D) <= addWork(a, i32, D) + addWork(b, i32, D) + 1e-9, `${a} + ${b}`);
  }
});

test("Int callWork under distance-v1: the cheaper of the digit adds and the multiplication, whatever mutator did it", () => {
  const place = 1 + Math.log2(10);
  // 1200 + 1200 = 2400 = 1200 × 2: as adds +1000 + 200 = 2·4.32 + 3λ = 13.40; as ×2 = 3.185
  near(intWork(i32, 1200, [["add", { k: 1200 }]], D), 1 + LAMX, 1e-5, "an add that doubles");
  // multiply is priced by its net effect too: 1 × 1000 = 1000 is +1000 − 1 (11.81), cheaper than ×1000 = 1 + λ×·9.966 = 22.78
  near(intWork(i32, 1, [["multiply", { m: 1000 }]], D), 2 * (place + LAM), 1e-9, "×1000 on 1");
  near(multiplyWork(1000, D), 22.778, 1e-3);
  // ... where set-v1 charges the call its parameter: 2 + 3·(1 + 1) + 3·(log2 5 + 1) = 17.966
  near(intWork(i32, 1, [["multiply", { m: 1000 }]]), 17.966, 1e-3);
  // 12 × 2401 = 28812: Δ = 28800 is six steps on three places (3·4.32 + 6λ = 22.48), cheaper than ×7⁴ (25.54)
  near(intWork(i32, 12, [["multiply", { m: 2401 }]], D), 3 * place + 6 * LAM, 1e-9, "×7⁴ on 12");
  // set_digit and the other composites pay for the digits they move: 123456 → 123406 is −50
  near(intWork(i32, 123456, [["set_digit", { place: 1, digit: 0 }]], D), place + 5 * LAM, 1e-9, "set_digit");
  // 0 × m changes nothing, and −x is not a multiplication (|m| ≥ 2): reflect pays its digits
  assert.ok(!act(INT, i32, 0, [["multiply", { m: 7 }]], D).ok);
  // every call: never more than the adds, never more than the multiply
  const rng = seededRng("int min");
  for (let t = 0; t < 500; t++) {
    const a = rng.int(20000) - 10000, m = (2 + rng.int(30)) * (rng.int(2) ? 1 : -1), b = a * m;
    if (a === 0) continue;
    const c = INT.callWork(a, b, { id: "multiply", params: { m } }, i32, D);
    near(c, Math.min(addWork(b - a, i32, D), multiplyWork(m, D)), 1e-12, `${a} × ${m}`);
  }
  // The mutators do what they did: the same values under both models, on every sampled call.
  const r2 = seededRng("int same effect");
  for (const m of INT.mutators) for (let s = 0; s < 20; s++) {
    const v = INT.spawn(i4, r2), p = m.sample(r2, i4), a = applyCalls(INT, i4, v, [[m.id, p]]), b = applyCalls(INT, i4, v, [[m.id, p]], D);
    assert.equal(a.ok, b.ok, m.id);
    if (a.ok && b.ok) { assert.equal(a.value, b.value, m.id); assert.ok(b.cost.work > 0); }
  }
});

test("Int cost table: one row per digit size and a few multipliers, each the price an act is charged", () => {
  const rows = intCostTable(i32, D);
  assert.deepEqual(rows.map(r => r.move), [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `move one digit place by ${k}`).concat([2, 3, 5, 7, 10].map(m => `multiply by ${m}`)));
  // W: 5.91 7.49 9.08 10.66 12.25 13.83 | 7, 8, 9 as the next place less 3, 2, 1: 14.98 13.40 11.81 | ×: 3.19 4.46 6.07 7.13 8.26
  assert.deepEqual(rows.map(r => +r.work.toFixed(2)), [5.91, 7.49, 9.08, 10.66, 12.25, 13.83, 14.98, 13.4, 11.81, 3.19, 4.46, 6.07, 7.13, 8.26]);
  assert.deepEqual(rows.map(r => +changeCost(r.work).toFixed(1)), [7.7, 10.3, 13.2, 16.3, 19.7, 23.4, 26.2, 22.4, 18.8, 3.7, 5.5, 7.9, 9.7, 11.7]);
  for (let k = 1; k <= 9; k++) near(intWork(i32, 5550, [["add", { k: k * 100 }]], D), rows[k - 1].work, 1e-9, `+${k}00`);
  for (const [i, m] of [2, 3, 5, 7, 10].entries()) near(intWork(i32, 123457, [["multiply", { m }]], D), rows[9 + i].work, 1e-9, `×${m}`);
  // set-v1: one digit price and the per-prime multipliers: 8.49 | 4 4.58 5.32 5.81 7.32
  assert.deepEqual(intCostTable(i32).map(r => [r.move, +r.work.toFixed(2)]),
    [["change one digit place", 8.49], ["multiply by 2", 4], ["multiply by 3", 4.58], ["multiply by 5", 5.32], ["multiply by 7", 5.81], ["multiply by 10", 7.32]]);
  assert.equal(INT.costTable!(i32, S1)[0].work, digitAddCost(i32));
  // a range lists only the multipliers it allows; a one-value range has no move
  assert.deepEqual(intCostTable(INT.instantiate({ min: -1, max: 1 }), D).filter(r => r.move.startsWith("multiply")).map(r => r.move), ["multiply by 2"]);
  assert.deepEqual(intCostTable(INT.instantiate({ min: 0, max: 0 }), D), []);
});

test("distance-v1 Int noise: a digit add ±d at a place or a multiplier ±m, each with probability 2^(−C(w))/Z", () => {
  // Int(0, 99999), from 50000: P = 5, place = 1 + log2 5 = 3.3219. Every multiplier leaves the range (×2 = 100000), so
  // it leaves the number as it is. A digit add ±d·10ᵖ wraps modulo 100000.
  //   ±1: W = 4.9069, C = 6.1108;  ±2: 6.4918, 8.5990;  ±3: 8.0767, 11.3383;  ±4: 9.6616, 14.3290
  //   ×2: W = 3.1853, C = 3.6926;  ×3: 4.4636, 5.4598;  ×4: 5.3706, 6.8127;  ×5: 6.0741, 7.9188
  const inst = INT.instantiate({ min: 0, max: 99999 }), x = 50000, step = noiseStep(inst, D), rng = seededRng("int distance noise");
  const expected = new Map<number, number>();
  let Z = 0;
  const put = (y: number, w: number) => { expected.set(y, (expected.get(y) ?? 0) + w); Z += w; };
  for (let p = 0; p < 5; p++) for (let d = 1; d <= 9; d++) for (const s of [1, -1]) put((((x + s * d * 10 ** p) % 100000) + 100000) % 100000, 2 ** -changeCost(1 + Math.log2(5) + LAM * d));
  for (let m = 2; m <= MAX_MULTIPLIER; m++) put(x, 2 * 2 ** -changeCost(1 + LAMX * Math.log2(m)));
  // by hand: the multipliers weigh 2·(0.07735 + 0.02272 + 0.00890 + 0.00413 + 0.00215 + 0.00122 + 0.00073 + … ) = 0.2375;
  // the ten ±1 adds 10·2^−6.1108 = 0.1447, the ten ±2 0.0258, ±3 0.0039, ±4 0.0005: Z = 0.4125.
  // P(stay) = 0.576, P(one given ±1) = 0.01447/0.4125 = 0.0351.
  near(expected.get(x)! / Z, 0.576, 2e-3, "P(stay)");
  near(expected.get(50001)! / Z, 0.0351, 2e-4, "P(+1)");
  near(expected.get(40000)! / Z, 0.0351, 2e-4, "P(−10000)");
  const n = 60000, seen = new Map<number, number>();
  for (let t = 0; t < n; t++) { const y = step(x, rng) as number; seen.set(y, (seen.get(y) ?? 0) + 1); }
  for (const y of seen.keys()) assert.ok(expected.has(y), `${y} is not one digit add away`);
  for (const [y, w] of expected) {
    const p = w / Z, f = (seen.get(y) ?? 0) / n;
    near(f, p, 5 * Math.sqrt(p * (1 - p) / n) + 1e-4, `P(${y})`);
  }
  // In range, a multiplier applies: from 3, ×2 is the likeliest change (the negative multipliers leave 0..99999).
  const small = new Map<number, number>(), r2 = seededRng("int distance noise 2");
  for (let t = 0; t < 20000; t++) { const y = step(3, r2) as number; small.set(y, (small.get(y) ?? 0) + 1); }
  const top = [...small.entries()].filter(([y]) => y !== 3).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(top, 6);
  near(small.get(6)! / 20000, 0.07735 / 0.4125, 0.012, "P(×2) = 0.1875");
  // the tail the enumeration leaves out: ×1025 has W = 1 + 2.18529·10.0014 = 22.856, C = 48.98 bits, against Z ≈ 0.4
  assert.ok(2 ** -changeCost(multiplyWork(MAX_MULTIPLIER + 1, D)) < 1e-14);
});

// ------------------------------------------------------------------------------------------------
// string, distance-v1
// ------------------------------------------------------------------------------------------------

test("string(32) distance-v1: substitute 13.57, insert 13.63, delete 13.58, each from its declared argument space", () => {
  const w = stringElementaryCosts(str(32), D);
  // substitute: log2 3 (which of three families) + log2 32 (which of the 32 places that can hold a character)
  //             + log2 127 (which of the 127 other characters, each one step away) + 0 erased = 1.58496 + 5 + 6.98868
  near(w.set, 13.57364, 1e-5, "substitute");
  near(w.set, L3 + Math.log2(32) + Math.log2(127), 1e-9);
  // insert:     log2 3 + log2 33 (which of the gaps 0 … 32) + log2 128 (the new character) + 0 erased = 1.58496 + 5.04439 + 7
  near(w.insert, 13.62936, 1e-5, "insert");
  near(w.insert, L3 + Math.log2(33) + 7, 1e-9);
  // delete:     log2 3 + log2 32 (which place) + no argument + log2 128 erased (128 texts give the same result) = 1.58496 + 5 + 7
  near(w.delete, 13.58496, 1e-5, "delete");
  near(w.delete, L3 + 5 + 7, 1e-9);
  // energy: 22.79, 22.92, 22.81 (the design: 22.8, 22.9, 22.8); set-v1 beside it: 41.91, 22.92, 22.92
  assert.deepEqual([w.set, w.insert, w.delete].map(x => +changeCost(x).toFixed(2)), [22.79, 22.92, 22.81]);
  const old = stringElementaryCosts(str(32));
  assert.deepEqual([old.set, old.insert, old.delete].map(x => +changeCost(x).toFixed(2)), [41.91, 22.92, 22.92]);
  // real acts are charged them
  const inst = str(32);
  near(strWork(inst, "hello", [["set_char", { i: 0, c: "j" }]], D), w.set, 1e-9);
  near(strWork(inst, "hello", [["insert", { i: 5, text: "!" }]], D), w.insert, 1e-9);
  near(strWork(inst, "hello", [["delete", { range: [0, 1] }]], D), w.delete, 1e-9);
  // 'a' → 'z' is no bigger a change than 'a' → 'b' (categorical; relabelling invariant)
  near(strWork(inst, "a", [["set_char", { i: 0, c: "z" }]], D), strWork(inst, "a", [["set_char", { i: 0, c: "b" }]], D), 1e-12);
  // one place: nothing to say about where
  near(stringElementaryCosts(str(1), D).set, L3 + Math.log2(127), 1e-9);
  near(stringElementaryCosts(str(1), D).insert, L3 + 1 + 7, 1e-9);
  for (const inst of STRINGS) for (const x of Object.values(stringElementaryCosts(inst, D))) assert.ok(Number.isFinite(x) && x > 0, inst.key);
});

test("Kraft for a string of any length: every substitution, insertion and deletion claims at most 1", () => {
  for (const L of [1, 2, 16, 32, 128, 1024]) {
    const w = stringElementaryCosts(str(L), D);
    for (const n of [0, 1, Math.floor(L / 2), L]) {
      // n places × 127 characters; n + 1 gaps × 128 characters (none when full); n deletions. The deletion's code is
      // its site alone (the 7 erased bits are a charge, not part of the name).
      const claimed = n * 127 * 2 ** -w.set + (n < L ? (n + 1) * 128 * 2 ** -w.insert : 0) + n * 2 ** -(w.delete - 7);
      assert.ok(claimed <= 1 + 1e-9, `L = ${L}, n = ${n}: ${claimed}`);
      if (n === L) near(claimed, 2 / 3, 1e-9, "a full text: substitutions and deletions are a third each");
    }
  }
});

test("string callWork under distance-v1: the cheapest edit script at the new prices", () => {
  const inst = str(16), w = stringElementaryCosts(inst, D);
  // hello → olleh: two substitutions, a delete and an insert, or four substitutions; the DP takes the cheaper
  near(strWork(inst, "hello", [["reverse", {}]], D), Math.min(4 * w.set, 2 * w.set + w.insert + w.delete), 1e-9);
  near(strWork(inst, "hello", [["rotate", { k: 1 }]], D), w.delete + w.insert, 1e-9, "a rotation is a delete and an insert");
  near(strWork(inst, "hello", [["insert", { i: 5, text: "!!" }]], D), 2 * w.insert, 1e-9);
  const rng = seededRng("string distance");
  for (const i of [inst, str(128), str(5)]) for (let t = 0; t < 80; t++) {
    const L = Math.min(i.args.maxLength as number, 12), word = () => Array.from({ length: rng.int(L + 1) }, () => "abc"[rng.int(3)]).join("");
    const a = word(), b = word();
    if (a === b) continue;
    near(STRING.callWork(a, b, { id: "x", params: {} }, i, D), editWork(a, b, stringElementaryCosts(i, D)), 1e-9, `${a} → ${b}`);
    // symmetric up to what a delete erases against what an insert names, and subadditive through any middle text
    const c = word();
    if (c !== a && c !== b) assert.ok(STRING.callWork(a, b, { id: "x", params: {} }, i, D) <= STRING.callWork(a, c, { id: "x", params: {} }, i, D) + STRING.callWork(c, b, { id: "x", params: {} }, i, D) + 1e-9);
  }
  // The mutators do what they did: the same texts under both models.
  const r2 = seededRng("string same effect");
  for (const m of STRING.mutators) for (let s = 0; s < 12; s++) {
    const v = STRING.spawn(inst, r2).slice(0, 9);
    let p: unknown;
    try { p = m.sample(r2, inst); } catch { continue; }
    const a = applyCalls(STRING, inst, v, [[m.id, p]]), b = applyCalls(STRING, inst, v, [[m.id, p]], D);
    assert.equal(a.ok, b.ok, m.id);
    if (a.ok && b.ok) assert.equal(a.value, b.value, m.id);
  }
});

test("string cost table and noise under distance-v1: the three moves, weighted by their prices", () => {
  assert.deepEqual(stringCostTable(str(32), D).map(r => [r.move, +r.work.toFixed(2)]),
    [["change one character", 13.57], ["insert one character", 13.63], ["delete one character", 13.58]]);
  assert.deepEqual(STRING.costTable!(str(32)).map(r => +r.work.toFixed(2)), [20.63, 13.63, 13.63]);
  assert.deepEqual(stringCostTable(str(0), D), []);
  // string(4), from "ab" (n = 2). W: substitute log2 3 + 2 + log2 127 = 10.5736, insert log2 3 + log2 5 + 7 = 10.9069,
  // delete log2 3 + 2 + 7 = 10.5850; C: 16.1637, 16.8549, 16.1870. Masses: 2·127·2^−16.1637, 3·128·2^−16.8549, 2·2^−16.1870:
  // 254 : 237.8 : 1.968 in units of 2^−16.1637, so P(substitute) = 0.5144, P(insert) = 0.4816, P(delete) = 0.0040.
  const inst = str(4), step = noiseStep(inst, D), rng = seededRng("string distance noise"), n = 40000;
  const w = stringElementaryCosts(inst, D), mass = [2 * 127 * 2 ** -changeCost(w.set), 3 * 128 * 2 ** -changeCost(w.insert), 2 * 2 ** -changeCost(w.delete)];
  const Z = mass[0] + mass[1] + mass[2];
  near(mass[0] / Z, 0.5144, 5e-4);
  near(mass[1] / Z, 0.4816, 5e-4);
  near(mass[2] / Z, 0.0040, 1e-4);
  const seen = [0, 0, 0];
  for (let t = 0; t < n; t++) { const y = step("ab", rng) as string; assert.notEqual(y, "ab"); seen[y.length === 2 ? 0 : y.length === 3 ? 1 : 2]++; }
  for (let k = 0; k < 3; k++) { const p = mass[k] / Z; near(seen[k] / n, p, 5 * Math.sqrt(p * (1 - p) / n) + 1e-4, ["substitute", "insert", "delete"][k]); }
  // under set-v1 a substitution is 7 bits dearer than an insert, so it is rare: 254·2^−(C(18.907)) against 384·2^−(C(11.907))
  const old = [0, 0, 0], r2 = seededRng("string set noise"), flat = noiseStep(inst);
  for (let t = 0; t < 5000; t++) { const y = flat("ab", r2) as string; old[y.length === 2 ? 0 : y.length === 3 ? 1 : 2]++; }
  assert.ok(old[0] < 5 && old[1] > 4900, `${old}`);
});
