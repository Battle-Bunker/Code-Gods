/**
 * The two energy accounts (docs/clean-implementation-plan.md §4.3; reference: the "agent_energy"
 * economy of lib/grid-lab/gridlab/sim.py on branch claude/gridlab-agent-energy).
 *
 * Power (docs/energy-model.md §6): each deity has a fixed budget of settings.powerPerSecond bits per WORLD second. It
 *        gives each of its agents a share s (Σ s ≤ 1, re-allocated at will); the unallocated rest is its own income.
 * Deity: starts at `startingEnergy`, accrues (1 − Σ s)·P per world second, pays summon prices (description bits).
 *        Never negative: a summon it cannot afford is refused. World time stops in planning and pauses.
 * Capacity (docs/energy-model.md §6.1): an account holds at most its power × settings.fullChargeSeconds (an agent's
 *        s·P·T, the deity's own (1 − Σ s)·P·T). Income above it is not stored, and an account whose power falls loses
 *        what it holds above its new capacity. A game stored without the setting has no capacity.
 * Agent: starts at 0, accrues s·P bits per WORLD second up to its capacity. Each mutation
 *        opportunity goes to an agent with probability proportional to its positive energy (pickByEnergy): one draw
 *        over all agents, with no limit per agent, so a deity's offers follow the energy its agents hold together,
 *        however many they are (§7). The agent pays what the
 *        act actually cost: the bits it read at READ_PRICE plus its change (docs/energy-model.md §2, §7). The balance may
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

/**
 * What an account earning `perSecond` can hold (docs/energy-model.md §6.1): `fullChargeSeconds` of its income, so an
 * empty account that spends nothing is full after that many world seconds. Infinity when the game has no
 * `fullChargeSeconds` (a game started before the setting existed).
 */
export function energyCapacity(perSecond: number, fullChargeSeconds: number | undefined): number {
  assertRate(perSecond, "income");
  if (fullChargeSeconds === undefined) return Infinity;
  assertRate(fullChargeSeconds, "fullChargeSeconds");
  return perSecond * fullChargeSeconds;
}

/** A game's time to a full store (settings.fullChargeSeconds), or undefined when it has no capacity: a game started before the setting. */
export const fullChargeOf = (settings: { fullChargeSeconds?: number }): number | undefined => settings.fullChargeSeconds;

/** World seconds until an account earning `perSecond` is full (0 when it is; Infinity when it never fills). */
export function secondsToFull(balance: number, perSecond: number, capacity: number): number {
  if (balance >= capacity) return 0;
  return perSecond > 0 && Number.isFinite(capacity) ? (capacity - balance) / perSecond : Infinity;
}

/** A deity's power, as its own account sees it: the budget, the share given to agents, and the game's capacity time. */
export interface DeityPowerTerms { powerPerSecond: number; allocated: number; fullChargeSeconds?: number }

/** A deity's own account accrued to `worldSeconds` at its unallocated power, within that power's capacity. */
export function settleDeityEnergy(account: AgentAccount, worldSeconds: number, power: DeityPowerTerms): AgentAccount {
  const income = deityIncome(power.powerPerSecond, power.allocated);
  return settleAgentEnergy(account, Math.max(worldSeconds, account.settledWorldSeconds), income, energyCapacity(income, power.fullChargeSeconds));
}

/**
 * Charge a deity's own account `bits` at `worldSeconds` (a summon price, a paid query): the account is settled to then
 * within its capacity, and the charge deducted. Throws "Insufficient energy", leaving the input untouched, if the
 * settled balance cannot pay: a charge never takes a deity's account below zero (only an agent's debt moving to it
 * with its power does: movePower).
 */
export function chargeDeityAccount(account: AgentAccount, bits: number, worldSeconds: number, power: DeityPowerTerms): AgentAccount {
  return spendDeityEnergy(settleDeityEnergy(account, worldSeconds, power), bits);
}

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
  /**
   * Bits; an agent's is negative after an act that cost more than it had, and a deity's own is negative while it owes
   * what an agent of its owed when its power was taken (docs/energy-model.md §7.2). Either way by at most its capacity.
   */
  balance: number;
  /** World time (seconds; negative during planning) the account was last accrued to. */
  settledWorldSeconds: number;
}

/** A freshly summoned agent: zero energy. */
export function newAgentAccount(worldSeconds: number): AgentAccount {
  assertClock(worldSeconds, "world clock");
  return { balance: 0, settledWorldSeconds: worldSeconds };
}

/**
 * Credit income from the last settlement to `worldSeconds`, up to `capacity` (energyCapacity; Infinity: no capacity).
 * Income above the capacity is not stored, and a balance already above it (the account's power was lowered) falls to
 * it, at any clock: the capacity is part of the formula, so it needs no write of its own. Debt is repaid first.
 */
export function settleAgentEnergy(account: AgentAccount, worldSeconds: number, perSecond: number, capacity = Infinity): AgentAccount {
  assertClock(worldSeconds, "world clock");
  assertClock(account.settledWorldSeconds, "agent account clock");
  assertClock(account.balance, "agent balance");
  assertRate(perSecond, "agent income");
  if (typeof capacity !== "number" || Number.isNaN(capacity) || capacity < 0) throw new Error("Invalid energy capacity");
  if (worldSeconds < account.settledWorldSeconds) throw new Error("World clock went backwards");
  const dt = worldSeconds - account.settledWorldSeconds;
  const balance = Math.min(capacity, account.balance + dt * perSecond);
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { balance, settledWorldSeconds: worldSeconds };
}

// ------------------------------------------------------------------------------------------------
// selection (docs/energy-model.md §7)
// ------------------------------------------------------------------------------------------------

/**
 * The bits an offer itself tells the agent (docs/energy-model.md §7.1): which of the `liveObjects` it was given, log2 of
 * their number (0 for one object, or none). The tick adds them to the bits the act read, so every offer is charged at
 * the read price whether or not the agent then looks at the object or changes it: exposure to an opportunity costs
 * something, far less than a change.
 */
export function offerReadBits(liveObjects: number): number {
  return Number.isFinite(liveObjects) && liveObjects > 1 ? Math.log2(liveObjects) : 0;
}

/** An agent's weight in the draw for an opportunity: its positive energy (none when at or below zero). */
export const selectionWeight = (balance: number): number => (Number.isFinite(balance) && balance > 0 ? balance : 0);

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

/**
 * Credit (docs/energy-model.md §7.2): an account may owe at most what it can hold, so its balance stays within
 * ±capacity as far as its own acts go. A change that would leave it owing more does not commit. Unbounded (as before)
 * in a game stored without `fullChargeSeconds`, which keeps the economy it started with.
 */
export const actCredit = (capacity: number): number => capacity;

/** True when an act costing `cost` leaves the settled `balance` at or above −`credit`: the change may commit. */
export function affordable(balance: number, cost: number, credit: number): boolean {
  return balance - cost >= -credit - 1e-9;
}

/**
 * Debt moves with power (docs/energy-model.md §7.2): what an account owes is repaid by the power it holds, so when a
 * deity changes an agent's share from `from` to `to` (0: the agent is destroyed) the debt goes where the power goes.
 * Both accounts are settled to the same world time first.
 *  - Power taken from an agent that owes: the same fraction of its debt moves onto the deity's own account, which may
 *    then be negative (the deity cannot pay for anything until its own income has repaid it).
 *  - Power given to an agent by a deity that owes: the agent takes the same fraction of the deity's debt as it takes
 *    of the deity's unallocated power (`unallocated`, before the change).
 * Energy never moves (what an account holds above its new capacity is lost when it is next settled); debt is never
 * lost. The sum of the two balances is unchanged whenever debt moves.
 */
export function movePower(agent: AgentAccount, deity: AgentAccount, from: number, to: number, unallocated: number): { agent: AgentAccount; deity: AgentAccount } {
  assertShare(from); assertShare(to);
  let moved = 0;   // debt moving from the agent to the deity (negative: from the deity to the agent)
  // (An agent left with no power keeps no debt: `to` 0 moves all of it, even from an agent that already had none.)
  if (agent.balance < 0 && (to < from || to === 0)) moved = -agent.balance * (to === 0 ? 1 : (from - to) / from);
  else if (to > from && deity.balance < 0) moved = deity.balance * Math.min(1, unallocated > 0 ? (to - from) / unallocated : 1);
  if (moved === 0) return { agent, deity };
  return { agent: { ...agent, balance: agent.balance + moved }, deity: { ...deity, balance: deity.balance - moved } };
}

/** Deduct one act's actual cost. The balance may go negative: by at most the account's capacity when the act changed the object (§7.2). */
export function chargeAct(account: AgentAccount, cost: number): AgentAccount {
  assertClock(account.balance, "agent balance");
  assertRate(cost, "act cost");
  const balance = account.balance - cost;
  if (!Number.isFinite(balance)) throw new Error("Energy overflow");
  return { ...account, balance };
}
