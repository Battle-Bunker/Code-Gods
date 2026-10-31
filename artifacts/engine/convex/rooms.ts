/**
 * Rooms: persistent, unnamed lobbies identified by a short code from their GUID, with an owner, a creation
 * date, members (humans and AI seats), public chat, the next game's settings and the history of ended games.
 * Settings and the game start need the calibration tables, so they are Node actions in owner.ts.
 */
import { v } from "convex/values";
import { presetSettings } from "@workspace/game-core";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./auth/access";
import { endGame, resumeGame } from "./engine/loop";
import { AI_MODEL_CATALOG, ASSISTANT_BUDGET_MAX, DEFAULT_AGENT_MODEL } from "./lib/aiModels";
import { fail } from "./lib/errors";
import { publicRoom } from "./lib/projection";
import { presetOrigin } from "./lib/settingsOrigin";
import {
  displayName, getCatalog, membersOf, memberOf, principalV, recentChat, requireMember, requireMemberAs, requireOwner, requireOwnerAs, requireReaderAs, requireRoom,
  shortCodeFor, viewerOf,
} from "./lib/rooms";
import { touchActivity } from "./activity";

export const MAX_GODS = 8;

async function bump(ctx: MutationCtx, room: Doc<"rooms">, patch: Partial<Doc<"rooms">> = {}) {
  await ctx.db.patch(room._id, { ...patch, seq: room.seq + 1 });
}
async function activeGame(ctx: MutationCtx, room: Doc<"rooms">) {
  const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  return game && game.phase !== "ended" ? game : null;
}

/** The preset a new room starts on (docs/ui-redesign.md §1): a small, slowed-down board a newcomer can follow. */
export const STARTING_PRESET = "grid-first-steps";

/** The in-client assistant's allowance (tokens per human per game; 0 = off) and model, as the owner approves them. */
function checkAssistant(assistantBudget: number | undefined, assistantModel: string | undefined) {
  if (assistantBudget !== undefined && (!Number.isSafeInteger(assistantBudget) || assistantBudget < 0 || assistantBudget > ASSISTANT_BUDGET_MAX)) {
    fail("BAD_REQUEST", `The assistant allowance is a whole number of tokens from 0 to ${ASSISTANT_BUDGET_MAX.toLocaleString("en")}`);
  }
  if (assistantModel !== undefined && !AI_MODEL_CATALOG.some(m => m.id === assistantModel)) fail("BAD_REQUEST", "Unknown assistant model");
}

/**
 * Create a room (browser login only). The creator owns it and is its first member. It starts on the First steps
 * preset; the owner may turn the in-client assistant on in the same call (the creation dialog's consent checkbox).
 */
export const create = mutation({
  args: { assistantBudget: v.optional(v.number()), assistantModel: v.optional(v.string()) },
  handler: async (ctx, { assistantBudget, assistantModel }) => {
    const viewer = await requireViewer(ctx);
    if (viewer.scope !== "browser") fail("FORBIDDEN", "Browser login required to create a room");
    checkAssistant(assistantBudget, assistantModel);
    const guid = crypto.randomUUID();
    const { shortCode, encoded } = await shortCodeFor(ctx, "rooms", guid);
    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      shortCode, guid, encoded, ownerId: viewer.subject, createdAt: now, revision: 0, seq: 0,
      settings: presetSettings(STARTING_PRESET, "python"), settingsOrigin: presetOrigin(STARTING_PRESET),
      aiBudget: 0, aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
      ...(assistantBudget !== undefined ? { assistantBudget } : {}), ...(assistantModel !== undefined ? { assistantModel } : {}),
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
        settingsOrigin: r.settingsOrigin ?? null,
      };
    }));
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** A room's public state by id, GUID or short code: owner, creation date, members, chat, settings, active game. */
export async function roomFor(ctx: QueryCtx, viewer: Viewer, { room: ref }: { room: string }) {
  const room = await requireRoom(ctx, ref);
  requireReaderAs(viewer, room);
  const [members, chat] = await Promise.all([membersOf(ctx, room._id), recentChat(ctx, room._id)]);
  const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  const owner = members.find(m => m.godId === room.ownerId)?.name ?? await displayName(ctx, room.ownerId);
  return { ...publicRoom(room, members, chat, game, owner, await getCatalog(ctx, `room:${room._id}`)), serverTime: Date.now() };
}
export const get = query({ args: { room: v.string() }, handler: async (ctx, args) => roomFor(ctx, await requireViewer(ctx), args) });
/** Internal twin of `get` for a principal; `requireOwner` makes it the owner-only room state of the agent registry. */
export const getAs = internalQuery({
  args: { principal: principalV, room: v.string(), requireOwner: v.optional(v.boolean()) },
  handler: async (ctx, { principal, requireOwner, ...args }) => {
    const viewer = await viewerOf(ctx, principal);
    if (requireOwner) await requireOwnerAs(ctx, viewer, await requireRoom(ctx, args.room));
    return roomFor(ctx, viewer, args);
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
export async function chatFor(ctx: QueryCtx, viewer: Viewer, { roomId, before, limit }: { roomId: string; before?: number; limit?: number }) {
  const room = await requireRoom(ctx, roomId);
  await requireMemberAs(ctx, viewer, room, "read");
  const rows = await recentChat(ctx, room._id, Math.max(1, Math.min(100, Math.floor(limit ?? 100))), 0, (before ?? Infinity) - 1);
  return rows.map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp }));
}
export const chatHistory = query({
  args: { roomId: v.id("rooms"), before: v.optional(v.number()) },
  handler: async (ctx, args) => chatFor(ctx, await requireViewer(ctx), args),
});
/**
 * One page of the room's chat, newest page first and each page oldest-first (the get_chat tool). `cursor` is the
 * previous page's `nextCursor`: Convex's own pagination cursor, so messages sharing a timestamp are never skipped
 * or repeated. `nextCursor` is null on the last page.
 */
export const chatHistoryAs = internalQuery({
  args: { principal: principalV, roomId: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { principal, roomId, cursor, limit }) => {
    const viewer = await viewerOf(ctx, principal);
    const room = await requireRoom(ctx, roomId);
    await requireMemberAs(ctx, viewer, room, "read");
    const page = await ctx.db.query("chat").withIndex("by_room", q => q.eq("roomId", room._id)).order("desc")
      .paginate({ cursor: cursor ?? null, numItems: Math.max(1, Math.min(100, Math.floor(limit ?? 100))) });
    const messages = page.page.reverse().map(m => ({ id: m._id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, timestamp: m.timestamp }));
    return { messages, nextCursor: page.isDone ? null : page.continueCursor };
  },
});

/** The room's finished games, newest first: public results only. */
export async function historyFor(ctx: QueryCtx, viewer: Viewer, { room: ref }: { room: string }) {
  const room = await requireRoom(ctx, ref);
  requireReaderAs(viewer, room);
  const games = await ctx.db.query("games").withIndex("by_room", q => q.eq("roomId", room._id)).order("desc").take(200);
  return games.filter(g => g.phase === "ended" && g.summary).slice(0, 100).map(g => g.summary);
}
export const history = query({ args: { room: v.string() }, handler: async (ctx, args) => historyFor(ctx, await requireViewer(ctx), args) });
export const historyAs = internalQuery({
  args: { principal: principalV, room: v.string() },
  handler: async (ctx, { principal, ...args }) => historyFor(ctx, await viewerOf(ctx, principal), args),
});

// ------------------------------------------------------------------------------------------------
// owner actions (mutations; settings and start are Node actions in owner.ts)
// ------------------------------------------------------------------------------------------------

/**
 * The owner approves the room's AI token budget for its AI seats (between games) and, optionally, the in-client
 * assistant's allowance: tokens per human per game (0 = off) and its model. The assistant fields may change during
 * a game (every human's allowance changes alike); the seats' budget stays frozen then.
 */
export const approveAiBudget = mutation({
  args: { roomId: v.id("rooms"), aiBudget: v.number(), assistantBudget: v.optional(v.number()), assistantModel: v.optional(v.string()) },
  handler: async (ctx, { roomId, aiBudget, assistantBudget, assistantModel }) => {
    const room = await requireRoom(ctx, roomId);
    await requireOwner(ctx, room);
    if (!Number.isSafeInteger(aiBudget) || aiBudget < 0 || aiBudget > 1_000_000) fail("BAD_REQUEST", "The AI budget is a whole number of tokens from 0 to 1,000,000");
    checkAssistant(assistantBudget, assistantModel);
    if (aiBudget !== room.aiBudget && await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    await bump(ctx, room, { aiBudget, ...(assistantBudget !== undefined ? { assistantBudget } : {}), ...(assistantModel !== undefined ? { assistantModel } : {}) });
    return { aiBudget, assistantBudget: assistantBudget ?? room.assistantBudget ?? 0, assistantModel: assistantModel ?? room.assistantModel ?? DEFAULT_AGENT_MODEL };
  },
});

/** Add an AI seat from the template library; the seat snapshots the template (name, provider, model, prompt, revision). */
export const addAi = mutation({
  args: { roomId: v.id("rooms"), templateId: v.string() },
  handler: async (ctx, args) => addAiFor(ctx, await requireViewer(ctx), args),
});
export const addAiAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms"), templateId: v.string() },
  handler: async (ctx, { principal, ...args }) => addAiFor(ctx, await viewerOf(ctx, principal), args),
});
async function addAiFor(ctx: MutationCtx, viewer: Viewer, { roomId, templateId }: { roomId: string; templateId: string }) {
    const room = await requireRoom(ctx, roomId);
    await requireOwnerAs(ctx, viewer, room);
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
}

export const removeAi = mutation({
  args: { roomId: v.id("rooms"), godId: v.string() },
  handler: async (ctx, args) => removeAiFor(ctx, await requireViewer(ctx), args),
});
export const removeAiAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms"), godId: v.string() },
  handler: async (ctx, { principal, ...args }) => removeAiFor(ctx, await viewerOf(ctx, principal), args),
});
async function removeAiFor(ctx: MutationCtx, viewer: Viewer, { roomId, godId }: { roomId: string; godId: string }) {
    const room = await requireRoom(ctx, roomId);
    await requireOwnerAs(ctx, viewer, room);
    if (await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    const seat = await memberOf(ctx, room._id, godId);
    if (!seat || seat.kind !== "ai") fail("NOT_FOUND", "AI seat not found");
    await ctx.db.delete(seat._id);
    await bump(ctx, room);
    return null;
}

/** The owner closes the active game early; its final state is recorded like any other ending. */
export const endActiveGame = mutation({ args: { roomId: v.id("rooms") }, handler: async (ctx, args) => endFor(ctx, await requireViewer(ctx), args) });
export const endActiveGameAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms") },
  handler: async (ctx, { principal, ...args }) => endFor(ctx, await viewerOf(ctx, principal), args),
});
async function endFor(ctx: MutationCtx, viewer: Viewer, { roomId }: { roomId: string }) {
  const room = await requireRoom(ctx, roomId);
  await requireOwnerAs(ctx, viewer, room);
  const game = await activeGame(ctx, room);
  if (!game) return fail("CONFLICT", "There is no active game to end");
  await endGame(ctx, game, "owner");
  return { gameId: game._id };
}

/** The owner resumes a game in recovery (e.g. after the 2,000-object safety stop). */
export const resume = mutation({ args: { roomId: v.id("rooms") }, handler: async (ctx, args) => resumeFor(ctx, await requireViewer(ctx), args) });
export const resumeAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms") },
  handler: async (ctx, { principal, ...args }) => resumeFor(ctx, await viewerOf(ctx, principal), args),
});
async function resumeFor(ctx: MutationCtx, viewer: Viewer, { roomId }: { roomId: string }) {
    const room = await requireRoom(ctx, roomId);
    await requireOwnerAs(ctx, viewer, room);
    const game = await activeGame(ctx, room);
    if (game?.phase !== "recovery") fail("CONFLICT", "Game is not in recovery");
    // Human activity resumes idle-parked games by itself; a safety stop still needs the explicit resume.
    await touchActivity(ctx, true);
    const after = await ctx.db.get(game._id);
    if (after?.phase === "recovery") await resumeGame(ctx, after);
    return { gameId: game._id };
}
