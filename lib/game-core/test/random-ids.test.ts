import assert from "node:assert/strict";
import test from "node:test";
import { lifetimeSeconds, poissonIntervalSeconds } from "../src/random.ts";
import { encodeUuid, uniquePrefixes, resolveIdentifier } from "../src/identifiers.ts";

test("half-life is a survival half-life and disabled Poisson sources never fire", () => {
  assert.equal(lifetimeSeconds(300, 0.5), 300);
  assert.equal(lifetimeSeconds(300, 0.25), 600);
  assert.equal(poissonIntervalSeconds(0, 0.5), Infinity);
  assert.ok(Math.abs(poissonIntervalSeconds(0.1, 1 / Math.E) - 10) < 1e-12); // mean interval 1/rate
  assert.throws(() => lifetimeSeconds(300, 0));
  assert.throws(() => lifetimeSeconds(300, 1));
  assert.throws(() => lifetimeSeconds(0, 0.5));
  assert.throws(() => poissonIntervalSeconds(-1, 0.5));
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
