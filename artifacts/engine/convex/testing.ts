/**
 * Test-only internal functions (internal = deployment admin only), refused unless DEV is set.
 * Tests seed `users` (the auth agent owns the real login flow), steer clocks and read raw private state
 * to check scoring parity and disclosure.
 */
import { storedLanguageV } from "./lib/language";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { endGame, nextDeadline, scheduleTick } from "./engine/loop";
import { clockDoc, engineDoc, liveGame, withEngine, writeGame, type LiveGame } from "./game/state";
import { fail } from "./lib/errors";
import { shortCodeFor } from "./lib/rooms";
import { listingOf, seed as seedSetups } from "./setups";
import { openTurn } from "./assistant/turns";

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
  args: { gameId: v.id("games"), patch: v.any(), kick: v.optional(v.boolean()), unsetSettings: v.optional(v.array(v.string())) },
  handler: async (ctx, { gameId, patch, kick, unsetSettings }) => {
    dev();
    const game = await liveGame(ctx, gameId);
    if (!game) return fail("NOT_FOUND", "no game");
    // `unsetSettings` removes fields, to stage a game stored before a setting existed (settings merge, so a patch cannot).
    const settings = { ...game.settings, ...(patch.settings ?? {}) } as Record<string, unknown>;
    for (const key of unsetSettings ?? []) delete settings[key];
    const next = await writeGame(ctx, game, { ...(patch as Partial<LiveGame>), settings: settings as LiveGame["settings"] });
    if (kick) await scheduleTick(ctx, { ...next, tick: game.tick }, nextDeadline(next, Date.now()));
  },
});

/** Patch a room's settings directly (bypassing the offered-instantiation check). */
export const patchRoom = internalMutation({
  args: { roomId: v.id("rooms"), settings: v.optional(v.any()) },
  handler: async (ctx, { roomId, settings }) => {
    dev();
    const room = await ctx.db.get(roomId);
    if (!room) fail("NOT_FOUND", "no room");
    await ctx.db.patch(roomId, { ...(settings ? { settings: { ...room.settings, ...settings }, revision: room.revision + 1 } : {}) });
  },
});

/** Give an agent a stored language (e.g. a retired one, as a past game's agent may carry). */
export const patchAgentLanguage = internalMutation({
  args: { agentId: v.id("agents"), language: storedLanguageV },
  handler: async (ctx, { agentId, language }) => {
    dev();
    await ctx.db.patch(agentId, { language });
  },
});

/** An agent as the tick stored it while agents had a rate cap of their own: with `lastOpportunityWorld` (test/game-schema-migrations.test.ts). */
export const legacyAgentOpportunity = internalMutation({
  args: { agentId: v.id("agents"), world: v.number() },
  handler: async (ctx, { agentId, world }) => {
    dev();
    await ctx.db.patch(agentId, { lastOpportunityWorld: world });
  },
});

/**
 * A system Lab setup as the seed sync would store one declared in game-core LAB_SETUPS (which may be empty), so the
 * tests of who may see one never depend on which experiments are shipped today. The next seed sync removes it.
 */
export const seedLabSetup = internalMutation({
  args: { seedId: v.string(), name: v.string(), settings: v.any() },
  handler: async (ctx, { seedId, name, settings }) => {
    dev();
    const now = Date.now(), summary = "An experiment for the tests";
    const fields = { ownerId: null, name, summary, seedId, lab: true };
    return await ctx.db.insert("gameSetups", { ...fields, settings, createdAt: now, updatedAt: now, ...listingOf(fields, "System") });
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
    for (const game of games) if (game && game.phase !== "ended") { await endGame(ctx, await withEngine(ctx, game), "owner"); ended++; }
    return { ended };
  },
});

/** Put an ended game back into its shape from before stored replays (no file), for migrations:backfillReplays' test. */
export const forgetReplay = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    const game = await ctx.db.get(gameId);
    if (!game) return fail("NOT_FOUND", "no game");
    if (game.replayStorageId) await ctx.storage.delete(game.replayStorageId);
    await ctx.db.patch(gameId, { replayStorageId: undefined });
  },
});

/**
 * Give a game's gods these utilities (one per god in roster order, repeating). Their stored cards lose their typed
 * params, which described the previous deal (the cards' text is left as it was).
 */
export const dealUtilities = internalMutation({
  args: { gameId: v.id("games"), utilities: v.array(v.any()) },
  handler: async (ctx, { gameId, utilities }) => {
    dev();
    const deities = (await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).take(16)).sort((a, b) => a.index - b.index);
    for (const [i, d] of deities.entries()) {
      const { params: _previous, ...card } = (d.card ?? {}) as { params?: unknown };
      await ctx.db.patch(d._id, { utility: utilities[i % utilities.length], card });
    }
  },
});

/** An ended game's stored replay file, parsed (null when it has none). */
export const replayFile = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    dev();
    const blob = await ctx.storage.get(storageId);
    return blob ? JSON.parse(await blob.text()) : null;
  },
});

/** A setup as stored. */
export const rawSetupDoc = internalQuery({
  args: { setupId: v.id("gameSetups") },
  handler: async (ctx, { setupId }) => { dev(); return await ctx.db.get(setupId); },
});

/** The games row as stored (no clock or engine merged in). */
export const rawGameDoc = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => { dev(); return await ctx.db.get(gameId); },
});

/** A game's futile-pair memos (engine only, lib/futility.ts). */
export const futileActs = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => { dev(); return await ctx.db.query("futileActs").withIndex("by_game", q => q.eq("gameId", gameId)).collect(); },
});

/** Raw private state of a game (scores, descriptors, sources, endAtWorld) for parity checks. */
export const rawGame = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    return {
      // With its clock and engine state (game/state.ts).
      game: await liveGame(ctx, gameId),
      deities: await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      objects: await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      agents: await ctx.db.query("agents").withIndex("by_game", q => q.eq("gameId", gameId)).collect(),
      batches: await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).collect(),
      objectEvents: await ctx.db.query("objectEvents").withIndex("by_game_world", q => q.eq("gameId", gameId)).collect(),
    };
  },
});

/** A game's objects as stored before they carried createdAt and lastMutatedAt (test/game-object-times.test.ts). */
export const legacyObjectTimes = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    const rows = await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(2100);
    for (const o of rows) await ctx.db.patch(o._id, { createdAt: undefined, lastMutatedAt: undefined });
    return rows.length;
  },
});

/** A game's engine counters (the query-cost gate waits for tick commits with it): one small read, unlike rawGame. */
export const gameCounters = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    const live = await liveGame(ctx, gameId);
    return live && { phase: live.phase, worldSeconds: live.worldSeconds, objectCount: live.objectCount, commits: live.stats.commits };
  },
});

/**
 * The loop's own counters of several games in one read (test/load-harness.ts polls it each second): the phase, the
 * lease, commits and discards, world time and the wall times the lateness measures need. Read-only.
 */
export const loadProbe = internalQuery({
  args: { gameIds: v.array(v.id("games")) },
  handler: async (ctx, { gameIds }) => {
    dev();
    const games = await Promise.all(gameIds.map(id => liveGame(ctx, id)));
    return { now: Date.now(), games: games.map(g => g && {
      id: g._id, phase: g.phase, seq: g.tick.seq, leaseUntil: g.tick.leaseUntil, commits: g.stats.commits, discarded: g.stats.discarded,
      acts: g.stats.acts, tickFailures: g.tickFailures ?? 0, worldSeconds: g.worldSeconds, lastTick: g.lastTick, endAtWorld: g.endAtWorld,
      createdAt: g.createdAt, planningEndsAt: g.planningEndsAt, endedAt: g.endedAt ?? null, endReason: g.endReason ?? null,
      holdState: g.holdState ?? null, engineError: g.engineError ?? null, agentCount: g.agentCount, objectCount: g.objectCount,
    }) };
  },
});

/**
 * Store a game as it was before the standings read model (migrations:backfillStandings): no standings or history rows.
 */
export const legacyReadModels = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    for (const r of await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", gameId)).collect()) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", gameId)).collect()) await ctx.db.delete(r._id);
  },
});

/** A game's read-model rows as stored: standings, history, and each object's publicSalience. */
export const rawReadModels = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    const strip = <D extends { _id: unknown; _creationTime: number }>({ _id, _creationTime, ...rest }: D) => rest;
    return {
      standings: (await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", gameId)).collect()).map(strip).sort((a, b) => a.godId.localeCompare(b.godId)),
      history: (await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", gameId)).collect()).map(strip),
      objects: (await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).collect())
        .map(o => ({ id: o._id, salience: o.salience, noise: o.noise ?? 0, publicSalience: o.publicSalience })),
    };
  },
});

/** The latest stored compilations (runtime/programs.ts), newest first. */
export const compiledProgramsLatest = internalQuery({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    dev();
    const rows = await ctx.db.query("compiledPrograms").withIndex("by_compiledAt").order("desc").take(count);
    return rows.map(row => ({ chars: row.js.length, inspection: row.inspection, error: row.error ?? null }));
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

/** An assistant turn's raw row (its generation and status), to race its step mutations. */
export const rawAssistantTurn = internalQuery({
  args: { turnId: v.id("assistantTurns") },
  handler: async (ctx, { turnId }) => {
    dev();
    const turn = await ctx.db.get(turnId);
    return { gen: turn?.gen ?? -1, status: turn?.status ?? null };
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

/**
 * A room with a long history (test/game-perf.test.ts): `copies` copies of one of its ended games, each with the game's
 * deities, agents, objects (object ids remapped; agent and deity references in the log still name the source game's),
 * event log (tick batches and object events) and its chat. History for the hot queries to ignore, not a replayable
 * game. One call writes `copies` (at most 10) × the game's rows; call it repeatedly for more. A game too big to copy
 * whole is refused, never copied in part.
 */
export const cloneEndedGame = internalMutation({
  args: { gameId: v.id("games"), copies: v.number() },
  handler: async (ctx, { gameId, copies }) => {
    dev();
    const game = await ctx.db.get(gameId);
    if (game?.phase !== "ended") fail("CONFLICT", "only an ended game is cloned");
    if (!Number.isInteger(copies) || copies < 1 || copies > 10) fail("BAD_REQUEST", "copies is 1 to 10 per call");
    const all = <T>(rows: T[], max: number, what: string) => rows.length > max ? fail("CONFLICT", `the game has over ${max} ${what}: too big to clone`) : rows;
    const deities = all(await ctx.db.query("deities").withIndex("by_game", q => q.eq("gameId", gameId)).take(9), 8, "deities");
    const agents = all(await ctx.db.query("agents").withIndex("by_game", q => q.eq("gameId", gameId)).take(201), 200, "agents");
    const objects = all(await ctx.db.query("objects").withIndex("by_game", q => q.eq("gameId", gameId)).take(501), 500, "objects");
    const batches = all(await ctx.db.query("tickBatches").withIndex("by_game_seq", q => q.eq("gameId", gameId)).take(501), 500, "tick batches");
    const events = all(await ctx.db.query("objectEvents").withIndex("by_game_world", q => q.eq("gameId", gameId)).take(1001), 1000, "object events");
    const chat = all(await ctx.db.query("chat").withIndex("by_room", q => q.eq("roomId", game.roomId)).take(1001), 1000, "chat messages in its room")
      .filter(m => m.gameId === gameId);
    const standings = all(await ctx.db.query("standings").withIndex("by_game", q => q.eq("gameId", gameId)).take(9), 8, "standings");
    const history = all(await ctx.db.query("standingsHistory").withIndex("by_game_seq", q => q.eq("gameId", gameId)).take(1001), 1000, "scoreboard publications");
    const strip = <D extends { _id: unknown; _creationTime: number }>({ _id, _creationTime, ...rest }: D) => rest;
    const [clock, engine] = [await clockDoc(ctx, gameId), await engineDoc(ctx, gameId)];
    if (!clock || !engine) fail("CONFLICT", "the game has no clock or engine document");
    for (let i = 0; i < copies; i++) {
      const guid = crypto.randomUUID();
      // A clone has no stored replay of its own (the source's file names the source game).
      const id = await ctx.db.insert("games", { ...strip(game), replayStorageId: undefined, guid, ...await shortCodeFor(ctx, "games", guid) });
      await ctx.db.insert("gameClocks", { ...strip(clock!), gameId: id });
      await ctx.db.insert("gameEngine", { ...strip(engine!), gameId: id });
      for (const d of deities) await ctx.db.insert("deities", { ...strip(d), gameId: id });
      for (const a of agents) await ctx.db.insert("agents", { ...strip(a), gameId: id });
      const objectIds = new Map<string, Doc<"objects">["_id"]>();
      for (const o of objects) objectIds.set(o._id, await ctx.db.insert("objects", { ...strip(o), gameId: id }));
      for (const b of batches) await ctx.db.insert("tickBatches", { ...strip(b), gameId: id });
      for (const e of events) await ctx.db.insert("objectEvents", { ...strip(e), gameId: id, objectId: objectIds.get(e.objectId) ?? e.objectId });
      for (const m of chat) await ctx.db.insert("chat", { ...strip(m), gameId: id });
      for (const s of standings) await ctx.db.insert("standings", { ...strip(s), gameId: id });
      for (const h of history) await ctx.db.insert("standingsHistory", { ...strip(h), gameId: id });
    }
    return { games: copies, batches: batches.length, events: events.length, objects: objects.length, chat: chat.length };
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

/** Kill an AI seat's turn chain as a dead turn action would: its scheduled turn is stale and none follows; `dueAgoMs` ago. */
export const killAiChain = internalMutation({
  args: { roomId: v.id("rooms"), godId: v.string(), dueAgoMs: v.number() },
  handler: async (ctx, { roomId, godId, dueAgoMs }) => {
    dev();
    const seat = await ctx.db.query("members").withIndex("by_room_god", q => q.eq("roomId", roomId).eq("godId", godId)).unique();
    if (!seat?.aiAgent) fail("NOT_FOUND", "no AI seat");
    await ctx.db.patch(seat._id, { aiChain: (seat.aiChain ?? 0) + 1, aiNextAt: Date.now() - dueAgoMs });
    return (seat.aiChain ?? 0) + 1;
  },
});

/** The examination cache's most recently used program (engine/examinationCache.ts): how many runs it remembers, and since when. */
export const latestExaminationRuns = internalQuery({
  args: {},
  handler: async (ctx) => {
    dev();
    const row = await ctx.db.query("examinationRuns").withIndex("by_usedAt").order("desc").first();
    return row ? { key: row.key, runs: row.runs.length, usedAt: row.usedAt, fields: Object.keys(row).sort() } : null;
  },
});

/** A room's member rows as stored (rooms.get defaults what it projects). */
export const rawMembers = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => { dev(); return ctx.db.query("members").withIndex("by_room", q => q.eq("roomId", roomId)).collect(); },
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

/** The agent sandbox readiness rows (runtime/readiness.ts), raw. */
export const sandboxes = internalQuery({
  args: {},
  handler: async ctx => { dev(); return ctx.db.query("runtimeReadiness").take(16); },
});

/**
 * Put a language's readiness row in a state (as if a boot were in flight, or had failed at `attemptAt`). Only the fields
 * given change; the row must exist (warm it first).
 */
export const setSandbox = internalMutation({
  args: { language: v.string(), patch: v.any() },
  handler: async (ctx, { language, patch }) => {
    dev();
    const row = await ctx.db.query("runtimeReadiness").filter(q => q.eq(q.field("language"), language)).first();
    if (!row) fail("NOT_FOUND", "no readiness row: warm the language first");
    await ctx.db.patch(row._id, patch as Partial<Doc<"runtimeReadiness">>);
    return ctx.db.get(row._id);
  },
});

/** Point a game at a pinned-tables file (engine/pinned.ts), or unpin it (no `storageId`: its next tick pins again). */
export const setGameTables = internalMutation({
  args: { gameId: v.id("games"), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { gameId, storageId }) => {
    dev();
    const game = await ctx.db.get(gameId);
    if (!game) return fail("NOT_FOUND", "no game");
    await ctx.db.patch(gameId, { tablesStorageId: storageId });
    return game.tablesStorageId ?? null;
  },
});

/** A file that is not a pinned-tables file: a game pointed at it fails every tick (test/game-deploy-survival). */
export const junkFile = internalAction({
  args: {},
  handler: async (ctx) => { dev(); return ctx.storage.store(new Blob(["{}"], { type: "application/json" })); },
});

/**
 * Hide (or show again) an instantiation's shipped calibration file, as a deploy whose new code re-keys the tables
 * finds it before upload-calibration: the row is renamed, the file kept. Engine processes notice within the index TTL.
 */
export const hideCalibration = internalMutation({
  args: { instance: v.string(), hidden: v.boolean() },
  handler: async (ctx, { instance, hidden }) => {
    dev();
    const from = hidden ? instance : `hidden:${instance}`, to = hidden ? `hidden:${instance}` : instance;
    const row = await ctx.db.query("calibrationFiles").withIndex("by_instance", q => q.eq("instance", from)).unique();
    if (row) await ctx.db.patch(row._id, { instance: to });
    return !!row;
  },
});

/** A human's raw assistant prefs row in a room (its mode and autopilot chain), or null. */
export const rawAssistantPrefs = internalQuery({
  args: { roomId: v.id("rooms"), subject: v.string() },
  handler: async (ctx, { roomId, subject }) => {
    dev();
    return ctx.db.query("assistantPrefs").withIndex("by_key", q => q.eq("roomId", roomId).eq("subject", subject)).unique();
  },
});

/** Set a human's assistant usage in the room's current game (the autopilot's budget stop). */
export const setAssistantUsed = internalMutation({
  args: { roomId: v.id("rooms"), subject: v.string(), usedTokens: v.number() },
  handler: async (ctx, { roomId, subject, usedTokens }) => {
    dev();
    const room = await ctx.db.get(roomId);
    const epoch = room?.currentGameId ? String(room.currentGameId) : "lobby";
    const row = await ctx.db.query("assistantAllowances").withIndex("by_key", q => q.eq("roomId", roomId).eq("subject", subject).eq("epoch", epoch)).unique();
    if (row) await ctx.db.patch(row._id, { usedTokens });
    else await ctx.db.insert("assistantAllowances", { roomId, subject, epoch, usedTokens, calls: [] });
  },
});

/**
 * Open an autopilot turn whose engine prompt is `text` (a `/mock` script, so a test can make it slow) in the human's
 * latest thread of the game, as assistant/autopilot.ts tick does with its fixed prompt.
 */
export const openAutopilotTurn = internalMutation({
  args: { roomId: v.id("rooms"), subject: v.string(), text: v.string() },
  handler: async (ctx, { roomId, subject, text }) => {
    dev();
    const room = await ctx.db.get(roomId) ?? fail("NOT_FOUND", "Room not found");
    const epoch = room.currentGameId ? String(room.currentGameId) : "lobby";
    const thread = await ctx.db.query("assistantThreads").withIndex("by_room_subject_epoch", q => q.eq("roomId", roomId).eq("subject", subject).eq("epoch", epoch)).order("desc").first()
      ?? fail("NOT_FOUND", "No thread in this game");
    const cred = (await ctx.db.query("credentials").withIndex("by_subject", q => q.eq("subject", subject)).order("desc").collect())
      .find(c => c.kind === "assistant" && c.roomId === roomId && c.revokedAt === undefined) ?? fail("NOT_FOUND", "No assistant credential");
    const turnId = await openTurn(ctx, { room, threadId: thread._id, subject, credentialId: cred._id, trigger: "autopilot" }, [{ text, autopilot: true }]);
    return { threadId: thread._id, turnId };
  },
});

/** One god's object rows and totals as stored (game/objectViews.ts; test/game-object-views.test.ts). */
export const rawObjectViews = internalQuery({
  args: { gameId: v.id("games"), godId: v.string() },
  handler: async (ctx, { gameId, godId }) => {
    dev();
    return {
      rows: await ctx.db.query("objectViews").withIndex("by_game_god_payoff", q => q.eq("gameId", gameId).eq("godId", godId)).collect(),
      totals: await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", godId)).first(),
    };
  },
});

/** Store a game as it was before the per-god read model (migrations.backfillObjectViews): no rows, no totals. */
export const forgetObjectViews = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    dev();
    const game = await ctx.db.get(gameId) ?? fail("NOT_FOUND", "no game");
    for (const { id } of game.roster) {
      for (const r of await ctx.db.query("objectViews").withIndex("by_game_god_payoff", q => q.eq("gameId", gameId).eq("godId", id)).collect()) await ctx.db.delete(r._id);
      for (const t of await ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", id)).collect()) await ctx.db.delete(t._id);
    }
  },
});

/** Make one god's row of one object stale, as a lost sync would leave it. */
export const staleObjectView = internalMutation({
  args: { objectId: v.id("objects"), godId: v.string(), payoff: v.number() },
  handler: async (ctx, { objectId, godId, payoff }) => {
    dev();
    const row = await ctx.db.query("objectViews").withIndex("by_object_god", q => q.eq("objectId", objectId).eq("godId", godId)).first()
      ?? fail("NOT_FOUND", "no row");
    await ctx.db.patch(row._id, { payoff });
  },
});

/** Remove a game's gameEngine row (returns it), or put a removed one back: a game whose state cannot be loaded. */
export const detachEngine = internalMutation({
  args: { gameId: v.id("games"), restore: v.optional(v.any()) },
  handler: async (ctx, { gameId, restore }) => {
    dev();
    if (restore) { await ctx.db.insert("gameEngine", { ...restore, gameId }); return null; }
    const row = await engineDoc(ctx, gameId);
    if (!row) return null;
    await ctx.db.delete(row._id);
    const { _id, _creationTime, ...fields } = row;
    return fields;
  },
});

/** Set a god's own energy (its account settled at the game's world time): the paid look's affordability tests. */
export const setGodEnergy = internalMutation({
  args: { gameId: v.id("games"), godId: v.string(), balance: v.number() },
  handler: async (ctx, { gameId, godId, balance }) => {
    dev();
    const game = await liveGame(ctx, gameId);
    const deity = await ctx.db.query("deities").withIndex("by_game_god", q => q.eq("gameId", gameId).eq("godId", godId)).unique();
    if (!game || !deity) return fail("NOT_FOUND", "no such god");
    await ctx.db.patch(deity._id, { account: { balance, settledWorldSeconds: game.worldSeconds } });
  },
});
