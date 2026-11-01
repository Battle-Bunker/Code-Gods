/**
 * The in-client assistant (docs/surface-architecture.md §6): a model, paid from the room's assistant pool, that acts
 * for ONE human through their revocable `kind: "assistant"` credential and only through the agent registry.
 *
 *   mutation assistant:send     ({roomId, text, threadId?, permission?, ownerConsent?}) → {threadId, turnId}
 *   mutation assistant:cancel   ({turnId})                                              → {status}
 *   mutation assistant:confirm  ({toolCallId, decision: "approve" | "deny"})           → {status}
 *   mutation assistant:setPrefs ({roomId, autoApproveSummonBits})
 *   query    assistant:status   ({roomId})   → enabled, allowance, model, credential, active turn, prefs
 *   query    assistant:threads  ({roomId, gameId?}) → the caller's threads in the room's current game (or that earlier one)
 *   query    assistant:transcript ({roomId, gameId, threadId?}) → the caller's conversation in that game (the pane's)
 *   query    assistant:thread   ({threadId}) → the thread's turns, messages and tool calls (its human only)
 *
 * Everything the assistant works from is per (human, game): threads (with their turns, briefings, messages, tool calls
 * and cards), the allowance (ai/seats.ts) and code runs and stored objects (convex/code). Starting a game ends the last
 * game's active turns (assistant/store.ts endTurnsForNewGame), and the new game lists no thread until the human starts
 * one; an earlier game's thread can be read, never continued. The pane reads `transcript` with the game `status` names,
 * so its query's arguments change with the game, and a transcript of one game is never another's: the server answers
 * with that game's thread only, whatever thread id the client holds, and `send` refuses a game that is no longer current.
 *
 * Callers: browser sessions and player credentials of a room member (the hosted client and dev-server apps).
 * The first send creates (or reuses) the human's assistant credential for the room with the permission they chose
 * (default act; never above their own; owner only for the current owner with explicit consent). The turn loop runs
 * in assistant/step.ts and assistant/store.ts.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { touchActivity } from "./activity";
import type { Permission, Viewer } from "./auth/access";
import { credentialProblem } from "./auth/principal";
import { ASSISTANT_LOBBY as LOBBY, allowanceOf, assistantEpoch } from "./ai/seats";
import { AI_MODEL_CATALOG, DEFAULT_AGENT_MODEL } from "./lib/aiModels";
import { fail } from "./lib/errors";
import { requireMember, requireRoom } from "./lib/rooms";
import { LIMITS, isActive } from "./assistant/rules";
import { CANCEL_GRACE_MS, callsOf, denyCall, finishTurn, log, resume } from "./assistant/store";

type Ctx = QueryCtx | MutationCtx;
const permissionV = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));
const RANK: Record<Permission, number> = { read: 0, act: 1, owner: 2 };
const CREDENTIAL_MS = 30 * 24 * 3600_000;
export const ASSISTANT_LABEL = "In-client assistant";

/** The strongest assistant permission this viewer may grant in this room. */
function maxPermission(viewer: Viewer, room: Doc<"rooms">): Permission {
  const own: Permission = viewer.scope === "browser" ? "owner" : viewer.permission ?? "read";
  const capped = own === "owner" && room.ownerId !== viewer.subject ? "act" : own;
  return capped;
}

async function activeAssistantCredential(ctx: Ctx, subject: string, room: Doc<"rooms">) {
  const now = Date.now();
  const rows = await ctx.db.query("credentials").withIndex("by_subject", q => q.eq("subject", subject)).order("desc").take(200);
  return rows.filter(r => r.kind === "assistant" && r.roomId === room._id && !credentialProblem(r, room, now));
}

/**
 * The human's assistant credential for the room: reused when it is the permission wanted and within the caller's own
 * rights and lifetime, else created (replacing the others). With no permission given, the wanted one is the current
 * credential's, or act, capped at what this caller may grant.
 */
async function assistantCredential(ctx: MutationCtx, viewer: Viewer, room: Doc<"rooms">, permission: Permission | undefined, ownerConsent: boolean) {
  const active = await activeAssistantCredential(ctx, viewer.subject, room);
  const max = maxPermission(viewer, room);
  // A player-credential caller cannot outlive or exceed its own grant through the assistant.
  const own = viewer.credentialId ? await ctx.db.get(viewer.credentialId as Id<"credentials">) : null;
  const ownExpiry = Math.min(own?.expiresAt ?? Infinity, own?.refreshExpiresAt ?? Infinity);
  const lower = (p: Permission): Permission => RANK[p] <= RANK[max] ? p : max;
  const want = permission ?? lower(active[0]?.permission ?? "act");
  const current = active[0];
  if (current && current.permission === want && RANK[want] <= RANK[max] && current.expiresAt <= ownExpiry) return current._id;
  if (RANK[want] > RANK[max]) fail("FORBIDDEN", want === "owner" ? "Only the room's current owner can give the assistant owner rights" : "The assistant cannot have more rights than this connection");
  if (want === "owner" && !ownerConsent) fail("FORBIDDEN", "Owner rights for the assistant need your explicit consent");
  const now = Date.now();
  for (const old of await ctx.db.query("credentials").withIndex("by_subject", q => q.eq("subject", viewer.subject)).take(200)) {
    if (old.kind === "assistant" && old.roomId === room._id && old.revokedAt === undefined) await ctx.db.patch(old._id, { revokedAt: now });
  }
  const id = await ctx.db.insert("credentials", {
    // Never a bearer: this is no secret's sha256, so no presented token resolves to it (and /mcp accepts device rows only).
    tokenHash: `assistant:${crypto.randomUUID()}`, subject: viewer.subject, roomId: room._id, permission: want, label: ASSISTANT_LABEL,
    createdAt: now, expiresAt: Math.min(now + CREDENTIAL_MS, ownExpiry), kind: "assistant",
  });
  log("credential", { credentialId: id, roomId: room._id, permission: want });
  return id;
}

async function latestTurn(ctx: Ctx, roomId: Id<"rooms">, subject: string) {
  return ctx.db.query("assistantTurns").withIndex("by_room_subject", q => q.eq("roomId", roomId).eq("subject", subject)).order("desc").first();
}

export const send = mutation({
  args: {
    roomId: v.id("rooms"), text: v.string(), threadId: v.optional(v.id("assistantThreads")), permission: v.optional(permissionV), ownerConsent: v.optional(v.boolean()),
    /** The game the message is for (status.game, as the pane showed it): refused once another game is current. */
    gameId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await requireRoom(ctx, args.roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    const text = args.text.trim();
    if (!text || text.length > LIMITS.userTextChars) fail("BAD_REQUEST", `A message is 1 to ${LIMITS.userTextChars} characters`);
    if (!(room.assistantBudget ?? 0)) {
      fail("FORBIDDEN", "The room owner has not enabled the assistant in this room (its allowance is 0 tokens). The owner approves an assistant allowance in the room's AI budget card.");
    }
    const epoch = assistantEpoch(room);
    if (args.gameId !== undefined && args.gameId !== epoch) fail("CONFLICT", "A new game has started: your message was not sent. Send it again to start this game's conversation");
    const latest = await latestTurn(ctx, room._id, viewer.subject);
    // A turn of the last game being stopped because this one started (endTurnsForNewGame) acts no more: not a conflict.
    const ending = latest?.status === "cancelling" && (await ctx.db.get(latest.threadId))?.epoch !== epoch;
    if (latest && isActive(latest.status) && !ending) fail("CONFLICT", "Your assistant is still answering in this room: stop it or wait for it to finish");
    let threadId = args.threadId;
    if (threadId) {
      const thread = await ctx.db.get(threadId);
      if (!thread || thread.subject !== viewer.subject || thread.roomId !== room._id) fail("NOT_FOUND", "Thread not found");
      if (thread.epoch !== epoch) fail("CONFLICT", "That conversation belongs to an earlier game: start a new one for this game");
    }
    const credentialId = await assistantCredential(ctx, viewer, room, args.permission, args.ownerConsent ?? false);
    const now = Date.now();
    threadId ??= await ctx.db.insert("assistantThreads", { roomId: room._id, subject: viewer.subject, title: text.slice(0, 60), epoch, createdAt: now, updatedAt: now });
    const turnId = await ctx.db.insert("assistantTurns", {
      threadId, roomId: room._id, subject: viewer.subject, ...(room.activeGameId ? { gameId: room.activeGameId } : {}), credentialId,
      status: "running", gen: 0, step: 0, maxSteps: LIMITS.maxSteps, deadline: now + LIMITS.turnMs,
      usage: { inputTokens: 0, outputTokens: 0, reservedTokens: 0, reservedUsd: 0, billedTokens: 0 }, tools: [], createdAt: now, updatedAt: now,
    });
    const last = await ctx.db.query("assistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", threadId!)).order("desc").first();
    await ctx.db.insert("assistantMessages", { threadId, turnId, seq: (last?.seq ?? 0) + 1, role: "user", text, status: "done", createdAt: now, updatedAt: now });
    await ctx.db.patch(threadId, { activeTurnId: turnId, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.assistant.step.run, { turnId, gen: 0 });
    await touchActivity(ctx);
    log("send", { turnId, roomId: room._id, credentialId });
    return { threadId, turnId };
  },
});

/** A turn of the caller's, in a room the caller may read (a player credential reaches its own room only). */
async function ownTurn(ctx: Ctx, turnId: Id<"assistantTurns">) {
  const turn = await ctx.db.get(turnId);
  const room = turn ? await ctx.db.get(turn.roomId) : null;
  if (!turn || !room) return fail("NOT_FOUND", "Turn not found");
  const { viewer } = await requireMember(ctx, room, "read").catch(() => fail("NOT_FOUND", "Turn not found"));
  if (turn.subject !== viewer.subject) fail("NOT_FOUND", "Turn not found");
  return turn;
}

export const cancel = mutation({
  args: { turnId: v.id("assistantTurns") },
  handler: async (ctx, { turnId }) => {
    const turn = await ownTurn(ctx, turnId);
    if (!isActive(turn.status) || turn.status === "cancelling") return { status: turn.status };
    if (turn.status === "awaiting_confirmation") {
      // No step is running: end it now.
      await finishTurn(ctx, turn, "cancelled");
      return { status: "cancelled" as const };
    }
    await ctx.db.patch(turn._id, { status: "cancelling", gen: turn.gen + 1, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(CANCEL_GRACE_MS, internal.assistant.store.finalizeCancel, { turnId });
    log("cancel", { turnId });
    return { status: "cancelling" as const };
  },
});

export const confirm = mutation({
  args: { toolCallId: v.id("assistantToolCalls"), decision: v.union(v.literal("approve"), v.literal("deny")) },
  handler: async (ctx, { toolCallId, decision }) => {
    const call = await ctx.db.get(toolCallId) ?? fail("NOT_FOUND", "Tool call not found");
    const turn = await ownTurn(ctx, call.turnId).catch(() => fail("NOT_FOUND", "Tool call not found"));
    // A decision on a call that no longer waits (replayed, timed out, or the turn ended) changes nothing.
    if (call.status !== "awaiting_confirmation" || turn.status !== "awaiting_confirmation") return { status: call.status };
    if (decision === "approve") {
      await ctx.db.patch(call._id, { status: "pending", approved: true, updatedAt: Date.now() });
      log("confirm.approve", { turnId: turn._id, callDocId: call._id, tool: call.tool });
    } else await denyCall(ctx, call, "player");
    await resume(ctx, turn);
    return { status: decision === "approve" ? "pending" as const : "denied" as const };
  },
});

export const setPrefs = mutation({
  args: { roomId: v.id("rooms"), autoApproveSummonBits: v.number() },
  handler: async (ctx, { roomId, autoApproveSummonBits }) => {
    const room = await requireRoom(ctx, roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    if (!Number.isFinite(autoApproveSummonBits) || autoApproveSummonBits < 0 || autoApproveSummonBits > 100_000) fail("BAD_REQUEST", "Auto-approve is 0 to 100,000 bits (0 = always ask)");
    const doc = await ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", room._id).eq("subject", viewer.subject)).unique();
    if (doc) await ctx.db.patch(doc._id, { autoApproveSummonBits });
    else await ctx.db.insert("assistantPrefs", { roomId: room._id, subject: viewer.subject, autoApproveSummonBits });
    return { autoApproveSummonBits };
  },
});

export const status = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await requireRoom(ctx, roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    const allowance = await allowanceOf(ctx, room, viewer.subject);
    const [credential] = await activeAssistantCredential(ctx, viewer.subject, room);
    const latest = await latestTurn(ctx, room._id, viewer.subject);
    // A turn of an earlier game (ending after the next game started) is not this game's active turn.
    const latestThread = latest && isActive(latest.status) ? await ctx.db.get(latest.threadId) : null;
    const prefs = await ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", room._id).eq("subject", viewer.subject)).unique();
    const model = AI_MODEL_CATALOG.find(m => m.id === (room.assistantModel ?? DEFAULT_AGENT_MODEL));
    return {
      enabled: allowance.limit > 0,
      /** The game the assistant works in now: the room's current game id, or "lobby" (transcript's and send's gameId). */
      game: allowance.epoch,
      allowance: { limit: allowance.limit, used: allowance.used, epoch: allowance.epoch },
      model: model ? { id: model.id, label: model.label, provider: model.provider } : null,
      credential: credential ? { credentialId: credential._id, permission: credential.permission, expiresAt: credential.expiresAt } : null,
      activeTurn: latest && latestThread?.epoch === allowance.epoch ? { turnId: latest._id, threadId: latest.threadId, status: latest.status } : null,
      isOwner: room.ownerId === viewer.subject, maxPermission: maxPermission(viewer, room),
      autoApproveSummonBits: prefs?.autoApproveSummonBits ?? 0,
    };
  },
});

/** A thread's game as the client sees it: the game id, or null before the room's first game. */
const gameOf = (epoch: string | undefined) => epoch && epoch !== LOBBY ? epoch : null;

/** The thread key of a game of this room named by a client: "lobby", or a game of this room (never another room's). */
async function gameKey(ctx: QueryCtx, room: Doc<"rooms">, gameId: string) {
  if (gameId === LOBBY) return LOBBY;
  const id = ctx.db.normalizeId("games", gameId);
  const game = id ? await ctx.db.get(id) : null;
  if (!game || game.roomId !== room._id) fail("NOT_FOUND", "No such game in this room");
  return String(game._id);
}

export const threads = query({
  args: { roomId: v.id("rooms"), gameId: v.optional(v.string()) },
  handler: async (ctx, { roomId, gameId }) => {
    const room = await requireRoom(ctx, roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    // Default: the current game. An earlier game of this room: a replay reads its conversations.
    const epoch = gameId === undefined ? assistantEpoch(room) : await gameKey(ctx, room, gameId);
    const rows = await ctx.db.query("assistantThreads").withIndex("by_room_subject_epoch", q => q.eq("roomId", room._id).eq("subject", viewer.subject).eq("epoch", epoch)).order("desc").take(20);
    return rows.map(t => ({ _id: t._id, title: t.title, gameId: gameOf(t.epoch), createdAt: t.createdAt, updatedAt: t.updatedAt, activeTurnId: t.activeTurnId ?? null }));
  },
});

export const thread = query({
  args: { threadId: v.id("assistantThreads") },
  handler: async (ctx, { threadId }) => {
    const thread = await ctx.db.get(threadId);
    const room = thread ? await ctx.db.get(thread.roomId) : null;
    if (!thread || !room) return fail("NOT_FOUND", "Thread not found");
    const { viewer } = await requireMember(ctx, room, "read").catch(() => fail("NOT_FOUND", "Thread not found"));
    if (thread.subject !== viewer.subject) fail("NOT_FOUND", "Thread not found");
    return threadView(ctx, thread);
  },
});

/**
 * The caller's conversation in one game of the room (the assistant pane's subscription, with status.game): `threadId`
 * when it is theirs in that game, else that game's thread with an active turn, else its latest; `thread: null` and no
 * rows when the game has none. A thread of another game is never answered, so a client still naming the last game's
 * thread gets this game's (or none).
 */
export const transcript = query({
  args: { roomId: v.id("rooms"), gameId: v.string(), threadId: v.optional(v.id("assistantThreads")) },
  handler: async (ctx, { roomId, gameId, threadId }) => {
    const room = await requireRoom(ctx, roomId);
    const { viewer } = await requireMember(ctx, room, "read");
    const epoch = await gameKey(ctx, room, gameId);
    const named = threadId ? await ctx.db.get(threadId) : null;
    const rows = named ? [] : await ctx.db.query("assistantThreads").withIndex("by_room_subject_epoch", q => q.eq("roomId", room._id).eq("subject", viewer.subject).eq("epoch", epoch)).order("desc").take(20);
    const thread = named && named.subject === viewer.subject && named.roomId === room._id && named.epoch === epoch ? named
      : named ? null : rows.find(t => t.activeTurnId) ?? rows[0] ?? null;
    return thread ? threadView(ctx, thread) : { thread: null, turns: [], messages: [], toolCalls: [] };
  },
});

async function threadView(ctx: QueryCtx, thread: Doc<"assistantThreads">) {
  const threadId = thread._id;
  const turns = (await ctx.db.query("assistantTurns").withIndex("by_thread", q => q.eq("threadId", threadId)).order("desc").take(20)).reverse();
  const messages = (await ctx.db.query("assistantMessages").withIndex("by_thread_seq", q => q.eq("threadId", threadId)).order("desc").take(100)).reverse();
  const toolCalls = (await Promise.all(turns.map(t => callsOf(ctx, t._id)))).flat();
  return {
    thread: { _id: thread._id, title: thread.title, gameId: gameOf(thread.epoch), createdAt: thread.createdAt, updatedAt: thread.updatedAt, activeTurnId: thread.activeTurnId },
    turns: turns.map(t => ({
      _id: t._id, status: t.status, step: t.step, maxSteps: t.maxSteps, deadline: t.deadline, usage: t.usage, tools: t.tools, credentialId: t.credentialId,
      error: t.error ?? null, createdAt: t.createdAt, finishedAt: t.finishedAt ?? null,
    })),
    messages: messages.map(m => ({
      _id: m._id, turnId: m.turnId, seq: m.seq, role: m.role, text: m.text, status: m.status,
      reservedTokens: m.reservedTokens ?? null, inputTokens: m.inputTokens ?? null, outputTokens: m.outputTokens ?? null,
      cacheReadTokens: m.cacheReadTokens ?? null, cacheWriteTokens: m.cacheWriteTokens ?? null, billedTokens: m.billedTokens ?? null,
      inputEstimate: m.inputEstimate ?? null, usageEstimated: m.usageEstimated ?? false, createdAt: m.createdAt,
    })),
    toolCalls: toolCalls.map(c => ({
      _id: c._id, turnId: c.turnId, messageId: c.messageId, callId: c.callId, index: c.index, tool: c.tool, argsJson: c.argsJson, status: c.status,
      summary: c.summary, resultJson: c.resultJson ?? null, commandId: c.commandId ?? null, confirmDeadline: c.confirmDeadline ?? null,
    })),
  };
}
