/** The two energy accounts as the engine and projections read them (game-core holds the arithmetic). */
import { agentBattery, isEligible, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";
import type { Agent, Game } from "./types";

// ------------------------------------------------------------------------------------------------

/** The world clock now, without mutating the game (world time stops outside `running`). */
export function worldNow(game: Game, nowMs = Date.now()): number {
  const running = game.phase === "running" ? Math.max(0, nowMs - game.lastTick) / 1000 : 0;
  return Math.min(game.endAtWorld, game.worldSeconds + running);
}

/**
 * The agent's account accrued to `world`. A world clock behind the account's own (a checkpoint
 * older than a replayed act, or recovery that froze time) accrues nothing rather than failing.
 */
export function settledAccount(settings: GameSettings, agent: Agent, world: number): AgentAccount {
  if (!(world > agent.account.settledWorldSeconds)) return agent.account;
  return settleAgentEnergy(agent.account, world, settings.agentEnergyPerSecond,
    agentBattery(agent.expectedActCost, settings.agentBatteryActs));
}
export function agentStatus(game: Game, agent: Agent, nowMs = Date.now()) {
  const account = settledAccount(game.settings, agent, worldNow(game, nowMs));
  return { energy: account.balance, eligible: isEligible(account, agent.expectedActCost) };
}

/** God energy: starting energy plus real-time income, minus summon prices paid. */
export function godEnergy(game: Game, deity: Game["deities"][number], nowMs = Date.now()) {
  return game.settings.startingEnergy + Math.max(0, nowMs - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent;
}

