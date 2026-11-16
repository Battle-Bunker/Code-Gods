/**
 * The other players' rules reach the host only so it can answer othersAfter (W2 #517): a player's rule stays secret.
 * What would break: any host reply (a result, a charge, an error) that differs between two opponents whose rules
 * differ but whose worth totals are the same, i.e. agent code learning more than the others' summed bits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineType, lineZ } from "@workspace/v2-linear";
import { q } from "@workspace/v2-core";
import type { HostRequest } from "@workspace/v2-sandbox";
import { EngineHost, type RuleRef } from "../src/index.ts";

const state = { lines: [fromMC(q(2), q(3))] };
const mine: RuleRef = { family: "m-meets-c", params: {}, tieBreaker: "size" };
// A flat value function: every score is worth 0 bits, so any two opponents' totals agree on every state.
const flat = { knots: [{ u: null, bits: 0, lo: 0, hi: 0 }], tail: { primary: { form: "log", slope: 1 }, secondary: { form: "log", slope: 1 } } } as never;
const host = (opponent: RuleRef) => new EngineHost({ type: lineType, variant: lineZ, state, rule: mine, energy: 50, others: [{ rule: opponent, values: flat }] });

const requests: HostRequest[] = [
  { op: "myRule" }, { op: "myScore" }, { op: "budget" }, { op: "worth" }, { op: "recent" },
  { op: "othersAfter", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] },
  { op: "othersAfter", calls: [{ mutator: "si.tilt", site: 0, args: { k: "3" } }, { mutator: "si.shift", site: 0, args: { k: "-2" } }] },
  { op: "othersAfter", calls: [{ mutator: "no.such", site: 0, args: {} }] },
  { op: "othersAfter", calls: "nonsense" },
  { op: "othersAfter" },
  { op: "rarity", score: null },
  { op: "view", rep: "si" },
  { op: "quote", calls: [{ mutator: "si.shift", site: 0, args: { k: "1" } }] },
] as never;

test("agent code cannot tell apart two opponents whose rules differ but whose totals agree", () => {
  const a = host({ family: "prime-gradient", params: { suffix: "1" } }), b = host({ family: "m-meets-c", params: {}, tieBreaker: "meetPrime" });
  for (const r of requests) {
    const ra = a.handle(r, { hostCallsLeft: 64 }), rb = b.handle(r, { hostCallsLeft: 64 });
    assert.deepEqual(ra, rb, `${JSON.stringify(r)} answers the same`);
  }
  assert.equal(a.readBits, b.readBits, "and charges the same");
  assert.deepEqual([...a.readsByRep], [...b.readsByRep]);
  const reply = a.handle(requests[5]!, { hostCallsLeft: 64 }) as { ok: true; result: unknown };
  assert.deepEqual(Object.keys(reply.result as object).sort(), ["after", "before"], "othersAfter answers two totals only");
});
