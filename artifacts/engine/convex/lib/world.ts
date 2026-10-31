/**
 * The world clock and the two energy accounts as the engine and the projections read them (pure; ported
 * from api-server economy.ts / interaction-scheduler.ts). game-core holds the arithmetic.
 */
import { agentBattery, isEligible, personalView, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

/**
 * Engine constants (plan §3.1). The tick window is a constant, not a setting: game-core's settings carry no
 * tickSeconds. A tick simulates the interaction opportunities of the world time since the last commit, at
 * most TICK_SECONDS of it: with commits about every 1.05–1.1 s (MIN_TICK_MS plus the tick's own work), a
 * 1.5 s cap covers every interval in normal running (measured: 94 acts/s at a 100 Hz cap with a 1.0 s cap)
 * while still bounding the catch-up after a stall: time beyond it is skipped, never owed.
 */
export const TICK_SECONDS = 1.5;
/**
 * Ticks commit at most once a second. Every commit re-runs every client's subscriptions (observation,
 * events, panels), so the commit rate, not the interaction rate, sets the query load: measured on the
 * local backend, three player apps at 4 Hz commits fell tens of seconds behind; at 1 Hz they keep up.
 * The window (TICK_SECONDS) still covers every interaction opportunity of the interval.
 */
export const MIN_TICK_MS = 1000;
/** A tick action that has not committed within this time loses its lease to the watchdog. */
export const LEASE_MS = 30_000;
export const MAX_OBJECTS = 2000;
export const IDLE_MS = 30 * 60 * 1000;
/** Every object a game holds; events per tickBatches doc. */
export const EVENTS_PER_BATCH = 400;

export type Clock = {
  phase: "planning" | "running" | "paused" | "recovery" | "ended";
  worldSeconds: number; lastTick: number; endAtWorld: number;
  createdAt: number; settings: GameSettings;
};
export type AgentLike = { expectedActCost: number; account: AgentAccount };

/** The world clock now, without mutating the game (world time stops outside `running`). */
export function worldNow(game: Clock, nowMs = Date.now()): number {
  const running = game.phase === "running" ? Math.max(0, nowMs - game.lastTick) / 1000 : 0;
  return Math.min(game.endAtWorld, game.worldSeconds + running);
}

/** The agent's account accrued to `world`; a clock behind the account's own accrues nothing. */
export function settledAccount(settings: GameSettings, agent: AgentLike, world: number): AgentAccount {
  if (!(world > agent.account.settledWorldSeconds)) return agent.account;
  return settleAgentEnergy(agent.account, world, settings.agentEnergyPerSecond, agentBattery(agent.expectedActCost, settings.agentBatteryActs));
}
export function agentStatus(settings: GameSettings, agent: AgentLike, world: number) {
  const account = settledAccount(settings, agent, world);
  return { energy: account.balance, eligible: isEligible(account, agent.expectedActCost) };
}
/** World seconds until the agent is eligible (0 if it is), or Infinity if it never earns. */
export function secondsUntilEligible(settings: GameSettings, agent: AgentLike, world: number): number {
  const { energy } = agentStatus(settings, agent, world);
  if (energy >= agent.expectedActCost) return 0;
  if (!(settings.agentEnergyPerSecond > 0)) return Infinity;
  return (agent.expectedActCost - energy) / settings.agentEnergyPerSecond;
}

/** God energy: starting energy plus real-time income, minus summon prices paid. */
export function godEnergy(game: Pick<Clock, "settings" | "createdAt"> & { endedAt?: number }, spent: number, nowMs = Date.now()): number {
  // An ended game is frozen: its gods' energy stops accruing at the end.
  const at = game.endedAt !== undefined ? Math.min(nowMs, game.endedAt) : nowMs;
  return game.settings.startingEnergy + Math.max(0, at - game.createdAt) / 1000 * game.settings.energyPerSecond - spent;
}

/** A god's own view of one object from the private score list: own score and peer aggregates only. */
export function viewOf(scores: readonly { god: string; netBits: number }[], godId: string) {
  return personalView(new Map(scores.map(s => [s.god, s.netBits])), godId);
}
/** The same from a roster-ordered net-bits vector (event log). */
export function viewOfNet(net: readonly number[], index: number) {
  let peer = 0;
  for (let i = 0; i < net.length; i++) if (i !== index) peer += net[i];
  const own = net[index], peerCare = Math.max(0, peer);
  return { netBits: own, peerNetBits: peer, peerCare, payoff: peerCare === 0 ? 0 : own * peerCare };
}
export const salienceOf = (scores: readonly { netBits: number }[]) => scores.reduce((sum, s) => sum + s.netBits, 0);

/**
 * The interaction's target. "uniform": every object alike. "shelter": weight 1/(1 + σ⁺) with σ the
 * object's salience, so salient objects are hit a little less. Never weighted toward salience.
 */
export function pickObject<T extends { salience: number }>(objects: readonly T[], mode: GameSettings["objectSelection"], uniform01: () => number): T {
  if (mode !== "shelter") return objects[Math.min(objects.length - 1, Math.floor(uniform01() * objects.length))];
  const weights = objects.map(o => 1 / (1 + Math.max(0, o.salience)));
  let u = uniform01() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < objects.length; i++) { u -= weights[i]; if (u < 0) return objects[i]; }
  return objects[objects.length - 1];
}

/** "YYYY-MM-DD" in UTC. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The world times of a tick's spawns: a Poisson process (`interval()` draws the next gap) from
 * `nextSpawn` up to `until`, never at or past the lifetime end, and at most `room` of them (the
 * 2,000-object limit). `place` places one spawn and says whether it found a free value; only placed spawns use room. `full` is true when a spawn was due but there was no room.
 *
 * Like interactions, spawns happen only inside the tick's window [windowStart, until]: time the loop
 * skipped (a stall longer than TICK_SECONDS) is skipped, never owed. A spawn due in the skipped time is
 * redrawn from the window's start, which the process's memorylessness makes exact.
 */
export function planSpawns(p: { nextSpawn: number; windowStart: number; until: number; endAtWorld: number; room: number; interval: () => number; place: (world: number) => boolean }) {
  let next = p.nextSpawn < p.windowStart ? p.windowStart + p.interval() : p.nextSpawn, placed = 0, full = false;
  while (next <= p.until && next < p.endAtWorld) {
    if (placed >= p.room) { full = true; break; }
    if (p.place(next)) placed++;
    const step = p.interval();
    next = Number.isFinite(next + step) ? next + step : Number.MAX_VALUE;
  }
  return { next, full };
}
