/**
 * The two energy accounts (docs/clean-implementation-plan.md §4.3; reference: the "agent_energy"
 * economy of lib/grid-lab/gridlab/sim.py on branch claude/gridlab-agent-energy).
 *
 * God:   accrues `energyPerSecond` bits per REAL-TIME second from `startingEnergy`, pays the summon
 *        price (description bits). Never negative: a summon it cannot afford is refused.
 * Agent: starts at 0, accrues `agentEnergyPerSecond` bits per WORLD second, capped at its battery
 *        (agentBatteryActs × expectedActCost; income above the cap is lost). It may act while
 *        energy ≥ expectedActCost and pays each act's actual cost, which may drive it negative (a
 *        cooldown: a negative balance keeps accruing until it is eligible again).
 *
 * Pure functions: the service persists the results under its own lock.
 */

function assertClock(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${what}`);
}

function assertRate(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${what}`);
}

// ------------------------------------------------------------------------------------------------
// god account (real time)
// ------------------------------------------------------------------------------------------------

export interface EnergyAccount {
  balance: number;
  settledAtMs: number;
}

/** Real-time accrual: callers must NOT pass game-world time here. */
export function settleEnergy(account: EnergyAccount, nowMs: number, perSecond: number): EnergyAccount {
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(account.settledAtMs) ||
    nowMs < account.settledAtMs || !Number.isFinite(perSecond) || perSecond < 0 ||
    !Number.isFinite(account.balance) || account.balance < 0
  ) throw new Error("Invalid energy clock/account");
  const balance = account.balance + (nowMs - account.settledAtMs) / 1000 * perSecond;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { balance, settledAtMs: nowMs };
}

/** Pay the summon price (bits). Throws, leaving the input untouched, if the god cannot afford it. */
export function spendEnergy(
  account: EnergyAccount, nowMs: number, perSecond: number, cost: number,
): EnergyAccount {
  if (!Number.isFinite(cost) || cost < 0) throw new Error("Invalid complexity cost");
  const settled = settleEnergy(account, nowMs, perSecond);
  if (settled.balance < cost) throw new Error("Insufficient energy");
  return { ...settled, balance: settled.balance - cost };
}

// ------------------------------------------------------------------------------------------------
// agent accounts (world time)
// ------------------------------------------------------------------------------------------------

export interface AgentAccount {
  /** Bits; negative while cooling down after an act that cost more than it had. */
  balance: number;
  /** World time (seconds; negative during planning) the account was last accrued to. */
  settledWorldSeconds: number;
}

/** A freshly summoned agent: zero energy. */
export function newAgentAccount(worldSeconds: number): AgentAccount {
  assertClock(worldSeconds, "world clock");
  return { balance: 0, settledWorldSeconds: worldSeconds };
}

/** Energy cap: batteryActs × expectedActCost. */
export function agentBattery(expectedActCost: number, batteryActs: number): number {
  assertRate(expectedActCost, "expected act cost");
  assertRate(batteryActs, "battery size");
  return batteryActs * expectedActCost;
}

/**
 * Credit income from the last settlement to `worldSeconds`, clipping at `battery` (as sim.py's
 * `accrue`: income above the cap is lost; a negative balance accrues normally up to the cap).
 */
export function settleAgentEnergy(
  account: AgentAccount, worldSeconds: number, perSecond: number, battery: number,
): AgentAccount {
  assertClock(worldSeconds, "world clock");
  assertClock(account.settledWorldSeconds, "agent account clock");
  assertClock(account.balance, "agent balance");
  assertRate(perSecond, "agent income");
  assertRate(battery, "agent battery");
  if (worldSeconds < account.settledWorldSeconds) throw new Error("World clock went backwards");
  const dt = worldSeconds - account.settledWorldSeconds;
  if (dt === 0) return { ...account };
  const balance = Math.min(account.balance + dt * perSecond, battery);
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { balance, settledWorldSeconds: worldSeconds };
}

/** Income that the battery cap would discard over this settlement (for analytics). */
export function wastedAgentIncome(
  account: AgentAccount, worldSeconds: number, perSecond: number, battery: number,
): number {
  const settled = settleAgentEnergy(account, worldSeconds, perSecond, battery);
  return account.balance + (worldSeconds - account.settledWorldSeconds) * perSecond - settled.balance;
}

/** Eligible to act: energy ≥ its expected cost per act. Settle the account first. */
export function isEligible(account: AgentAccount, expectedActCost: number): boolean {
  assertClock(account.balance, "agent balance");
  assertRate(expectedActCost, "expected act cost");
  return account.balance >= expectedActCost;
}

/** Deduct one act's actual cost. The balance may go negative (a cooldown). */
export function chargeAct(account: AgentAccount, cost: number): AgentAccount {
  assertClock(account.balance, "agent balance");
  assertRate(cost, "act cost");
  const balance = account.balance - cost;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { ...account, balance };
}
