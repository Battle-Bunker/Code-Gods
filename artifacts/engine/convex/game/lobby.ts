/**
 * Internal halves of the owner's Node actions (owner.ts): read a consistent context with the owner check,
 * then commit with optimistic re-checks (room revision, members, no active game). The caller's identity
 * propagates from the action, so the owner check runs again inside each commit.
 */
import { v } from "convex/values";
import { sameSettings, validateSettings, type GameSettings } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { failureMessage, forgetWaits, preparationFailed } from "../calibration/cache";
import { touchActivity } from "../activity";
import { endTurnsForNewGame } from "../assistant/store";
import { insertObjectEvents, nextDeadline } from "../engine/loop";
import { fail } from "../lib/errors";
import { putCatalog } from "../lib/rooms";
import { membersOf, principalV, requireOwnerAs, requireRoom, shortCodeFor, viewerOf } from "../lib/rooms";
import { EVENT_LOG_SCHEMA, LEASE_MS, totalsOf } from "../lib/world";
import { roomSetupWrite, type RoomSetupChange } from "../setups";
import { scoreV } from "./tables";

/** The second half's watchdog period while tables compute (owner.ts completeStart; finished() normally launches at once). */
export const PREPARING_WATCHDOG_MS = 60_000;

/** How a settings commit changes the room's setup: run another one (`apply`), or edit the one it runs (`edit`). */
const setupChangeV = v.union(v.object({ kind: v.literal("apply"), setupId: v.id("gameSetups") }),
  /** `baseUpdatedAt`: the owner's setup the change started from (setups.ownedBase), checked unchanged. */
  v.object({ kind: v.literal("edit"), baseUpdatedAt: v.optional(v.number()) }));

/** The room as its current owner sees it, for an owner action. */
export const ownerContext = internalQuery({
  args: { room: v.string(), principal: v.optional(principalV) },
  handler: async (ctx, { room: ref, principal }) => {
    const room = await requireRoom(ctx, ref);
    const { viewer } = await requireOwnerAs(ctx, await viewerOf(ctx, principal), room);
    const members = await membersOf(ctx, room._id);
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    return {
      room, ownerId: viewer.subject, members: members.map(m => ({ godId: m.godId, name: m.name, kind: m.kind, aiAgent: m.aiAgent })),
      activeGame: active && active.phase !== "ended" ? { id: active._id, phase: active.phase } : null,
      receipt: null as unknown,
    };
  },
});

export const receiptFor = internalQuery({
  args: { roomId: v.id("rooms"), actorId: v.string(), requestId: v.string() },
  handler: async (ctx, { roomId, actorId, requestId }) => {
    const r = await ctx.db.query("receipts").withIndex("by_key", q => q.eq("roomId", roomId).eq("actorId", actorId).eq("requestId", requestId)).unique();
    return r ? { hash: r.hash, result: r.result } : null;
  },
});

export const commitSettings = internalMutation({
  args: { roomId: v.id("rooms"), principal: v.optional(principalV), revision: v.number(), settings: v.any(), setup: v.optional(setupChangeV), catalog: v.any(), aiBudget: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ revision: number; setup?: RoomSetupChange }> => {
    const room = await requireRoom(ctx, args.roomId);
    const { viewer } = await requireOwnerAs(ctx, await viewerOf(ctx, args.principal), room);
    if (args.revision !== room.revision) fail("CONFLICT", "Settings changed; refresh before saving");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "Settings and seats are frozen during games");
    if (room.preparing && !room.preparing.error) fail("CONFLICT", "The next game is preparing its rule tables; settings are frozen until it starts (or end the preparation)");
    if (args.aiBudget !== undefined && (!Number.isSafeInteger(args.aiBudget) || args.aiBudget < 0 || args.aiBudget > 1_000_000)) {
      fail("BAD_REQUEST", "The AI budget is a whole number of tokens from 0 to 1,000,000");
    }
    const settings = args.settings as GameSettings;
    validateSettings(settings);
    // The room always runs a setup: applying one names it; an edit changes the room's own setup or a copy of it.
    let setup: RoomSetupChange | undefined;
    if (args.setup?.kind === "apply") {
      const doc = await ctx.db.get(args.setup.setupId);
      if (!doc || doc.deleted) fail("NOT_FOUND", "That setup was deleted meanwhile");
      setup = { id: doc._id, name: doc.name, created: false, note: `The next game runs "${doc.name}"` };
    } else if (args.setup?.kind === "edit" && !(room.setupId && sameSettings(settings, room.settings))) {
      setup = await roomSetupWrite(ctx, room, viewer.subject, settings, args.setup.baseUpdatedAt);
    }
    await putCatalog(ctx, `room:${room._id}`, args.catalog, room.revision + 1);
    await ctx.db.patch(room._id, {
      settings, revision: room.revision + 1, seq: room.seq + 1,
      ...(setup ? { setupId: setup.id, setupName: setup.name } : {}),
      ...(args.aiBudget !== undefined ? { aiBudget: args.aiBudget } : {}),
    });
    return { revision: room.revision + 1, ...(setup ? { setup } : {}) };
  },
});

/** Fill a room's catalog after creation (its settings unchanged since the action computed it). */
export const setCatalog = internalMutation({
  args: { roomId: v.id("rooms"), revision: v.number(), catalog: v.any() },
  handler: async (ctx, { roomId, revision, catalog }) => {
    const room = await ctx.db.get(roomId);
    if (room && room.revision === revision) await putCatalog(ctx, `room:${roomId}`, catalog, revision);
  },
});

const wire = v.union(v.number(), v.string());

/**
 * The start's first half found tables to compute (owner.ts startGame): record the fixed deal and the keys it waits for
 * on the room, and a wait row per key for calibration/cache.ts finished. Keys that became ready (or failed) between
 * the action's check and this mutation are settled here, so no landing is missed; when none is left, the second half
 * is scheduled at once. A watchdog run of the second half follows every minute until the game starts.
 */
export const beginPreparing = internalMutation({
  args: {
    roomId: v.id("rooms"), principal: v.optional(principalV), revision: v.number(), memberIds: v.array(v.string()), requestId: v.string(),
    instance: v.string(), total: v.number(), pending: v.array(v.string()), estimateSeconds: v.number(),
    deals: v.array(v.object({ godId: v.string(), utility: v.any() })),
    dealer: v.object({ selectorId: v.string(), dealtAs: v.string(), note: v.optional(v.string()) }),
  },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    const { viewer } = await requireOwnerAs(ctx, await viewerOf(ctx, args.principal), room);
    if (room.revision !== args.revision) fail("CONFLICT", "Settings changed while starting; try again");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "There is already a live game");
    if (room.preparing && !room.preparing.error) return room.preparing;   // a concurrent start won
    await forgetWaits(ctx, room._id);
    const pending: string[] = [];
    let failure: string | undefined;
    // Progress at piece granularity: a split key is several pieces (those already ready count as done), others one.
    const pieces = { done: 0, total: 0 };
    for (const key of args.pending) {
      const row = await ctx.db.query("calibrationComputed").withIndex("by_key", q => q.eq("key", key)).unique();
      if (row?.status === "ready") continue;
      if (row?.status === "failed") { failure ??= failureMessage(row, row.error ?? "unknown error"); continue; }
      pending.push(key);
      pieces.total += row?.pieces ?? 1;
      pieces.done += row?.piecesDone ?? 0;
      await ctx.db.insert("calibrationWaits", { key, roomId: room._id, requestId: args.requestId });
    }
    const preparing = {
      requestId: args.requestId, ownerId: viewer.subject, startedAt: Date.now(), revision: args.revision, memberIds: args.memberIds,
      instance: args.instance, total: args.total, pending, estimateSeconds: args.estimateSeconds, deals: args.deals, dealer: args.dealer,
      ...(pieces.total > pending.length ? { pieces } : {}),
      ...(failure ? { error: failure } : {}),
    };
    await ctx.db.patch(room._id, { preparing, seq: room.seq + 1 });
    if (failure) await forgetWaits(ctx, room._id);
    else if (!pending.length) await ctx.scheduler.runAfter(0, internal.owner.completeStart, { roomId: room._id, requestId: args.requestId });
    else await ctx.scheduler.runAfter(PREPARING_WATCHDOG_MS, internal.owner.completeStart, { roomId: room._id, requestId: args.requestId, watchdog: true });
    await touchActivity(ctx, true);
    return preparing;
  },
});

/** The second half could not launch the prepared game: record why on the room (the owner starts again). */
export const preparingFailed = internalMutation({
  args: { roomId: v.id("rooms"), requestId: v.string(), message: v.string() },
  handler: async (ctx, { roomId, requestId, message }) => preparationFailed(ctx, roomId, requestId, message.slice(0, 2000)),
});

/** The owner ends a preparation (rooms.endActiveGame with no game running): the deal is dropped, computing continues for the cache. */
export async function cancelPreparing(ctx: MutationCtx, room: Doc<"rooms">) {
  await forgetWaits(ctx, room._id);
  await ctx.db.patch(room._id, { preparing: undefined, seq: room.seq + 1 });
}

/**
 * Launch: insert the game, its deities and starting objects; snapshot settings and roster; schedule the loop. A
 * prepared start (`prepared`: the room's preparing requestId, owner.ts completeStart) runs without the owner's
 * identity: the owner was checked when the preparation began, and it launches only while that preparation is the
 * room's (an ended or replaced one returns null). Its roster is the dealt gods, who must all still be members; anyone
 * who joined meanwhile spectates, as on joining a running game.
 */
export const commitStart = internalMutation({
  args: {
    roomId: v.id("rooms"), principal: v.optional(principalV), revision: v.number(), memberIds: v.array(v.string()), requestId: v.optional(v.string()),
    prepared: v.optional(v.string()),
    seasonCommitment: v.string(), endAtWorld: v.number(), nextSpawn: v.number(), catalog: v.any(),
    deities: v.array(v.object({ godId: v.string(), utility: v.any(), card: v.any() })),
    objects: v.array(v.object({ value: wire, scores: v.array(scoreV), salience: v.number() })),
  },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    let actorId: string;
    if (args.prepared !== undefined) {
      if (room.preparing?.requestId !== args.prepared || room.preparing.error) return null;
      if (room.ownerId !== room.preparing.ownerId) fail("CONFLICT", "The room changed owner while the game was preparing; start again");
      actorId = room.preparing.ownerId;
    } else {
      actorId = (await requireOwnerAs(ctx, await viewerOf(ctx, args.principal), room)).viewer.subject;
      if (room.preparing && !room.preparing.error) fail("CONFLICT", "The game is preparing its rule tables");
    }
    if (room.revision !== args.revision) fail("CONFLICT", "Settings changed while starting; try again");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "There is already a live game");
    const allMembers = await membersOf(ctx, room._id);
    let members = allMembers;
    if (args.prepared !== undefined) {
      const current = new Set(allMembers.map(m => m.godId));
      const gone = args.memberIds.filter(id => !current.has(id));
      if (gone.length) fail("CONFLICT", `${gone.length === 1 ? "A dealt god" : `${gone.length} dealt gods`} left while the game was preparing; start again`);
      const dealt = new Set(args.memberIds);
      members = allMembers.filter(m => dealt.has(m.godId));
    } else if (members.map(m => m.godId).sort().join("\n") !== [...args.memberIds].sort().join("\n")) fail("CONFLICT", "Members changed while starting; try again");
    const byGod = new Map(members.map(m => [m.godId, m]));
    const settings = room.settings as GameSettings;
    const setupId = room.setupId, setupName = (setupId ? (await ctx.db.get(setupId))?.name : undefined) ?? room.setupName;
    const now = Date.now(), guid = crypto.randomUUID();
    const { shortCode, encoded } = await shortCodeFor(ctx, "games", guid);
    const roster = args.deities.map(d => {
      const m = byGod.get(d.godId)!;
      return { id: m.godId, name: m.name, kind: m.kind };
    });
    const planningEndsAt = now + settings.planningSeconds * 1000;
    const gameId: Id<"games"> = await ctx.db.insert("games", {
      roomId: room._id, guid, shortCode, encoded, phase: "planning", scoring: "information-v1", seasonCommitment: args.seasonCommitment,
      settings, roster, ...(setupId ? { setupId, setupName } : {}),
      createdAt: now, planningEndsAt, pauseEndsAt: 0, worldSeconds: 0, lastTick: now, nextSpawn: args.nextSpawn,
      endAtWorld: args.endAtWorld, executionEpoch: 0, tick: { seq: 0, leaseUntil: planningEndsAt + LEASE_MS },
      nextBatch: 0, agentCount: 0, objectCount: args.objects.length, stats: { acts: 0, commits: 0, discarded: 0, opportunities: 0 },
    });
    await putCatalog(ctx, `game:${gameId}`, args.catalog, 0);
    for (const [index, d] of args.deities.entries()) {
      const aiAgent = byGod.get(d.godId)!.aiAgent;
      await ctx.db.insert("deities", { gameId, godId: d.godId, index, utility: d.utility, card: d.card, spent: 0, pauseUsed: false, ...(aiAgent ? { aiAgent } : {}) });
    }
    const events = [];
    for (const o of args.objects) {
      const objectId = await ctx.db.insert("objects", { gameId, value: o.value, version: 0, scores: o.scores, salience: o.salience });
      events.push({ t: "spawn" as const, objectId, value: o.value, version: 0, world: 0, net: args.deities.map(d => o.scores.find(s => s.god === d.godId)!.netBits) });
    }
    // The first scoreboard (docs/public-log-design.md §3): published with the starting objects, at world 0.
    const totals = totalsOf(args.deities.map(d => d.godId), args.objects);
    await ctx.db.insert("tickBatches", {
      gameId, seq: 0, at: now, worldFrom: 0, worldTo: 0, schema: EVENT_LOG_SCHEMA, events: [{ t: "phase", phase: "planning", world: 0 }, ...events], totals, published: true,
    });
    await insertObjectEvents(ctx, gameId, 0, events);
    await ctx.db.patch(gameId, { nextBatch: 1, scoreboard: { totals, world: 0, at: now } });
    for (const m of members) await ctx.db.patch(m._id, { ready: false, ...(m.kind === "ai" ? { status: "Planning", aiFailures: 0 } : {}) });
    // The assistant's conversation and working state are per (player, game): the last game's turns end here.
    await endTurnsForNewGame(ctx, room._id);
    await ctx.db.patch(room._id, {
      activeGameId: gameId, currentGameId: gameId, seq: room.seq + 1, preparing: undefined,
      aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
    });
    await ctx.scheduler.runAt(nextDeadline({ phase: "planning", planningEndsAt, pauseEndsAt: 0 }, now)!, internal.engine.tick.run, { gameId, seq: 0 });
    await ctx.scheduler.runAfter(0, internal.ai.seats.startAll, { gameId });
    const result = { gameId, shortCode, guid };
    if (args.requestId) {
      await ctx.db.insert("receipts", { roomId: room._id, actorId, requestId: `start:${args.requestId}`, hash: "start", result, createdAt: now });
    }
    await touchActivity(ctx, true);
    return result;
  },
});
