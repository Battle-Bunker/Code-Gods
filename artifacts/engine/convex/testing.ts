/**
 * Test-only internal functions (internal = deployment admin only), refused unless CODE_GODS_DEV is set.
 * Tests seed `users` (the auth agent owns the real login flow), steer clocks and read raw private state
 * to check scoring parity and disclosure.
 */
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { endGame, nextDeadline, scheduleTick } from "./engine/loop";
import { fail } from "./lib/errors";

const dev = () => {
  if (process.env.CODE_GODS_DEV !== "1" && process.env.CODE_GODS_TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need CODE_GODS_DEV=1 or CODE_GODS_TEST_FIXTURES=1");
};

export const seedUser = internalMutation({
  args: { subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    dev();
    const existing = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", args.subject)).unique();
    const now = Date.now();
    const doc = { subject: args.subject, name: args.name, email: args.email, emailVerified: args.emailVerified ?? false, provider: "test", updatedAt: now };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("users", doc);
    // Browser JWTs name a Better Auth session (`sessionId`) that access.ts checks: return one for impersonated
    // browser calls (test/game-helpers.ts clientFor).
    const session = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "session", data: { token: crypto.randomUUID(), userId: args.subject, expiresAt: now + 24 * 3600_000, createdAt: now, updatedAt: now } },
    }) as { _id: string };
    return session._id;
  },
});

/** Mint a player credential row; with `tokenHash` (sha256 hex of a `cgc_…` value) it also works as a bearer for POST /mcp. */
export const seedCredential = internalMutation({
  args: { subject: v.string(), roomId: v.string(), permission: v.union(v.literal("read"), v.literal("act"), v.literal("owner")), tokenHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    dev();
    const now = Date.now();
    return ctx.db.insert("credentials", { tokenHash: args.tokenHash ?? crypto.randomUUID(), subject: args.subject, roomId: args.roomId, permission: args.permission,
      label: "test", createdAt: now, expiresAt: now + 3600_000 });
  },
});

/** Patch a credential (revokedAt, expiresAt, refreshExpiresAt) to test revocation and expiry. */
export const patchCredential = internalMutation({
  args: { credentialId: v.id("credentials"), patch: v.object({ revokedAt: v.optional(v.number()), expiresAt: v.optional(v.number()), refreshExpiresAt: v.optional(v.number()) }) },
  handler: async (ctx, { credentialId, patch }) => {
    dev();
    await ctx.db.patch(credentialId, patch);
  },
});

export const setActivity = internalMutation({
  args: { at: v.number() },
  handler: async (ctx, { at }) => {
    dev();
    const doc = await ctx.db.query("activity").withIndex("by_key", q => q.eq("key", "global")).unique();
    if (doc) await ctx.db.patch(doc._id, { lastHumanActivityAt: at });
    else await ctx.db.insert("activity", { key: "global", lastHumanActivityAt: at });
  },
});

/** Patch a game (clocks, settings snapshot) and optionally restart its loop now. */
export const patchGame = internalMutation({
  args: { gameId: v.id("games"), patch: v.any(), kick: v.optional(v.boolean()) },
  handler: async (ctx, { gameId, patch, kick }) => {
    dev();
    const game = await ctx.db.get(gameId);
    if (!game) fail("NOT_FOUND", "no game");
    const next = { ...game, ...(patch as Partial<Doc<"games">>), settings: { ...game.settings, ...(patch.settings ?? {}) } };
    await ctx.db.patch(gameId, { ...(patch as Partial<Doc<"games">>), settings: next.settings });
    if (kick) await scheduleTick(ctx, { ...next, tick: game.tick }, nextDeadline(next, Date.now()));
  },
});

/** Patch a room's settings directly (bypassing the offered-instantiation check). */
export const patchRoom = internalMutation({
  args: { roomId: v.id("rooms"), settings: v.optional(v.any()), aiBudget: v.optional(v.number()) },
  handler: async (ctx, { roomId, settings, aiBudget }) => {
    dev();
    const room = await ctx.db.get(roomId);
    if (!room) fail("NOT_FOUND", "no room");
    await ctx.db.patch(roomId, { ...(settings ? { settings: { ...room.settings, ...settings }, revision: room.revision + 1 } : {}), ...(aiBudget !== undefined ? { aiBudget } : {}) });
  },
});

/** End games (all live ones when `gameIds` is omitted) so finished tests leave no loops running. */
export const endGames = internalMutation({
  args: { gameIds: v.optional(v.array(v.id("games"))) },
  handler: async (ctx, { gameIds }) => {
    dev();
    const games = gameIds
      ? (await Promise.all(gameIds.map(id => ctx.db.get(id)))).filter(g => g !== null)
      : (await Promise.all((["planning", "running", "paused", "recovery"] as const).map(phase =>
          ctx.db.query("games").withIndex("by_phase", q => q.eq("phase", phase)).take(100)))).flat();
    let ended = 0;
    for (const game of games) if (game && game.phase !== "ended") { await endGame(ctx, game, "owner"); ended++; }
    return { ended };
  },
});

/** Raw private state of a game (scores, descriptors, sources, endAtWorld) for parity checks. */
export const rawGame = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    return {
      game: await ctx.db.get(gameId),
      deities: await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      objects: await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      agents: await ctx.db.query("agents").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      batches: await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).collect(),
    };
  },
});

/** The assistant pool rows of a room (per human and the room's own row, subject ""). */
export const rawAssistantPool = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    dev();
    const room = await ctx.db.get(roomId);
    const epoch = room?.currentGameId ? String(room.currentGameId) : "lobby";
    const rows = (await ctx.db.query("assistantAllowances").collect()).filter(r => r.roomId === roomId && r.epoch === epoch);
    return { rows, roomUsd: rows.find(r => r.subject === "")?.reservedUsd ?? 0 };
  },
});

export const rawRoom = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    dev();
    return { room: await ctx.db.get(roomId), members: await ctx.db.query("members").withIndex("by_room", q => q.eq("roomId", roomId)).collect() };
  },
});
