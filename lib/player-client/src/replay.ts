/**
 * Replay an ended game from its log (docs/replay-design.md): the pure reducer every client uses on `player.replay`
 * pages.
 *
 * Information hiding applies only while a game is live; an ended game's replay is fully transparent. A page carries
 * every event in full: every god's net bits after each spawn and transformation, the agent and god behind every act,
 * every agent's source, language and price, each act's seed. So the state rebuilt here is the whole game, for every
 * god at once; `viewOf(object.net, index)` gives any one god's view of an object (own bits, the others' sum, payoff).
 *
 * The engine records OUTCOMES, so a replay plays them back in log order and never re-runs an agent, a sampler or a
 * scorer. The only arithmetic run here is the game's own energy accounting (game-core settleAgentEnergy, chargeAct).
 *
 * Order: events apply in (batch seq, index) order, the order the engine committed them. World time is non-decreasing
 * within a batch, but a summon or a pause committed while a tick was simulating may carry a world time a little past
 * the next batch's first events; `cursorAtWorld` therefore seeks on the running maximum of world time.
 *
 * Seeking costs at most one keyframe interval of folds: `buildReplay` keeps a full state snapshot every
 * `keyframeEvery` events (256, widened on long logs so there are at most about 256 keyframes).
 *
 * Pure: no React, no Convex; browser-safe.
 */
import { agentBattery, chargeAct, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

/** The replay API version this reducer reads (player.replay's `version`). */
export const REPLAY_VERSION = 2;
export const KEYFRAME_EVERY = 256;
const MAX_KEYFRAMES = 256;

type Wire = number | string;
type Charge = { decision: number; erasure: number; motion: number; floor: number; total: number; naming: number };
type Breakdown = { decision: number; erasure: number; motion: number; floor: number };

/** One logged event, in full, as `player.replay` serves it. `net`: every roster god's net bits after it, roster order. */
export type ReplayEvent =
  | { type: "phase"; phase: "planning" | "running" | "paused" | "recovery" | "ended"; worldSeconds: number; reason?: string }
  | { type: "object.spawned"; objectId: string; value: Wire; version: number; worldSeconds: number; net: number[] }
  // agentId/ownerId are always present in an ended game's replay; a client folding other (live, unattributed) pages may lack them.
  | { type: "object.transformed"; objectId: string; before: Wire; value: Wire; version: number; worldSeconds: number; agentId?: string; ownerId?: string;
    calls: unknown; cost: Charge; net: number[]; seed?: string }
  | { type: "agent.failed"; objectId: string; agentId: string; ownerId: string; worldSeconds: number; reason: string; cost: Charge; seed?: string }
  | { type: "agent.summoned"; agentId: string; ownerId: string; worldSeconds: number; language: string; source: string; summonCost: number; decisionBits: number;
    expectedActCost: number; perActFloorBits: number; breakdown: Breakdown; randomized: boolean; account: AgentAccount }
  | { type: "agent.destroyed"; agentId: string; ownerId: string; worldSeconds: number };

/** `from`: the index in its batch of the first event served (a batch larger than a page is split across pages). */
export type ReplayBatch = { seq: number; at: number; worldFrom: number; worldTo: number; from?: number; events: ReplayEvent[] };
export type ReplayChat = { id: string; authorId: string; authorName: string; kind: "human" | "ai"; text: string; timestamp: number; worldSeconds?: number };
export type ReplayRosterEntry = { id: string; name: string; kind: "human" | "ai" };
/** A god as dealt: its utility descriptor and kid card, its final summon spending and pause, its AI seat's library agent. */
export type ReplayGod = {
  godId: string; index: number; utility: unknown; card: unknown; spent: number; pauseUsed: boolean;
  aiAgent?: { id: string; name: string; provider: string; model: string; prompt: string; revision: number };
};
export type ReplayGame = {
  id: string; shortCode: string; phase: string; startedAt: number; planningEndsAt: number; endedAt: number | null; endReason: string | null;
  worldSeconds: number; endAtWorld: number; settings: GameSettings; setup: { id: string; name: string } | null; roster: ReplayRosterEntry[];
  objectInstance: unknown; seasonCommitment: string; stats?: unknown; logSchema?: number; currentLogSchema?: number;
};
/** One `player.replay` page. `gods` is on the first page. */
export type ReplayPage = {
  version: number; game: ReplayGame; viewer: { godId: string; index: number }; gods?: ReplayGod[];
  batches: ReplayBatch[]; chat: ReplayChat[]; nextCursor: number; eventOffset?: number; chatCursor: number; latestCursor: number; done: boolean;
};

/** One event of the flattened log, with where it came from. */
export type LogEntry = { seq: number; index: number; at: number; world: number; event: ReplayEvent };

export type ReplayObject = { id: string; value: Wire; version: number; net: number[]; spawnedAt: number; changedAt: number; lastAgentId?: string; lastOwnerId?: string };
export type ReplayAgent = {
  id: string; ownerId: string; alive: boolean; summonedAt: number; destroyedAt?: number;
  /** From the summon (absent for an agent whose summon predates schema 2). */
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
  /** Per god (roster order): summon prices paid so far. */
  spent: number[];
  /** Per god (roster order): total payoff (the leaderboard), exact after every event. */
  totals: number[];
};

export type Replay = {
  game: ReplayGame;
  viewer: ReplayPage["viewer"];
  gods: ReplayGod[];
  log: LogEntry[];
  /** The game's chat, each message placed at a world time. */
  chat: (ReplayChat & { world: number })[];
  /** Running maximum of world time per entry (monotone; for seeking by world time). */
  worldMax: Float64Array;
  keyframes: ReplayState[];
  keyframeEvery: number;
  /** God id → roster index. */
  roster: ReadonlyMap<string, number>;
  /** World time at the end of the log. */
  endWorld: number;
};

/** One god's view of an object: own net bits, the others' sum, their care and the payoff (as the engine's viewOfNet). */
export function viewOf(net: readonly number[], index: number) {
  let peer = 0;
  for (let i = 0; i < net.length; i++) if (i !== index) peer += net[i];
  const peerCare = Math.max(0, peer);
  return { netBits: net[index], peerNetBits: peer, peerCare, payoff: peerCare === 0 ? 0 : net[index] * peerCare };
}
/** God `index`'s payoff on an object: own net bits × the others' care (their summed net bits, floored at 0). */
export const payoffOf = (net: readonly number[], index: number): number => viewOf(net, index).payoff;

const emptyState = (gods: number): ReplayState => ({
  cursor: 0, phase: "planning", world: 0, at: 0, objects: new Map(), agents: new Map(), spent: new Array(gods).fill(0), totals: new Array(gods).fill(0),
});
const cloneState = (s: ReplayState): ReplayState => ({
  ...s, objects: new Map([...s.objects].map(([k, o]) => [k, { ...o }])), agents: new Map([...s.agents].map(([k, a]) => [k, { ...a }])),
  spent: [...s.spent], totals: [...s.totals],
});

/** The agent's account accrued to `world` (as the engine's lib/world settledAccount): never backwards. */
export function settleAccount(settings: GameSettings, account: AgentAccount, expectedActCost: number, world: number): AgentAccount {
  if (!(world > account.settledWorldSeconds)) return account;
  return settleAgentEnergy(account, world, settings.agentEnergyPerSecond, agentBattery(expectedActCost, settings.agentBatteryActs));
}

function setObject(state: ReplayState, o: ReplayObject) {
  const prior = state.objects.get(o.id);
  for (let i = 0; i < state.totals.length; i++) {
    state.totals[i] += payoffOf(o.net, i) - (prior ? payoffOf(prior.net, i) : 0);
  }
  state.objects.set(o.id, o);
}

/** Apply one log entry to a state (mutates it). `roster` maps god ids to indices. */
export function applyEntry(state: ReplayState, entry: LogEntry, settings: GameSettings, roster: ReadonlyMap<string, number>) {
  const ev = entry.event;
  state.cursor++;
  state.world = Math.max(state.world, entry.world);
  state.at = entry.at;
  const agentOf = (agentId: string, ownerId: string) => {
    // A log from before summons were recorded (schema 1) still shows every agent, from its acts, without its record.
    let agent = state.agents.get(agentId);
    if (!agent) state.agents.set(agentId, agent = { id: agentId, ownerId, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, spent: 0 });
    return agent;
  };
  const charge = (agent: ReplayAgent, cost: Charge, ok: boolean) => {
    agent.acts++; agent.spent += cost.total;
    if (ok) agent.transforms++; else agent.failures++;
    if (agent.account && agent.expectedActCost !== undefined) {
      agent.account = chargeAct(settleAccount(settings, agent.account, agent.expectedActCost, entry.world), cost.total);
    }
  };
  switch (ev.type) {
    case "phase": state.phase = ev.phase; break;
    case "object.spawned":
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, net: ev.net, spawnedAt: entry.world, changedAt: entry.world });
      break;
    case "object.transformed": {
      const prior = state.objects.get(ev.objectId);
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, net: ev.net, spawnedAt: prior?.spawnedAt ?? entry.world, changedAt: entry.world,
        lastAgentId: ev.agentId, lastOwnerId: ev.ownerId });
      if (ev.agentId) charge(agentOf(ev.agentId, ev.ownerId ?? ""), ev.cost, true);
      break;
    }
    case "agent.failed": charge(agentOf(ev.agentId, ev.ownerId), ev.cost, false); break;
    case "agent.summoned": {
      state.agents.set(ev.agentId, {
        id: ev.agentId, ownerId: ev.ownerId, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, spent: 0,
        language: ev.language, source: ev.source, summonCost: ev.summonCost, expectedActCost: ev.expectedActCost, decisionBits: ev.decisionBits, account: ev.account,
      });
      const i = roster.get(ev.ownerId);
      if (i !== undefined) state.spent[i] += ev.summonCost;
      break;
    }
    case "agent.destroyed": {
      const agent = state.agents.get(ev.agentId);
      if (agent) { agent.alive = false; agent.destroyedAt = entry.world; }
      break;
    }
  }
}

/** Flatten replay pages (in cursor order) into a replay with keyframes. */
export function buildReplay(pages: readonly ReplayPage[]): Replay {
  if (!pages.length) throw new Error("A replay needs at least its first page");
  const [first] = pages;
  if (first.version !== REPLAY_VERSION) throw new Error(`Replay version ${first.version} is not supported (this client reads ${REPLAY_VERSION})`);
  const settings = first.game.settings;
  const roster = new Map(first.game.roster.map((g, i) => [g.id, i]));
  const log: LogEntry[] = [];
  for (const page of pages) for (const batch of page.batches) {
    batch.events.forEach((event, index) => log.push({ seq: batch.seq, index: (batch.from ?? 0) + index, at: batch.at, world: event.worldSeconds, event }));
  }
  const worldMax = new Float64Array(log.length);
  let max = 0;
  log.forEach((e, i) => { max = Math.max(max, e.world); worldMax[i] = max; });
  const keyframeEvery = Math.max(KEYFRAME_EVERY, Math.ceil(log.length / MAX_KEYFRAMES));
  const keyframes: ReplayState[] = [emptyState(roster.size)];
  const state = emptyState(roster.size);
  log.forEach((entry, i) => {
    applyEntry(state, entry, settings, roster);
    if ((i + 1) % keyframeEvery === 0) keyframes.push(cloneState(state));
  });
  // Chat: placed by its world stamp; an unstamped message (sent before stamps existed) by wall time against the batches.
  const seen = new Set<string>();
  const chat = pages.flatMap(p => p.chat ?? []).filter(m => !seen.has(m.id) && !!seen.add(m.id))
    .map(m => ({ ...m, world: m.worldSeconds ?? worldAtWall(log, worldMax, m.timestamp) }));
  return { game: first.game, viewer: first.viewer, gods: first.gods ?? [], log, chat, worldMax, keyframes, keyframeEvery, roster,
    endWorld: Math.max(max, first.game.worldSeconds) };
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
  for (let i = k * replay.keyframeEvery; i < target; i++) applyEntry(state, replay.log[i], replay.game.settings, replay.roster);
  return state;
}

/** The cursor (events applied) at world time `world`: every event up to `world` applied. */
export function cursorAtWorld(replay: Replay, world: number): number {
  let lo = 0, hi = replay.log.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (replay.worldMax[mid] <= world) lo = mid + 1; else hi = mid; }
  return lo;
}

/** God `index`'s energy at a state: starting energy plus real-time income to its wall time (frozen at the end), less summons. */
export function godEnergyAt(replay: Replay, state: ReplayState, index: number): number {
  const s = replay.game.settings, end = replay.game.endedAt ?? Infinity;
  const at = Math.min(Math.max(state.at, replay.game.startedAt), end);
  return s.startingEnergy + (at - replay.game.startedAt) / 1000 * s.energyPerSecond - state.spent[index];
}

/**
 * Every god's exact total over the game, for score curves: a point before the first event and one after each event
 * (roster order in `totals`), downsampled to at most `maxPoints` (the last state in each bucket, and always the end)
 * only for drawing; `stateAt` stays exact at every event.
 */
export function scoreSeries(replay: Replay, maxPoints = 2000) {
  const n = replay.log.length, gods = replay.game.roster.length;
  const step = Math.max(1, Math.ceil(n / (Math.max(2, maxPoints) - 1)));
  const cursor: number[] = [], world: number[] = [], totals: number[][] = Array.from({ length: gods }, () => []);
  const push = (c: number, w: number, t: readonly number[]) => { cursor.push(c); world.push(w); t.forEach((v, i) => totals[i].push(v)); };
  const state = emptyState(gods);
  push(0, 0, state.totals);
  replay.log.forEach((entry, i) => {
    applyEntry(state, entry, replay.game.settings, replay.roster);
    if ((i + 1) % step === 0 || i === n - 1) push(i + 1, state.world, state.totals);
  });
  return { cursor, world, totals };
}

/** A moment worth jumping to; `cursor` is the events applied once it has happened. */
export type KeyMoment = {
  cursor: number; world: number;
  kind: "phase" | "summon" | "lead" | "swing";
  /** The god it is about (roster index), when one. */
  god?: number;
  /** phase: the phase; swing: the change of that god's total. */
  phase?: string; delta?: number; reason?: string;
};

/**
 * The game's key moments, in log order: every phase change, each god's first summon, every new sole leader (one who
 * retakes the lead after a tie has not changed), and
 * the `swings` largest single-event changes of any god's total.
 */
export function keyMoments(replay: Replay, swings = 8): KeyMoment[] {
  const out: KeyMoment[] = [], changes: KeyMoment[] = [];
  const state = emptyState(replay.game.roster.length);
  const summoned = new Set<string>();
  // The last SOLE leader: a tie does not reset it, so retaking the lead after a tie is not a change.
  let leader = -1;
  replay.log.forEach((entry, i) => {
    const before = [...state.totals];
    applyEntry(state, entry, replay.game.settings, replay.roster);
    const cursor = i + 1, world = state.world, ev = entry.event;
    if (ev.type === "phase") out.push({ cursor, world, kind: "phase", phase: ev.phase, ...(ev.reason ? { reason: ev.reason } : {}) });
    if (ev.type === "agent.summoned" && !summoned.has(ev.ownerId)) {
      summoned.add(ev.ownerId);
      const god = replay.roster.get(ev.ownerId);
      if (god !== undefined) out.push({ cursor, world, kind: "summon", god });
    }
    if (ev.type !== "object.spawned" && ev.type !== "object.transformed") return;
    state.totals.forEach((t, god) => { if (t !== before[god]) changes.push({ cursor, world, kind: "swing", god, delta: t - before[god] }); });
    const best = Math.max(...state.totals);
    const leaders = state.totals.flatMap((t, god) => (t === best ? [god] : []));
    if (leaders.length === 1 && leaders[0] !== leader) {
      leader = leaders[0];
      out.push({ cursor, world, kind: "lead", god: leader });
    }
  });
  const top = [...changes].sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, swings);
  return [...out, ...top].sort((a, b) => a.cursor - b.cursor || (a.god ?? -1) - (b.god ?? -1));
}
