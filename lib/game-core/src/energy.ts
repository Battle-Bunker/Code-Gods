/**
 * The two energy accounts (docs/clean-implementation-plan.md §4.3; reference: the "agent_energy"
 * economy of lib/grid-lab/gridlab/sim.py on branch claude/gridlab-agent-energy).
 *
 * God:   accrues `energyPerSecond` bits per REAL-TIME second from `startingEnergy`, pays the summon
 *        price (description bits). Never negative: a summon it cannot afford is refused.
 * Agent: starts at 0, accrues `agentEnergyPerSecond` bits per WORLD second, with no cap. Each mutation
 *        opportunity goes to an agent with probability proportional to its positive energy (pickByEnergy),
 *        at most MAX_AGENT_OPPORTUNITY_HZ times per world second per agent, and the agent pays what the
 *        act actually cost: the bits it read plus its change (docs/energy-model.md §2, §7). The balance may
 *        go negative; such an agent is not picked until its income lifts it above zero.
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

/** Credit income from the last settlement to `worldSeconds` (no cap: an agent that spends little saves it). */
export function settleAgentEnergy(account: AgentAccount, worldSeconds: number, perSecond: number): AgentAccount {
  assertClock(worldSeconds, "world clock");
  assertClock(account.settledWorldSeconds, "agent account clock");
  assertClock(account.balance, "agent balance");
  assertRate(perSecond, "agent income");
  if (worldSeconds < account.settledWorldSeconds) throw new Error("World clock went backwards");
  const dt = worldSeconds - account.settledWorldSeconds;
  if (dt === 0) return { ...account };
  const balance = account.balance + dt * perSecond;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { balance, settledWorldSeconds: worldSeconds };
}

// ------------------------------------------------------------------------------------------------
// selection (docs/energy-model.md §7)
// ------------------------------------------------------------------------------------------------

/**
 * The sanity cap: an agent is offered at most this many opportunities per world second. Without it an agent that reads
 * nothing and returns no calls pays 0 per act, keeps all its energy and, as the richest agent, would take nearly every
 * opportunity. Four a second is far more than an agent needs to contest an object, and it bounds the sandbox work one
 * agent can cause.
 */
export const MAX_AGENT_OPPORTUNITY_HZ = 4;

/** An agent's weight in the draw for an opportunity: its positive energy (none when at or below zero). */
export const selectionWeight = (balance: number): number => (Number.isFinite(balance) && balance > 0 ? balance : 0);

/** True while the cap allows offering the agent an opportunity at `world` (it was last offered one at `last`). */
export function offerable(last: number | undefined, world: number, capHz = MAX_AGENT_OPPORTUNITY_HZ): boolean {
  return last === undefined || !(capHz > 0) || world - last >= 1 / capHz - 1e-9;
}

/**
 * Pick one of `candidates` with probability proportional to selectionWeight(energy(c)), using `uniform01` in [0, 1);
 * undefined when none has positive energy.
 */
export function pickByEnergy<T>(candidates: readonly T[], energy: (c: T) => number, uniform01: () => number): T | undefined {
  let total = 0;
  const weights = candidates.map(c => { const w = selectionWeight(energy(c)); total += w; return w; });
  if (!(total > 0)) return undefined;
  let u = uniform01() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (weights[i] <= 0) continue;
    u -= weights[i];
    if (u < 0) return candidates[i];
  }
  for (let i = candidates.length - 1; i >= 0; i--) if (weights[i] > 0) return candidates[i];
  return undefined;
}

/** Deduct one act's actual cost. The balance may go negative (a cooldown). */
export function chargeAct(account: AgentAccount, cost: number): AgentAccount {
  assertClock(account.balance, "agent balance");
  assertRate(cost, "act cost");
  const balance = account.balance - cost;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { ...account, balance };
}
