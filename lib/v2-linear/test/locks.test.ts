/** Locks on lines (docs/engine-v2/locks.md): the owner's example predicates, canonical text, information content. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breaksLocks, canonicalPredicate, holds, informationContent, isInvalid, isqrtB, lockEnergyAt, lockEndsAt, lockFee, lockRate,
  lockedAct, parsePredicate, plainWords, rng, type ActLock, type LockOpWire, type Predicate,
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

// ---------------------------------------------------------------- an act under locks

const shift = (k: number | string) => ({ mutator: "si.shift", site: 0, args: { k: String(k) } });
const law = lineLaw(variant);
const infoOf = (p: Predicate, s: ReturnType<typeof mc>) =>
  informationContent(lineType, variant, p, r => law.draw(r, 1).state, lineType.readLength(s, variant), 4096);
const lockOn = (n: number, text: string, energy: number) => ({ n, predicate: P(text), text, info: 4, energy, settledAt: 0, rate: 0.1 });
const act = (state: ReturnType<typeof mc>, calls: object[], ops: LockOpWire[], locks: ActLock[], world = 0) =>
  lockedAct({ type: lineType, variant, state, calls: calls as never, ops, locks, world, nextLock: locks.length + 1, fullChargeSeconds: 240, info: infoOf });

test("a call that breaks a lock is refused; one that keeps it passes; every call is checked, not only the last", () => {
  const locks = [lockOn(1, "si.c is prime", 5)];
  const kept = act(mc(1, 13), [shift(4)], [], locks);   // 13 → 17
  assert.ok(!isInvalid(kept));
  const broken = act(mc(1, 13), [shift(1)], [], locks);  // 13 → 14
  assert.ok(isInvalid(broken) && /breaks lock #1 \(the y-intercept is prime\), holding 5: drain it first/.test(broken.invalid), JSON.stringify(broken));
  assert.ok(isInvalid(act(mc(1, 13), [shift(1), shift(3)], [], locks)), "13 → 14 → 17 passes through a non-prime");
});

test("drain to zero, then the move passes, in one act; drains are clipped, funds add, both cost the actor", () => {
  const locks = [lockOn(1, "si.c is prime", 5)];
  const r = act(mc(1, 13), [shift(1)], [{ op: "drain", lock: 1, amount: 9 }], locks);
  assert.ok(!isInvalid(r), isInvalid(r) ? r.invalid : "");
  assert.deepEqual(r.done, [{ op: "drain", lock: 1, amount: 5, spend: 5 }]);
  assert.equal(r.locks.length, 0);
  assert.equal(r.spend, 5);
  const part = act(mc(1, 13), [shift(1)], [{ op: "drain", lock: 1, amount: 2 }], locks);
  assert.ok(isInvalid(part), "a partial drain leaves the lock standing");
  const f = act(mc(1, 13), [], [{ op: "fund", lock: 1, amount: 3 }], locks, 10);   // settled to 4 at world 10, plus 3
  assert.ok(!isInvalid(f));
  assert.equal(f.locks[0]!.energy, 7);
  assert.ok(isInvalid(act(mc(1, 13), [], [{ op: "fund", lock: 2, amount: 3 }], locks)), "no lock #2");
  assert.ok(isInvalid(act(mc(1, 13), [], [{ op: "fund", lock: 1, amount: -3 }], locks)));
  assert.ok(!isInvalid(act(mc(1, 14), [], [], [lockOn(1, "si.c is prime", 5)], 60)), "a decayed lock forbids nothing");
});

test("a new lock is made on the state the calls reached, pays I + its opening amount, and must hold there", () => {
  const r = act(mc(-2, 11), [shift(2)], [{ op: "create", predicate: "si.c is prime and si.m = -2", amount: 10 }], []);
  assert.ok(!isInvalid(r), isInvalid(r) ? r.invalid : "");
  const d = r.done[0]!;
  assert.equal(d.op, "create");
  if (d.op !== "create") return;
  assert.equal(d.lock, 1);
  assert.equal(d.predicate, "si.c is prime and si.m = -2");
  assert.ok(d.info > 5, `${d.info}`);
  assert.equal(d.fee, d.info);
  assert.equal(d.rate, d.info / 240);
  assert.equal(r.spend, d.info + 10);
  assert.equal(r.locks.length, 1);
  assert.ok(isInvalid(act(mc(-2, 11), [shift(1)], [{ op: "create", predicate: "si.c is prime", amount: 1 }], [])), "12 is not prime");
  const full = Array.from({ length: 8 }, (_, i) => lockOn(i + 1, "si.m = -2", 5));
  assert.ok(isInvalid(act(mc(-2, 11), [], [{ op: "create", predicate: "si.c is prime", amount: 1 }], full)), "eight is the most");
});
