import test from "node:test";
import assert from "node:assert/strict";
import { completionSecret } from "../src/lib/connect-completion.ts";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
};

test("the completion secret survives a reload of the same request, so an approved request can still complete", () => {
  const storage = memory();
  const first = completionSecret(storage, "request-one");
  assert.match(first, /^[A-Za-z0-9_-]{43}$/, "32 random bytes, base64url: what approve accepts");
  assert.equal(completionSecret(storage, "request-one"), first);
  assert.notEqual(completionSecret(storage, "request-two"), first, "another request gets its own secret");
});

test("without usable storage the page still gets a fresh secret", () => {
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  const a = completionSecret(broken, "r"), b = completionSecret(null, "r");
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});
