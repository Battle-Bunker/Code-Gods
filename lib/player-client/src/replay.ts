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
import { CHANGE_READ_RATIO, MAX_AGENT_OPPORTUNITY_HZ, agentIncome, allowedLanguages, chargeAct, deityIncome, instantiationOf, roundShare, settleAgentEnergy, type AgentAccount, type GameSettings } from "@workspace/game-core";

/** The replay API version this reducer reads (player.replay's `version`). */
export const REPLAY_VERSION = 2;
export const KEYFRAME_EVERY = 256;
const MAX_KEYFRAMES = 256;

type Wire = number | string;
/** One act's charge in energy bits (docs/energy-model.md §2): what its reads cost plus its change when that committed. Recorded, never recomputed. */
type Charge = { read: number; change: number; total: number };
/** An agent's estimated cost per act, split. */
type Breakdown = { read: number; change: number };

/** One logged event, in full, as `player.replay` serves it. `net`: every roster god's net bits after it, roster order. */
export type ReplayEvent =
  | { type: "phase"; phase: "planning" | "running" | "paused" | "recovery" | "ended"; worldSeconds: number; reason?: string }
  | { type: "object.spawned"; objectId: string; value: Wire; version: number; worldSeconds: number; net: number[] }
  /** Hold rarity applied during planning (log schema 7, docs/energy-model.md §8): the same version, re-scored. */
  | { type: "object.rescored"; objectId: string; value: Wire; version: number; worldSeconds: number; net: number[] }
  // agentId/ownerId are always present in an ended game's replay; a client folding other (live, unattributed) pages may lack them.
  | { type: "object.transformed"; objectId: string; before: Wire; value: Wire; version: number; worldSeconds: number; agentId?: string; ownerId?: string;
    calls: unknown; cost: Charge; net: number[]; seed?: string }
  | { type: "agent.failed"; objectId: string; agentId: string; ownerId: string; worldSeconds: number; reason: string; cost: Charge; seed?: string }
  /** An act that returned no calls: it paid its reads; not a failure. */
  | { type: "agent.skipped"; objectId: string; agentId: string; ownerId: string; worldSeconds: number; cost: Charge; seed?: string }
  | { type: "agent.summoned"; agentId: string; ownerId: string; worldSeconds: number; language: string; source: string; name?: string; description?: string; summonCost: number;
    expectedActCost: number; breakdown: Breakdown; randomized: boolean; account: AgentAccount;
    /** The share of its owner's power the agent was given (log schema 6); absent in older logs, which replay as share 0. */
    powerShare?: number }
  /** The owner re-allocated power: the agent's share from then on (log schema 6). */
  | { type: "agent.power"; agentId: string; ownerId: string; worldSeconds: number; share: number }
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
  name?: string; description?: string; language?: string; source?: string; summonCost?: number; expectedActCost?: number; breakdown?: Breakdown; randomized?: boolean;
  acts: number; transforms: number; failures: number; skips: number; spent: number; account?: AgentAccount;
  /** Its share of its owner's power now (0 for an agent logged before the power budget). */
  share: number;
};
/** A god's own energy account on world time (docs/energy-model.md §6): `allocated` is the sum of its agents' shares. */
export type ReplayDeity = { balance: number; world: number; allocated: number };
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
  /** Per god (roster order): its own energy account: startingEnergy, plus (1 − allocated)·P per world second, less summon prices. */
  deities: ReplayDeity[];
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

const emptyState = (gods: number, startingEnergy: number): ReplayState => ({
  cursor: 0, phase: "planning", world: 0, at: 0, objects: new Map(), agents: new Map(), spent: new Array(gods).fill(0), totals: new Array(gods).fill(0),
  deities: Array.from({ length: gods }, () => ({ balance: startingEnergy, world: 0, allocated: 0 })),
});
const cloneState = (s: ReplayState): ReplayState => ({
  ...s, objects: new Map([...s.objects].map(([k, o]) => [k, { ...o }])), agents: new Map([...s.agents].map(([k, a]) => [k, { ...a }])),
  spent: [...s.spent], totals: [...s.totals], deities: s.deities.map(d => ({ ...d })),
});

/** The power a game gives each god, bits per world second (0 for settings that carry none). */
const powerOf = (settings: GameSettings): number => settings.powerPerSecond ?? 0;

/**
 * The agent's account accrued to `world` at its share of the power (as the engine's lib/world settledAccount): never
 * backwards, no cap. A game logged before the energy model (schema ≤ 4) capped income at a battery; its replay shows the
 * uncapped balance.
 */
export function settleAccount(settings: GameSettings, account: AgentAccount, world: number, share: number): AgentAccount {
  if (!(world > account.settledWorldSeconds)) return account;
  return settleAgentEnergy(account, world, agentIncome(powerOf(settings), share));
}

/** A god's own account accrued to `world` at its unallocated power. */
function settleDeity(settings: GameSettings, d: ReplayDeity, world: number): ReplayDeity {
  if (!(world > d.world)) return d;
  return { ...d, balance: d.balance + (world - d.world) * deityIncome(powerOf(settings), d.allocated), world };
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
    if (!agent) state.agents.set(agentId, agent = { id: agentId, ownerId, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, skips: 0, spent: 0, share: 0 });
    return agent;
  };
  const charge = (agent: ReplayAgent, cost: Charge, outcome: "transform" | "failure" | "skip") => {
    agent.acts++; agent.spent += cost.total;
    if (outcome === "transform") agent.transforms++; else if (outcome === "skip") agent.skips++; else agent.failures++;
    if (agent.account) agent.account = chargeAct(settleAccount(settings, agent.account, entry.world, agent.share), cost.total);
  };
  switch (ev.type) {
    case "phase": state.phase = ev.phase; break;
    case "object.spawned":
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, net: ev.net, spawnedAt: entry.world, changedAt: entry.world });
      break;
    case "object.rescored": {
      const prior = state.objects.get(ev.objectId);
      if (prior) setObject(state, { ...prior, net: ev.net });
      break;
    }
    case "object.transformed": {
      const prior = state.objects.get(ev.objectId);
      setObject(state, { id: ev.objectId, value: ev.value, version: ev.version, net: ev.net, spawnedAt: prior?.spawnedAt ?? entry.world, changedAt: entry.world,
        lastAgentId: ev.agentId, lastOwnerId: ev.ownerId });
      if (ev.agentId) charge(agentOf(ev.agentId, ev.ownerId ?? ""), ev.cost, "transform");
      break;
    }
    case "agent.failed": charge(agentOf(ev.agentId, ev.ownerId), ev.cost, "failure"); break;
    case "agent.skipped": charge(agentOf(ev.agentId, ev.ownerId), ev.cost, "skip"); break;
    case "agent.summoned": {
      state.agents.set(ev.agentId, {
        id: ev.agentId, ownerId: ev.ownerId, alive: true, summonedAt: entry.world, acts: 0, transforms: 0, failures: 0, skips: 0, spent: 0,
        name: ev.name, description: ev.description, language: ev.language, source: ev.source, summonCost: ev.summonCost, expectedActCost: ev.expectedActCost, account: ev.account,
        breakdown: ev.breakdown, randomized: ev.randomized, share: ev.powerShare ?? 0,
      });
      const i = roster.get(ev.ownerId);
      if (i !== undefined) {
        state.spent[i] += ev.summonCost;
        const d = settleDeity(settings, state.deities[i], entry.world);
        state.deities[i] = { balance: d.balance - ev.summonCost, world: d.world, allocated: roundShare(d.allocated + (ev.powerShare ?? 0)) };
      }
      break;
    }
    case "agent.power": {
      const agent = state.agents.get(ev.agentId), i = roster.get(ev.ownerId);
      if (!agent || !agent.alive) break;
      // Both accounts are settled at the old rates, then the share changes.
      if (agent.account) agent.account = settleAccount(settings, agent.account, entry.world, agent.share);
      if (i !== undefined) {
        const d = settleDeity(settings, state.deities[i], entry.world);
        state.deities[i] = { ...d, allocated: Math.max(0, roundShare(d.allocated - agent.share + ev.share)) };
      }
      agent.share = ev.share;
      break;
    }
    case "agent.destroyed": {
      const agent = state.agents.get(ev.agentId);
      if (agent) {
        agent.alive = false; agent.destroyedAt = entry.world;
        // Its share returns to its owner, whose income changes from now.
        const i = roster.get(agent.ownerId);
        if (i !== undefined && agent.share > 0) {
          const d = settleDeity(settings, state.deities[i], entry.world);
          state.deities[i] = { ...d, allocated: Math.max(0, roundShare(d.allocated - agent.share)) };
        }
        agent.share = 0;
      }
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
  const keyframes: ReplayState[] = [emptyState(roster.size, settings.startingEnergy)];
  const state = emptyState(roster.size, settings.startingEnergy);
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

/**
 * God `index`'s own energy at a state: startingEnergy plus its unallocated power, (1 − Σ shares)·P per world second
 * (a destroyed agent's share comes back to it), less the summon prices.
 */
export function godEnergyAt(replay: Replay, state: ReplayState, index: number): number {
  return settleDeity(replay.game.settings, state.deities[index], state.world).balance;
}
/** God `index`'s share of power given to its agents at a state (Σ of their shares), and its own income from the rest. */
export function godPowerAt(replay: Replay, state: ReplayState, index: number): { allocated: number; income: number } {
  const allocated = state.deities[index].allocated;
  return { allocated, income: deityIncome(powerOf(replay.game.settings), allocated) };
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
  const state = emptyState(gods, replay.game.settings.startingEnergy);
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
  const state = emptyState(replay.game.roster.length, replay.game.settings.startingEnergy);
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
    if (ev.type !== "object.spawned" && ev.type !== "object.transformed" && ev.type !== "object.rescored") return;
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

// ------------------------------------------------------------------------------------------------
// the SDK's answers at a playhead (docs/replay-design.md §4): what the player client's panels read, for any god
// ------------------------------------------------------------------------------------------------

/** Where the answers are asked from: the room (for ids the shapes carry), the playhead and the point-of-view god. */
export type ReplayAt = { room: { roomId: string; roomShortCode?: string }; cursor: number; pov: number };

/**
 * The protocol v3 observation (player.observation's shape) of god `pov` at the playhead. As live, but for any god:
 * its card, its own and the others' bits per object, its agents with their code and energy settled to the playhead,
 * its own transformations so far, the leaderboard ranked, chat up to the playhead. The log records net bits only, so
 * `own.ordinal` and `own.rewardBits` carry the net bits too. The phase is the phase at the playhead.
 */
export function replayObservation(replay: Replay, at: ReplayAt, state: ReplayState = stateAt(replay, at.cursor)) {
  const { game } = replay, settings = game.settings, god = game.roster[at.pov], dealt = replay.gods.find(g => g.index === at.pov);
  const languages = allowedLanguages(settings) as string[];
  const view = (net: readonly number[]) => viewOf(net, at.pov);
  // The point of view's last 500 transformations, read back from the playhead.
  const transformations: { id: string; agentId: string; before: Wire; after: Wire; calls?: unknown; cost?: number }[] = [];
  for (let i = Math.min(at.cursor, replay.log.length) - 1; i >= 0 && transformations.length < 500; i--) {
    const { seq, index, event: ev } = replay.log[i];
    if (ev.type === "object.transformed" && ev.ownerId === god?.id && ev.agentId) {
      transformations.push({ id: `${seq}:${index}`, agentId: ev.agentId, before: ev.before, after: ev.value, ...(Array.isArray(ev.calls) ? { calls: ev.calls.slice(0, 16) } : {}), cost: ev.cost.total });
    }
  }
  transformations.reverse();
  const ranked = game.roster.map((g, i) => ({ godId: g.id, label: g.name, isAI: g.kind === "ai", totalPayoff: state.totals[i] }))
    .sort((a, b) => b.totalPayoff - a.totalPayoff || a.godId.localeCompare(b.godId));
  return {
    version: "code-gods.player.v3" as const, roomId: at.room.roomId, revision: at.cursor, roomShortCode: at.room.roomShortCode, gameShortCode: game.shortCode,
    seated: true, gameId: game.id, planningEndsAt: game.planningEndsAt, pauseEndsAt: 0,
    phase: (state.phase === "recovery" ? "paused" : state.phase) as "planning" | "running" | "paused" | "ended",
    language: languages[0], languages, instance: game.objectInstance,
    economy: {
      powerPerSecond: powerOf(settings), startingEnergy: settings.startingEnergy, maxAgentOpportunityHz: MAX_AGENT_OPPORTUNITY_HZ,
      // The read price the log was charged at: event-log schema 8 introduced κ (docs/energy-model.md §2.1); before it, 1.
      changeReadRatio: (game.logSchema ?? 1) >= 8 ? CHANGE_READ_RATIO : 1,
      maxAgentsPerGod: settings.maxAgentsPerGod, penaltyWeight: settings.penaltyWeight, worldSeconds: state.world,
      commitClause: settings.commitClause, objectSelection: settings.objectSelection,
    },
    self: {
      godId: god?.id ?? "", label: god?.name ?? "", isAI: god?.kind === "ai", energy: godEnergyAt(replay, state, at.pov), ...godPowerAt(replay, state, at.pov), ready: false,
      pauseUsed: dealt?.pauseUsed ?? false, ...(dealt?.card ? { utility: dealt.card } : {}),
    },
    objects: [...state.objects.values()].map(o => {
      const v = view(o.net);
      // The public figures at the playhead: the version is the transformation count, changedAt a transformation's time once there is one.
      return { id: o.id, value: o.value, own: { ordinal: v.netBits, rewardBits: v.netBits, netBits: v.netBits }, peerNetBits: v.peerNetBits, peerCare: v.peerCare, payoff: v.payoff,
        mutations: o.version, createdAt: o.spawnedAt, lastMutatedAt: o.version > 0 ? o.changedAt : null };
    }),
    agents: [...state.agents.values()].filter(a => a.alive && a.ownerId === god?.id).map(a => {
      const account = a.account ? settleAccount(settings, a.account, state.world, a.share) : undefined;
      return {
        id: a.id, ...(a.name ? { name: a.name } : {}), ...(a.description ? { description: a.description } : {}),
        source: a.source ?? "", language: a.language ?? languages[0], summonCost: a.summonCost ?? 0,
        expectedActCost: a.expectedActCost ?? 0, breakdown: a.breakdown ?? { read: 0, change: 0 }, randomized: a.randomized ?? false,
        energy: account?.balance ?? 0, eligible: (account?.balance ?? 0) > 0, acts: a.acts, spent: a.spent, skips: a.skips, powerShare: a.share, income: agentIncome(powerOf(settings), a.share),
      };
    }),
    transformations,
    leaderboard: ranked,
    chat: replay.chat.filter(m => m.world <= state.world).slice(-100).map(m => ({ id: m.id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text })),
  };
}

/** One logged event as player.events projects it, for god `pov`, transparently (calls and costs for every act). */
function projected(ev: ReplayEvent, seq: number, pov: number, roster: Replay["game"]["roster"]) {
  const mine = "ownerId" in ev && ev.ownerId === roster[pov]?.id;
  const scored = (net: readonly number[]) => { const v = viewOf(net, pov); return { own: { netBits: v.netBits }, peerNetBits: v.peerNetBits, peerCare: v.peerCare, payoff: v.payoff }; };
  switch (ev.type) {
    case "phase": return { type: "phase" as const, seq, phase: ev.phase, worldSeconds: ev.worldSeconds, ...(ev.reason ? { reason: ev.reason } : {}) };
    case "object.spawned": return { type: "object.spawned" as const, seq, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.worldSeconds, ...scored(ev.net) };
    case "object.rescored": return { type: "object.rescored" as const, seq, objectId: ev.objectId, value: ev.value, version: ev.version, worldSeconds: ev.worldSeconds, ...scored(ev.net) };
    case "object.transformed": return {
      type: "object.transformed" as const, seq, objectId: ev.objectId, value: ev.value, before: ev.before, version: ev.version, worldSeconds: ev.worldSeconds,
      agentId: ev.agentId ?? "", mine, calls: ev.calls, cost: ev.cost, ...scored(ev.net),
    };
    case "agent.failed": return { type: "agent.failed" as const, seq, objectId: ev.objectId, agentId: ev.agentId, worldSeconds: ev.worldSeconds, reason: ev.reason, cost: ev.cost };
    case "agent.skipped": return { type: "agent.skipped" as const, seq, objectId: ev.objectId, agentId: ev.agentId, worldSeconds: ev.worldSeconds, cost: ev.cost };
    case "agent.summoned": return {
      type: "agent.summoned" as const, seq, agentId: ev.agentId, mine, worldSeconds: ev.worldSeconds, language: ev.language, source: ev.source, summonCost: ev.summonCost,
      expectedActCost: ev.expectedActCost, breakdown: ev.breakdown, randomized: ev.randomized, account: ev.account,
      ...(ev.powerShare !== undefined ? { powerShare: ev.powerShare } : {}),
    };
    case "agent.power": return mine ? { type: "agent.power" as const, seq, agentId: ev.agentId, worldSeconds: ev.worldSeconds, share: ev.share } : null;
    case "agent.destroyed": return { type: "agent.destroyed" as const, seq, agentId: ev.agentId, mine, worldSeconds: ev.worldSeconds };
  }
}

/** player.events' shape at the playhead: the events of the last `limit` batches (at most 50, as live) up to it, for god `pov`. */
export function replayEvents(replay: Replay, at: ReplayAt, limit = 20) {
  const upto = Math.min(at.cursor, replay.log.length);
  const lastSeq = upto ? replay.log[upto - 1].seq : -1;
  const batches = Math.max(1, Math.min(50, Math.floor(limit)));
  // Read back from the playhead until `batches` distinct batches are in.
  let i = upto, seen = 0, seq = Number.NaN;
  while (i > 0) {
    const s = replay.log[i - 1].seq;
    if (s !== seq) { if (seen === batches) break; seen++; seq = s; }
    i--;
  }
  const events = replay.log.slice(i, upto).map(e => projected(e.event, e.seq, at.pov, replay.game.roster)).filter(e => e !== null);
  return { gameId: replay.game.id, events, nextCursor: lastSeq, latestCursor: lastSeq, gap: false };
}

/**
 * player.trajectories' shape at the playhead: every object's series of god `pov`'s bits, the others' and the payoff,
 * from batches after `afterSeq` (up to `upTo`: a closed window, which, as live, reports its own last batch as
 * `latestCursor`). `epoch` names the point of view.
 */
export function replayTrajectories(replay: Replay, at: ReplayAt, afterSeq = -1, upTo?: number) {
  const upto = Math.min(at.cursor, replay.log.length);
  const series = new Map<string, { seq: number; worldSeconds: number; value: Wire; ownNetBits: number; peerNetBits: number; payoff: number }[]>();
  // The log is in seq order: start at its first entry after `afterSeq` (a window reads only its own range).
  let i = 0;
  for (let hi = upto; i < hi;) { const mid = (i + hi) >> 1; if (replay.log[mid].seq <= afterSeq) i = mid + 1; else hi = mid; }
  let end = afterSeq;
  for (; i < upto; i++) {
    const { seq, event: ev } = replay.log[i];
    if (upTo !== undefined && seq > upTo) break;
    end = seq;
    if (ev.type !== "object.spawned" && ev.type !== "object.transformed" && ev.type !== "object.rescored") continue;
    const v = viewOf(ev.net, at.pov);
    let points = series.get(ev.objectId);
    if (!points) series.set(ev.objectId, points = []);
    points.push({ seq, worldSeconds: ev.worldSeconds, value: ev.value, ownNetBits: v.netBits, peerNetBits: v.peerNetBits, payoff: v.payoff });
  }
  const objects = [...series].map(([objectId, points]) => ({ objectId, points }));
  // A closed window reports its own last batch at the playhead (none: it ends where it starts).
  if (upTo !== undefined) return { gameId: replay.game.id, objects, nextCursor: end, latestCursor: end, epoch: `pov:${at.pov}` };
  const lastSeq = upto ? replay.log[upto - 1].seq : -1;
  return { gameId: replay.game.id, objects, nextCursor: lastSeq, latestCursor: lastSeq, epoch: `pov:${at.pov}` };
}

/** player.myUtility's shape for god `pov`: its dealt descriptor and what the client's evaluator needs. */
export function replayMyUtility(replay: Replay, pov: number) {
  const dealt = replay.gods.find(g => g.index === pov), settings = replay.game.settings;
  if (!dealt) return null;
  const utility = dealt.utility as { familyId: string; params: unknown; penalty?: { familyId: string; params: unknown } };
  return {
    gameId: replay.game.id, godId: dealt.godId,
    utility: { familyId: utility.familyId, params: utility.params, ...(utility.penalty ? { penalty: { familyId: utility.penalty.familyId, params: utility.penalty.params } } : {}) },
    instantiationKey: instantiationOf(settings).key, objectType: settings.objectType, typeArgs: settings.typeArgs, priorId: settings.priorId,
    penaltyWeight: settings.penaltyWeight, language: allowedLanguages(settings)[0], settings,
  };
}
