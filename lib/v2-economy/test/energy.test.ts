/**
 * Power, capacity, selection, credit and moving power (docs/energy-model.md §6, §7). Breaks caught: income past the
 * capacity stored; a re-allocation that makes, loses or hides energy or debt; debt beyond the capacity; selection not
 * proportional to energy; and above all an advantage from splitting power over more agents.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import {
  actCredit, affordable, agentIncome, assertShare, chargeAct, chargeOwn, defaultShare, energyCapacity, firstAgentShare,
  movePower, newAccount, offerReadBits, ownIncome, pickByEnergy, secondsToFull, selectionWeight, settle, settleOwn, spend,
  type Account,
} from "../src/index.ts";

const at = (balance: number): Account => ({ balance, settledWorldSeconds: 40 });

test("power: agents earn their share, the player's own store the unallocated rest", () => {
  assert.equal(agentIncome(64, 0.25), 16);
  assert.equal(ownIncome(64, 0.75), 16);
  assert.equal(ownIncome(64, 1), 0);
  assert.equal(agentIncome(64, 0.25) * 3 + ownIncome(64, 0.75), 64, "power is conserved whatever the split");
  assert.equal(defaultShare(0), 0.5);
  assert.equal(defaultShare(0.5), 0.25);
  assert.equal(defaultShare(1), 0);
  for (const bad of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => assertShare(bad), /share/);
  // No room for more than the default: send nothing.
  assert.equal(firstAgentShare({ allocated: 0, powerPerSecond: 64, fullChargeSeconds: 30, need: 1500 }), undefined);
  assert.equal(firstAgentShare({ allocated: 0, powerPerSecond: 64, fullChargeSeconds: 30, need: 0 }), 0.75);
});

test("capacity: an empty account that spends nothing is full after fullChargeSeconds, and income past that is not stored", () => {
  const capacity = energyCapacity(16, 30);
  assert.equal(capacity, 480);
  assert.equal(energyCapacity(0, 30), 0);
  assert.throws(() => energyCapacity(-1, 30));
  assert.equal(settle(newAccount(0), 10, 16, capacity).balance, 160);
  assert.equal(settle(newAccount(0), 30, 16, capacity).balance, 480);
  assert.deepEqual(settle(newAccount(0), 100, 16, capacity), { balance: 480, settledWorldSeconds: 100 });
  // In steps or at once is the same: nothing needs writing at the moment an account fills.
  assert.equal(settle(settle(newAccount(0), 29, 16, capacity), 100, 16, capacity).balance, 480);
  // A lowered capacity clamps at once; debt is repaid first.
  assert.equal(settle(at(400), 40, 8, energyCapacity(8, 30)).balance, 240);
  assert.equal(settle(at(-30), 42, 8, 240).balance, -14);
  assert.throws(() => settle(at(0), 39, 8, 240), /backwards/);
  assert.equal(secondsToFull(160, 16, capacity), 20);
  assert.equal(secondsToFull(-16, 16, capacity), 31);
  assert.equal(secondsToFull(0, 0, 10), Infinity);
});

test("the player's own store: income and capacity follow its unallocated power; spending never takes it below zero", () => {
  const terms = { powerPerSecond: 64, allocated: 0.75, fullChargeSeconds: 30 };   // 16 bits/s, capacity 480
  assert.equal(settleOwn({ balance: 200, settledWorldSeconds: 0 }, 10, terms).balance, 360);
  assert.equal(settleOwn({ balance: 200, settledWorldSeconds: 0 }, 1000, terms).balance, 480);
  assert.equal(settleOwn({ balance: 200, settledWorldSeconds: 0 }, 0, { ...terms, allocated: 1 }).balance, 0);
  // Planning: a clock behind the account's accrues nothing but the capacity still holds.
  assert.deepEqual(settleOwn({ balance: 600, settledWorldSeconds: 5 }, 0, terms), { balance: 480, settledWorldSeconds: 5 });
  const account = { balance: 100, settledWorldSeconds: 0 };
  const half = { ...terms, allocated: 0.5 };   // 32 bits/s, capacity 960
  assert.deepEqual(chargeOwn(account, 60, 5, half), { balance: 200, settledWorldSeconds: 5 });
  assert.throws(() => chargeOwn(account, 961, 1000, half), /Insufficient/);
  assert.throws(() => spend(account, -1), /Invalid/);
  assert.equal(account.balance, 100, "the input is untouched");
});

test("an offer is a read of which object the agent was given; an act may drive the balance negative", () => {
  assert.equal(offerReadBits(8), 3);
  assert.equal(offerReadBits(1), 0);
  assert.equal(offerReadBits(0), 0);
  assert.equal(chargeAct(at(5), 16).balance, -11);
  assert.throws(() => chargeAct(at(5), -1));
});

test("credit: an act may leave an account owing at most what it can hold", () => {
  const credit = actCredit(energyCapacity(16, 30));
  assert.equal(affordable(480, 960, credit), true);
  assert.equal(affordable(480, 961, credit), false);
  assert.equal(affordable(0.1, 12, actCredit(0)), false, "no power, no credit");
  assert.equal(affordable(0.1, 0.05, actCredit(0)), true, "what it holds, it may spend");
});

test("selection is proportional to positive energy; none positive picks nobody and draws nothing", () => {
  assert.equal(selectionWeight(-3), 0);
  assert.equal(selectionWeight(NaN), 0);
  const xs = [{ id: "a", e: 1 }, { id: "b", e: 3 }, { id: "c", e: -5 }];
  const fixed = (u: number) => ({ unit: () => u });
  assert.equal(pickByEnergy(xs, x => x.e, fixed(0))?.id, "a");
  assert.equal(pickByEnergy(xs, x => x.e, fixed(0.25))?.id, "b");
  assert.equal(pickByEnergy(xs, x => x.e, fixed(0.999999))?.id, "b");
  assert.equal(pickByEnergy([{ e: 0 }, { e: -1 }], x => x.e, { unit: () => assert.fail("drew") }), undefined);
  const r = rng("pick");
  const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 40000; i++) counts[pickByEnergy(xs, x => x.e, r)!.id]!++;
  assert.equal(counts.c, 0);
  assert.ok(Math.abs(counts.a! / 40000 - 0.25) < 0.01, `${counts.a}`);
});

test("energy and debt move with power: the giver's excess goes to the receiver, and it fits", () => {
  const W = 64 * 30;
  // Half an agent's power taken (capacity 960 → 480) while it holds 700: 220 goes to the player's store.
  assert.deepEqual(movePower(at(700), at(100), 0.5, 0.25, 0.5, W), { agent: at(480), own: at(320), owed: 0, held: 220 });
  assert.deepEqual(movePower(at(300), at(100), 0.5, 0.25, 0.5, W), { agent: at(300), own: at(100), owed: 0, held: 0 });
  // Destroyed: all of it moves.
  assert.deepEqual(movePower(at(960), at(960), 0.5, 0, 0.5, W), { agent: at(0), own: at(1920), owed: 0, held: 960 });
  // A summon: the store gives half its power (1920 → 960) while holding 1500: 540 goes to the agent.
  assert.deepEqual(movePower(at(0), at(1500), 0, 0.5, 1, W), { agent: at(540), own: at(960), owed: 0, held: -540 });
  // Debt: half the power, half the debt; destroyed, all of it; a store that owes gives its part with the power.
  assert.deepEqual(movePower(at(-412), at(100), 0.5, 0.25, 0.5, W), { agent: at(-206), own: at(-106), owed: 206, held: 0 });
  assert.deepEqual(movePower(at(-412), at(100), 0.5, 0, 0.5, W), { agent: at(0), own: at(-312), owed: 412, held: 0 });
  assert.deepEqual(movePower(at(50), at(-312), 0, 0.25, 0.5, W), { agent: at(-106), own: at(-156), owed: -156, held: 0 });
});

test("no walk of summons, re-allocations and destroys changes the sum of balances, or takes any account beyond ±its capacity", () => {
  const W = 64 * 30;
  const r = rng("move-walk");
  const round = (x: number) => Math.round(x * 100) / 100;
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + r.below(6);
    const shares: number[] = [];
    let left = 1;
    for (let i = 0; i < n; i++) { const s = round(r.unit() * left); shares.push(s); left = round(left - s); }
    const within = (share: number) => (r.unit() * 2 - 1) * share * W;
    const agents: Account[] = shares.map(s => ({ balance: within(s), settledWorldSeconds: 0 }));
    let own: Account = { balance: within(left), settledWorldSeconds: 0 };
    const sum = () => agents.reduce((t, a) => t + a.balance, own.balance);
    const before = sum();
    for (let step = 0; step < 40; step++) {
      const unallocated = Math.max(0, round(1 - shares.reduce((x, y) => x + y, 0)));
      const roll = r.unit();
      if (roll < 0.15 && shares.length < 8) {
        const to = round(r.unit() * unallocated);
        const m = movePower(newAccount(0), own, 0, to, unallocated, W);
        agents.push(m.agent); shares.push(to); own = m.own;
      } else if (roll < 0.3 && shares.length) {
        const i = r.below(shares.length);
        const m = movePower(agents[i]!, own, shares[i]!, 0, unallocated, W);
        assert.ok(Math.abs(m.agent.balance) < 1e-9, "a destroyed agent leaves nothing behind");
        own = m.own; agents.splice(i, 1); shares.splice(i, 1);
      } else if (shares.length) {
        const i = r.below(shares.length);
        const to = round(r.unit() * (shares[i]! + unallocated));
        const m = movePower(agents[i]!, own, shares[i]!, to, unallocated, W);
        assert.ok(m.owed === 0 || m.held === 0, "one thing moves");
        agents[i] = m.agent; own = m.own; shares[i] = to;
      }
      assert.ok(Math.abs(sum() - before) < 1e-6, `nothing is made or lost (${sum()} vs ${before})`);
      agents.forEach((a, k) => assert.ok(Math.abs(a.balance) <= shares[k]! * W + 1e-6, `agent ${k} at ${a.balance}, capacity ${shares[k]! * W}`));
      const free = Math.max(0, 1 - shares.reduce((x, y) => x + y, 0));
      assert.ok(Math.abs(own.balance) <= free * W + 1e-6, `own store at ${own.balance}, capacity ${free * W}`);
    }
  }
});

// ------------------------------------------------------------------------------------------------ agent-count neutrality (§7)

/**
 * One player's power split over agents running the same program, against an opponent with two half-share agents that
 * always change 12 bits. Real selection, capacity, credit and charging; the v2 seeded rng. Returns the player's offers,
 * acts and spend. `perAgentGap`: a minimum time between one agent's offers (a per-agent limit, which breaks neutrality).
 */
function playSplit(shares: readonly number[], program: { offer: number; act: number; p: number }, seed: string, perAgentGap = 0) {
  const P = 64, T = 30, rate = 25, seconds = 300;
  const r = rng("neutrality", seed);
  const agents = [
    ...shares.map(s => ({ mine: true, income: P * s, cost: program, last: -Infinity, account: newAccount(0) })),
    ...[0.5, 0.5].map(s => ({ mine: false, income: P * s, cost: { offer: 0.2, act: 12, p: 1 }, last: -Infinity, account: newAccount(0) })),
  ];
  const out = { offers: 0, acts: 0, spent: 0 };
  for (let k = 1; k <= rate * seconds; k++) {
    const world = k / rate;
    for (const a of agents) a.account = settle(a.account, world, a.income, energyCapacity(a.income, T));
    const pick = pickByEnergy(agents.filter(a => world - a.last >= perAgentGap - 1e-9), a => a.account.balance, r);
    if (!pick) continue;
    pick.last = world;
    const acts = r.unit() < pick.cost.p && affordable(pick.account.balance, pick.cost.offer + pick.cost.act, actCredit(energyCapacity(pick.income, T)));
    const cost = pick.cost.offer + (acts ? pick.cost.act : 0);
    pick.account = chargeAct(pick.account, cost);
    assert.ok(pick.account.balance >= -energyCapacity(pick.income, T) - 1e-6, "debt is bounded by the capacity");
    if (pick.mine) { out.offers++; out.spent += cost; if (acts) out.acts++; }
  }
  return out;
}

test("agent-count neutrality: one agent with all the power and four with a quarter each get the same offers, acts and spend", () => {
  const programs = {
    actor: { offer: 0.2, act: 12, p: 1 },
    looker: { offer: 2.5, act: 12, p: 0.3 },
    skipper: { offer: 0.2, act: 0, p: 0 },
    bigActor: { offer: 0.2, act: 50, p: 1 },
  };
  const SEEDS = 6;
  for (const [name, program] of Object.entries(programs)) {
    const mean = (shares: number[]) => {
      const sum = { offers: 0, acts: 0, spent: 0 };
      for (let i = 0; i < SEEDS; i++) { const o = playSplit(shares, program, `${name}:${i}`); sum.offers += o.offers; sum.acts += o.acts; sum.spent += o.spent; }
      return { offers: sum.offers / SEEDS, acts: sum.acts / SEEDS, spent: sum.spent / SEEDS };
    };
    const one = mean([1]), four = mean([0.25, 0.25, 0.25, 0.25]), uneven = mean([0.55, 0.3, 0.1, 0.05]);
    assert.ok(one.offers > 200, `${name}: the player is offered turns (${one.offers})`);
    for (const got of [four, uneven]) {
      for (const key of ["offers", "acts", "spent"] as const) {
        const tolerance = Math.max(10, 0.05 * one[key]);
        assert.ok(Math.abs(got[key] - one[key]) <= tolerance, `${name}: ${key} ${got[key].toFixed(1)} vs ${one[key].toFixed(1)} with one agent`);
      }
    }
  }
});

test("a per-agent limit would break neutrality, and the same check sees it", () => {
  const skipper = { offer: 0.2, act: 0, p: 0 };
  const one = playSplit([1], skipper, "limit", 0.25).offers;
  const ten = playSplit(new Array(10).fill(0.1), skipper, "limit", 0.25).offers;
  assert.ok(ten > 1.5 * one, `with a per-agent cap, ten agents out-draw one (${ten} vs ${one})`);
});
