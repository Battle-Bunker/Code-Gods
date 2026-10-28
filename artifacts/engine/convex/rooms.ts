/**
 * Rooms: persistent, unnamed lobbies identified by a short code from their GUID, with an owner, a creation
 * date, members (humans and AI seats), public chat, the next game's settings and the history of ended games.
 * Settings and the game start need the calibration tables, so they are Node actions in owner.ts.
 */
import { v } from "convex/values";
import { DEFAULT_SETTINGS, defaultSettingsFor } from "@workspace/game-core";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { endGame, resumeGame } from "./engine/loop";
import { fail } from "./lib/errors";
import { publicRoom } from "./lib/projection";
import { displayName, getCatalog, membersOf, memberOf, recentChat, requireMember, requireOwner, requireReader, requireRoom, shortCodeFor } from "./lib/rooms";
import { touchActivity } from "./activity";

export const MAX_GODS = 8;

async function bump(ctx: MutationCtx, room: Doc<"rooms">, patch: Partial<Doc<"rooms">> = {}) {
  await ctx.db.patch(room._id, { ...patch, seq: room.seq + 1 });
}
async function activeGame(ctx: MutationCtx, room: Doc<"rooms">) {
  const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  return game && game.phase !== "ended" ? game : null;
}

/** Create a room (browser login only). The creator owns it and is its first member. */
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.scope !== "browser") fail("FORBIDDEN", "Browser login required to create a room");
    const guid = crypto.randomUUID();
    const { shortCode, encoded } = await shortCodeFor(ctx, "rooms", guid);
    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      shortCode, guid, encoded, ownerId: viewer.subject, createdAt: now, revision: 0, seq: 0,
      settings: defaultSettingsFor(DEFAULT_SETTINGS.objectType),
      aiBudget: 0, aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
    });
    await ctx.db.insert("members", { roomId, godId: viewer.subject, userId: viewer.subject, name: viewer.name, kind: "human", ready: false, joinedAt: now });
    await ctx.scheduler.runAfter(0, internal.owner.fillCatalog, { roomId });
    await ctx.scheduler.runAfter(0, internal.aiTemplates.ensureSeeded, {});
    await touchActivity(ctx);
    return { roomId, shortCode, guid };
  },
});

/** The caller's rooms (a player credential sees only its own room), newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const memberships = await ctx.db.query("members").withIndex("by_god", q => q.eq("godId", viewer.subject)).take(200);
    const rooms = (await Promise.all(memberships.map(m => ctx.db.get(m.roomId))))
      .filter((r): r is Doc<"rooms"> => !!r && (viewer.scope === "browser" || viewer.roomId === r._id));
    const rows = await Promise.all(rooms.map(async r => {
      const game = r.activeGameId ? await ctx.db.get(r.activeGameId) : null;
      const live = game && game.phase !== "ended" ? game : null;
      return {
        id: r._id, guid: r.guid, shortCode: r.shortCode, ownerId: r.ownerId, ownerName: await displayName(ctx, r.ownerId), createdAt: r.createdAt,
        memberCount: (await membersOf(ctx, r._id)).length,
        phase: live ? live.phase : "lobby", activeGameShortCode: live?.shortCode ?? null,
      };
    }));
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** A room's public state by id, GUID or short code: owner, creation date, members, chat, settings, active game. */
export const get = query({
  args: { room: v.string() },
  handler: async (ctx, { room: ref }) => {
    const room = await requireRoom(ctx, ref);
    await requireReader(ctx, room);
    const [members, chat] = await Promise.all([membersOf(ctx, room._id), recentChat(ctx, room._id)]);
    const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    const owner = members.find(m => m.godId === room.ownerId)?.name ?? await displayName(ctx, room.ownerId);
    return { ...publicRoom(room, members, chat, game, owner, await getCatalog(ctx, `room:${room._id}`)), serverTime: Date.now() };
  },
});

/** Join a room (browser login). Joining mid-game spectates until the next game. */
export const join = mutation({
  args: { room: v.string() },
  handler: async (ctx, { room: ref }) => {
    const room = await requireRoom(ctx, ref);
    const viewer = await requireViewer(ctx);
    if (viewer.scope !== "browser") fail("FORBIDDEN", "Browser login required to join");
    if (!await memberOf(ctx, room._id, viewer.subject)) {
      if ((await membersOf(ctx, room._id)).length >= MAX_GODS) fail("CONFLICT", "This room has reached its eight-player limit");
      await ctx.db.insert("members", { roomId: room._id, godId: viewer.subject, userId: viewer.subject, name: viewer.name, kind: "human", ready: false, joinedAt: Date.now() });
      await bump(ctx, room);
    }
    await touchActivity(ctx);
    return { roomId: room._id, shortCode: room.shortCode };
  },
});

export const leave = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await requireRoom(ctx, roomId);
    const { member } = await requireMember(ctx, room, "act");
    if (room.ownerId === member.godId) fail("FORBIDDEN", "The owner cannot leave their room");
    const game = await activeGame(ctx, room);
    if (game?.roster.some(m => m.id === member.godId)) fail("CONFLICT", "You are seated in the active game; leave after it ends");
    await ctx.db.delete(member._id);
    await bump(ctx, room);
    return null;
  },
});

/** Advisory readiness (also available as the v3 "ready" command). */
export const setReady = mutation({
  args: { roomId: v.id("rooms"), ready: v.boolean() },
  handler: async (ctx, { roomId, ready }) => {
    const room = await requireRoom(ctx, roomId);
    const { member } = await requireMember(ctx, room, "act");
    await ctx.db.patch(member._id, { ready });
    await bump(ctx, room);
    return { ready };
  },
});

/** Older public chat (members only), 100 messages before `before`. */
export const chatHistory = query({
  args: { roomId: v.id("rooms"), before: v.optional(v.number()) },
  handler: async (ctx, { roomId, before }) => {
    const room = await requireRoom(ctx, roomId);
    await requireMember(ctx, room, "read");
    const rows = await recentChat(ctx, room._id, 100, 0, (before ?? Infinity) - 1);
    return rows.map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp }));
  },
});

/** The room's finished games, newest first: public results only. */
export const history = query({
  args: { room: v.string() },
  handler: async (ctx, { room: ref }) => {
    const room = await requireRoom(ctx, ref);
    await requireReader(ctx, room);
    const games = await ctx.db.query("games").withIndex("by_room", q => q.eq("roomId", room._id)).order("desc").take(200);
    return games.filter(g => g.phase === "ended" && g.summary).slice(0, 100).map(g => g.summary);
  },
});

// ------------------------------------------------------------------------------------------------
// owner actions (mutations; settings and start are Node actions in owner.ts)
// ------------------------------------------------------------------------------------------------

/** The owner approves the room's AI token budget (between games). */
export const approveAiBudget = mutation({
  args: { roomId: v.id("rooms"), aiBudget: v.number() },
  handler: async (ctx, { roomId, aiBudget }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    if (!Number.isSafeInteger(aiBudget) || aiBudget < 0 || aiBudget > 1_000_000) fail("BAD_REQUEST", "The AI budget is a whole number of tokens from 0 to 1,000,000");
    if (await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    await bump(ctx, room, { aiBudget });
    return { aiBudget };
  },
});

/** Add an AI seat from the template library; the seat snapshots the template (name, provider, model, prompt, revision). */
export const addAi = mutation({
  args: { roomId: v.id("rooms"), templateId: v.string() },
  handler: async (ctx, { roomId, templateId }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    if (await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    if ((await membersOf(ctx, room._id)).length >= MAX_GODS) fail("CONFLICT", "Maximum eight gods");
    const template = await ctx.db.query("aiTemplates").withIndex("by_template", q => q.eq("templateId", templateId)).unique();
    if (!template || template.deleted) fail("NOT_FOUND", "AI agent not found");
    const godId = `ai:${crypto.randomUUID()}`;
    await ctx.db.insert("members", {
      roomId: room._id, godId, name: template.name, kind: "ai", ready: true, joinedAt: Date.now(), status: "Ready; awaiting game start",
      aiAgent: { id: template.templateId, name: template.name, provider: template.provider, model: template.model, prompt: template.prompt, revision: template.revision },
    });
    await bump(ctx, room);
    return { godId };
  },
});

export const removeAi = mutation({
  args: { roomId: v.id("rooms"), godId: v.string() },
  handler: async (ctx, { roomId, godId }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    if (await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    const seat = await memberOf(ctx, room._id, godId);
    if (!seat || seat.kind !== "ai") fail("NOT_FOUND", "AI seat not found");
    await ctx.db.delete(seat._id);
    await bump(ctx, room);
    return null;
  },
});

/** The owner closes the active game early; its final state is recorded like any other ending. */
export const endActiveGame = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    const game = await activeGame(ctx, room);
    if (!game) fail("CONFLICT", "There is no active game to end");
    await endGame(ctx, game, "owner");
    return { gameId: game._id };
  },
});

/** The owner resumes a game in recovery (e.g. after the 2,000-object safety stop). */
export const resume = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    await touchActivity(ctx, true); // may already resume an idle-parked game
    const game = await activeGame(ctx, room);
    if (game?.phase !== "recovery") fail("CONFLICT", "Game is not in recovery");
    await resumeGame(ctx, game);
    return { gameId: game._id };
  },
});
