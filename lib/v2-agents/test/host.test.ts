/** The engine host's read accounting (spec §3.1, §6.2–§6.3) and one act's outcomes and charge (§6.1). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineType, lineZ } from "@workspace/v2-linear";
import { applyCalls, isInvalid, q } from "@workspace/v2-core";
import type { HostReply, HostRequest } from "@workspace/v2-sandbox";
import { EngineHost, runAct, sandboxes, SPEC_ECONOMY, type RuleRef } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
// y = 2x + 3 on line-z: si reads m = 2 (6 bits) and c = 3 (6 bits); φ, the full read of the state, is less.
const state = { lines: [fromMC(q(2), q(3))] };
const PHI = lineType.readLength(state, lineZ);
const rule: RuleRef = { family: "m-meets-c", params: {} };
const host = () => new EngineHost({ type: lineType, variant: lineZ, state, rule, energy: 50 });
const ask = (h: EngineHost<typeof state>, request: HostRequest) => h.handle(request, { hostCallsLeft: 10 }) as HostReply & { ok: true; result: any };

test("a view charges its coordinates once, within one full read of the state; dynamic elements are charged on their own", () => {
  const h = host();
  const si = ask(h, { op: "view", rep: "si" });
  assert.deepEqual(si.result.elements.m, { kind: "number", q: "2" });
  assert.equal(si.result.elements.sign.text, "uphill", "derived elements come with the view");
  assert.equal(si.result.elements.y, undefined, "dynamic elements need arguments");
  assert.equal(si.result.bits, 12);
  assert.ok(PHI < 12);
  assert.equal(si.bits, PHI, "never past φ");
  assert.equal(ask(h, { op: "view", rep: "si" }).bits, 0, "a repeat is free");
  assert.equal(ask(h, { op: "view", rep: "seq" }).bits, 0, "the act has already paid one full read");
  const t3 = ask(h, { op: "element", ref: { rep: "seq", name: "term", args: { n: "3" } } });
  assert.deepEqual(t3.result.value, { kind: "number", q: "9" });
  assert.equal(t3.bits, 10, "rat(9): int(9) = 9 bits and a 1-bit denominator");
  assert.equal(ask(h, { op: "element", ref: { rep: "seq", name: "term", args: { n: "3" } } }).bits, 0);
  assert.equal(h.readBits, PHI + 10);
  assert.deepEqual(Object.fromEntries(h.readsByRep), { si: PHI, seq: 10 });
});

test("a single static element counts towards its view's full read", () => {
  const h = host();
  assert.equal(ask(h, { op: "element", ref: { rep: "si", name: "m" } }).bits, 6);
  assert.equal(ask(h, { op: "view", rep: "si" }).bits, PHI - 6, "only what is left of φ");
});

test("myScore charges the rule's views and reports each layer; myRule and budget are free", () => {
  const h = host();
  const s = ask(h, { op: "myScore" });
  assert.deepEqual(s.result.score, ["-1", "3"], "main part: −|m − c|; tie-breaker (the family's first, size): |c|");
  assert.equal(s.result.layers[0].level, 6, "|m − c| = 1: the Z ladder's 'within 1' rung");
  assert.equal(s.result.layers[0].top, 7);
  assert.equal(s.result.layers[1].id, "size");
  assert.equal(s.bits, PHI);
  const r = ask(h, { op: "myRule" }).result;
  assert.equal(r.tieBreaker, "size");
  assert.deepEqual(r.layers.map((l: { id: string }) => l.id), ["gap", "size"]);
  assert.match(r.card, /Tie-breaker/);
  assert.equal(ask(h, { op: "budget" }).result.energy, 50);
  assert.equal(h.readBits, PHI);
  const alone = new EngineHost({ type: lineType, variant: lineZ, state, rule: { ...rule, tieBreaker: null }, energy: 50 });
  assert.deepEqual(ask(alone, { op: "myScore" }).result.score, ["-1"], "tieBreaker null: the main layer alone");
});

test("the first quote charges the first mutator's view; the price is v2-core's, the charge W + βW²", () => {
  const h = host();
  const calls = [{ mutator: "si.shift", site: 0, args: { k: "-1" } }];
  const first = ask(h, { op: "quote", calls });
  assert.equal(first.bits, PHI);
  const applied = applyCalls(lineType, lineZ, state, calls);
  assert.ok(!isInvalid(applied));
  assert.deepEqual(first.result.bits, applied.prices.map(p => p.total));
  assert.equal(first.result.charge, applied.total + SPEC_ECONOMY.beta * applied.total ** 2);
  assert.equal(ask(h, { op: "quote", calls }).bits, 0);
  const bad = ask(h, { op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "0" } }] });
  assert.equal(bad.result.valid, false);
  assert.match(bad.result.reason, /k/);
});

test("bad requests are host errors, not exceptions", () => {
  const h = host();
  assert.equal(h.handle({ op: "view", rep: "nope" }, { hostCallsLeft: 1 }).ok, false);
  assert.equal(h.handle({ op: "view", rep: "si", site: 1 }, { hostCallsLeft: 1 }).ok, false);
  assert.equal(h.handle({ op: "element", ref: { rep: "seq", name: "term" } }, { hostCallsLeft: 1 }).ok, false);
  assert.equal(h.readBits, 0);
});

const act = async (source: string, language: "typescript" | "python" = "typescript", liveObjects = 8) =>
  runAct(await boxes.get(language), { type: lineType, variant: lineZ, state, rule, program: { language, source }, seed: "1", energy: 50, liveObjects });

test("a committed act is charged R/κ + W + βW², the offer included in R", async () => {
  const { record, state: after } = await act(`function agent(o) { look(o, "si"); return [move("si.shift", { k: -1 })]; }`);
  assert.equal(record.outcome, "committed");
  assert.equal(record.offerBits, 3);
  assert.equal(record.readBits, PHI + 3);
  assert.deepEqual(record.readsByRep, { si: PHI, offer: 3 });
  const w = record.calls[0]!.price.total;
  assert.equal(record.changeBits, w);
  assert.equal(record.charge, (PHI + 3) / 32 + w + 0.05 * w * w);
  assert.equal(lineType.encode(after), lineType.encode({ lines: [fromMC(q(2), q(2))] }));
  assert.equal(record.after, lineType.encode(after));
});

test("skips, invalid calls and broken programs change nothing and are charged their reads", async () => {
  const skip = await act(`def agent(offer):\n    look(offer, "si")\n    return None\n`, "python");
  assert.equal(skip.record.outcome, "skipped");
  assert.equal(skip.record.charge, (PHI + 3) / 32);
  const invalid = await act(`function agent(o) { look(o, "si"); return [move("si.shift", { k: 0 })]; }`);
  assert.equal(invalid.record.outcome, "failed");
  assert.match(invalid.record.reason!, /k/);
  assert.equal(invalid.record.charge, (PHI + 3) / 32);
  assert.equal(invalid.state, state);
  const broken = await act(`function agent(o) { look(o, "si"); throw new Error("oops"); }`);
  assert.equal(broken.record.outcome, "failed");
  assert.equal(broken.record.code, "EXECUTION");
  assert.equal(broken.record.readBits, PHI + 3);
  const compile = await act(`function agent(o) {`);
  assert.equal(compile.record.code, "COMPILE");
  assert.equal(compile.record.charge, 3 / 32);
});
