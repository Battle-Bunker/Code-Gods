/**
 * Grid agents' own energy accounts (bits), separate from their god's energy.
 *
 * - Summoning still costs the god energy (the room's complexity function), as for every type.
 * - Each agent then earns `agentEnergyPerSecond` bits per second of WORLD time (planning, pauses
 *   and recovery earn nothing), capped at `agentBatteryActs` × its expected cost per act.
 * - It is eligible to act only while its balance ≥ its expected cost per act.
 * - When it acts, the actual bit cost of what it emitted is deducted, and the balance may go
 *   negative: a cooldown while it earns its way back. Decision bits (which tool, which
 *   parameters) are always charged; physical bits (erasure and motion) only when the result is
 *   committed. A failed act (an error, or invalid output) costs FAILED_ACT_BITS.
 * - The expected cost is an exponential moving average of the agent's actual act costs,
 *   starting at 0 (a new agent may act at once).
 *
 * Defaults follow Grid Lab's agent-energy study (lib/grid-lab, economy "agent_energy":
 * agent_income 2.0 bits/s, agent_battery 2.0 acts, agent_start "zero"); all knobs are settings.
 */
import type { GameSettings } from "@workspace/game-core";
import type { AgentEnergy, Game } from "./types";

export const FAILED_ACT_BITS = 1;
const EXPECTED_WEIGHT = 0.3;

export function newAgentEnergy(worldNow: number): AgentEnergy {
  return { balance: 0, settledAtWorld: worldNow, expectedCost: 0, acts: 0, charged: 0 };
}

/** The game's world clock now, without mutating the game (world time stops outside `running`). */
export function worldNow(game: Game, nowMs: number): number {
  return game.phase === "running" ? game.worldSeconds + Math.max(0, nowMs - game.lastTick) / 1000 : game.worldSeconds;
}

/** Credit income up to `world`, never above the battery cap (a balance already above it stays). */
export function accrued(e: AgentEnergy, world: number, settings: Pick<GameSettings, "agentEnergyPerSecond" | "agentBatteryActs">): AgentEnergy {
  const dt = world - e.settledAtWorld;
  if (!(dt > 0)) return e;
  const cap = settings.agentBatteryActs * e.expectedCost;
  const balance = e.balance >= cap ? e.balance : Math.min(cap, e.balance + settings.agentEnergyPerSecond * dt);
  return { ...e, balance, settledAtWorld: world };
}

export const eligible = (e: AgentEnergy) => e.balance >= e.expectedCost;

/** Deduct one act's actual cost (may go negative) and update the expected cost per act. */
export function charged(e: AgentEnergy, bits: number): AgentEnergy {
  if (!Number.isFinite(bits) || bits < 0) throw new Error("Invalid act cost");
  const acts = e.acts + 1;
  return {
    ...e, balance: e.balance - bits, acts, charged: e.charged + bits,
    expectedCost: acts === 1 ? bits : (1 - EXPECTED_WEIGHT) * e.expectedCost + EXPECTED_WEIGHT * bits,
  };
}
