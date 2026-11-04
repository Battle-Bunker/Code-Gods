/**
 * Power (docs/energy-model.md §6): each deity's fixed budget of settings.powerPerSecond bits per world second, split
 * into its agents' shares (agents.powerShare); the unallocated rest (1 − deities.allocated) is the deity's own income,
 * on its own world-time account (deities.account), which pays for summons.
 *
 * WIDEN PHASE (migrations.powerV1): a game, agent or deity stored before the power budget lacks these fields until the
 * migration has run. The readers below fall back to the old economy's numbers so a game ticking across the deploy keeps
 * working: P = energyPerSecond + 2 · agentEnergyPerSecond, an agent's share agentEnergyPerSecond / P, and a deity's
 * account its old real-time energy. Narrowed (the fallbacks removed) once dev and production report powerV1 done.
 */
import { agentIncome, deityIncome, settleAgentEnergy, upgradeLegacyPower, type AgentAccount, type GameSettings } from "@workspace/game-core";

type LegacySettings = { energyPerSecond?: number; agentEnergyPerSecond?: number };
const legacy = (settings: GameSettings) => settings as GameSettings & LegacySettings;

/** The power a game's stored settings imply (the old economy's when it predates powerPerSecond). */
export function legacyPower(settings: LegacySettings): number {
  return (settings.energyPerSecond ?? 1) + 2 * (settings.agentEnergyPerSecond ?? 2);
}
export function powerOf(settings: GameSettings): number {
  return typeof settings.powerPerSecond === "number" ? settings.powerPerSecond : legacyPower(legacy(settings));
}
/** An agent's share: stored, or the old economy's agentEnergyPerSecond / P. */
export function shareOf(agent: { powerShare?: number }, settings: GameSettings): number {
  if (typeof agent.powerShare === "number") return agent.powerShare;
  const P = powerOf(settings);
  return P > 0 ? Math.min(1, (legacy(settings).agentEnergyPerSecond ?? 2) / P) : 0;
}
/** An agent's income, bits per world second. */
export const agentIncomeOf = (agent: { powerShare?: number }, settings: GameSettings) => agentIncome(powerOf(settings), shareOf(agent, settings));

export type DeityPower = { account?: AgentAccount; allocated?: number; spent: number };
export type PowerClock = { settings: GameSettings; createdAt: number; endedAt?: number };

/**
 * A deity's own account accrued to world time `world`: its stored account, settled at (1 − allocated)·P; or, for a
 * deity stored before the power budget, its old real-time energy (startingEnergy + energyPerSecond · seconds − spent).
 */
export function deityAccount(game: PowerClock, deity: DeityPower, world: number, nowMs = Date.now()): AgentAccount {
  if (!deity.account) {
    const at = game.endedAt !== undefined ? Math.min(nowMs, game.endedAt) : nowMs;
    const balance = game.settings.startingEnergy + Math.max(0, at - game.createdAt) / 1000 * (legacy(game.settings).energyPerSecond ?? 1) - deity.spent;
    return { balance: Math.max(0, balance), settledWorldSeconds: world };
  }
  if (!(world > deity.account.settledWorldSeconds)) return deity.account;
  return settleAgentEnergy(deity.account, world, deityIncome(powerOf(game.settings), deity.allocated ?? 0));
}

/** migrations.powerV1 for stored settings (games, rooms, game setups): game-core upgradeLegacyPower. */
export function powerSettingsV1(settings: unknown): Record<string, unknown> | undefined {
  if (!settings || typeof settings !== "object") return undefined;
  return upgradeLegacyPower(settings as Record<string, unknown>) ?? undefined;
}
