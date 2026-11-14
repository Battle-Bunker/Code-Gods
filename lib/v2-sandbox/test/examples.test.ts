/**
 * The three example agents of spec §6.6, in both languages, against the fake host: each pair makes the same host
 * calls in the same order, receives the same receipts, and returns the same calls at the same cost.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FakeHost, type FakeHostOptions } from "../src/index.ts";
import { agentSource, sandboxes } from "./helpers.ts";

const boxes = sandboxes();
after(() => boxes.close());

async function runBoth(agent: string, options: FakeHostOptions) {
  const runs = [];
  for (const [language, file] of [["python", `${agent}.py`], ["typescript", `${agent}.ts`]] as const) {
    const host = new FakeHost(options);
    const result = await (await boxes.get(language)).act({ source: agentSource(file), offer: { object: 0 }, seed: "7", host });
    assert.equal(result.ok, true, `${language}: ${result.ok ? "" : result.error}`);
    if (!result.ok) throw new Error("unreachable");
    runs.push({ transcript: result.transcript, readBits: result.readBits, calls: JSON.parse(result.calls), settled: host.settle(result.calls) });
  }
  assert.deepEqual(runs[0], runs[1], "Python and TypeScript differ");
  return runs[0];
}

test("Prime Gradient: one read, then tilt to the nearest prime (the first on a tie)", async () => {
  const run = await runBoth("prime-gradient", { line: { m: 4, c: 1 }, rule: { family: "prime-gradient", params: {} } });
  assert.deepEqual(run.transcript.map(t => t.request), [{ op: "view", rep: "si" }]);
  assert.deepEqual(run.calls, [{ mutator: "si.tilt", site: 0, args: { k: "-1" } }]);
  assert.equal(run.settled.outcome, "committed");
  assert.deepEqual(run.settled.state, { m: "3", c: "1" });
});

test("m Meets c: three quotes, the cheapest plan (seq.step(2) on y = x + 5)", async () => {
  const run = await runBoth("m-meets-c", { line: { m: 1, c: 5 }, rule: { family: "m-meets-c", params: {} } });
  assert.deepEqual(run.transcript.map(t => t.request.op), ["view", "quote", "quote", "quote"]);
  const totals = run.transcript.slice(1).map(t => (t.reply as { ok: true; result: { total: number } }).result.total);
  // which = log2 4 = 2 bits; k by the nonzero code; surcharge = growth of φ = int(m) + int(c) (10 bits here).
  assert.deepEqual(totals, [2 + 6, 2 + 6 + 4, 2 + 4]);
  assert.deepEqual(run.calls, [{ mutator: "seq.step", site: 0, args: { k: "2" } }]);
  assert.deepEqual(run.settled.prices, [6]);
  assert.equal(run.readBits, 3 + 1 + 7 + 1, "rat(1) + rat(5): int code plus the 1-bit denominator, read once");
});

test("Triangle Area: one read, a local search, quotes only to break ties", async () => {
  const run = await runBoth("triangle-area", { line: { m: 2, c: 3 }, rule: { family: "triangle-area", params: { A: 6 } } });
  const ops = run.transcript.map(t => t.request.op);
  assert.deepEqual(ops.slice(0, 2), ["view", "myRule"]);
  assert.ok(ops.slice(2).every(op => op === "quote") && ops.length > 3, ops.join(","));
  assert.equal(run.settled.outcome, "committed");
  assert.equal(run.readBits, 5 + 1 + 5 + 1, "quotes of a state already read are free");
});
