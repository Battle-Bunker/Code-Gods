/**
 * Internal halves of the owner's Node actions (owner.ts): read a consistent context with the owner check,
 * then commit with optimistic re-checks (room revision, members, no active game). The caller's identity
 * propagates from the action, so the owner check runs again inside each commit.
 */
import { v } from "convex/values";
import { validateSettings, type GameSettings } from "@workspace/game-core";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { touchActivity } from "../activity";
import { nextDeadline } from "../engine/loop";
import { fail } from "../lib/errors";
import { objectInstance } from "../lib/projection";
import { membersOf, requireOwner, requireRoom, shortCodeFor } from "../lib/rooms";
import { LEASE_MS } from "../lib/world";
import { scoreV } from "./tables";

/** The room as its current owner sees it, for an owner action. */
export const ownerContext = internalQuery({
  args: { room: v.string() },
  handler: async (ctx, { room: ref }) => {
    const room = await requireRoom(ctx, ref);
    const { viewer } = await requireOwner(ctx, room);
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
  args: { roomId: v.id("rooms"), revision: v.number(), settings: v.any(), catalog: v.any(), aiBudget: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    await requireOwner(ctx, room);
    if (args.revision !== room.revision) fail("CONFLICT", "Settings changed; refresh before saving");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "Settings and seats are frozen during games");
    if (args.aiBudget !== undefined && (!Number.isSafeInteger(args.aiBudget) || args.aiBudget < 0 || args.aiBudget > 1_000_000)) {
      fail("BAD_REQUEST", "The AI budget is a whole number of tokens from 0 to 1,000,000");
    }
    validateSettings(args.settings as GameSettings);
    await ctx.db.patch(room._id, {
      settings: args.settings, utilityCatalog: args.catalog, revision: room.revision + 1, seq: room.seq + 1,
      ...(args.aiBudget !== undefined ? { aiBudget: args.aiBudget } : {}),
    });
    return { revision: room.revision + 1 };
  },
});

/** Fill a room's catalog after creation (its settings unchanged since the action computed it). */
export const setCatalog = internalMutation({
  args: { roomId: v.id("rooms"), revision: v.number(), catalog: v.any() },
  handler: async (ctx, { roomId, revision, catalog }) => {
    const room = await ctx.db.get(roomId);
    if (room && room.revision === revision) await ctx.db.patch(roomId, { utilityCatalog: catalog });
  },
});

const wire = v.union(v.number(), v.string());

/** Launch: insert the game, its deities and starting objects; snapshot settings and roster; schedule the loop. */
export const commitStart = internalMutation({
  args: {
    roomId: v.id("rooms"), revision: v.number(), memberIds: v.array(v.string()), requestId: v.optional(v.string()),
    seasonCommitment: v.string(), endAtWorld: v.number(), nextSpawn: v.number(), catalog: v.any(),
    deities: v.array(v.object({ godId: v.string(), utility: v.any(), card: v.any() })),
    objects: v.array(v.object({ value: wire, scores: v.array(scoreV), salience: v.number() })),
  },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    const { viewer } = await requireOwner(ctx, room);
    if (room.revision !== args.revision) fail("CONFLICT", "Settings changed while starting; try again");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "There is already a live game");
    const members = await membersOf(ctx, room._id);
    if (members.map(m => m.godId).sort().join("\n") !== [...args.memberIds].sort().join("\n")) fail("CONFLICT", "Members changed while starting; try again");
    const byGod = new Map(members.map(m => [m.godId, m]));
    const settings = room.settings as GameSettings;
    const now = Date.now(), guid = crypto.randomUUID();
    const { shortCode, encoded } = await shortCodeFor(ctx, "games", guid);
    const roster = args.deities.map(d => {
      const m = byGod.get(d.godId)!;
      return { id: m.godId, name: m.name, kind: m.kind, ...(m.aiAgent ? { aiAgent: m.aiAgent } : {}) };
    });
    const planningEndsAt = now + settings.planningSeconds * 1000;
    const gameId: Id<"games"> = await ctx.db.insert("games", {
      roomId: room._id, guid, shortCode, encoded, phase: "planning", scoring: "information-v1", seasonCommitment: args.seasonCommitment,
      settings, roster, objectInstance: objectInstance(settings), utilityCatalog: args.catalog,
      createdAt: now, planningEndsAt, pauseEndsAt: 0, worldSeconds: 0, lastTick: now, nextSpawn: args.nextSpawn,
      endAtWorld: args.endAtWorld, executionEpoch: 0, tick: { seq: 0, leaseUntil: planningEndsAt + LEASE_MS },
      nextBatch: 0, objectCount: args.objects.length, stats: { acts: 0, commits: 0, discarded: 0, opportunities: 0 },
    });
    for (const [index, d] of args.deities.entries()) {
      await ctx.db.insert("deities", { gameId, godId: d.godId, index, utility: d.utility, card: d.card, spent: 0, pauseUsed: false });
    }
    const events = [];
    for (const o of args.objects) {
      const objectId = await ctx.db.insert("objects", { gameId, value: o.value, version: 0, scores: o.scores, salience: o.salience });
      events.push({ t: "spawn" as const, objectId, value: o.value, version: 0, world: 0, net: args.deities.map(d => o.scores.find(s => s.god === d.godId)!.netBits) });
    }
    await ctx.db.insert("tickBatches", { gameId, seq: 0, at: now, worldFrom: 0, worldTo: 0, events: [{ t: "phase", phase: "planning", world: 0 }, ...events] });
    await ctx.db.patch(gameId, { nextBatch: 1 });
    for (const m of members) await ctx.db.patch(m._id, { ready: false, ...(m.kind === "ai" ? { status: "Planning", aiFailures: 0 } : {}) });
    await ctx.db.patch(room._id, {
      activeGameId: gameId, currentGameId: gameId, seq: room.seq + 1,
      aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
    });
    await ctx.scheduler.runAt(nextDeadline({ phase: "planning", planningEndsAt, pauseEndsAt: 0 }, now)!, internal.engine.tick.run, { gameId, seq: 0 });
    await ctx.scheduler.runAfter(0, internal.ai.seats.startAll, { gameId });
    const result = { gameId, shortCode, guid };
    if (args.requestId) {
      await ctx.db.insert("receipts", { roomId: room._id, actorId: viewer.subject, requestId: `start:${args.requestId}`, hash: "start", result, createdAt: now });
    }
    await touchActivity(ctx, true);
    return result;
  },
});
