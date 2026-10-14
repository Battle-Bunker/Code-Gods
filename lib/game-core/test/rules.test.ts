import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS, validateSettings, assertObjectValue,
  personalScore, totalValue, leaderboard, uniformObject,
  lifetimeSeconds, poissonIntervalSeconds, asciiStringAtRank,
  encodeUuid, uniquePrefixes, resolveIdentifier, settleEnergy, spendEnergy,
} from "../src/index.ts";

test("requested defaults and settings validation", () => {
  validateSettings({ ...DEFAULT_SETTINGS });
  assert.equal(DEFAULT_SETTINGS.planningSeconds, 60);
  assert.equal(DEFAULT_SETTINGS.halfLifeSeconds, 300);
  assert.equal(DEFAULT_SETTINGS.pauseSeconds, 180);
  assert.equal(DEFAULT_SETTINGS.startingEnergy, 100);
  assert.equal(DEFAULT_SETTINGS.energyPerSecond, 1);
  assert.equal(DEFAULT_SETTINGS.startingObjectCount, 10);
  assert.equal(DEFAULT_SETTINGS.spawnRateHz, 0.1);
  assert.equal(DEFAULT_SETTINGS.interactionRateHz, 10);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, halfLifeSeconds: 0 }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, intMin: 10, intMax: 1 }));
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, spawnRateHz: NaN }));
});

test("object contracts reject coercion and permit empty/control ASCII strings", () => {
  for (const x of [-2147483648, 0, 2147483647]) assertObjectValue(x, DEFAULT_SETTINGS);
  for (const x of [true, 0.5, "1", Infinity, -2147483649]) {
    assert.throws(() => assertObjectValue(x, DEFAULT_SETTINGS));
  }
  const strings = { ...DEFAULT_SETTINGS, objectType: "string" as const };
  for (const x of ["", "\0\n\x7f", "a".repeat(128)]) assertObjectValue(x, strings);
  for (const x of ["é", "a".repeat(129), 1]) assert.throws(() => assertObjectValue(x, strings));
});

test("two players have identical payoff regardless of opposed raw values", () => {
  for (const [a, b] of [[1, 0], [0.2, 0.8], [0.7, 0.3]]) {
    const values = new Map([["a", a], ["b", b]]);
    assert.equal(personalScore(values, "a").score, personalScore(values, "b").score);
    assert.deepEqual(Object.keys(personalScore(values, "a")).sort(), ["othersValueSum", "ownValue", "score"]);
  }
});

test("three players permit a genuine payoff conflict", () => {
  const before = new Map([["a", 0.5], ["b", 0.5], ["c", 1]]);
  const after = new Map([["a", 0.75], ["b", 0.25], ["c", 1]]);
  assert.equal(personalScore(before, "a").score, 0.75);
  assert.equal(personalScore(after, "a").score, 0.9375);
  assert.equal(personalScore(after, "b").score, 0.4375);
  assert.equal(totalValue(before), 2);
  assert.equal(personalScore(new Map([["a", 1]]), "a").score, 0);
  assert.throws(() => personalScore(new Map([["a", NaN]]), "a"));
  assert.throws(() => personalScore(before, "missing"));
});

test("leaderboards sum objects and preserve tied ranks", () => {
  const values = new Map([["a", 0.5], ["b", 0.5]]);
  const rows = leaderboard(["b", "a"], [values, values]);
  assert.deepEqual(rows, [
    { deityId: "a", totalScore: 0.5, rank: 1 },
    { deityId: "b", totalScore: 0.5, rank: 1 },
  ]);
});

test("uniform integer draws include both endpoints", () => {
  assert.equal(uniformObject(DEFAULT_SETTINGS, () => 0n), -2147483648);
  assert.equal(uniformObject(DEFAULT_SETTINGS, n => n - 1n), 2147483647);
  assert.throws(() => uniformObject(DEFAULT_SETTINGS, n => n));
});

test("uniform strings rank every possible string once, not every length equally", () => {
  const settings = { ...DEFAULT_SETTINGS, objectType: "string" as const, stringMaxLength: 2 };
  const population = 1 + 128 + 128 * 128;
  const all = new Set<string>();
  for (let rank = 0; rank < population; rank++) all.add(asciiStringAtRank(BigInt(rank), 2));
  assert.equal(all.size, population);
  assert.equal([...all].filter(x => x.length === 0).length, 1);
  assert.equal([...all].filter(x => x.length === 1).length, 128);
  assert.equal([...all].filter(x => x.length === 2).length, 16384);
  assert.equal(uniformObject(settings, () => 0n), "");
  assert.equal(uniformObject(settings, n => n - 1n), "\x7f\x7f");
  assert.throws(() => asciiStringAtRank(BigInt(population), 2));
});

test("half-life is a survival half-life and disabled Poisson sources never fire", () => {
  assert.equal(lifetimeSeconds(300, 0.5), 300);
  assert.equal(lifetimeSeconds(300, 0.25), 600);
  assert.equal(poissonIntervalSeconds(0, 0.5), Infinity);
  assert.throws(() => lifetimeSeconds(300, 0));
  assert.throws(() => lifetimeSeconds(300, 1));
});

test("UUID aliases expand both colliding records and reject ambiguous legacy codes", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-111111111112",
    "f1111111-1111-4111-8111-111111111111",
  ];
  assert.equal(encodeUuid("00000000-0000-0000-0000-000000000000"), "0".repeat(26));
  const entries = uniquePrefixes(ids);
  assert.equal(entries[0].prefixLength, 26);
  assert.equal(entries[1].prefixLength, 26);
  assert.equal(entries[2].prefixLength, 4);
  assert.throws(() => resolveIdentifier(entries[0].shortCode.slice(0, 4), ids), /Ambiguous/);
  assert.equal(resolveIdentifier(entries[0].shortCode, ids), ids[0]);
  assert.equal(resolveIdentifier(ids[1].toUpperCase(), ids), ids[1]);
  assert.throws(() => uniquePrefixes([ids[0], ids[0].toUpperCase()]));
});

test("energy accrues in real time; exact balance succeeds; failed spend is immutable", () => {
  const account = { balance: 100, settledAtMs: 0 };
  assert.deepEqual(spendEnergy(account, 1000, 1, 101), { balance: 0, settledAtMs: 1000 });
  assert.deepEqual(settleEnergy(account, 180000, 1), { balance: 280, settledAtMs: 180000 });
  assert.throws(() => spendEnergy(account, 0, 1, 101), /Insufficient/);
  assert.equal(account.balance, 100);
  assert.throws(() => settleEnergy(account, -1, 1));
});
