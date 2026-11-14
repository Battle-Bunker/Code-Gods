/**
 * The helper libraries behave the same in both languages: the same agent, written once in TypeScript and once in
 * Python with the helpers (look, peek, goal, progress, move, price, cheapest, energy, prime, square, near), makes the
 * same host calls in the same order, is charged the same reads and returns the same calls, against the engine host
 * over lib/v2-linear's real line, rules and prices.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromMC, lineType, lineZ, lineQ } from "@workspace/v2-linear";
import { q, type Q } from "@workspace/v2-core";
import { EngineHost, runAct, sandboxes, type RuleRef } from "../src/index.ts";
import type { Language } from "@workspace/v2-sandbox";

const boxes = sandboxes();
after(() => boxes.close());
const source = (file: string) => readFileSync(new URL(`./agents/${file}`, import.meta.url), "utf8");
const line = (m: Q | number, c: Q | number, v = lineZ) =>
  ({ variant: v, state: { lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] } });

async function both(agent: string, rule: RuleRef, at: ReturnType<typeof line>) {
  const out = [];
  for (const language of ["typescript", "python"] as Language[]) {
    const file = `${agent}.${language === "python" ? "py" : "ts"}`;
    const { record } = await runAct(await boxes.get(language), {
      type: lineType, ...at, rule, program: { language, source: source(file) }, seed: "7", energy: 100,
    });
    const { steps: _steps, ...comparable } = record;
    out.push(comparable);
  }
  assert.deepEqual(out[1], out[0], `${agent}: Python and TypeScript differ`);
  return out[0]!;
}

test("Prime Gradient with look and near: one read of si, then a tilt to the nearest prime", async () => {
  const r = await both("prime-gradient", { family: "prime-gradient", params: {} }, line(9, 1));
  assert.deepEqual(r.transcript.map(t => t.request), [{ op: "view", rep: "si" }]);
  assert.equal(r.outcome, "committed");
  assert.deepEqual(r.calls.map(c => [c.mutator, c.args]), [["si.tilt", { k: "-2" }]], "9 → 7: on a tie the smaller prime");
  assert.equal(r.after, lineType.encode({ lines: [fromMC(q(7), q(1))] }));
  const skip = await both("prime-gradient", { family: "prime-gradient", params: {} }, line(5, 3));
  assert.equal(skip.outcome, "skipped");
});

test("m Meets c with cheapest: three routes priced, the cheapest made, by real v2-linear prices", async () => {
  const r = await both("m-meets-c", { family: "m-meets-c", params: {} }, line(1, 5));
  assert.deepEqual(r.transcript.map(t => t.request.op), ["view", "quote", "quote", "quote"]);
  const charges = r.transcript.slice(1).map(t => (t.reply as { ok: true; result: { charge: number } }).result.charge);
  const cheapest = Math.min(...charges);
  assert.equal(r.outcome, "committed");
  const picked = charges.indexOf(cheapest);
  assert.equal(r.calls[0]!.mutator, ["si.shift", "si.tilt", "seq.step"][picked]);
  assert.equal(r.calls[0]!.rep, ["si", "si", "seq"][picked]);
});

test("Triangle Area with goal and cheapest: one read, a search in the agent's own time, quotes only of the best", async () => {
  const r = await both("triangle-area", { family: "triangle-area", params: { A: 6 } }, line(2, 3));
  const ops = r.transcript.map(t => t.request.op);
  assert.deepEqual(ops.slice(0, 2), ["view", "myRule"]);
  assert.ok(ops.slice(2).every(op => op === "quote"));
  assert.equal(r.outcome, "committed");
});

test("every helper gives the same answers in both languages", async () => {
  const out: string[] = [];
  for (const language of ["typescript", "python"] as Language[]) {
    const host = new EngineHost({ type: lineType, variant: lineQ, state: line(q(3, 2), q(-4), lineQ).state, rule: { family: "triangle-area", params: { A: 6 } }, energy: 100 });
    const res = await (await boxes.get(language)).act({ source: source(`every-helper.${language === "python" ? "py" : "ts"}`), offer: { object: 0 }, seed: "1", host });
    assert.equal(res.ok, true, res.ok ? "" : res.error);
    if (res.ok) out.push(JSON.stringify({ calls: JSON.parse(res.calls), transcript: res.transcript, readBits: res.readBits }));
  }
  assert.equal(out[1], out[0]);
  const calls = JSON.parse(out[0]!).calls as { mutator: string; args: Record<string, string> }[];
  assert.deepEqual(calls.map(c => c.mutator), ["si.shift", "probe"], "the one-move plan is cheaper than the two-move one; the made-up mutator is not allowed");
  assert.deepEqual(calls[1]!.args.r.split("|").slice(6), ["1/2", "16/3", "100", "true", "true", "false", "false", "true", "false", "2", "9", "true", "false", "false", "false", "3", "9"]);
});

test("an agent may declare its own name that a helper has (the helpers are configurable globals)", async () => {
  const src = `const square = x => Q.mul(x, x);\nconst price = 3;\nfunction agent(offer) { return [move("si.shift", { k: Q.sub(square(price), 8) })]; }`;
  const { record } = await runAct(await boxes.get("typescript"), {
    type: lineType, ...line(1, 1), rule: { family: "m-meets-c", params: {} }, program: { language: "typescript", source: src }, seed: "1", energy: 10,
  });
  assert.equal(record.outcome, "committed", record.reason);
  assert.deepEqual(record.calls[0]!.args, { k: "1" });
});
