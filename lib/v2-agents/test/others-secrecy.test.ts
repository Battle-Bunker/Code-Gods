/**
 * The other players' rules reach the host only so it can answer othersAfter (W2 #517): a player's rule stays secret.
 * What would break: any host reply (a result, a charge, an error) that differs between two opponents whose rules
 * differ but whose worth totals are the same, i.e. agent code learning more than the others' summed bits.
 */
import { lineZ } from "./config.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineType } from "@workspace/v2-linear";
import { q } from "@workspace/v2-core";
import type { HostRequest } from "@workspace/v2-sandbox";
import { EngineHost, type RuleRef } from "../src/index.ts";

const state = { lines: [fromMC(q(2), q(3))] };
const mine: RuleRef = { family: "long-run", params: { b: 7, d: 3, on: "y-intercept top" }, tieBreaker: null };
// The same two opponents in either seat order: each seat's rule differs, and the totals agree on every state.
const host = (first: RuleRef, second: RuleRef) => new EngineHost({ type: lineType, variant: lineZ, state, rule: mine, energy: 50, energySeed: "s", others: [{ rule: first }, { rule: second }] });

const requests: HostRequest[] = [
  { op: "myRule" }, { op: "myScore" }, { op: "budget" }, { op: "worth" }, { op: "recent" },
  { op: "othersAfter", calls: [{ mutator: "add", site: 0, args: { lens: "mc", at: "3", k: "1" } }] },
  { op: "othersAfter", calls: [{ mutator: "add", site: 0, args: { lens: "mc", at: "1", k: "3" } }, { mutator: "add", site: 0, args: { lens: "mc", at: "3", k: "-2" } }] },
  { op: "othersAfter", calls: [{ mutator: "no.such", site: 0, args: {} }] },
  { op: "othersAfter", calls: "nonsense" },
  { op: "othersAfter" },
  { op: "rarity", score: null },
  { op: "view", rep: "si" },
  { op: "quote", calls: [{ mutator: "add", site: 0, args: { lens: "mc", at: "3", k: "1" } }] },
] as never;

test("agent code cannot tell apart two opponents whose rules differ but whose totals agree", () => {
  const p: RuleRef = { family: "bearing", params: { deg: 37 }, tieBreaker: null }, w: RuleRef = { family: "long-run", params: { b: 7, d: 3, on: "y-intercept top" }, tieBreaker: null };
  const a = host(p, w), b = host(w, p);
  for (const r of requests) {
    const ra = a.handle(r, { hostCallsLeft: 64 }), rb = b.handle(r, { hostCallsLeft: 64 });
    assert.deepEqual(ra, rb, `${JSON.stringify(r)} answers the same`);
  }
  assert.equal(a.readBits, b.readBits, "and charges the same");
  assert.deepEqual([...a.readsByRep], [...b.readsByRep]);
  const reply = a.handle(requests[5]!, { hostCallsLeft: 64 }) as { ok: true; result: unknown };
  assert.deepEqual(Object.keys(reply.result as object).sort(), ["after", "before", "mine"], "othersAfter answers two totals and the player's own energy only");
});
