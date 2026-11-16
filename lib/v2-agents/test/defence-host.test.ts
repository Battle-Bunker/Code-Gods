/**
 * Defence goals in the agent host (v1, restored; owner-decisions call 1): with a penalty dealt beside the rule, the
 * host values a board as the server's commit does, n = s⁺ − w·(η(h) − E_π η(h)): `myScore` bits, `othersAfter`'s `mine`
 * and the commit clause's payoff all carry it; without one nothing changes. What would break: an agent climbing its
 * reward into its penalty because the host showed it the reward alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { grid4, gridType, type GridState } from "@workspace/v2-grid";
import { defenceNet, hinge, meanHinge, valueLookup } from "@workspace/v2-valuation";
import { evaluateSite } from "@workspace/v2-core";
import { births, EngineHost, type DefenceRef } from "../src/index.ts";
import { findValues, valuer } from "../src/harness.ts";

const ask = (h: EngineHost<GridState>, r: object) => h.handle(r as never, { hostCallsLeft: 64 }) as { ok: true; result: any };
const rule = (() => {
  for (const f of gridType.families) for (const t of f.tieBreakers) {
    const r = { family: f.id, params: f.dealable(grid4)[0] as Record<string, unknown>, tieBreaker: t.id };
    if (findValues(grid4.id, r)) return r;
  }
  throw new Error("no valued grid rule");
})();
const penalty = gridType.penalties!.find(f => f.id === "hated-number")!;
const pParams = { value: 0 };
const pVf = findValues(grid4.id, { family: penalty.id, params: pParams, tieBreaker: "none" })!;
const defence: DefenceRef = { family: penalty.id, params: pParams, values: { knots: pVf.knots, tail: pVf.tail }, mean: meanHinge(pVf.knots), weight: 2 };

test("myScore's bits and othersAfter's mine are the signed bits the commit pays; absent without a defence goal", () => {
  assert.ok(pVf, "the penalty has a value function");
  const v = valuer(gridType, grid4, rule), [state] = births(gridType, grid4, "defence-host", 1);
  const others = [{ rule, values: v.values! }];
  const plain = new EngineHost({ type: gridType, variant: grid4, state: state!, rule, energy: 100, values: v.values!, others });
  const held = new EngineHost({ type: gridType, variant: grid4, state: state!, rule, energy: 100, values: v.values!, others, defence });
  const h = valueLookup(pVf)(evaluateSite(gridType, penalty, pParams, state!, grid4, 0, null).score).bits;
  const want = defenceNet(v.bits(state!), h, 2, defence.mean);
  assert.ok(Math.abs(ask(held, { op: "myScore" }).result.bits - want) < 1e-9);
  assert.equal(ask(plain, { op: "myScore" }).result.bits, v.bits(state!));
  assert.ok(Math.abs(held.payoffAt(state!)!.mine - want) < 1e-9);
  assert.deepEqual(ask(held, { op: "myRule" }).result.defence, { family: "hated-number", params: pParams, weight: 2 });
  assert.equal(ask(plain, { op: "myRule" }).result.defence, null);
  const plan = [{ mutator: gridType.mutators[0]!.id, site: 0, args: {} }];
  const o = ask(held, { op: "othersAfter", calls: plan });
  if (o.ok && o.result.after !== null) assert.ok(Math.abs(o.result.mine.before - want) < 1e-9);
  assert.equal("mine" in (ask(plain, { op: "othersAfter", calls: plan }).result ?? {}), false);
  assert.ok(hinge(h) >= hinge(0));
});

test("an other seat's defence goal counts in the others' sum", () => {
  const v = valuer(gridType, grid4, rule), [state] = births(gridType, grid4, "defence-host-2", 1);
  const bare = new EngineHost({ type: gridType, variant: grid4, state: state!, rule, energy: 100, values: v.values!, others: [{ rule, values: v.values! }] });
  const pen = new EngineHost({ type: gridType, variant: grid4, state: state!, rule, energy: 100, values: v.values!, others: [{ rule, values: v.values!, defence }] });
  const h = valueLookup(pVf)(evaluateSite(gridType, penalty, pParams, state!, grid4, 0, null).score).bits;
  assert.ok(Math.abs(pen.payoffAt(state!)!.others - defenceNet(bare.payoffAt(state!)!.others, h, 2, defence.mean)) < 1e-9);
});
