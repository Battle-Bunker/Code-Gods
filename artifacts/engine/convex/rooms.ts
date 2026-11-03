/**
 * Rooms: persistent, unnamed lobbies identified by a short code from their GUID, with an owner, a creation
 * date, members (humans and AI seats), public chat, the next game's settings and the history of ended games.
 * Settings and the game start need the calibration tables, so they are Node actions in owner.ts.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actsAsHuman, requireViewer, type Viewer } from "./auth/access";
import { endGame, resumeGame } from "./engine/loop";
import { liveGame, withEngine } from "./game/state";
import { AI_MODEL_CATALOG, AI_QUOTA_MAX, ASSISTANT_QUOTA_MAX, DEFAULT_AGENT_MODEL, DEFAULT_AI_QUOTA, DEFAULT_ASSISTANT_QUOTA } from "./lib/aiModels";
import { aiEnabledFor, aiQuotaOf, assistantQuotaOf, requireAiEnabled } from "./lib/aiAccess";
import { fail } from "./lib/errors";
import { aiSeatName } from "./lib/aiNames";
import { chatView, publicRoom } from "./lib/projection";
import { paginationOptsValidator } from "convex/server";
import { firstSteps } from "./setups";
import {
  AI_LOBBY_STATUS, chatWindow, displayName, getCatalog, isHistoric, requireHistoricReaderAs, membersOf, memberOf, principalV, recentChat, requireMember, requireMemberAs, requireOwner, requireOwnerAs, requireReaderAs, requireRoom,
  shortCodeFor, viewerOf,
} from "./lib/rooms";
import { touchActivity } from "./activity";
import { cancelPreparing } from "./game/lobby";

/** Players of one game (spectators aside), and members of a room (players and spectators). */
export const MAX_GODS = 8, MAX_MEMBERS = 24;
const playersOf = (members: readonly Doc<"members">[]) => members.filter(m => !m.spectator);

async function bump(ctx: MutationCtx, room: Doc<"rooms">, patch: Partial<Doc<"rooms">> = {}) {
  await ctx.db.patch(room._id, { ...patch, seq: room.seq + 1 });
}
async function activeGame(ctx: MutationCtx, room: Doc<"rooms">) {
  const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
  return game && game.phase !== "ended" ? game : null;
}

/** The room's AI quotas (tokens per game; 0 = none) and the assistant's model, as the owner configures them. */
type Quotas = { aiQuota?: number; assistantQuota?: number; assistantModel?: string };
function checkQuotas({ aiQuota, assistantQuota, assistantModel }: Quotas) {
  const whole = (n: number | undefined, max: number) => n === undefined || (Number.isSafeInteger(n) && n >= 0 && n <= max);
  if (!whole(aiQuota, AI_QUOTA_MAX)) fail("BAD_REQUEST", `The AI players' quota is a whole number of tokens per game from 0 to ${AI_QUOTA_MAX.toLocaleString("en")}`);
  if (!whole(assistantQuota, ASSISTANT_QUOTA_MAX)) {
    fail("BAD_REQUEST", `The assistant quota is a whole number of tokens per player per game from 0 to ${ASSISTANT_QUOTA_MAX.toLocaleString("en")}`);
  }
  if (assistantModel !== undefined && !AI_MODEL_CATALOG.some(m => m.id === assistantModel)) fail("BAD_REQUEST", "Unknown assistant model");
}
const quotaPatch = ({ aiQuota, assistantQuota, assistantModel }: Quotas) => ({
  ...(aiQuota !== undefined ? { aiQuota } : {}), ...(assistantQuota !== undefined ? { assistantQuota } : {}), ...(assistantModel !== undefined ? { assistantModel } : {}),
});

/**
 * Create a room (the human everywhere: a browser session or an account grant; never a room credential). The creator owns it and is its first member, a spectator until they choose to
 * play (setSpectator; docs/unify-apps-plan.md §2). It starts on the seeded First steps
 * setup (docs/ui-redesign.md §1: a small, slowed-down board a newcomer can follow; its built-in settings if an admin
 * removed it). Its AI quotas start at the defaults (300,000 tokens per game for the AI players, and for each player's
 * assistant); an API caller may set them and the assistant's model in the same call.
 */
export const create = mutation({
  args: { aiQuota: v.optional(v.number()), assistantQuota: v.optional(v.number()), assistantModel: v.optional(v.string()) },
  handler: async (ctx, quotas) => {
    const viewer = await requireViewer(ctx);
    if (!actsAsHuman(viewer)) fail("FORBIDDEN", "Sign in (in a browser, or an app you allowed to act as you in every room) to create a room");
    checkQuotas(quotas);
    const guid = crypto.randomUUID();
    const { shortCode, encoded } = await shortCodeFor(ctx, "rooms", guid);
    const now = Date.now();
    const first = await firstSteps(ctx);
    const roomId = await ctx.db.insert("rooms", {
      shortCode, guid, encoded, ownerId: viewer.subject, createdAt: now, revision: 0, seq: 0,
      settings: first.settings, setupId: first._id, setupName: first.name,
      aiQuota: DEFAULT_AI_QUOTA, assistantQuota: DEFAULT_ASSISTANT_QUOTA, aiUsed: 0, aiReservedUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, aiCalls: [],
      ...quotaPatch(quotas),
    });
    await ctx.db.insert("members", { roomId, godId: viewer.subject, userId: viewer.subject, name: viewer.name, kind: "human", ready: false, spectator: true, joinedAt: now });
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
      .filter((r): r is Doc<"rooms"> => !!r && (actsAsHuman(viewer) || viewer.roomId === r._id));
    const rows = await Promise.all(rooms.map(async r => {
      const game = r.activeGameId ? await ctx.db.get(r.activeGameId) : null;
      const live = game && game.phase !== "ended" ? game : null;
      return {
        id: r._id, guid: r.guid, shortCode: r.shortCode, ownerId: r.ownerId, ownerName: await displayName(ctx, r.ownerId), createdAt: r.createdAt,
        memberCount: (await membersOf(ctx, r._id)).length,
        phase: live ? live.phase : "lobby", activeGameShortCode: live?.shortCode ?? null,
        setupName: r.setupName ?? null,
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
  const setupDoc = room.setupId ? await ctx.db.get(room.setupId) : null;
  const setup = room.setupId ? { id: room.setupId, name: setupDoc?.name ?? room.setupName ?? "", deleted: !setupDoc || !!setupDoc.deleted } : null;
  // No server clock here (Date.now() would be cached with the answer, read-architecture §2.2 point 6): the room's answer
  // changes only when the room, its members, chat, setup or its game's header does.
  return publicRoom(room, members, chat, game, owner, await getCatalog(ctx, `room:${room._id}`), setup, await aiEnabledFor(ctx, room));
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

/**
 * Join a room (the human everywhere, as for create), as a player of the next game or as a spectator. Joining mid-game watches the running
 * game (its spectators gain the newcomer: they may open its replay) and plays the next one unless `spectator`.
 */
export const join = mutation({
  args: { room: v.string(), spectator: v.optional(v.boolean()) },
  handler: async (ctx, { room: ref, spectator = false }) => {
    const room = await requireRoom(ctx, ref);
    const viewer = await requireViewer(ctx);
    if (!actsAsHuman(viewer)) fail("FORBIDDEN", "Sign in (in a browser, or an app you allowed to act as you in every room) to join");
    if (!await memberOf(ctx, room._id, viewer.subject)) {
      const members = await membersOf(ctx, room._id);
      if (members.length >= MAX_MEMBERS) fail("CONFLICT", `This room has reached its ${MAX_MEMBERS}-member limit`);
      if (!spectator && playersOf(members).length >= MAX_GODS) fail("CONFLICT", "This room has its eight players; join as a spectator");
      await ctx.db.insert("members", { roomId: room._id, godId: viewer.subject, userId: viewer.subject, name: viewer.name, kind: "human", ready: false, spectator, joinedAt: Date.now() });
      const game = await activeGame(ctx, room);
      if (game && !game.spectators.includes(viewer.subject)) await ctx.db.patch(game._id, { spectators: [...game.spectators, viewer.subject] });
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

/**
 * Play or watch the next game (docs/unify-apps-plan.md §2): a member sets it for themselves, the owner for any human
 * member (`godId`); AI seats always play. It never changes a running game's roster ("applies after this game ends") and
 * is refused while the next game is preparing (its deal is fixed). A spectator has no ready state.
 */
export const setSpectator = mutation({
  args: { roomId: v.id("rooms"), spectator: v.boolean(), godId: v.optional(v.string()) },
  handler: async (ctx, args) => setSpectatorFor(ctx, await requireViewer(ctx), args),
});
export const setSpectatorAs = internalMutation({
  args: { principal: principalV, roomId: v.string(), spectator: v.boolean(), godId: v.optional(v.string()) },
  handler: async (ctx, { principal, ...args }) => setSpectatorFor(ctx, await viewerOf(ctx, principal), args),
});
async function setSpectatorFor(ctx: MutationCtx, viewer: Viewer, { roomId, spectator, godId }: { roomId: string; spectator: boolean; godId?: string }) {
  const room = await requireRoom(ctx, roomId);
  const { member: me } = await requireMemberAs(ctx, viewer, room, "act");
  const target = !godId || godId === me.godId ? me : await memberOf(ctx, room._id, godId);
  if (!target) return fail("NOT_FOUND", "Member not found");
  if (target !== me) await requireOwnerAs(ctx, viewer, room);
  if (target.kind !== "human") fail("BAD_REQUEST", "AI seats always play; remove the seat instead");
  if (room.preparing && !room.preparing.error) fail("CONFLICT", "The next game is preparing with its players dealt; change this after it starts");
  if (target.spectator === spectator) return { spectator };
  if (!spectator && playersOf(await membersOf(ctx, room._id)).length >= MAX_GODS) fail("CONFLICT", "The next game already has eight players");
  await ctx.db.patch(target._id, { spectator, ...(spectator ? { ready: false } : {}) });
  await bump(ctx, room);
  return { spectator };
}

/** Advisory readiness (also available as the v3 "ready" command); players only. */
export const setReady = mutation({
  args: { roomId: v.id("rooms"), ready: v.boolean() },
  handler: async (ctx, { roomId, ready }) => {
    const room = await requireRoom(ctx, roomId);
    const { member } = await requireMember(ctx, room, "act");
    if (member.spectator) fail("BAD_REQUEST", "Spectators have no ready state; play the next game first");
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
export const CHAT_PAGE_MAX = 100;
/**
 * The room's public chat for a page's chat component: one page, newest first (usePaginatedQuery loads older pages).
 * With `gameId`, only that game's chat: the messages sent between its start and its end (a past game's chat is for
 * the gods who played in it or watched it, and the room owner). Readable by whoever may read the room, like rooms.get.
 */
export const chat = query({
  args: { roomId: v.id("rooms"), gameId: v.optional(v.id("games")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { roomId, gameId, paginationOpts }) => {
    const viewer = await requireViewer(ctx);
    const room = await requireRoom(ctx, roomId);
    requireReaderAs(viewer, room);
    let from = 0, to = Infinity;
    if (gameId) {
      const game = await ctx.db.get(gameId);
      if (!game || game.roomId !== room._id) fail("NOT_FOUND", "Game not found in this room");
      if (isHistoric(room, game)) requireHistoricReaderAs(viewer, room, game);
      from = game.createdAt; to = game.endedAt ?? Infinity;
    }
    const page = await chatWindow(ctx, room._id, from, to).paginate({ ...paginationOpts, numItems: Math.max(1, Math.min(CHAT_PAGE_MAX, Math.floor(paginationOpts.numItems))) });
    return { ...page, page: page.page.map(chatView) };
  },
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
 * The owner sets the room's AI quotas (tokens per game; 0 = none): the AI players' pool (all AI seats of a game
 * together) and each player's assistant, and the assistant's model. Any field may be left out, and they may change
 * during a game (the next reservation checks the new value). Only in rooms where AI is available (lib/aiAccess.ts).
 */
export const setAiQuotas = mutation({
  args: { roomId: v.id("rooms"), aiQuota: v.optional(v.number()), assistantQuota: v.optional(v.number()), assistantModel: v.optional(v.string()) },
  handler: async (ctx, args) => setAiQuotasFor(ctx, await requireViewer(ctx), args),
});
export const setAiQuotasAs = internalMutation({
  args: { principal: principalV, roomId: v.id("rooms"), aiQuota: v.optional(v.number()), assistantQuota: v.optional(v.number()), assistantModel: v.optional(v.string()) },
  handler: async (ctx, { principal, ...args }) => setAiQuotasFor(ctx, await viewerOf(ctx, principal), args),
});
async function setAiQuotasFor(ctx: MutationCtx, viewer: Viewer, { roomId, ...quotas }: Quotas & { roomId: string }) {
  const room = await requireRoom(ctx, roomId);
  await requireOwnerAs(ctx, viewer, room);
  await requireAiEnabled(ctx, room);
  checkQuotas(quotas);
  await bump(ctx, room, quotaPatch(quotas));
  return { aiQuota: quotas.aiQuota ?? aiQuotaOf(room), assistantQuota: quotas.assistantQuota ?? assistantQuotaOf(room), assistantModel: quotas.assistantModel ?? room.assistantModel ?? DEFAULT_AGENT_MODEL };
}

/**
 * Add an AI seat from the template library; the seat snapshots the template (name, provider, model, prompt, revision)
 * and gets its own name, unique in the room and fixed for the seat's life (lib/aiNames.ts).
 */
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
    await requireAiEnabled(ctx, room);
    if (await activeGame(ctx, room)) fail("CONFLICT", "Settings and seats are frozen during games");
    const members = await membersOf(ctx, room._id);
    if (members.length >= MAX_MEMBERS) fail("CONFLICT", `This room has reached its ${MAX_MEMBERS}-member limit`);
    if (playersOf(members).length >= MAX_GODS) fail("CONFLICT", "The next game already has eight players");
    const template = await ctx.db.query("aiTemplates").withIndex("by_template", q => q.eq("templateId", templateId)).unique();
    if (!template || template.deleted) fail("NOT_FOUND", "AI agent not found");
    const godId = `ai:${crypto.randomUUID()}`;
    const name = aiSeatName(godId, members.map(m => m.name), [template.name]);
    await ctx.db.insert("members", {
      roomId: room._id, godId, name, kind: "ai", ready: true, spectator: false, joinedAt: Date.now(), status: AI_LOBBY_STATUS,
      aiAgent: { id: template.templateId, name: template.name, provider: template.provider, model: template.model, prompt: template.prompt, revision: template.revision },
    });
    await bump(ctx, room);
    return { godId, name };
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
  if (!game && room.preparing) { await cancelPreparing(ctx, room); return { cancelled: "preparing" as const }; }
  if (!game) return fail("CONFLICT", "There is no active game to end");
  await endGame(ctx, await withEngine(ctx, game), "owner");
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
    const after = await liveGame(ctx, game._id);
    if (after?.phase === "recovery") await resumeGame(ctx, after);
    return { gameId: game._id };
}
