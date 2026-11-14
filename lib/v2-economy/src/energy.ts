/**
 * Power and energy (docs/energy-model.md §6, §7; copied and cleaned from game-core's energy.ts).
 *
 * Power: each player has a fixed budget of `powerPerSecond` bits per WORLD second. It gives each of its agents a share
 *   s (Σ s ≤ 1, re-allocated at will); the unallocated rest is the income of the player's own account (its store), which
 *   pays summon prices. World time stops in planning and pauses, so nothing accrues then.
 * Capacity: an account holds at most its power × `fullChargeSeconds` (an agent's s·P·T, the player's own (1 − Σ s)·P·T).
 *   Income above it is not stored. When power moves, what an account holds or owes beyond what its new power supports
 *   moves with it (movePower), so a re-allocation neither makes nor loses energy.
 * Selection: each opportunity goes to one agent of the room, with probability proportional to its positive energy
 *   (pickByEnergy). One draw over every agent and no limit per agent, so a player's share of the offers follows the
 *   energy its agents hold together, however many they are (§7).
 * An agent pays each act's charge (charge.ts). Its balance may go negative, by at most its capacity when the act changed
 *   the state (affordable); such an agent is not picked until its income lifts it above zero.
 *
 * Pure functions: the server persists the results.
 */

function assertClock(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${what}`);
}

function assertRate(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${what}`);
}

// ------------------------------------------------------------------------------------------------
// power shares
// ------------------------------------------------------------------------------------------------

/** Shares are kept to this many decimals, so Σ s ≤ 1 holds exactly where it should. */
const SHARE_DECIMALS = 1e6;
export const roundShare = (s: number): number => Math.round(s * SHARE_DECIMALS) / SHARE_DECIMALS;
/** The largest kept share not above `s` (a bound that must hold, such as a store that must stay large enough). */
export const floorShare = (s: number): number => Math.floor(s * SHARE_DECIMALS + 1e-9) / SHARE_DECIMALS;

/** A valid power share: a finite number in [0, 1]. */
export function assertShare(share: number): void {
  if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) throw new Error("A power share must be from 0 to 1");
}
/** An agent's income: its share of its player's power. */
export const agentIncome = (powerPerSecond: number, share: number): number => powerPerSecond * Math.max(0, share);
/** The income of a player's own account: the power it has not allocated to its agents. */
export const ownIncome = (powerPerSecond: number, allocated: number): number => powerPerSecond * Math.max(0, 1 - allocated);
/** The share a new agent gets when its summon names none: half of what is unallocated (the player keeps the rest). */
export const defaultShare = (allocated: number): number => roundShare(Math.max(0, 1 - allocated) / 2);

/** What a beginner's FIRST agent is aimed at: three quarters of the player's power, so one agent acts often. */
export const FIRST_AGENT_SHARE_TARGET = 0.75;
/**
 * The share a beginner's first agent is summoned with: as close to FIRST_AGENT_SHARE_TARGET as still leaves the
 * player's own store able to hold `need` (the dearest agent it may want to pay for next):
 * (1 − allocated − share) × P × T ≥ need. Undefined (use defaultShare) when that share is not above the default.
 */
export function firstAgentShare(s: { allocated: number; powerPerSecond: number; fullChargeSeconds: number; need: number }): number | undefined {
  if (!(s.powerPerSecond > 0) || !(s.fullChargeSeconds > 0)) return undefined;
  const free = Math.max(0, 1 - s.allocated);
  const bound = free - Math.max(0, s.need) / (s.powerPerSecond * s.fullChargeSeconds);
  const share = floorShare(Math.min(FIRST_AGENT_SHARE_TARGET, free, bound));
  return share > defaultShare(s.allocated) ? share : undefined;
}

// ------------------------------------------------------------------------------------------------
// accounts (world time) and capacity
// ------------------------------------------------------------------------------------------------

/** An energy account on world time: an agent's, or a player's own store. */
export interface Account {
  /** Bits. Negative while it owes (after an act, or debt that moved with power), by at most its capacity. */
  readonly balance: number;
  /** World time (seconds; negative during planning) the account was last accrued to. */
  readonly settledWorldSeconds: number;
}

/** A freshly summoned agent's account: zero energy. */
export function newAccount(worldSeconds: number, balance = 0): Account {
  assertClock(worldSeconds, "world clock");
  assertClock(balance, "balance");
  return { balance, settledWorldSeconds: worldSeconds };
}

/** What an account earning `perSecond` can hold: `fullChargeSeconds` of its income. */
export function energyCapacity(perSecond: number, fullChargeSeconds: number): number {
  assertRate(perSecond, "income");
  assertRate(fullChargeSeconds, "fullChargeSeconds");
  return perSecond * fullChargeSeconds;
}

/** World seconds until an account earning `perSecond` is full (0 when it is; Infinity when it never fills). */
export function secondsToFull(balance: number, perSecond: number, capacity: number): number {
  if (balance >= capacity) return 0;
  return perSecond > 0 ? (capacity - balance) / perSecond : Infinity;
}

/**
 * Credit income from the last settlement to `worldSeconds`, up to `capacity`. Income above it is not stored, and a
 * balance above it falls to it (the capacity is part of the formula, so nothing is written when an account fills).
 * Debt is repaid first. Throws if `worldSeconds` is behind the account's own clock.
 */
export function settle(account: Account, worldSeconds: number, perSecond: number, capacity: number): Account {
  assertClock(worldSeconds, "world clock");
  assertClock(account.settledWorldSeconds, "account clock");
  assertClock(account.balance, "balance");
  assertRate(perSecond, "income");
  assertRate(capacity, "energy capacity");
  if (worldSeconds < account.settledWorldSeconds) throw new Error("World clock went backwards");
  const balance = Math.min(capacity, account.balance + (worldSeconds - account.settledWorldSeconds) * perSecond);
  return { balance, settledWorldSeconds: worldSeconds };
}

/** A player's power, as its own account sees it. */
export interface PowerTerms { readonly powerPerSecond: number; readonly allocated: number; readonly fullChargeSeconds: number }

/**
 * A player's own account accrued to `worldSeconds` at its unallocated power, within that power's capacity. A clock
 * behind the account's own (a planning summon after the account was settled later) accrues nothing.
 */
export function settleOwn(account: Account, worldSeconds: number, power: PowerTerms): Account {
  const income = ownIncome(power.powerPerSecond, power.allocated);
  return settle(account, Math.max(worldSeconds, account.settledWorldSeconds), income, energyCapacity(income, power.fullChargeSeconds));
}

/** Pay `bits` (a summon price, a paid query) from a settled account. Throws, leaving the input untouched, if it cannot. */
export function spend(account: Account, bits: number): Account {
  if (typeof bits !== "number" || !Number.isFinite(bits) || bits < 0) throw new Error("Invalid price");
  if (account.balance < bits) throw new Error("Insufficient energy");
  return { ...account, balance: account.balance - bits };
}

/** Settle a player's own account to `worldSeconds`, then pay `bits` from it. Never takes it below zero. */
export function chargeOwn(account: Account, bits: number, worldSeconds: number, power: PowerTerms): Account {
  return spend(settleOwn(account, worldSeconds, power), bits);
}

// ------------------------------------------------------------------------------------------------
// selection (docs/energy-model.md §7)
// ------------------------------------------------------------------------------------------------

/**
 * The bits an offer itself tells the agent (§7.1): which of the `liveObjects` it was given, log2 of their number (0 for
 * one object or none). Added to the act's read bits, so every offer costs something.
 */
export function offerReadBits(liveObjects: number): number {
  return Number.isFinite(liveObjects) && liveObjects > 1 ? Math.log2(liveObjects) : 0;
}

/** An agent's weight in the draw for an opportunity: its positive energy (none when at or below zero). */
export const selectionWeight = (balance: number): number => (Number.isFinite(balance) && balance > 0 ? balance : 0);

/**
 * Pick one of `candidates` with probability proportional to selectionWeight(energy(c)), with one `rng.unit()` draw;
 * undefined (and nothing drawn) when none has positive energy.
 */
export function pickByEnergy<T>(candidates: readonly T[], energy: (c: T) => number, rng: { unit(): number }): T | undefined {
  let total = 0;
  const weights = candidates.map(c => { const w = selectionWeight(energy(c)); total += w; return w; });
  if (!(total > 0)) return undefined;
  let u = rng.unit() * total;
  for (let i = 0; i < candidates.length; i++) {
    if (weights[i]! <= 0) continue;
    u -= weights[i]!;
    if (u < 0) return candidates[i];
  }
  for (let i = candidates.length - 1; i >= 0; i--) if (weights[i]! > 0) return candidates[i];
  return undefined;
}

// ------------------------------------------------------------------------------------------------
// credit and charging (docs/energy-model.md §7.2)
// ------------------------------------------------------------------------------------------------

/** An account may owe at most what it can hold. */
export const actCredit = (capacity: number): number => capacity;

/** True when an act costing `cost` leaves the settled `balance` at or above −`credit`: its change may commit. */
export function affordable(balance: number, cost: number, credit: number): boolean {
  return balance - cost >= -credit - 1e-9;
}

/** Deduct one act's charge. The balance may go negative (by at most the capacity when the change committed: affordable). */
export function chargeAct(account: Account, cost: number): Account {
  assertClock(account.balance, "balance");
  assertRate(cost, "act cost");
  return { ...account, balance: account.balance - cost };
}

/**
 * Power moves between an agent and its player's own account: the agent's share goes from `from` to `to` (0: the agent
 * is destroyed; from 0: it is summoned). Both accounts must already be settled to the same world time at the old
 * shares. `unallocated` is the player's unallocated share before the move, `whole` what all its power can hold (P·T).
 * What an account holds or owes beyond what its power supports goes where the power goes:
 *  - the account that loses power gives: if it owes, the same fraction of its debt as of its power (all of it from an
 *    agent left with none); if it holds more than its new capacity, the excess;
 *  - the account that gains power receives; its capacity rises by exactly what the giver's falls, so it always fits.
 * The sum of the two balances is unchanged. `owed`: debt moved onto the player's account (negative: onto the agent);
 * `held`: energy moved onto the player's account (negative: onto the agent). At most one is not zero.
 */
export function movePower(agent: Account, own: Account, from: number, to: number, unallocated: number, whole: number):
  { agent: Account; own: Account; owed: number; held: number } {
  assertShare(from); assertShare(to);
  assertRate(whole, "energy capacity");
  let owed = 0, held = 0;
  if (to < from || to === 0) {
    if (agent.balance < 0) owed = -agent.balance * (to === 0 ? 1 : (from - to) / from);
    else held = Math.max(0, agent.balance - to * whole);
  } else if (to > from) {
    if (own.balance < 0) owed = own.balance * Math.min(1, unallocated > 0 ? (to - from) / unallocated : 1);
    else held = -Math.max(0, own.balance - Math.max(0, unallocated - (to - from)) * whole);
  }
  if (owed === 0 && held === 0) return { agent, own, owed: 0, held: 0 };
  const onto = held - owed;   // the change of the player's own balance
  return { agent: { ...agent, balance: agent.balance - onto }, own: { ...own, balance: own.balance + onto }, owed, held };
}
