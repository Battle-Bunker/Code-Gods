/** The in-memory fake host: the toy line's reads, quotes and settlement, priced by spec §2.3, §3.1, §5.2, §6.1–§6.3. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeHost, codes } from "../src/index.ts";

const ctx = { hostCallsLeft: 10 };
const ok = (reply: ReturnType<FakeHost["handle"]>) => { assert.equal(reply.ok, true, reply.ok ? "" : reply.error); return reply as Extract<typeof reply, { ok: true }>; };

test("codes match the spec's table", () => {
  assert.deepEqual([1, 2, 3, 4, 7].map(codes.gamma), [1, 3, 3, 5, 5]);
  assert.deepEqual([0, 1, -1, 2, -2, 3, -3, 4, -4].map(n => codes.int(BigInt(n))), [1, 3, 3, 5, 5, 5, 5, 7, 7]);
  assert.deepEqual([1, -1, 2, 3, 4, 7].map(n => codes.nonzero(BigInt(n))), [2, 2, 4, 4, 6, 6]);
});

test("a view costs its coordinates once; repeats and derived elements are free; an element alone costs its value", () => {
  const host = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });
  const y = ok(host.handle({ op: "element", ref: { rep: "si", name: "y", args: { q: "2" } } }, ctx));
  assert.deepEqual(y.result, { ref: { rep: "si", name: "y", args: { q: "2" } }, value: { kind: "number", q: "7" }, bits: 7 + 1 });
  const first = ok(host.handle({ op: "view", rep: "si" }, ctx));
  assert.deepEqual(first.result, { rep: "si", site: 0, elements: { m: { kind: "number", q: "1" }, c: { kind: "number", q: "5" }, sign: { kind: "symbol", text: "+" } }, bits: 4 + 8 });
  assert.equal(first.bits, 12);
  assert.equal(ok(host.handle({ op: "view", rep: "si" }, ctx)).bits, 0);
  assert.equal(ok(host.handle({ op: "element", ref: { rep: "si", name: "m" } }, ctx)).bits, 0, "a coordinate of a representation read in full");
  assert.equal(ok(host.handle({ op: "view", rep: "seq" }, ctx)).bits, 0, "seq's coordinates are functions of si's: never more than one full read");
  assert.equal(host.readBits, 8 + 12);
});

test("a quote of an unread state charges the read of its first mutator's representation, once", () => {
  const host = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });
  const q = ok(host.handle({ op: "quote", calls: [{ mutator: "seq.step", site: 0, args: { k: "2" } }, { mutator: "si.shift", site: 0, args: { k: "-1" } }] }, ctx));
  assert.deepEqual(q.result, { valid: true, bits: [6, 4], total: 10, charge: 10 + 0.05 * 100 });
  assert.equal(q.bits, 12, "seq read in full");
  assert.equal(ok(host.handle({ op: "quote", calls: [] }, ctx)).bits, 0);
  const bad = ok(host.handle({ op: "quote", calls: [{ mutator: "si.tilt", site: 0, args: { k: "1/2" } }] }, ctx));
  assert.deepEqual(bad.result, { valid: false, reason: "si.tilt: k must be a nonzero integer", bits: [], total: 0, charge: 0 });
});

test("settle applies the calls in order and charges R/κ + W + βW²; an invalid call fails the whole act", () => {
  const host = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });
  host.handle({ op: "view", rep: "si" }, ctx);
  const done = host.settle('[{"mutator":"seq.step","site":0,"args":{"k":"2"}}]');
  assert.deepEqual(done, { outcome: "committed", prices: [6], total: 6, readBits: 12, charge: 12 / 32 + 6 + 0.05 * 36, state: { m: "3", c: "3" } });
  const failed = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } }).settle('[{"mutator":"si.tilt","site":0,"args":{"k":"0"}}]');
  assert.equal(failed.outcome, "failed");
  assert.deepEqual(failed.state, { m: "1", c: "5" });
  assert.equal(new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } }).settle("null").outcome, "skipped");
});

test("myScore reads the rule's representations and scores on the ladder", () => {
  const host = new FakeHost({ line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });
  const s = ok(host.handle({ op: "myScore" }, ctx));
  assert.deepEqual(s.result, { score: ["-4"], level: 3, top: 7, terms: [{ id: "gap", value: "4" }] });
  assert.equal(s.bits, 12);
});
