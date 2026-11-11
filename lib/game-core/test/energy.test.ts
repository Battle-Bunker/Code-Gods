import assert from "node:assert/strict";
import test from "node:test";
import {
  agentIncome, deityIncome, defaultShare, assertShare, spendDeityEnergy, newAgentAccount, settleAgentEnergy, chargeAct, pickByEnergy, selectionWeight, offerReadBits, affordable,
  energyCapacity, secondsToFull, settleDeityEnergy, chargeDeityAccount,
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

/**
 * docs/energy-model.md §7: two agents with the same income on a busy world; one reads a little and usually skips
 * (1 bit per act), the other always acts (12 bits per act). The skipper keeps its energy, so it is offered more.
 */
test("a cheap skipper gets more opportunities than an expensive actor with the same income", () => {
  const agents = [{ id: "skipper", cost: 1, account: newAgentAccount(0), n: 0 }, { id: "actor", cost: 12, account: newAgentAccount(0), n: 0 }];
  let seed = 7;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let k = 1; k <= 20 * 300; k++) {
    const world = k / 20;
    for (const a of agents) a.account = settleAgentEnergy(a.account, world, 4);
    const pick = pickByEnergy(agents, a => a.account.balance, rand);
    if (!pick) continue;
    pick.account = chargeAct(pick.account, pick.cost);
    pick.n++;
  }
  const n = Object.fromEntries(agents.map(a => [a.id, a.n]));
  assert.ok(n.skipper > 3 * n.actor, JSON.stringify(n));
  // the actor still acts about as often as its income allows (4 bits/s ÷ 12 bits)
  assert.ok(n.actor > 0.25 * 300 && n.actor < 0.4 * 300, JSON.stringify(n));
});

// ------------------------------------------------------------------------------------------------ agent-count neutrality (§7)

/**
 * The invariant (owner, 11 Nov 2026): "agent impact [is] a function of power assigned to that agent and … the discrete
 * quantity of agents [offers] no opportunity for advantage". One god's power budget is split over n agents running the
 * same program, against a fixed opponent; its offers, acts and energy spent must not depend on n or on how uneven the
 * split is. Real selection code (pickByEnergy, settleAgentEnergy with the capacity, chargeAct), seeded.
 *
 * What would break it: any limit or allowance per agent (a rate cap per agent, a store or a price per agent).
 */
function playSplit(shares: readonly number[], program: { offer: number; act: number; actProbability: number }, room: { rateHz: number; seconds: number; fullChargeSeconds?: number }, seed: number) {
  const P = 64;
  let state = seed;
  const rand = () => (state = (state * 48271) % 2147483647) / 2147483647;
  // God 0: the split under test. God 1: two agents with half the same budget each, always acting at 12 bits.
  const agents = [
    ...shares.map(share => ({ god: 0, income: P * share, cost: program, account: newAgentAccount(0) })),
    ...[0.45, 0.45].map(share => ({ god: 1, income: P * share, cost: { offer: 0, act: 12, actProbability: 1 }, account: newAgentAccount(0) })),
  ];
  const out = { offers: 0, acts: 0, spent: 0 };
  for (let k = 1; k <= room.rateHz * room.seconds; k++) {
    const world = k / room.rateHz;
    for (const a of agents) a.account = settleAgentEnergy(a.account, world, a.income, energyCapacity(a.income, room.fullChargeSeconds));
    const pick = pickByEnergy(agents, a => a.account.balance, rand);
    if (!pick) continue;
    const acts = rand() < pick.cost.actProbability, cost = pick.cost.offer + (acts ? pick.cost.act : 0);
    pick.account = chargeAct(pick.account, cost);
    if (pick.god === 0) { out.offers++; out.spent += cost; if (acts) out.acts++; }
  }
  return out;
}

test("agent-count neutrality: a power budget split over n agents gets the offers, acts and spend of one agent", () => {
  const programs = {
    skipper: { offer: 0.2, act: 0, actProbability: 0 },      // never acts: pays only for being offered
    actor: { offer: 0.2, act: 12, actProbability: 1 },       // always changes one cell
    looker: { offer: 2.5, act: 12, actProbability: 0.3 },    // reads the board, acts on 3 offers in 10
  };
  const rooms = {
    "offers scarce, stores full (capped)": { rateHz: 5, seconds: 600, fullChargeSeconds: 30 },
    "offers plentiful (energy-limited)": { rateHz: 50, seconds: 300, fullChargeSeconds: 30 },
    "no capacity": { rateHz: 5, seconds: 600 },
  };
  const splits: Record<string, number[]> = {
    "1 agent": [0.9], "2 equal": [0.45, 0.45], "5 equal": [0.18, 0.18, 0.18, 0.18, 0.18], "10 equal": new Array(10).fill(0.09),
    "3 uneven": [0.6, 0.25, 0.05], "6 uneven": [0.4, 0.2, 0.1, 0.1, 0.07, 0.03],
  };
  const SEEDS = 6;
  for (const [roomName, room] of Object.entries(rooms)) {
    for (const [programName, program] of Object.entries(programs)) {
      const mean = (shares: number[]) => {
        const sum = { offers: 0, acts: 0, spent: 0 };
        for (let i = 0; i < SEEDS; i++) { const r = playSplit(shares, program, room, 101 + i); sum.offers += r.offers; sum.acts += r.acts; sum.spent += r.spent; }
        return { offers: sum.offers / SEEDS, acts: sum.acts / SEEDS, spent: sum.spent / SEEDS };
      };
      const one = mean(splits["1 agent"]);
      assert.ok(one.offers > 100, `${roomName} / ${programName}: the god is offered turns (${one.offers})`);
      for (const [splitName, shares] of Object.entries(splits)) {
        const got = mean(shares);
        for (const key of ["offers", "acts", "spent"] as const) {
          // Sampling error: the counts are in the hundreds to thousands over 6 seeds; 8% (or 8 events) is several standard errors.
          const tolerance = Math.max(8, 0.08 * one[key]);
          assert.ok(Math.abs(got[key] - one[key]) <= tolerance, `${roomName} / ${programName} / ${splitName}: ${key} ${got[key].toFixed(1)} vs ${one[key].toFixed(1)} with one agent`);
        }
      }
    }
  }
});

test("a rate limit per agent would break neutrality: this test's own check sees it", () => {
  // The rule removed on 11 Nov 2026 (each agent offered at most 4 times a second), re-created here: ten skippers then
  // take far more offers than one with the same total power. The neutrality test above must be able to see that.
  const play = (shares: number[]) => {
    let state = 11;
    const rand = () => (state = (state * 48271) % 2147483647) / 2147483647;
    const agents = [...shares.map(s => ({ god: 0, income: 64 * s, last: -1, account: newAgentAccount(0) })), { god: 1, income: 57.6, last: -1, account: newAgentAccount(0) }];
    let offers = 0;
    for (let k = 1; k <= 25 * 200; k++) {
      const world = k / 25;
      for (const a of agents) a.account = settleAgentEnergy(a.account, world, a.income, energyCapacity(a.income, 30));
      const pick = pickByEnergy(agents.filter(a => world - a.last >= 0.25 - 1e-9), a => a.account.balance, rand);
      if (!pick) continue;
      pick.last = world;
      if (pick.god === 0) offers++; else pick.account = chargeAct(pick.account, 12);
    }
    return offers;
  };
  assert.ok(play(new Array(10).fill(0.09)) > 2 * play([0.9]), "with a per-agent cap, ten agents out-draw one");
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

test("an offer is a read of which object the agent was given: log2 of the live objects", () => {
  assert.equal(offerReadBits(80), Math.log2(80));     // the Grid seeds start with 80 objects: 6.32 bits
  assert.equal(offerReadBits(2), 1);
  assert.equal(offerReadBits(1), 0, "one object: nothing to learn");
  assert.equal(offerReadBits(0), 0);
  assert.equal(offerReadBits(NaN), 0);
  // At the read price (1/32) that is 0.198 energy bits on a Grid seed: under 2% of the cheapest change there (11.5).
  assert.ok(Math.abs(offerReadBits(80) / 32 - 0.1976) < 1e-4);
});

test("debt within capacity: an act may leave an account owing at most what it can hold", () => {
  // A quarter of 64 bits/s for 30 s holds 480 bits: from a full store an act may cost up to 960, from empty up to 480.
  assert.equal(affordable(480, 960, 480), true);
  assert.equal(affordable(480, 961, 480), false);
  assert.equal(affordable(0.1, 480, 480), true);
  assert.equal(affordable(0.1, 985, 480), false, "a whole-grid repaint on a nearly empty quarter-share agent");
  assert.equal(affordable(0.1, 985, 0), false, "no power, no credit");
  assert.equal(affordable(0.1, 0.05, 0), true, "what it holds, it may spend");
  assert.equal(affordable(0.1, 1e9, Infinity), true, "no capacity: no bound, as before the setting");
});
