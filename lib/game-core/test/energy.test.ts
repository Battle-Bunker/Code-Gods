import assert from "node:assert/strict";
import test from "node:test";
import {
  agentIncome, deityIncome, defaultShare, assertShare, spendDeityEnergy, newAgentAccount, settleAgentEnergy, chargeAct, pickByEnergy, offerable, selectionWeight,
  MAX_AGENT_OPPORTUNITY_HZ, energyCapacity, secondsToFull, settleDeityEnergy, chargeDeityAccount,
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

test("agents start empty and accrue in world seconds at the agent rate; without a capacity, saved energy is kept", () => {
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

// ------------------------------------------------------------------------------------------------ capacity (§6.1)

test("capacity is power × fullChargeSeconds; a game without the setting has none", () => {
  assert.equal(energyCapacity(16, 30), 480);          // an agent with a quarter of 64 bits/s
  assert.equal(energyCapacity(0, 30), 0);             // no power, nothing stored
  assert.equal(energyCapacity(16, undefined), Infinity);
  assert.throws(() => energyCapacity(16, -1));
  assert.throws(() => energyCapacity(NaN, 30));
});

test("an empty account that spends nothing is full after fullChargeSeconds, and income past that is not stored", () => {
  const capacity = energyCapacity(16, 30);
  assert.equal(settleAgentEnergy(newAgentAccount(0), 10, 16, capacity).balance, 160);
  assert.equal(settleAgentEnergy(newAgentAccount(0), 30, 16, capacity).balance, 480);   // full exactly at T
  assert.deepEqual(settleAgentEnergy(newAgentAccount(0), 100, 16, capacity), { balance: 480, settledWorldSeconds: 100 });
  // settling in steps or at once is the same: the lazily settled account needs no write at the moment it fills
  const stepped = settleAgentEnergy(settleAgentEnergy(newAgentAccount(0), 29, 16, capacity), 100, 16, capacity);
  assert.equal(stepped.balance, 480);
  assert.equal(secondsToFull(160, 16, capacity), 20);
  assert.equal(secondsToFull(480, 16, capacity), 0);
  assert.equal(secondsToFull(0, 0, 0), 0);
  assert.equal(secondsToFull(-16, 16, capacity), 31);  // debt is repaid first
  assert.equal(secondsToFull(5, 16, Infinity), Infinity);
});

test("an account whose power was lowered falls to its new capacity, even with no time passed; debt is untouched", () => {
  const held = { balance: 400, settledWorldSeconds: 50 };
  // share lowered from 1/4 to 1/8 of 64 bits/s: capacity 480 → 240
  assert.deepEqual(settleAgentEnergy(held, 50, 8, energyCapacity(8, 30)), { balance: 240, settledWorldSeconds: 50 });
  assert.equal(settleAgentEnergy(held, 60, 8, energyCapacity(8, 30)).balance, 240);
  // all power taken away: nothing can be held
  assert.equal(settleAgentEnergy(held, 50, 0, energyCapacity(0, 30)).balance, 0);
  const owing = { balance: -30, settledWorldSeconds: 50 };
  assert.equal(settleAgentEnergy(owing, 50, 0, 0).balance, -30);
  assert.equal(settleAgentEnergy(owing, 52, 8, 240).balance, -14);
  assert.throws(() => settleAgentEnergy(held, 50, 8, -1), /capacity/);
  assert.throws(() => settleAgentEnergy(held, 50, 8, NaN), /capacity/);
});

test("a deity's own account: income and capacity both follow its unallocated power", () => {
  const terms = { powerPerSecond: 64, allocated: 0.75, fullChargeSeconds: 30 };   // keeps 16 bits/s: capacity 480
  assert.equal(settleDeityEnergy({ balance: 200, settledWorldSeconds: 0 }, 10, terms).balance, 360);
  assert.equal(settleDeityEnergy({ balance: 200, settledWorldSeconds: 0 }, 1000, terms).balance, 480);
  // everything allocated: no income, no capacity, so nothing left to summon with
  assert.equal(settleDeityEnergy({ balance: 200, settledWorldSeconds: 0 }, 0, { ...terms, allocated: 1 }).balance, 0);
  // no setting (a game started before it): unbounded, as before
  assert.equal(settleDeityEnergy({ balance: 200, settledWorldSeconds: 0 }, 1000, { powerPerSecond: 64, allocated: 0.75 }).balance, 16200);
  // a clock behind the account's own (planning) accrues nothing but still respects the capacity
  assert.deepEqual(settleDeityEnergy({ balance: 600, settledWorldSeconds: 5 }, 0, terms), { balance: 480, settledWorldSeconds: 5 });
});

test("chargeDeityAccount settles within the capacity, then deducts; it refuses what the settled balance cannot pay", () => {
  const terms = { powerPerSecond: 64, allocated: 0.5, fullChargeSeconds: 30 };    // 32 bits/s, capacity 960
  const account = { balance: 100, settledWorldSeconds: 0 };
  assert.deepEqual(chargeDeityAccount(account, 60, 5, terms), { balance: 200, settledWorldSeconds: 5 });   // 100 + 160 − 60
  assert.deepEqual(chargeDeityAccount(account, 960, 1000, terms), { balance: 0, settledWorldSeconds: 1000 });
  assert.throws(() => chargeDeityAccount(account, 961, 1000, terms), /Insufficient/);   // never more than a full store
  assert.throws(() => chargeDeityAccount(account, -1, 5, terms), /Invalid/);
  assert.equal(account.balance, 100, "the input is untouched");
});
