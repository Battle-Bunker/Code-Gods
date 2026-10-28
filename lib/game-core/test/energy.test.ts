import assert from "node:assert/strict";
import test from "node:test";
import {
  settleEnergy, spendEnergy, newAgentAccount, agentBattery, settleAgentEnergy, wastedAgentIncome,
  isEligible, chargeAct,
} from "../src/energy.ts";

test("god energy accrues in real time; exact balance succeeds; failed spend is immutable", () => {
  const account = { balance: 100, settledAtMs: 0 };
  assert.deepEqual(spendEnergy(account, 1000, 1, 101), { balance: 0, settledAtMs: 1000 });
  assert.deepEqual(settleEnergy(account, 180000, 1), { balance: 280, settledAtMs: 180000 });
  assert.throws(() => spendEnergy(account, 0, 1, 101), /Insufficient/);
  assert.equal(account.balance, 100);
  assert.throws(() => settleEnergy(account, -1, 1));
  assert.throws(() => spendEnergy(account, 0, 1, -1), /Invalid/);
  assert.throws(() => settleEnergy({ balance: -1, settledAtMs: 0 }, 0, 1)); // the god never goes negative
});

test("agents start empty and accrue in world seconds at the agent rate", () => {
  const fresh = newAgentAccount(-30); // summoned during planning
  assert.deepEqual(fresh, { balance: 0, settledWorldSeconds: -30 });
  const battery = agentBattery(5, 2);
  assert.equal(battery, 10);
  const later = settleAgentEnergy(fresh, -28, 2, battery);
  assert.deepEqual(later, { balance: 4, settledWorldSeconds: -28 });
  assert.deepEqual(fresh, { balance: 0, settledWorldSeconds: -30 }); // pure
  assert.deepEqual(settleAgentEnergy(later, -28, 2, battery), later);
  assert.throws(() => settleAgentEnergy(later, -29, 2, battery), /backwards/);
  assert.throws(() => settleAgentEnergy(later, NaN, 2, battery));
  assert.throws(() => settleAgentEnergy(later, 0, -1, battery));
  assert.throws(() => agentBattery(-1, 2));
});

test("income above the battery cap is lost", () => {
  const battery = agentBattery(5, 2);
  const full = settleAgentEnergy(newAgentAccount(0), 100, 2, battery);
  assert.equal(full.balance, 10);
  assert.equal(wastedAgentIncome(newAgentAccount(0), 100, 2, battery), 190);
  assert.equal(wastedAgentIncome(newAgentAccount(0), 3, 2, battery), 0);
  // Spending and re-earning: the cap applies to the balance, not to cumulative income.
  const spent = chargeAct(full, 7);
  assert.equal(spent.balance, 3);
  assert.equal(settleAgentEnergy(spent, 101, 2, battery).balance, 5);
  assert.equal(settleAgentEnergy(spent, 200, 2, battery).balance, 10);
});

test("eligibility is energy ≥ expected cost per act", () => {
  const expected = 5;
  assert.equal(isEligible({ balance: 4.999, settledWorldSeconds: 0 }, expected), false);
  assert.equal(isEligible({ balance: 5, settledWorldSeconds: 0 }, expected), true);
  assert.equal(isEligible({ balance: 10, settledWorldSeconds: 0 }, expected), true);
  assert.equal(isEligible({ balance: 0, settledWorldSeconds: 0 }, 0), true);
  assert.throws(() => isEligible({ balance: 1, settledWorldSeconds: 0 }, -1));
  // A full battery of one expected act is exactly eligible.
  const one = settleAgentEnergy(newAgentAccount(0), 1000, 2, agentBattery(expected, 1));
  assert.equal(isEligible(one, expected), true);
});

test("an act may drive the balance negative; the agent cools down and recovers", () => {
  const expected = 5;
  const battery = agentBattery(expected, 2);
  let account = settleAgentEnergy(newAgentAccount(0), 5, 2, battery); // 10 bits, full
  assert.equal(isEligible(account, expected), true);
  account = chargeAct(account, 16); // an unusually expensive act
  assert.equal(account.balance, -6);
  assert.equal(isEligible(account, expected), false);
  account = settleAgentEnergy(account, 10, 2, battery); // −6 + 10 = 4: still cooling down
  assert.equal(account.balance, 4);
  assert.equal(isEligible(account, expected), false);
  account = settleAgentEnergy(account, 10.5, 2, battery);
  assert.equal(account.balance, 5);
  assert.equal(isEligible(account, expected), true);
  // A negative balance accrues up to (not past) the cap.
  assert.equal(settleAgentEnergy({ balance: -100, settledWorldSeconds: 0 }, 1000, 2, battery).balance, 10);
  assert.throws(() => chargeAct(account, -1));
  assert.throws(() => chargeAct(account, NaN));
  assert.equal(chargeAct(account, 0).balance, 5);
});
