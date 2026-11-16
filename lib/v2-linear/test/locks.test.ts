/** Locks on lines (docs/engine-v2/locks.md): the owner's example predicates, canonical text, information content. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breaksLocks, canonicalPredicate, holds, informationContent, isInvalid, isqrtB, lockEnergyAt, lockEndsAt, lockFee, lockRate,
  parsePredicate, plainWords, rng, type Predicate,
} from "@workspace/v2-core";
import { lineType } from "../src/type.ts";
import { lineLaw } from "../src/law.ts";
import { mc } from "./helpers.ts";

const variant = lineType.variants[0]!;
const P = (text: string): Predicate => {
  const p = parsePredicate(lineType, text);
  if (isInvalid(p)) throw new Error(p.invalid);
  return p;
};
const at = (text: string, m: number, c: number) => holds(lineType, P(text), mc(m, c));

test("the owner's examples: a prime y-intercept, a gradient of −2, a floor", () => {
  assert.equal(at("si.c is prime", 3, 13), true);
  assert.equal(at("si.c is prime", 3, 15), false);
  assert.equal(at("si.c is prime", 3, -13), false, "primes are positive");
  assert.equal(at("si.m = -2", -2, 7), true);
  assert.equal(at("si.m = -2", 2, 7), false);
  assert.equal(at("si.c >= 1013", 0, 1013), true);
  assert.equal(at("si.c >= 1013", 0, 1012), false);
  assert.equal(at("si.c <= 5", 0, 5), true);
});

test("the owner's examples: primes whose digit sum is 7 ending in 3, square areas whose root's digit sum is a multiple of 7", () => {
  const p = "si.c is prime and digitsum(si.c) = 7 and lastdigit(si.c) = 3";
  assert.equal(at(p, -2, 43), true);    // 43: prime, 4 + 3 = 7, ends in 3
  assert.equal(at(p, -2, 1033), true);  // 1033 is prime, digit sum 7
  assert.equal(at(p, -2, 53), false);   // digit sum 8
  assert.equal(at(p, -2, 25), false);
  // y = −2x + c: legs c/2 and c, area c²/4. c = 14: area 49 = 7², 7 is a multiple of 7.
  const s = "tri.area is square and digitsum(isqrt(tri.area)) is multiple of 7";
  assert.equal(at(s, -2, 14), true);
  assert.equal(at(s, -2, 32), true, "area 256 = 16², 1 + 6 = 7");
  assert.equal(at(s, -2, 20), false, "area 100 = 10², digit sum 1");
  assert.equal(at(s, -2, 6), false, "area 9 = 3²");
  assert.equal(at(s, -2, 7), false, "area 49/4 is not a whole square");
});

test("an undefined or non-integer reading makes its atom false; set membership", () => {
  assert.equal(holds(lineType, P("si.c is integer"), mc(1, 3)), true);
  assert.equal(at("si.c in {2, 3, 5}", 1, 3), true);
  assert.equal(at("si.c in {2, 3, 5}", 1, 4), false);
  assert.equal(at("lastdigit(si.y(q=1/2)) = 3", 1, 3), false, "y at ½ is 7/2: no last digit");
  assert.equal(at("si.y(q=2) = 9", 3, 3), true);
});

test("canonical text: atoms sorted, numbers reduced, duplicates removed; parse errors are sentences", () => {
  const a = canonicalPredicate(P("si.m = -4/2 and si.c is prime and si.c is prime"));
  const b = canonicalPredicate(P("si.c   is   prime and si.m=-2"));
  assert.equal(a, b);
  assert.equal(a, "si.c is prime and si.m = -2");
  assert.equal(canonicalPredicate(parsePredicate(lineType, a) as Predicate), a);
  for (const bad of ["", "si.nope = 1", "si.c is odd", "si.c = x", "si.c >= 1 or si.m = 2", "si.y = 3", "si.sign = 1",
    "si.c = 1 and si.c = 2 and si.c = 3 and si.c = 4 and si.c = 5 and si.c = 6 and si.c = 7", "si.c is multiple of 0"]) {
    assert.ok(isInvalid(parsePredicate(lineType, bad)), bad);
  }
});

test("isqrt is exact on huge numbers", () => {
  const big = 10n ** 400n + 12345n;
  assert.equal(isqrtB(big * big), big);
  assert.equal(isqrtB(big * big - 1n), big - 1n);
  for (let n = 0n; n < 200n; n++) assert.equal(isqrtB(n), BigInt(Math.floor(Math.sqrt(Number(n)))));
});

test("plain words name the readings", () => {
  assert.equal(plainWords(lineType, P("si.c is prime and si.m = -2")), "the y-intercept is prime and the gradient is -2");
  assert.equal(plainWords(lineType, P("digitsum(si.c) >= 7")), "the digit sum of the y-intercept is at least 7");
});

test("information content: −log2 of the law's mass, deterministic, rarer predicates cost more, capped by φ", () => {
  const law = lineLaw(variant);
  const draw = (r: ReturnType<typeof rng>) => law.draw(r, 1).state;
  const info = (text: string, m: number, c: number) =>
    informationContent(lineType, variant, P(text), draw, lineType.readLength(mc(m, c), variant));
  const grad = info("si.m = -2", -2, 7), again = info("si.m = -2", -2, 7);
  assert.deepEqual(grad, again, "the same seed for the same canonical text");
  assert.ok(grad.bits > 1 && grad.bits < 12, `gradient −2: ${grad.bits}`);
  assert.equal(grad.bounded, false);
  const prime = info("si.c is prime", 0, 13), both = info("si.c is prime and si.m = -2", -2, 13);
  assert.ok(both.bits > prime.bits && both.bits > grad.bits, "a conjunction is rarer than either part");
  const pinned = info("si.c = 104729 and si.m = -2", -2, 104729);
  assert.equal(pinned.bounded, true, "too rare for the draws");
  assert.equal(pinned.bits, lineType.readLength(mc(-2, 104729), variant));
});

test("fees, upkeep and decay: a lock re-pays its fee once per full-charge period and ends at zero", () => {
  assert.equal(lockFee(20), 20);
  assert.equal(lockRate(20, 240), 20 / 240);
  const lock = { energy: 10, settledAt: 100, rate: 0.5 };
  assert.equal(lockEnergyAt(lock, 104), 8);
  assert.equal(lockEndsAt(lock), 120);
  assert.equal(lockEnergyAt(lock, 130), 0);
});

test("breaksLocks names every live lock a state breaks", () => {
  const locks = [
    { n: 1, predicate: P("si.m = -2"), energy: 5, settledAt: 0, rate: 0.1 },
    { n: 2, predicate: P("si.c is prime"), energy: 5, settledAt: 0, rate: 0.1 },
    { n: 3, predicate: P("si.c >= 100"), energy: 1, settledAt: 0, rate: 0.1 },   // decayed by world 10
  ];
  assert.deepEqual(breaksLocks(lineType, locks, mc(-2, 13), 1), [3]);
  assert.deepEqual(breaksLocks(lineType, locks, mc(-2, 13), 20), []);
  assert.deepEqual(breaksLocks(lineType, locks, mc(3, 15), 20), [1, 2]);
});
