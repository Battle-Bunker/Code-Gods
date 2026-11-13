/**
 * Futile acts (convex/lib/futility.ts): which failed acts are provably futile to retry, the memo the tick keeps of them,
 * and the pairing that never offers an agent an object it can only fail on. Pure, no backend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FutileMemo, MAX_FUTILE_PER_AGENT, diagnoseAgent, futileAfter, pickPair, failureKind } from "../../convex/lib/futility.ts";

const obj = (id: string, version = 0) => ({ id, version });

test("a deterministic failed act is futile on that object version; a randomized one, an error or a transform is not", () => {
  assert.deepEqual(futileAfter({ object: obj("a", 3), deterministic: true, kind: "noChange" }), { o: "a", v: 3 });
  assert.deepEqual(futileAfter({ object: obj("a", 3), deterministic: true, kind: "invalid" }), { o: "a", v: 3 });
  assert.equal(futileAfter({ object: obj("a", 3), deterministic: false, kind: "noChange" }), null);
  // A runtime error can be a timeout: never treated as reproducible.
  assert.equal(futileAfter({ object: obj("a", 3), deterministic: true, kind: "error" }), null);
  assert.equal(futileAfter({ object: obj("a", 3), deterministic: true, kind: "transform" }), null);
  // a skip is a choice, not a failure: never remembered as futile (docs/energy-model.md §2)
  assert.equal(futileAfter({ object: obj("a", 3), deterministic: true, kind: "skip" }), null);
});

test("a deterministic collision is futile while the object that holds the value keeps it", () => {
  const entry = futileAfter({ object: obj("a", 3), deterministic: true, kind: "collision", holder: obj("b", 7) });
  assert.deepEqual(entry, { o: "a", v: 3, by: "b", bv: 7 });
  const memo = new FutileMemo([{ agentId: "x", entries: [entry!] }]);
  const versions = new Map([["a", 3], ["b", 7]]);
  assert.equal(memo.isFutile("x", obj("a", 3), id => versions.get(id)), true);
  // The holder changed: the value may be free again.
  versions.set("b", 8);
  assert.equal(memo.isFutile("x", obj("a", 3), id => versions.get(id)), false);
  // A collision with no known holder is not remembered.
  assert.equal(futileAfter({ object: obj("a", 3), deterministic: true, kind: "collision" }), null);
});

test("the memo forgets an entry when its object changes version, and is per agent", () => {
  const memo = new FutileMemo([{ agentId: "x", entries: [{ o: "a", v: 3 }] }]);
  const versionOf = () => undefined;
  assert.equal(memo.isFutile("x", obj("a", 3), versionOf), true);
  assert.equal(memo.isFutile("y", obj("a", 3), versionOf), false);
  assert.equal(memo.isFutile("x", obj("a", 4), versionOf), false);
  assert.equal(memo.isFutile("x", obj("b", 3), versionOf), false);
});

test("record and changedRows: only agents whose memo changed are written, pruned of stale entries", () => {
  const memo = new FutileMemo([
    { agentId: "x", entries: [{ o: "a", v: 1 }, { o: "b", v: 1 }] },
    { agentId: "y", entries: [{ o: "a", v: 1 }] },
  ]);
  memo.record("x", "c", { o: "c", v: 0 });
  const versions = new Map([["a", 2], ["b", 1], ["c", 0]]);
  // x changed: its stale entry for a (now version 2) goes; y did not change and is not rewritten.
  assert.deepEqual(memo.changedRows(id => versions.get(id)), [{ agentId: "x", entries: [{ o: "b", v: 1 }, { o: "c", v: 0 }] }]);
  // A success clears the pair's entry.
  const again = new FutileMemo([{ agentId: "x", entries: [{ o: "a", v: 1 }] }]);
  again.record("x", "a", null);
  assert.deepEqual(again.changedRows(id => versions.get(id)), [{ agentId: "x", entries: [] }]);
  // Recording nothing new for an agent with no entry changes nothing.
  const quiet = new FutileMemo([]);
  quiet.record("z", "a", null);
  assert.deepEqual(quiet.changedRows(id => versions.get(id)), []);
});

test("pickPair never offers an agent an object its act is futile on, and tries other objects first", () => {
  const objects = [obj("a"), obj("b"), obj("c")];
  const agents = [{ id: "x" }, { id: "y" }];
  // x is futile everywhere but c; y everywhere.
  const futile = (agent: { id: string }, o: { id: string }) => agent.id === "y" || o.id !== "c";
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 200; i++) {
    const pair = pickPair(objects, agents, os => os[Math.floor(rng() * os.length)], as => as[Math.floor(rng() * as.length)], futile);
    assert.ok(pair, "a pair exists");
    assert.equal(pair.object.id, "c");
    assert.equal(pair.agent.id, "x");
  }
  // No pair at all: nothing is offered, so nobody is charged.
  assert.equal(pickPair(objects, agents, os => os[0], as => as[0], () => true), null);
});

test("pickPair with nothing futile is the plain pick: the object first, then the chosen agent", () => {
  const objects = [obj("a"), obj("b")];
  const agents = [{ id: "x" }, { id: "y" }, { id: "z" }];
  const pair = pickPair(objects, agents, os => os[1], as => as[as.length - 1], () => false);
  assert.deepEqual(pair, { object: objects[1], agent: agents[2] });
});

test("failureKind sorts the engine's failure reasons into the breakdown's kinds", () => {
  assert.equal(failureKind("another object already has this value"), "collision");
  assert.equal(failureKind("no change"), "noChange");
  assert.equal(failureKind("the commit clause kept the object: it would not raise your points"), "commit");
  // Calling commit() where the room has no commit clause is an invalid act, not the clause keeping the object.
  assert.equal(failureKind("this room does not offer the commit clause"), "invalid");
  assert.equal(failureKind("call 1 (paint): unknown colour"), "invalid");
});

test("diagnoseAgent: the owner's failure breakdown, one line on why and a fix", () => {
  const none = { collision: 0, noChange: 0, commit: 0, invalid: 0, error: 0 };
  assert.equal(diagnoseAgent({ transforms: 0, failures: none }), undefined);
  const constant = diagnoseAgent({ transforms: 0, failures: { ...none, collision: 38 } })!;
  assert.equal(constant.summary, "38 of 38 acts failed: another object already has this value");
  assert.match(constant.hint!, /depend on the object/);
  const mixed = diagnoseAgent({ transforms: 10, failures: { ...none, noChange: 25, collision: 5 } })!;
  assert.equal(mixed.summary, "30 of 40 acts failed: the act changed nothing ×25, another object already has this value ×5");
  assert.match(mixed.hint!, /changes nothing more/);
  const invalid = diagnoseAgent({ transforms: 0, failures: { ...none, invalid: 4 }, lastFailures: { invalid: "call 1 (paint): unknown colour", error: "timed out" } })!;
  assert.doesNotMatch(invalid.hint!, /timed out/);
  assert.match(invalid.hint!, /unknown colour/);
  // Mostly working: the breakdown, no fix to suggest.
  const fine = diagnoseAgent({ transforms: 30, failures: { ...none, collision: 2 } })!;
  assert.equal(fine.summary, "2 of 32 acts failed: another object already has this value");
  assert.equal(fine.hint, undefined);
});

test("pickPair finds the one workable object among thousands of futile ones", () => {
  const objects = Array.from({ length: 2000 }, (_, i) => obj(`o${i}`));
  const agents = [{ id: "x" }];
  for (let i = 0; i < 50; i++) {
    const pair = pickPair(objects, agents, os => os[Math.floor(Math.random() * os.length)], as => as[0], (_a, o) => o.id !== "o1234");
    assert.equal(pair?.object.id, "o1234");
  }
});

test("the memo keeps at most MAX_FUTILE_PER_AGENT pairs per agent, forgetting the oldest", () => {
  const memo = new FutileMemo([]);
  for (let i = 0; i <= MAX_FUTILE_PER_AGENT; i++) memo.record("x", `o${i}`, { o: `o${i}`, v: 0 });
  const [row] = memo.changedRows(() => 0);
  assert.equal(row.entries.length, MAX_FUTILE_PER_AGENT);
  assert.equal(row.entries[0].o, "o1", "the oldest went");
});

test("a change the agent could not afford is its own failure kind, never remembered as futile (docs/energy-model.md §7.2)", async () => {
  const { unaffordableReason, failureKind, futileAfter, diagnoseAgent, NO_FAILURES } = await import("../../convex/lib/futility.ts");
  assert.equal(unaffordableReason(986.13, 11.52, 480), "could not afford this change: it costs 986.1 bits, the agent had 11.5 and may owe at most 480.0");
  assert.equal(failureKind(unaffordableReason(986.13, 11.52, 480)), "unaffordable");
  assert.equal(futileAfter({ object: { id: "o", version: 3 }, deterministic: true, kind: "unaffordable" }), null, "it commits once the agent holds more");
  const d = diagnoseAgent({ transforms: 1, failures: { ...NO_FAILURES, unaffordable: 9 } })!;
  assert.match(d.summary, /9 of 10 acts failed: it could not afford the change/);
  assert.match(d.hint!, /bigger power share/);
  // Counts stored before the kind existed have no entry for it.
  assert.equal(diagnoseAgent({ transforms: 3, failures: { collision: 0, noChange: 0, commit: 0, invalid: 0, error: 0 } }), undefined);
});
