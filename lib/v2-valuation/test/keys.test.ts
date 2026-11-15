/** Value keys: a variant that differs from another only in its menu shares its values (Variant.valuesOf). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ObjectType } from "@workspace/v2-core";
import { lineQ, lineQLenses, lineType, lineZ } from "@workspace/v2-linear";
import { ruleKey, valuesHash, valuesVariant } from "../src/index.ts";

const T = lineType as ObjectType<unknown>;

test("line-q-lenses reads line-q's value keys; line-q's own key is what it was", () => {
  assert.equal(ruleKey(T, lineQLenses, "prime-landing", {}, "big-prime"), ruleKey(T, lineQ, "prime-landing", {}, "big-prime"));
  assert.match(ruleKey(T, lineQ, "prime-landing", {}, "big-prime"), /^line@1\/line-q#/);
  assert.equal(valuesVariant(T, lineZ), lineZ);
});

test("sharing values needs the same params (the same law)", () => {
  assert.throws(() => valuesVariant(T, { ...lineQLenses, valuesOf: "line-z" }), /params differ/);
  assert.throws(() => valuesVariant(T, { ...lineQLenses, valuesOf: "nope" }), /does not have/);
});

test("a value key does not change with the menu: only the object type and the params are hashed", () => {
  const k = ruleKey(T, lineQ, "treasure", { k: 2, T: 11 }, "prime-terms");
  assert.equal(ruleKey(T, { ...lineQ, mutators: lineQ.mutators.slice(0, 3), which: undefined }, "treasure", { k: 2, T: 11 }, "prime-terms"), k);
  assert.equal(valuesHash({ ...lineQ, birthMixSteps: 7 }), valuesHash(lineQ));
  assert.notEqual(valuesHash(lineZ), valuesHash(lineQ));
});
