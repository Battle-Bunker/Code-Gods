/**
 * The engine loop's transactional half (plan §3.1). A tick is one Node action (engine/tick.ts: read a
 * snapshot, simulate a window sequentially, score) followed by ONE commit mutation here, which re-validates
 * the window against the database and applies it atomically. Only the commit holding the game's current
 * lease `tick.seq` schedules `seq + 1`, so exactly one loop runs per game; a cron watchdog restarts expired
 * leases. Pause, end, recovery and idle parking bump `executionEpoch`, which discards any window in flight.
 */
import { v } from "convex/values";
import type { GameSettings } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { eventV, scoreV } from "../game/tables";
import { gameRecord } from "../lib/projection";
import { DEFAULT_SCORE_INTERVAL_SECONDS } from "@workspace/game-core";
import { AI_LOBBY_STATUS, isIdle, lastHumanActivity, membersOf } from "../lib/rooms";
import { EVENT_LOG_SCHEMA, EVENTS_PER_BATCH, LEASE_MS, MIN_TICK_MS, scoreboardDue, totalsOf } from "../lib/world";
import { agentLanguage } from "../lib/language";

type Ev = Doc<"tickBatches">["events"][number];

// ------------------------------------------------------------------------------------------------
// scheduling helpers (also used by commands and lobby mutations)
// ------------------------------------------------------------------------------------------------

/** When the loop of a game in this phase should next run (wall ms), or null when it should not run. */
export function nextDeadline(game: Pick<Doc<"games">, "phase" | "planningEndsAt" | "pauseEndsAt">, now: number): number | null {
  if (game.phase === "planning") return Math.max(now, game.planningEndsAt);
  if (game.phase === "paused") return Math.max(now, game.pauseEndsAt);
  if (game.phase === "running") return now;
  return null;
}

/** Take the lease for `seq + 1` and schedule that tick at `at` (or not at all when the phase needs none). */
export async function scheduleTick(ctx: MutationCtx, game: Doc<"games">, at: number | null, patch: Partial<Doc<"games">> = {}) {
  const seq = game.tick.seq + 1, now = Date.now();
  if (at === null) {
    await ctx.db.patch(game._id, { ...patch, tick: { seq, leaseUntil: 0 } });
    return;
  }
  const when = Math.max(now, at);
  await ctx.db.patch(game._id, { ...patch, tick: { seq, leaseUntil: when + LEASE_MS } });
  await ctx.scheduler.runAt(when, internal.engine.tick.run, { gameId: game._id, seq });
}

/**
 * Append events to the game's log as one (or more) tickBatches docs. `totals` (the leaderboard after these events)
 * goes on the last doc, so a reader that has it has every event it sums; `published` marks that doc as the live
 * scoreboard's publication. Every spawn and transform also gets its objectEvents row (docs/public-log-design.md §2).
 */
export async function appendEvents(ctx: MutationCtx, game: Doc<"games">, events: Ev[], worldFrom: number, worldTo: number,
  perf?: Doc<"tickBatches">["perf"], totals?: number[], published = false): Promise<number> {
  let next = game.nextBatch;
  const docs = Math.max(1, Math.ceil(events.length / EVENTS_PER_BATCH));
  if (!events.length && !perf && !totals) return next;
  for (let k = 0; k < docs; k++) {
    const seq = next++, slice = events.slice(k * EVENTS_PER_BATCH, (k + 1) * EVENTS_PER_BATCH);
    await ctx.db.insert("tickBatches", {
      gameId: game._id, seq, at: Date.now(), worldFrom, worldTo, schema: EVENT_LOG_SCHEMA, events: slice,
      ...(k === 0 && perf ? { perf } : {}), ...(k === docs - 1 && totals ? { totals } : {}), ...(k === docs - 1 && published ? { published: true as const } : {}),
    });
    await insertObjectEvents(ctx, game._id, seq, slice);
  }
  return next;
}

/** One objectEvents row per spawn and transform (the indexed per-object history, docs/public-log-design.md §2). */
export async function insertObjectEvents(ctx: MutationCtx, gameId: Id<"games">, seq: number, events: readonly Ev[]) {
  for (const e of events) {
    if (e.t === "spawn") {
      await ctx.db.insert("objectEvents", { gameId, objectId: e.objectId as Id<"objects">, seq, world: e.world, kind: "spawn", value: e.value, version: e.version, net: e.net });
    } else if (e.t === "transform") {
      await ctx.db.insert("objectEvents", {
        gameId, objectId: e.objectId as Id<"objects">, seq, world: e.world, kind: "transform", before: e.before, value: e.value, version: e.version,
        calls: e.calls, agentId: e.agentId, ownerId: e.ownerId, net: e.net,
      });
    }
  }
}

async function allObjects(ctx: MutationCtx, gameId: Id<"games">) {
  return ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
}

/** The game's scoreboard interval (world seconds); a game stored before the setting existed uses the default. */
export const scoreIntervalOf = (game: Pick<Doc<"games">, "settings">) =>
  (game.settings as Partial<GameSettings>).scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS;

/**
 * End a game: stamp it, publish its final scoreboard (exact, whatever the interval), write its public summary and free
 * the room. Bumps the epoch.
 */
export async function endGame(ctx: MutationCtx, game: Doc<"games">, reason: "lifetime" | "owner", patch: Partial<Doc<"games">> = {}) {
  const now = Date.now();
  const objects = await allObjects(ctx, game._id);
  const scoreboard = { totals: totalsOf(game.roster.map(m => m.id), objects), world: patch.worldSeconds ?? game.worldSeconds, at: now };
  const ended = { ...game, ...patch, phase: "ended" as const, endedAt: now, endReason: reason, executionEpoch: game.executionEpoch + 1, autoResume: undefined, scoreboard };
  const summary = gameRecord(ended, objects);
  const nextBatch = await appendEvents(ctx, ended, [{ t: "phase", phase: "ended", world: ended.worldSeconds, reason }], ended.worldSeconds, ended.worldSeconds,
    undefined, scoreboard.totals, true);
  await ctx.db.patch(game._id, {
    ...patch, phase: "ended", endedAt: now, endReason: reason, executionEpoch: ended.executionEpoch, autoResume: undefined,
    summary, nextBatch, scoreboard, tick: { seq: game.tick.seq + 1, leaseUntil: 0 },
  });
  const room = await ctx.db.get(game.roomId);
  if (room && room.activeGameId === game._id) {
    await ctx.db.patch(room._id, { activeGameId: undefined, seq: room.seq + 1 });
    // AI seats are back in the lobby: a failure (or "Sent a command") from the game's last turn no longer applies.
    for (const m of await membersOf(ctx, room._id)) if (m.kind === "ai") await ctx.db.patch(m._id, { status: AI_LOBBY_STATUS, aiFailures: 0 });
  }
}

/** Freeze a game in recovery (world time stops). `autoResume` games resume when a human returns. */
export async function parkGame(ctx: MutationCtx, game: Doc<"games">, reason: string, autoResume: boolean) {
  const nextBatch = await appendEvents(ctx, game, [{ t: "phase", phase: "recovery", world: game.worldSeconds, reason }], game.worldSeconds, game.worldSeconds);
  await ctx.db.patch(game._id, {
    phase: "recovery", recoveryReason: reason, autoResume: autoResume || undefined, executionEpoch: game.executionEpoch + 1,
    nextBatch, tick: { seq: game.tick.seq + 1, leaseUntil: 0 },
  });
}

/** Resume a recovered game. World time stays frozen across recovery, so downtime is never simulated. */
export async function resumeGame(ctx: MutationCtx, game: Doc<"games">) {
  const now = Date.now();
  const phase = game.worldSeconds === 0 && game.planningEndsAt > now ? "planning" as const : "running" as const;
  const resumed = { ...game, phase };
  const nextBatch = await appendEvents(ctx, game, [{ t: "phase", phase, world: game.worldSeconds, reason: "resumed" }], game.worldSeconds, game.worldSeconds);
  await scheduleTick(ctx, resumed, nextDeadline(resumed, now), {
    phase, lastTick: now, recoveryReason: undefined, autoResume: undefined, executionEpoch: game.executionEpoch + 1, nextBatch,
  });
  await ctx.scheduler.runAfter(0, internal.ai.seats.startAll, { gameId: game._id });
}

// ------------------------------------------------------------------------------------------------
// the tick's snapshot
// ------------------------------------------------------------------------------------------------

/** One consistent snapshot for the tick action, or null when this lease is stale. */
export const snapshot = internalQuery({
  args: { gameId: v.id("games"), seq: v.number() },
  handler: async (ctx, { gameId, seq }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.tick.seq !== seq) return null;
    const [objects, agents, deities] = await Promise.all([
      ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100),
      ctx.db.query("agents").withIndex("by_game", q => q.eq("gameId", gameId)).take(2000),
      ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).take(16),
    ]);
    return {
      game, lastActivity: await lastHumanActivity(ctx),
      objects: objects.map(o => ({ id: o._id as string, value: o.value, version: o.version, scores: o.scores, salience: o.salience })),
      agents: agents.map(a => ({
        id: a._id as string, ownerId: a.ownerId, source: a.source, language: agentLanguage(a, game.settings as GameSettings), decisionBits: a.decisionBits, perActFloorBits: a.perActFloorBits,
        expectedActCost: a.expectedActCost, account: a.account, acts: a.acts, spent: a.spent,
      })),
      deities: deities.sort((a, b) => a.index - b.index).map(d => ({ godId: d.godId, utility: d.utility })),
    };
  },
});

// ------------------------------------------------------------------------------------------------
// the commit
// ------------------------------------------------------------------------------------------------

const wire = v.union(v.number(), v.string());
const clockV = v.object({
  phase: v.union(v.literal("planning"), v.literal("running"), v.literal("paused"), v.literal("recovery"), v.literal("ended")),
  worldSeconds: v.number(), lastTick: v.number(), nextSpawn: v.number(), recoveryReason: v.optional(v.string()),
});

/**
 * Apply one simulated window. Re-validates the game id, lease, phase, epoch and clock, every object's
 * `fromVersion`, every agent's act count and object uniqueness through `by_game_value`. A destroyed agent's
 * failed acts are dropped; a window in which a destroyed agent changed an object is discarded whole.
 * Discarding is safe: nothing of the window was visible yet. Returns what happened.
 */
export const commit = internalMutation({
  args: {
    gameId: v.id("games"), seq: v.number(), epoch: v.number(), phaseBefore: v.string(), lastTickBefore: v.number(),
    kind: v.union(v.literal("window"), v.literal("wait"), v.literal("park")),
    clock: v.optional(clockV),
    objects: v.array(v.object({ id: v.id("objects"), fromVersion: v.number(), value: wire, version: v.number(), scores: v.array(scoreV), salience: v.number() })),
    spawns: v.array(v.object({ tmp: v.string(), value: wire, scores: v.array(scoreV), salience: v.number() })),
    agents: v.array(v.object({ id: v.id("agents"), fromActs: v.number(), acts: v.number(), spent: v.number(), account: v.object({ balance: v.number(), settledWorldSeconds: v.number() }) })),
    events: v.array(eventV),
    stats: v.object({ opportunities: v.number(), acts: v.number(), simulateMs: v.number(), prevCommitMs: v.optional(v.number()) }),
    /** The leaderboard after the window (every roster god's total payoff, roster order); published when due. */
    totals: v.optional(v.array(v.number())),
    wakeAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.tick.seq !== args.seq) return { result: "stale" as const };
    const now = Date.now();
    const unchanged = game.executionEpoch === args.epoch && game.phase === args.phaseBefore && game.lastTick === args.lastTickBefore;
    const discard = async (why: string) => {
      console.log(`tick ${game._id}#${args.seq} discarded: ${why}`);
      await scheduleTick(ctx, game, nextDeadline(game, now), { stats: { ...game.stats, discarded: game.stats.discarded + 1 } });
      return { result: "discarded" as const, why };
    };
    if (!unchanged) return discard("game changed (pause, end, recovery or resume)");

    if (args.kind === "park") {
      if (!isIdle(await lastHumanActivity(ctx), now)) return discard("a human returned");
      await parkGame(ctx, game, "The engine went idle after 30 minutes without human activity. The game resumes when a player returns.", true);
      return { result: "parked" as const };
    }
    if (args.kind === "wait") {
      await scheduleTick(ctx, game, nextDeadline(game, now));
      return { result: "waited" as const };
    }

    // Validate the window against the database.
    const objectDocs = new Map<string, Doc<"objects">>();
    for (const change of args.objects) {
      const doc = await ctx.db.get(change.id);
      if (!doc || doc.gameId !== game._id || doc.version !== change.fromVersion) return discard(`object ${change.id} moved on`);
      objectDocs.set(change.id, doc);
    }
    const live = new Set<string>();
    for (const state of args.agents) {
      const doc = await ctx.db.get(state.id);
      if (!doc) continue; // destroyed during the window
      if (doc.acts !== state.fromActs) return discard(`agent ${state.id} moved on`);
      live.add(state.id);
    }
    const events = args.events.filter(e => e.t !== "fail" || live.has(e.agentId));
    if (events.some(e => e.t === "transform" && !live.has(e.agentId))) return discard("a destroyed agent changed an object");
    const finalValue = new Map(args.objects.map(c => [c.id as string, c.value]));
    const check = async (value: number | string, self?: string) => {
      const found = await ctx.db.query("objects").withIndex("by_game_value", q => q.eq("gameId", game._id).eq("value", value)).take(4);
      return found.every(doc => doc._id === self || (finalValue.has(doc._id) && finalValue.get(doc._id) !== value));
    };
    for (const change of args.objects) if (!await check(change.value, change.id)) return discard("uniqueness");
    for (const spawn of args.spawns) if (!await check(spawn.value)) return discard("spawn uniqueness");
    if (new Set([...args.objects.map(c => c.value), ...args.spawns.map(s => s.value)]).size !== args.objects.length + args.spawns.length) return discard("duplicate in window");
    if (game.objectCount + args.spawns.length > 2000) return discard("object limit");

    // Apply.
    for (const change of args.objects) {
      await ctx.db.patch(change.id, { value: change.value, version: change.version, scores: change.scores, salience: change.salience });
    }
    const ids = new Map<string, string>();
    for (const spawn of args.spawns) {
      ids.set(spawn.tmp, await ctx.db.insert("objects", { gameId: game._id, value: spawn.value, version: 0, scores: spawn.scores, salience: spawn.salience }));
    }
    for (const state of args.agents) {
      if (live.has(state.id)) await ctx.db.patch(state.id, { acts: state.acts, spent: state.spent, account: state.account });
    }
    const resolved = events.map(e => (e.t === "spawn" && ids.has(e.objectId) ? { ...e, objectId: ids.get(e.objectId)! } : e));
    const clock = args.clock!;
    const acts = events.filter(e => e.t === "transform" || e.t === "fail").length;
    const perf = { acts, window: clock.worldSeconds - game.worldSeconds, simulateMs: args.stats.simulateMs, ...(args.stats.prevCommitMs !== undefined ? { commitMs: args.stats.prevCommitMs } : {}) };
    // The scoreboard is published for everyone at once when the window reaches the next multiple of the interval
    // (docs/public-log-design.md §3); the end publishes its own (endGame). A game without one (started before
    // scoreboards) keeps its live leaderboard.
    const publish = !!game.scoreboard && !!args.totals && clock.phase !== "ended" &&
      scoreboardDue(game.scoreboard.world, clock.worldSeconds, scoreIntervalOf(game));
    const scoreboard = publish ? { totals: args.totals!, world: clock.worldSeconds, at: now } : undefined;
    // The stored totals stay exact on every scoring batch (the replay of an ended game steps per event); the live
    // projection shows them only on the batch marked `published`.
    const scored = resolved.some(e => e.t === "spawn" || e.t === "transform");
    const nextBatch = await appendEvents(ctx, game, resolved, game.worldSeconds, clock.worldSeconds, acts > 0 ? perf : undefined,
      scored || publish ? args.totals : undefined, publish);
    const patch: Partial<Doc<"games">> = {
      ...(scoreboard ? { scoreboard } : {}),
      worldSeconds: clock.worldSeconds, lastTick: clock.lastTick, nextSpawn: clock.nextSpawn, nextBatch,
      objectCount: game.objectCount + args.spawns.length,
      stats: { acts: game.stats.acts + acts, commits: game.stats.commits + 1, discarded: game.stats.discarded, opportunities: game.stats.opportunities + args.stats.opportunities },
    };
    const updated = { ...game, ...patch, phase: clock.phase };
    if (clock.phase === "ended") {
      await endGame(ctx, updated, "lifetime", patch);
      return { result: "ended" as const, acts };
    }
    if (clock.phase === "recovery") {
      await ctx.db.patch(game._id, { ...patch, phase: "recovery", recoveryReason: clock.recoveryReason, executionEpoch: game.executionEpoch + 1, tick: { seq: game.tick.seq + 1, leaseUntil: 0 } });
      return { result: "recovery" as const, acts };
    }
    const at = clock.phase === "running" ? Math.max(now, args.wakeAt ?? now + MIN_TICK_MS) : nextDeadline(updated, now);
    await scheduleTick(ctx, updated, at, { ...patch, phase: clock.phase });
    return { result: "committed" as const, acts };
  },
});

// ------------------------------------------------------------------------------------------------
// the watchdog (cron) and idle parking
// ------------------------------------------------------------------------------------------------

/**
 * Restart any live game whose lease expired (a crashed or lost tick action), and park live games when the
 * engine is idle. A restarted running game does not simulate the downtime: its wall clock restarts now.
 */
export const watchdog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now(), idle = isIdle(await lastHumanActivity(ctx), now);
    let restarted = 0, parked = 0;
    for (const phase of ["planning", "running", "paused"] as const) {
      const games = await ctx.db.query("games").withIndex("by_phase", q => q.eq("phase", phase)).take(200);
      for (const game of games) {
        if (idle) {
          await parkGame(ctx, game, "The engine went idle after 30 minutes without human activity. The game resumes when a player returns.", true);
          parked++;
        } else if (game.tick.leaseUntil < now) {
          await scheduleTick(ctx, game, nextDeadline(game, now), phase === "running" ? { lastTick: now } : {});
          restarted++;
        }
      }
    }
    if (restarted || parked) console.log(`watchdog: restarted ${restarted}, parked ${parked}`);
    return { restarted, parked };
  },
});

/** Settings of a game, typed. */
export const settingsOf = (game: Doc<"games">) => game.settings as GameSettings;
