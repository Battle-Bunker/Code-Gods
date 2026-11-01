/**
 * Replay a game from its log (docs/replay-design.md): the pure reducer every client uses on `player.replay` pages.
 *
 * The engine records OUTCOMES (each spawn's value, each transformation's result, each act's charge, each summon's
 * agent record), so a replay plays them back in log order and never re-runs an agent, a sampler or a scorer. What a
 * page holds is the caller's own projection (own net bits and the peer aggregate per object, own agents with their
 * sources, the public leaderboard totals), so the state rebuilt here is exactly what that player could see at the
 * time, and nothing more.
 *
 * Order: events apply in (batch seq, index) order, the order the engine committed them. World time is non-decreasing
 * within a batch, but a summon or a pause committed while a tick was simulating may carry a world time a little past
 * the next batch's first events; `cursorAtWorld` therefore seeks on the running maximum of world time.
 *
 * Seeking is O(keyframe interval): `buildReplay` keeps a full state snapshot every KEYFRAME_EVERY events, and
 * `stateAt(cursor)` restores the nearest one at or before the cursor and applies the rest.
 *
 * Pure: no React, no Convex; browser-safe.
 */
import { agentBattery, chargeAct, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

/** The replay API version this reducer reads (player.replay's `version`). */
export const REPLAY_VERSION = 1;
/** The keyframe interval: every 256 events, widened on long logs so a replay keeps at most about 256 keyframes. */
export const KEYFRAME_EVERY = 256;
const MAX_KEYFRAMES = 256;

type Wire = number | string;
type Charge = { decision: number; erasure: number; motion: number; floor: number; total: number; naming: number };
type Scored = { own?: { netBits: number }; peerNetBits?: number; peerCare?: number; payoff?: number };

/** One projected event as `player.replay` (and `player.events`) serve it. */
export type ReplayEvent =
  | { type: "phase"; phase: "planning" | "running" | "paused" | "recovery" | "ended"; worldSeconds: number; reason?: string }
  | ({ type: "object.spawned"; objectId: string; value: Wire; version: number; worldSeconds: number } & Scored)
  | ({ type: "object.transformed"; objectId: string; value: Wire; before: Wire; version: number; worldSeconds: number; agentId: string; mine: boolean; calls?: unknown; cost?: Charge } & Scored)
  | { type: "agent.failed"; objectId: string; agentId: string; worldSeconds: number; reason: string; cost: Charge }
  | {
    type: "agent.summoned"; agentId: string; mine: boolean; worldSeconds: number;
    language?: string; source?: string; summonCost?: number; decisionBits?: number; expectedActCost?: number; perActFloorBits?: number;
    breakdown?: { decision: number; erasure: number; motion: number; floor: number }; randomized?: boolean; account?: AgentAccount;
  }
  | { type: "agent.destroyed"; agentId: string; mine: boolean; worldSeconds: number };

export type ReplayBatch = { seq: number; at: number; worldFrom: number; worldTo: number; totals?: number[]; events: ReplayEvent[] };
export type ReplayChat = { id: string; authorId: string; authorName: string; kind: "human" | "ai"; text: string; timestamp: number; worldSeconds?: number };
export type ReplayRosterEntry = { id: string; name: string; kind: "human" | "ai" };
export type ReplayGame = {
  id: string; shortCode: string; phase: string; startedAt: number; planningEndsAt: number; endedAt: number | null; endReason: string | null;
  worldSeconds: number; settings: GameSettings; setup: { id: string; name: string } | null; roster: ReplayRosterEntry[];
  objectInstance: unknown; seasonCommitment: string; logSchema?: number; currentLogSchema?: number;
};
/** One `player.replay` page. */
export type ReplayPage = {
  version: number; game: ReplayGame; self: { godId: string; index: number; utility: unknown };
  batches: ReplayBatch[]; chat: ReplayChat[]; nextCursor: number; chatCursor: number; latestCursor: number; done: boolean;
};

/** One event of the flattened log, with where it came from. */
export type LogEntry = { seq: number; index: number; at: number; world: number; event: ReplayEvent };

export type ReplayObject = { id: string; value: Wire; version: number; ownNetBits: number; peerNetBits: number; payoff: number; spawnedAt: number; changedAt: number };
export type ReplayAgent = {
  id: string; mine: boolean; alive: boolean; summonedAt: number; destroyedAt?: number;
  /** Own agents only: the record from the summon and the bookkeeping since. */
  language?: string; source?: string; summonCost?: number; expectedActCost?: number; decisionBits?: number;
  acts: number; transforms: number; failures: number; spent: number; account?: AgentAccount;
};
export type ReplayState = {
  /** Events applied (the cursor): 0 is before the first event. */
  cursor: number;
  phase: "planning" | "running" | "paused" | "recovery" | "ended";
  world: number;
  /** Wall time (ms) of the batch of the last applied event. */
  at: number;
  objects: Map<string, ReplayObject>;
  agents: Map<string, ReplayAgent>;
  /** The caller's summon prices paid so far. */
  spent: number;
  /** The public leaderboard after the last batch that changed scores, roster order (absent before schema 2). */
  totals: number[] | null;
  /** Σ over objects of own net bits, the peers' net bits and own payoff (the caller's score). */
  ownNetBits: number; peerNetBits: number; score: number;
};

export type Replay = {
  game: ReplayGame;
  self: ReplayPage["self"];
  log: LogEntry[];
  /** Log index → the leaderboard totals written after that entry (its batch's `totals`). */
  totalsAfter: Map<number, number[]>;
  /** The game's chat, each message placed at a world time. */
  chat: (ReplayChat & { world: number })[];
  /** Running maximum of world time per entry (monotone; for seeking by world time). */
  worldMax: Float64Array;
  keyframes: ReplayState[];
  /** Events between keyframes. */
  keyframeEvery: number;
  /** World time at the end of the log. */
  endWorld: number;
  /** The log's totals per batch, for the leaderboard curve: [world, totals]. */
  totalsSeries: { world: number; at: number; totals: number[] }[];
};

const emptyState = (): ReplayState => ({
  cursor: 0, phase: "planning", world: 0, at: 0, objects: new Map(), agents: new Map(), spent: 0, totals: null, ownNetBits: 0, peerNetBits: 0, score: 0,
});
const cloneState = (s: ReplayState): ReplayState => ({
  ...s, objects: new Map([...s.objects].map(([k, o]) => [k, { ...o }])), agents: new Map([...s.agents].map(([k, a]) => [k, { ...a }])),
  totals: s.totals ? [...s.totals] : null,
});

/** The agent's account accrued to `world` (as the engine's lib/world settledAccount): never backwards. */
export function settleAccount(settings: GameSettings, account: AgentAccount, expectedActCost: number, world: number): AgentAccount {
  if (!(world > account.settledWorldSeconds)) return account;
  return settleAgentEnergy(account, world, settings.agentEnergyPerSecond, agentBattery(expectedActCost, settings.agentBatteryActs));
}

function setObject(state: ReplayState, o: ReplayObject) {
  const prior = state.objects.get(o.id);
  if (prior) { state.ownNetBits -= prior.ownNetBits; state.peerNetBits -= prior.peerNetBits; state.score -= prior.payoff; }
  state.objects.set(o.id, o);
  state.ownNetBits += o.ownNetBits; state.peerNetBits += o.peerNetBits; state.score += o.payoff;
}

/** Apply one log entry to a state (mutates it). */
export function applyEntry(state: ReplayState, entry: LogEntry, settings: GameSettings, totals?: number[]) {
  const ev = entry.event;
  state.cursor++;
  state.world = Math.max(state.world, entry.world);
  state.at = entry.at;
  const charge = (agentId: string, cost: Charge, ok: boolean) => {
    // A log from before summons were recorded (schema 1) still shows the caller's agents, without their record.
    if (!state.agents.has(agentId)) state.agents.set(agentId, { id: agentId, mine: true, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, spent: 0 });
    const agent = state.agents.get(agentId)!;
    if (!agent.mine) return;
    agent.acts++; agent.spent += cost.total;
    if (ok) agent.transforms++; else agent.failures++;
    if (agent.account && agent.expectedActCost !== undefined) {
      agent.account = chargeAct(settleAccount(settings, agent.account, agent.expectedActCost, entry.world), cost.total);
    }
  };
  switch (ev.type) {
    case "phase": state.phase = ev.phase; break;
    case "object.spawned":
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, ownNetBits: ev.own?.netBits ?? 0, peerNetBits: ev.peerNetBits ?? 0,
        payoff: ev.payoff ?? 0, spawnedAt: entry.world, changedAt: entry.world });
      break;
    case "object.transformed": {
      const prior = state.objects.get(ev.objectId);
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, ownNetBits: ev.own?.netBits ?? 0, peerNetBits: ev.peerNetBits ?? 0,
        payoff: ev.payoff ?? 0, spawnedAt: prior?.spawnedAt ?? entry.world, changedAt: entry.world });
      if (ev.mine && ev.cost) charge(ev.agentId, ev.cost, true);
      else if (!state.agents.has(ev.agentId)) state.agents.set(ev.agentId, { id: ev.agentId, mine: false, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, spent: 0 });
      const other = state.agents.get(ev.agentId);
      if (other && !other.mine) { other.transforms++; }
      break;
    }
    case "agent.failed": charge(ev.agentId, ev.cost, false); break;
    case "agent.summoned":
      state.agents.set(ev.agentId, {
        id: ev.agentId, mine: ev.mine, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, spent: 0,
        ...(ev.mine ? { language: ev.language, source: ev.source, summonCost: ev.summonCost, expectedActCost: ev.expectedActCost, decisionBits: ev.decisionBits, account: ev.account } : {}),
      });
      if (ev.mine) state.spent += ev.summonCost ?? 0;
      break;
    case "agent.destroyed": {
      const agent = state.agents.get(ev.agentId);
      if (agent) { agent.alive = false; agent.destroyedAt = entry.world; }
      break;
    }
  }
  if (totals) state.totals = [...totals];
}

/** Flatten replay pages (in cursor order) into a replay with keyframes. */
export function buildReplay(pages: readonly ReplayPage[]): Replay {
  if (!pages.length) throw new Error("A replay needs at least its first page");
  const [first] = pages;
  if (first.version !== REPLAY_VERSION) throw new Error(`Replay version ${first.version} is not supported (this client reads ${REPLAY_VERSION})`);
  const settings = first.game.settings;
  const last = pages.at(-1)!;
  const game = { ...first.game, phase: last.game.phase, endedAt: last.game.endedAt, endReason: last.game.endReason, worldSeconds: last.game.worldSeconds };
  const log: LogEntry[] = [];
  const totalsAfter = new Map<number, number[]>();
  const totalsSeries: Replay["totalsSeries"] = [];
  for (const page of pages) for (const batch of page.batches) {
    batch.events.forEach((event, index) => log.push({ seq: batch.seq, index, at: batch.at, world: event.worldSeconds, event }));
    if (batch.totals) {
      if (log.length) totalsAfter.set(log.length - 1, batch.totals);
      totalsSeries.push({ world: batch.worldTo, at: batch.at, totals: batch.totals });
    }
  }
  const worldMax = new Float64Array(log.length);
  let max = 0;
  log.forEach((e, i) => { max = Math.max(max, e.world); worldMax[i] = max; });
  const keyframeEvery = Math.max(KEYFRAME_EVERY, Math.ceil(log.length / MAX_KEYFRAMES));
  const keyframes: ReplayState[] = [emptyState()];
  const state = emptyState();
  log.forEach((entry, i) => {
    applyEntry(state, entry, settings, totalsAfter.get(i));
    if ((i + 1) % keyframeEvery === 0) keyframes.push(cloneState(state));
  });
  // Chat: placed by its world stamp; an unstamped message (sent before stamps existed) by wall time against the batches.
  const seen = new Set<string>();
  const chat = pages.flatMap(p => p.chat ?? []).filter(m => !seen.has(m.id) && !!seen.add(m.id))
    .map(m => ({ ...m, world: m.worldSeconds ?? worldAtWall(log, worldMax, m.timestamp) }));
  return { game, self: first.self, log, totalsAfter, chat, worldMax, keyframes, keyframeEvery, endWorld: Math.max(max, game.worldSeconds), totalsSeries };
}

/** The world time reached by the batches committed at or before wall time `at` (0 before the first): a binary search (batch times only grow). */
function worldAtWall(log: readonly LogEntry[], worldMax: Float64Array, at: number): number {
  let lo = 0, hi = log.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (log[mid].at <= at) lo = mid + 1; else hi = mid; }
  return lo ? worldMax[lo - 1] : 0;
}

/** The state after the first `cursor` events (clamped to the log). */
export function stateAt(replay: Replay, cursor: number): ReplayState {
  const target = Math.max(0, Math.min(replay.log.length, Math.floor(cursor)));
  const k = Math.min(replay.keyframes.length - 1, Math.floor(target / replay.keyframeEvery));
  const state = cloneState(replay.keyframes[k]);
  for (let i = k * replay.keyframeEvery; i < target; i++) applyEntry(state, replay.log[i], replay.game.settings, replay.totalsAfter.get(i));
  return state;
}

/** The cursor (events applied) at world time `world`: every event up to `world` applied. */
export function cursorAtWorld(replay: Replay, world: number): number {
  let lo = 0, hi = replay.log.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (replay.worldMax[mid] <= world) lo = mid + 1; else hi = mid; }
  return lo;
}

/** The caller's god energy at a state: starting energy plus real-time income to its wall time (frozen at the end), less summons. */
export function godEnergyAt(replay: Replay, state: ReplayState): number {
  const s = replay.game.settings, end = replay.game.endedAt ?? Infinity;
  const at = Math.min(Math.max(state.at, replay.game.startedAt), end);
  return s.startingEnergy + (at - replay.game.startedAt) / 1000 * s.energyPerSecond - state.spent;
}
