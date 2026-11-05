/**
 * The two energy accounts (docs/clean-implementation-plan.md §4.3; reference: the "agent_energy"
 * economy of lib/grid-lab/gridlab/sim.py on branch claude/gridlab-agent-energy).
 *
 * Power (docs/energy-model.md §6): each deity has a fixed budget of settings.powerPerSecond bits per WORLD second. It
 *        gives each of its agents a share s (Σ s ≤ 1, re-allocated at will); the unallocated rest is its own income.
 * Deity: starts at `startingEnergy`, accrues (1 − Σ s)·P per world second, pays summon prices (description bits).
 *        Never negative: a summon it cannot afford is refused. World time stops in planning and pauses.
 * Agent: starts at 0, accrues s·P bits per WORLD second, with no cap. Each mutation
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
// power (world time)
// ------------------------------------------------------------------------------------------------

/** Shares are kept to this many decimals, so Σ s ≤ 1 holds exactly where it should. */
const SHARE_DECIMALS = 1e6;
export const roundShare = (s: number): number => Math.round(s * SHARE_DECIMALS) / SHARE_DECIMALS;

/** A valid power share: a finite number in [0, 1]. */
export function assertShare(share: number): void {
  if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) throw new Error("A power share must be from 0 to 1");
}
/** An agent's income: its share of the deity's power. */
export const agentIncome = (powerPerSecond: number, share: number): number => powerPerSecond * Math.max(0, share);
/** A deity's own income: the power it has not allocated to its agents. */
export const deityIncome = (powerPerSecond: number, allocated: number): number => powerPerSecond * Math.max(0, 1 - allocated);
/** The share a new agent gets when its summon names none: half of what the deity has not allocated (it keeps the rest). */
export const defaultShare = (allocated: number): number => roundShare(Math.max(0, 1 - allocated) / 2);

/** Pay a summon price (bits) from a deity's settled account. Throws, leaving the input untouched, if it cannot afford it. */
export function spendDeityEnergy(account: AgentAccount, cost: number): AgentAccount {
  if (!Number.isFinite(cost) || cost < 0) throw new Error("Invalid complexity cost");
  if (account.balance < cost) throw new Error("Insufficient energy");
  return { ...account, balance: account.balance - cost };
}

// ------------------------------------------------------------------------------------------------
// agent accounts (world time)
// ------------------------------------------------------------------------------------------------

/** An energy account on world time: an agent's, or a deity's own. */
export interface AgentAccount {
  /** Bits; an agent's is negative after an act that cost more than it had. A deity's is never negative. */
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
