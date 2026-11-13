/**
 * The world clock and the two energy accounts as the engine and the projections read them (pure; ported
 * from api-server economy.ts / interaction-scheduler.ts). game-core holds the arithmetic.
 */
import { agentCapacityOf, agentIncomeOf, deityAccount, type DeityPower } from "./power.ts";
import { DEFAULT_SCORE_INTERVAL_SECONDS, leaderboard, personalView, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

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
/**
 * A tick's lease: the watchdog (engine/loop.ts) restarts a game whose lease ran out. A tick that is alive keeps its
 * lease (the heartbeat, engine/loop.ts renewLease): it renews once less than LEASE_RENEW_BELOW_MS is left, so a tick
 * that starts on time and commits within ten seconds (every tick in normal running) writes nothing extra, and a slow
 * one (a congested sandbox, a late start) is never restarted under itself, which would throw its window away.
 */
export const LEASE_MS = 30_000;
export const LEASE_RENEW_BELOW_MS = 20_000;
/** Whether a tick holding a lease until `leaseUntil` should renew it now. */
export const leaseRenewalDue = (leaseUntil: number, now: number): boolean => leaseUntil - now < LEASE_RENEW_BELOW_MS;
/** Wall-clock budget for one window's simulation: opportunities past it are dropped (no debt). */
export const MAX_SIMULATE_MS = 4000;
/** The least a wave of acts gets, however little of the budget is left when it starts. */
export const MIN_WAVE_MS = 1000;
/**
 * How long a wave of acts starting `elapsedMs` into the simulation may take: the budget left, at least MIN_WAVE_MS.
 * An act with no answer by then is a host skip (nothing charged), so a tick lasts at most about
 * MAX_SIMULATE_MS + MIN_WAVE_MS whatever the sandboxes' queues hold.
 */
export const waveBudgetMs = (elapsedMs: number): number => Math.max(MIN_WAVE_MS, MAX_SIMULATE_MS - elapsedMs);
export const MAX_OBJECTS = 2000;
export const IDLE_MS = 30 * 60 * 1000;
/** Every object a game holds; events per tickBatches doc. */
export const EVENTS_PER_BATCH = 400;
/**
 * The event log's schema (game/tables.ts eventV, docs/replay-design.md §2), stamped on every tickBatches doc. 2 added
 * agent summons and destructions, per-batch leaderboard totals and chat stamped with its game and world time; 3 added
 * each act's seed to transform and fail events. A batch without the stamp predates them. 4 marks the batches that
 * published the live scoreboard (`scoreboard`, every scoreIntervalSeconds of world time, docs/public-log-design.md §3),
 * adds the live disclosure noise per spawn and transform (`noise`) and writes one objectEvents row per spawn and
 * transform. 5 is the energy model (docs/energy-model.md): an act's cost is {read, change, total} (no decision or floor),
 * summons carry no decisionBits or perActFloorBits, and an act that returned no calls is a `skip` event. Bump it whenever
 * an event's meaning or fields change. 6 is the power budget (docs/energy-model.md §6): a summon carries the agent's
 * `powerShare`, and a `power` event records each re-allocation. 7 is hold rarity (docs/energy-model.md §8): a `rescore` event
 * per object when the hold corrections arrive during planning. 8 is the read price (docs/energy-model.md §2.1): an act's
 * cost.read is the energy its reads cost (bits read × READ_PRICE, 1/32 when 8 was introduced); in schemas 5–7 reads were
 * priced at one energy bit per bit read, so cost.read there is also the bits read. Replay reads recorded costs either way.
 * 9 marks a failed act whose code raised or ran out of time (`error: true` on a fail event), so a replay tells a runtime
 * error from an invalid call, as the live failure breakdown (agents.failures) does.
 * 10 marks the selection and exposure rules of 11 Nov 2026 (docs/energy-model.md §7): no rate limit per agent (before it,
 * each agent was offered at most 4 opportunities per world second), and every offer is charged as a read of which object
 * the agent was given (log2 of the live objects, inside cost.read). Replay reads recorded costs either way.
 * 11 adds the `look` event (paid observation, lib/knowledge.ts): a god paid its own energy to be told one object, or all
 * of them.
 * 12 is cost models (docs/mutation-cost-design.md §11): an act's cost.change (and cost.work) is priced under the game's
 * settings.costModel ("distance-v1" charges a number by how far it moved); in every batch below 12 it is priced under
 * "set-v1", whatever the settings say. A game without the setting (every game started before 12) is "set-v1" too, so a
 * game that was running across the deploy changes its stamp and nothing else. Replay reads recorded costs and never
 * re-prices.
 * 13 marks debt within capacity (docs/energy-model.md §7.2): a change that would leave the agent owing more than it can
 * hold fails ("could not afford this change"), and `power` and `destroy` events carry `owed`, the debt that moved with
 * the power between the agent and its god's own account. Replay applies the recorded amount.
 * 14 adds the `replace` event (docs/energy-model.md §5.2): an agent's program was replaced for the new program's summon
 * price; the agent keeps its id, name, power share and account. Replay charges the recorded price to its god.
 */
export const EVENT_LOG_SCHEMA = 14;

export type Clock = {
  phase: "planning" | "running" | "paused" | "recovery" | "ended";
  worldSeconds: number; lastTick: number; endAtWorld: number;
  createdAt: number; settings: GameSettings;
};
export type AgentLike = { account: AgentAccount; powerShare: number };

/** The world clock now, without mutating the game (world time stops outside `running`). */
export function worldNow(game: Clock, nowMs = Date.now()): number {
  const running = game.phase === "running" ? Math.max(0, nowMs - game.lastTick) / 1000 : 0;
  return Math.min(game.endAtWorld, game.worldSeconds + running);
}

/**
 * The agent's account accrued to `world` within its capacity (share·P·fullChargeSeconds: docs/energy-model.md §6.1); a
 * clock behind the account's own accrues nothing, but the capacity still holds (its share may just have been lowered).
 */
export function settledAccount(settings: GameSettings, agent: AgentLike, world: number): AgentAccount {
  return settleAgentEnergy(agent.account, Math.max(world, agent.account.settledWorldSeconds), agentIncomeOf(agent, settings), agentCapacityOf(agent, settings));
}
/**
 * The agent's energy at `world`, and whether it can be offered an opportunity then (docs/energy-model.md §7): positive
 * energy, which is also its weight in the draw. Nothing else limits it: no rate per agent.
 */
export function agentStatus(settings: GameSettings, agent: AgentLike, world: number) {
  const account = settledAccount(settings, agent, world);
  return { energy: account.balance, eligible: account.balance > 0 };
}
/** World seconds until the agent can be offered an opportunity (0 if it can now), or Infinity if it never earns. */
export function secondsUntilEligible(settings: GameSettings, agent: AgentLike, world: number): number {
  const { energy, eligible } = agentStatus(settings, agent, world);
  if (eligible) return 0;
  const income = agentIncomeOf(agent, settings);
  if (!(income > 0)) return Infinity;
  return -energy / income + 1e-6;
}

/** A deity's own energy at world time `world` (docs/energy-model.md §6; lib/power.ts deityAccount). */
export function godEnergy(game: { settings: GameSettings }, deity: DeityPower, world: number): number {
  return deityAccount(game, deity, world).balance;
}

/**
 * A god's own view of one object from the private score list: own score and peer aggregates only. `noise` is added to
 * the peers' sum before care and payoff (the live disclosure, settings.peerNoiseBits; 0 for the exact view).
 */
export function viewOf(scores: readonly { god: string; netBits: number }[], godId: string, noise = 0) {
  const view = personalView(new Map(scores.map(s => [s.god, s.netBits])), godId);
  return noise === 0 ? view : withPeers(view.netBits, view.peerNetBits + noise);
}
const withPeers = (own: number, peer: number) => {
  const peerCare = Math.max(0, peer);
  return { netBits: own, peerNetBits: peer, peerCare, payoff: peerCare === 0 ? 0 : own * peerCare };
};
/** The same from a roster-ordered net-bits vector (event log), with the disclosure `noise` on the peers' sum. */
export function viewOfNet(net: readonly number[], index: number, noise = 0) {
  let peer = 0;
  for (let i = 0; i < net.length; i++) if (i !== index) peer += net[i];
  return withPeers(net[index], peer + noise);
}
/**
 * The commit clause's test (docs/public-log-design.md §5.2): does the act strictly raise the owner's payoff on the object
 * AS THE OWNER SEES IT, own bits exact and the others' sum with each value's live disclosure noise? Deciding on the
 * exact payoff would leak one bit of the exact others' sum per conditional act; on the disclosed values it reveals only
 * what the owner is shown (and the noise is a fixed function of the value, so repeating a probe adds nothing).
 */
export function commitRaises(before: readonly { god: string; netBits: number }[], after: readonly { god: string; netBits: number }[],
  ownerId: string, beforeNoise: number, afterNoise: number): boolean {
  return viewOf(after, ownerId, afterNoise).payoff - viewOf(before, ownerId, beforeNoise).payoff > 0;
}

/**
 * Every roster god's total payoff as disclosed live (the published scoreboard): each object's payoff computed from its
 * noisy peers' sum (the object's stored `noise`), so a god's published total is consistent with what that god sees.
 */
export function disclosedTotalsOf(roster: readonly string[], objects: readonly { scores: readonly { god: string; netBits: number }[]; noise?: number }[],
  handicaps?: readonly number[]): number[] {
  return withHandicaps(roster.map(id => objects.reduce((sum, o) => sum + (o.scores.some(s => s.god === id) ? viewOf(o.scores, id, o.noise ?? 0).payoff : 0), 0)), handicaps);
}
/**
 * A handicap taken off a total (docs/bid-phase.md): `percent` of its size, always downwards (a negative total, possible
 * with defence goals, gets more negative: a handicap never helps). None (0 or absent) is the total itself, untouched.
 * The same formula as game-utilities applyHandicap (kept here: this file loads in the V8 runtime).
 */
export const applyHandicap = (total: number, percent: number | undefined): number => (percent ? total - Math.abs(total) * percent / 100 : total);
/**
 * Roster-ordered totals with the game's handicaps taken off (`games.handicaps`, roster order; absent: nobody has one,
 * and the totals are returned as they are). Every total a game ranks, shows or records goes through here.
 */
export const withHandicaps = (totals: number[], handicaps?: readonly number[]): number[] =>
  (handicaps?.some(h => h > 0) ? totals.map((t, i) => applyHandicap(t, handicaps[i])) : totals);
/** Every roster god's total payoff over these objects (the leaderboard's numbers), in roster order. */
export function totalsOf(roster: readonly string[], objects: readonly { scores: readonly { god: string; netBits: number }[] }[], handicaps?: readonly number[]): number[] {
  const rows = leaderboard(roster, objects.map(o => new Map(o.scores.map(s => [s.god, s.netBits]))));
  const total = new Map(rows.map(r => [r.godId, r.totalPayoff]));
  return withHandicaps(roster.map(id => total.get(id)!), handicaps);
}
/** The game's scoreboard interval (world seconds); a game stored before the setting existed uses the default. */
export const scoreIntervalOf = (game: { settings: unknown }) =>
  (game.settings as Partial<GameSettings>).scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS;

/**
 * Whether a commit that brings the world from the last publication at `lastWorld` to `world` publishes the scoreboard:
 * it has reached the next multiple of `interval` after `lastWorld` (docs/public-log-design.md §3).
 */
export function scoreboardDue(lastWorld: number, world: number, interval: number): boolean {
  if (!(interval > 0)) return true;
  return Math.floor(world / interval + 1e-9) > Math.floor(lastWorld / interval + 1e-9);
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
