/**
 * Power (docs/energy-model.md §6): each deity's fixed budget of settings.powerPerSecond bits per world second, split
 * into its agents' shares (agents.powerShare); the unallocated rest (1 − deities.allocated) is the deity's own income,
 * on its own world-time account (deities.account), which pays for summons (and whatever else charges the god: chargeGod).
 *
 * Capacity (§6.1): every account holds at most its power × settings.fullChargeSeconds. It is part of the settle formula
 * (game-core settleAgentEnergy), so every reader of an account goes through agentAccount/deityAccount and nothing is
 * written when an account fills. A game stored before the setting existed has no capacity.
 */
import { agentIncome, deityIncome, energyCapacity, fullChargeOf, settleDeityEnergy, spendDeityEnergy, type AgentAccount, type DeityPowerTerms, type GameSettings } from "@workspace/game-core";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { worldNow, type Clock } from "./world.ts";

export const powerOf = (settings: GameSettings): number => settings.powerPerSecond;
export { fullChargeOf };
/** An agent's income, bits per world second. */
export const agentIncomeOf = (agent: { powerShare: number }, settings: GameSettings) => agentIncome(powerOf(settings), agent.powerShare);
/** What an agent's account can hold: its income × fullChargeSeconds (Infinity: no capacity). */
export const agentCapacityOf = (agent: { powerShare: number }, settings: GameSettings) => energyCapacity(agentIncomeOf(agent, settings), fullChargeOf(settings));

export type DeityPower = { account: AgentAccount; allocated: number };
const termsOf = (settings: GameSettings, deity: { allocated: number }): DeityPowerTerms =>
  ({ powerPerSecond: powerOf(settings), allocated: deity.allocated, fullChargeSeconds: fullChargeOf(settings) });
/** What a deity's own account can hold: its unallocated power × fullChargeSeconds (Infinity: no capacity). */
export const deityCapacityOf = (deity: { allocated: number }, settings: GameSettings) =>
  energyCapacity(deityIncome(powerOf(settings), deity.allocated), fullChargeOf(settings));

/** A deity's own account accrued to world time `world` at (1 − allocated)·P, within its capacity. */
export function deityAccount(game: { settings: GameSettings }, deity: DeityPower, world: number): AgentAccount {
  return settleDeityEnergy(deity.account, world, termsOf(game.settings, deity));
}

/**
 * Charge a god's own account `bits` now (a paid query; a summon charges the same account with its share change, in
 * game/commands.ts): the account is settled at the game's world time within its capacity, and `deities.account` and
 * `deities.spent` are written. Returns the new balance, or null (nothing written) when the god cannot pay: its account
 * is never negative. `deities` is a cold document that other queries read, so charge it per request, never per tick.
 */
export async function chargeGod(ctx: MutationCtx, game: Clock, deity: Doc<"deities">, bits: number, nowMs = Date.now()): Promise<number | null> {
  const settled = deityAccount(game, deity, worldNow(game, nowMs));
  if (settled.balance < bits) return null;
  const account = spendDeityEnergy(settled, bits);
  await ctx.db.patch(deity._id, { account, spent: deity.spent + bits });
  return account.balance;
}
