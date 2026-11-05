/**
 * Power (docs/energy-model.md §6): each deity's fixed budget of settings.powerPerSecond bits per world second, split
 * into its agents' shares (agents.powerShare); the unallocated rest (1 − deities.allocated) is the deity's own income,
 * on its own world-time account (deities.account), which pays for summons.
 */
import { agentIncome, deityIncome, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

export const powerOf = (settings: GameSettings): number => settings.powerPerSecond;
/** An agent's income, bits per world second. */
export const agentIncomeOf = (agent: { powerShare: number }, settings: GameSettings) => agentIncome(powerOf(settings), agent.powerShare);

export type DeityPower = { account: AgentAccount; allocated: number };

/** A deity's own account accrued to world time `world`, settled at (1 − allocated)·P. */
export function deityAccount(game: { settings: GameSettings }, deity: DeityPower, world: number): AgentAccount {
  if (!(world > deity.account.settledWorldSeconds)) return deity.account;
  return settleAgentEnergy(deity.account, world, deityIncome(powerOf(game.settings), deity.allocated));
}
