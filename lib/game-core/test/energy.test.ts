import assert from "node:assert/strict";
import test from "node:test";
import {
  agentIncome, deityIncome, defaultShare, assertShare, spendDeityEnergy, newAgentAccount, settleAgentEnergy, chargeAct, pickByEnergy, offerable, selectionWeight,
  MAX_AGENT_OPPORTUNITY_HZ,
} from "../src/energy.ts";

test("power: agents earn their share, the deity the unallocated rest; summons are paid from the deity's own energy", () => {
  assert.equal(agentIncome(64, 0.25), 16);
  assert.equal(deityIncome(64, 0.75), 16);
  assert.equal(deityIncome(64, 1), 0);
  assert.equal(agentIncome(64, 0.25) * 3 + deityIncome(64, 0.75), 64, "power is conserved whatever the split");
  assert.equal(defaultShare(0), 0.5);
  assert.equal(defaultShare(0.5), 0.25);
  assert.equal(defaultShare(1), 0);
  for (const bad of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => assertShare(bad), /share/);
  assert.doesNotThrow(() => assertShare(0));
  const account = { balance: 100, settledWorldSeconds: 3 };
  assert.deepEqual(spendDeityEnergy(account, 100), { balance: 0, settledWorldSeconds: 3 });
  assert.throws(() => spendDeityEnergy(account, 101), /Insufficient/);
  assert.equal(account.balance, 100);
  assert.throws(() => spendDeityEnergy(account, -1), /Invalid/);
});

test("agents start empty and accrue in world seconds at the agent rate, with no cap", () => {
  const fresh = newAgentAccount(-30); // summoned during planning
  assert.deepEqual(fresh, { balance: 0, settledWorldSeconds: -30 });
  const later = settleAgentEnergy(fresh, -28, 2);
  assert.deepEqual(later, { balance: 4, settledWorldSeconds: -28 });
  assert.deepEqual(settleAgentEnergy(later, -28, 2), later);
  assert.throws(() => settleAgentEnergy(later, -29, 2), /backwards/);
  assert.throws(() => settleAgentEnergy(later, NaN, 2));
  assert.throws(() => settleAgentEnergy(later, 0, -1));
  assert.equal(settleAgentEnergy(newAgentAccount(0), 1000, 2).balance, 2000);   // saved energy is kept
});

test("an act's cost may drive the balance negative; income lifts it again", () => {
  let account = chargeAct(settleAgentEnergy(newAgentAccount(0), 5, 2), 16);
  assert.equal(account.balance, -6);
  account = settleAgentEnergy(account, 10, 2);
  assert.equal(account.balance, 4);
  assert.throws(() => chargeAct(account, -1));
  assert.throws(() => chargeAct(account, NaN));
  assert.equal(chargeAct(account, 0).balance, 4);
});

test("selection is proportional to positive energy; none positive picks nobody", () => {
  assert.equal(selectionWeight(-3), 0);
  assert.equal(selectionWeight(NaN), 0);
  assert.equal(selectionWeight(2.5), 2.5);
  const xs = [{ id: "a", e: 1 }, { id: "b", e: 3 }, { id: "c", e: -5 }];
  assert.equal(pickByEnergy(xs, x => x.e, () => 0)?.id, "a");
  assert.equal(pickByEnergy(xs, x => x.e, () => 0.25)?.id, "b");     // 1 of 4: past a
  assert.equal(pickByEnergy(xs, x => x.e, () => 0.999999)?.id, "b");  // c never
  assert.equal(pickByEnergy([{ e: 0 }, { e: -1 }], x => x.e, () => 0.5), undefined);
  let seed = 1;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const counts = { a: 0, b: 0, c: 0 } as Record<string, number>;
  for (let i = 0; i < 40000; i++) counts[pickByEnergy(xs, x => x.e, rand)!.id]++;
  assert.equal(counts.c, 0);
  assert.ok(Math.abs(counts.b / counts.a - 3) < 0.15, JSON.stringify(counts));
});

test("the cap: at most MAX_AGENT_OPPORTUNITY_HZ opportunities per world second per agent", () => {
  assert.equal(MAX_AGENT_OPPORTUNITY_HZ, 4);
  assert.equal(offerable(undefined, 0), true);
  assert.equal(offerable(10, 10.2), false);
  assert.equal(offerable(10, 10.25), true);
  assert.equal(offerable(10, 10.1, 0), true);   // a non-positive cap is off
});

/**
 * docs/energy-model.md §7: two agents with the same income on a busy world; one reads a little and usually skips
 * (1 bit per act), the other always acts (12 bits per act). The skipper keeps its energy, so it is offered more.
 */
test("a cheap skipper gets more opportunities than an expensive actor with the same income; the cap bounds it", () => {
  const simulate = (skipCost: number, actCost: number, rate: number, seconds: number) => {
    const agents = [{ id: "skipper", cost: skipCost, account: newAgentAccount(0), last: undefined as number | undefined, n: 0 },
      { id: "actor", cost: actCost, account: newAgentAccount(0), last: undefined as number | undefined, n: 0 }];
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const steps = rate * seconds;
    for (let k = 1; k <= steps; k++) {
      const world = k / rate;
      for (const a of agents) a.account = settleAgentEnergy(a.account, world, 4);
      const pick = pickByEnergy(agents.filter(a => offerable(a.last, world)), a => a.account.balance, rand);
      if (!pick) continue;
      pick.account = chargeAct(pick.account, pick.cost);
      pick.last = world; pick.n++;
    }
    return Object.fromEntries(agents.map(a => [a.id, a.n]));
  };
  const n = simulate(1, 12, 20, 300);
  assert.ok(n.skipper > 3 * n.actor, JSON.stringify(n));
  // the actor still acts about as often as its income allows (4 bits/s ÷ 12 bits)
  assert.ok(n.actor > 0.25 * 300 && n.actor < 0.4 * 300, JSON.stringify(n));
  // a skipper that pays nothing at all is held to the cap, not every opportunity
  const free = simulate(0, 12, 50, 100);
  assert.ok(free.skipper <= MAX_AGENT_OPPORTUNITY_HZ * 100 + 1, JSON.stringify(free));
  assert.ok(free.actor > 0, JSON.stringify(free));
});
