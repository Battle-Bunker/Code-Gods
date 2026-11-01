/**
 * Test-only internal functions (internal = deployment admin only), refused unless DEV is set.
 * Tests seed `users` (the auth agent owns the real login flow), steer clocks and read raw private state
 * to check scoring parity and disclosure.
 */
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { endGame, nextDeadline, scheduleTick } from "./engine/loop";
import { fail } from "./lib/errors";
import { seed as seedSetups } from "./setups";

const dev = () => {
  if (process.env.DEV !== "1" && process.env.TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need DEV=1 or TEST_FIXTURES=1");
};

export const seedUser = internalMutation({
  args: { subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.optional(v.boolean()), provider: v.optional(v.literal("fake")) },
  handler: async (ctx, args) => {
    dev();
    const existing = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", args.subject)).unique();
    const now = Date.now();
    // provider "fake" with a verified ADMIN_EMAILS address makes an admin (auth/identity.ts isAdminUser; dev.mjs allows admin@example.test).
    const doc = { subject: args.subject, name: args.name, email: args.email, emailVerified: args.emailVerified ?? false, provider: args.provider ?? "test", updatedAt: now };
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

/** Empty the retired `panelLayouts` table so a follow-up can drop it from the schema (docs/ui-redesign.md §2.4). */
export const clearPanelLayouts = internalMutation({
  args: {},
  handler: async ctx => {
    dev();
    let cleared = 0;
    for (const row of await ctx.db.query("panelLayouts").take(1000)) { await ctx.db.delete(row._id); cleared++; }
    return { cleared };
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

/** Put the system setups back as shipped (the seed sync does exactly that). */
export const resetSeedSetups = internalMutation({
  args: {},
  handler: async ctx => { dev(); await seedSetups(ctx); },
});

/**
 * Put a room, game or setup back into its pre-setups-v2 shape (raw `settings`; for rooms and games a legacy
 * `settingsOrigin` and no setupId), so the migration test (test/game-migration.test.ts) has legacy documents to migrate.
 */
export const makeLegacy = internalMutation({
  args: { roomId: v.optional(v.id("rooms")), gameId: v.optional(v.id("games")), setupId: v.optional(v.id("gameSetups")), settings: v.any(), settingsOrigin: v.optional(v.any()) },
  handler: async (ctx, { roomId, gameId, setupId, settings, settingsOrigin }) => {
    dev();
    const legacy = { settings, settingsOrigin, setupId: undefined, setupName: undefined };
    if (roomId) await ctx.db.patch(roomId, legacy);
    const game = gameId ? await ctx.db.get(gameId) : null;
    if (game) {
      const summary = game.summary as Record<string, unknown> | undefined;
      const { setup: _s, ...rest } = summary ?? {};
      await ctx.db.patch(game._id, { ...legacy, ...(summary ? { summary: { ...rest, settings, settingsOrigin } } : {}) });
    }
    if (setupId) await ctx.db.patch(setupId, { settings });
  },
});

/**
 * The assistant state of one human as it was before (player, game) keys (the assistant-per-game migration's input):
 * threads and stored objects without an epoch, one usage total, and optionally `merge`'s second thread folded into its
 * first (a conversation continued across games, as the client once allowed).
 */
export const makeAssistantLegacy = internalMutation({
  args: { subject: v.string(), merge: v.optional(v.array(v.id("assistantThreads"))) },
  handler: async (ctx, { subject, merge }) => {
    dev();
    if (merge) {
      const [keep, from] = merge;
      for (const turn of await ctx.db.query("assistantTurns").withIndex("by_thread", q => q.eq("threadId", from)).collect()) {
        await ctx.db.patch(turn._id, { threadId: keep });
        for (const m of await ctx.db.query("assistantMessages").withIndex("by_turn", q => q.eq("turnId", turn._id)).collect()) await ctx.db.patch(m._id, { threadId: keep });
        for (const c of await ctx.db.query("assistantToolCalls").withIndex("by_turn", q => q.eq("turnId", turn._id)).collect()) await ctx.db.patch(c._id, { threadId: keep });
      }
      await ctx.db.delete(from);
    }
    for (const t of await ctx.db.query("assistantThreads").collect()) if (t.subject === subject) await ctx.db.patch(t._id, { epoch: undefined });
    let objects = 0, bytes = 0;
    for (const r of await ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", subject)).collect()) {
      await ctx.db.patch(r._id, { epoch: undefined });
      if (!r.key.startsWith("runs/")) { objects++; bytes += r.bytes; }
    }
    for (const u of await ctx.db.query("codeObjectUsage").withIndex("by_subject", q => q.eq("subject", subject)).collect()) await ctx.db.delete(u._id);
    await ctx.db.insert("codeObjectUsage", { subject, objects, bytes });
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

/** Forget that an OAuth client was used, as for a client registered before `usedAt` existed. */
export const forgetClientUse = internalMutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    dev();
    const row = await ctx.db.query("oauthClients").withIndex("by_client", q => q.eq("clientId", clientId)).unique();
    if (row) await ctx.db.patch(row._id, { usedAt: undefined });
  },
});

/** Insert chat messages that all share one timestamp (paging must neither skip nor repeat them). */
export const seedChat = internalMutation({
  args: { roomId: v.id("rooms"), authorId: v.string(), texts: v.array(v.string()), timestamp: v.number() },
  handler: async (ctx, { roomId, authorId, texts, timestamp }) => {
    dev();
    for (const text of texts) await ctx.db.insert("chat", { roomId, authorId, authorName: authorId, kind: "human", text, timestamp });
  },
});

/** Make an AI seat look as it did before seat names: named after its template, with a chat line under that name. */
export const legacyAiSeat = internalMutation({
  args: { roomId: v.id("rooms"), godId: v.string(), chat: v.optional(v.string()) },
  handler: async (ctx, { roomId, godId, chat }) => {
    dev();
    const seat = await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", roomId).eq("godId", godId)).unique();
    if (!seat?.aiAgent) fail("NOT_FOUND", "no AI seat");
    await ctx.db.patch(seat._id, { name: seat.aiAgent.name });
    if (chat) await ctx.db.insert("chat", { roomId, authorId: godId, authorName: seat.aiAgent.name, kind: "ai", text: chat, timestamp: Date.now() });
  },
});

/** `count` examinations of `godId` in `roomId`, `ageMs` ago (game/commands.ts claimExamination's window). */
export const seedExaminations = internalMutation({
  args: { roomId: v.id("rooms"), godId: v.string(), count: v.number(), ageMs: v.number() },
  handler: async (ctx, { roomId, godId, count, ageMs }) => {
    dev();
    for (let i = 0; i < count; i++) await ctx.db.insert("examinations", { roomId, godId, at: Date.now() - ageMs });
  },
});

/** Move a god's recorded examinations `byMs` into the past. */
export const ageExaminations = internalMutation({
  args: { roomId: v.id("rooms"), godId: v.string(), byMs: v.number() },
  handler: async (ctx, { roomId, godId, byMs }) => {
    dev();
    for (const row of await ctx.db.query("examinations").withIndex("by_room_god_at", q => q.eq("roomId", roomId).eq("godId", godId)).take(500)) {
      await ctx.db.patch(row._id, { at: row.at - byMs });
    }
  },
});
