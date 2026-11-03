/**
 * Data migrations (CLAUDE.md "Schema migrations"). New ones use the official @convex-dev/migrations component:
 * `migrations.define({ table, migrateOne })`, idempotent (a row already in the new shape is left alone), appended to
 * `runAll`, which the deploy workflow runs after `convex deploy` (scripts/run-migrations.mjs waits for it and fails
 * the deploy on a failed migration). The component runs them online, in batches, resumably, once per deployment.
 * The schema change around one follows widen → migrate → narrow: the new shape is optional (or a union) while it runs,
 * and a later PR makes it required once every deployment reports it done (`migrations:status`).
 *
 * Component migrations, in runAll's order:
 *  - dropHaskell* (Haskell agents were retired on 2026-11-02): "haskell" leaves the stored settings' `languages` of game
 *    setups, rooms and games (["typescript"] if nothing is left), and Haskell's runtime assets go: its bundle (row and
 *    stored file) and its compiled programs. Agents keep `language: "haskell"` as history (game-core RETIRED_LANGUAGES);
 *    a game's Haskell agent sits out (engine/tick.ts).
 *  - splitGameHotFields (games; docs/convex-read-architecture.md R3, §5): a game's clock (worldSeconds, lastTick,
 *    objectCount, agentCount, scoreboard) moves to its gameClocks doc and its engine state (tick, nextSpawn, nextBatch,
 *    stats) to its gameEngine doc, created from its fields where missing, and the fields are cleared on `games`. A game
 *    the new code already wrote (game/state.ts writeGame splits on its first write) only gets what it lacks. Narrowed
 *    later: the hot fields leave the games validator, and game/state.ts's legacy fallbacks go.
 *  - backfillReplays (games; read-architecture §4.4): an ended game without a stored replay gets its build scheduled
 *    (convex/replays.ts build, which endGame schedules for every game ending since). Its success means scheduled, not
 *    built: nothing to narrow in the schema, and the replay page's paging fallback goes only once no ended game on dev
 *    and production lacks its file (a failed build is not retried).
 *  - backfillStandings (games; read-architecture §4.1): a game stored before the standings read model gets its last
 *    published scoreboard as `standings` rows and one `standingsHistory` row (game/readModel.ts). Nothing to narrow:
 *    games.standings' fallback to the clock's scoreboard goes once dev and production report it done.
 *  - aiQuotas (rooms; 2026-11-03, AI budget approvals removed): every room gets the default per-game quotas
 *    (DEFAULT_AI_QUOTA for its AI players, DEFAULT_ASSISTANT_QUOTA per player's assistant) where it has none, whatever
 *    it had approved before, and its legacy `aiBudget` / `assistantBudget` are cleared. Narrowed later: `aiQuota` and
 *    `assistantQuota` become required, the legacy fields leave the validator, and lib/aiAccess.ts's `??` defaults go.
 *  - typedParams* (2026-11-03, docs/rules-design.md §9): families that now declare named, typed params store them as
 *    such (`{ X: 0 }` became `{ colour: "red" }`, game-utilities `upgradeDescriptor`). typedParamsDeities rewrites a
 *    dealt god's descriptor (`deities.utility`, utility and defence goal) and adds the typed params to its stored card
 *    (`deities.card.params`; the card's text is kept as dealt); when that god's game has ended with a stored replay
 *    file (which embeds the descriptors), the file is dropped and rebuilt (replays.ts rebuildAfterMigration).
 *    typedParamsPreparing rewrites the fixed deal of a room waiting for calibration (`rooms.preparing.deals`).
 *    Narrowed later (no schema change: both are v.any()): game-utilities' `upgrade`/`legacy` readers go.
 *  - backfillObjectTimes (objects; 2026-11-03, the Objects panel's public sorts): an object gets `createdAt` and
 *    `lastMutatedAt` (world seconds) from its objectEvents rows; its mutation count is its `version`. Narrowed later:
 *    `createdAt` becomes required and the `?? 0` fallbacks go (lib/projection.ts personalObject), once dev and
 *    production report it done.
 *  - pictureFrameSymbol* (2026-11-03): Picture Frame's redesign deals a symbol too; the same two rewrites again, for
 *    rows the typedParams* steps already left as `{ colour }` (deployments that ran them before the redesign).
 *
 * Older hand-rolled steps, idempotent and run by their own deploy-workflow steps (kept as they are: they predate the
 * component, and porting the Node action setupsV2 buys nothing):
 *
 * setups-v2 (`migrations/node:setupsV2`, which pages through `setupsV2Page`):
 *  - settings on game setups, rooms and games: `defenceRate` becomes `defenceGoals` + `excludedDefenceFamilies`, and a
 *    single `language` (with its grammarId and complexityFunctionId) becomes the allowed set `languages: [language]`
 *    (lib/migrateSetups.ts). Agents summoned before then carry no `language`: they are read as the game's one language
 *    (lib/language.ts agentLanguage), so agents need no migration;
 *  - rooms: `settingsOrigin` becomes `setupId` (+ `setupName`). A room on an unmodified setup that still exists keeps
 *    it; any other room (custom, a legacy preset, modified, or its setup gone) gets a new setup of its owner's named
 *    "Room <code>'s setup" holding its settings, which it then runs;
 *  - games (and an ended game's stored `summary`): an unmodified setup origin becomes `setupId`/`setupName` (the
 *    summary's `setup`); `settingsOrigin` is cleared.
 *
 * ai-seat-names (`migrations:aiSeatNames`, which pages through `aiSeatNamesPage`): an AI seat still named after its
 * template (every seat added before lib/aiNames.ts, so two seats of one template shared a name) gets a unique seat
 * name; the room's chat, its games' rosters and its ended games' stored results follow, so history reads the same.
 * A room with a game in progress is left alone (names never change mid-game); a later deploy renames it.
 */
import { v } from "convex/values";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { cardParams, context, family, paramsKey, upgradeDescriptor, type UtilityDescriptor } from "@workspace/game-utilities";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { Migrations, type MigrationStatus } from "@convex-dev/migrations";
import type { FunctionReference } from "convex/server";
import { components } from "./_generated/api";
import schema from "./schema";
import { ASSISTANT_LOBBY } from "./ai/seats";
import { PLAYER_PARTITION, PLAYER_PREFIX, RUNS_PREFIX, codeEpoch } from "./code/keys";
import { aiSeatName, renameInRecord } from "./lib/aiNames";
import { migrateSettings } from "./lib/migrateSetups";
import { DEFAULT_AI_QUOTA, DEFAULT_ASSISTANT_QUOTA } from "./lib/aiModels";
import { freeName, setupSummary } from "./setups";
import { clockDoc, clockFrom, splitHotFields } from "./game/state";
import { hasStandings, publishStandings } from "./game/readModel";

export const migrations = new Migrations(components.migrations, { schema });

/** Stored settings without Haskell in `languages` (TypeScript if nothing is left), or undefined when they never had it. */
function withoutHaskell(settings: unknown): { settings: GameSettings } | undefined {
  const s = settings as { languages?: unknown } | null;
  if (!s || !Array.isArray(s.languages) || !s.languages.includes("haskell")) return undefined;
  const languages = s.languages.filter(l => l !== "haskell");
  return { settings: { ...s, languages: languages.length ? languages : ["typescript"] } as unknown as GameSettings };
}
export const dropHaskellFromSetups = migrations.define({ table: "gameSetups", migrateOne: (_ctx, row) => withoutHaskell(row.settings) });
export const dropHaskellFromRooms = migrations.define({ table: "rooms", migrateOne: (_ctx, row) => withoutHaskell(row.settings) });
export const dropHaskellFromGames = migrations.define({ table: "games", migrateOne: (_ctx, row) => withoutHaskell(row.settings) });
export const dropHaskellBundle = migrations.define({
  table: "runtimeAssets",
  migrateOne: async (ctx, row) => {
    if (!row.name.startsWith("haskell-")) return;
    await ctx.db.delete(row._id);
    await ctx.storage.delete(row.storageId);
  },
});
export const dropHaskellCompiledPrograms = migrations.define({
  table: "compiledPrograms",
  migrateOne: async (ctx, row) => { if (row.language === "haskell") await ctx.db.delete(row._id); },
});

export const splitGameHotFields = migrations.define({
  table: "games",
  migrateOne: async (ctx, game) => { await splitHotFields(ctx, game); },
});

export const backfillReplays = migrations.define({
  table: "games",
  // Only schedules: the build (an action) pages the log and stores the file; it leaves a game that has one alone. The
  // builds are spread over a minute, so a deployment with many past games does not start them all at once.
  migrateOne: async (ctx, game) => {
    if (game.phase === "ended" && !game.replayStorageId) await ctx.scheduler.runAfter(Math.floor(Math.random() * 60_000), internal.replays.build, { gameId: game._id });
  },
});

export const backfillStandings = migrations.define({
  table: "games",
  // A game stored before the standings read model gets its last published scoreboard (from its clock, or its legacy
  // fields) as standings and one history row. A game that has standings (new, or published since) is left alone.
  migrateOne: async (ctx, game) => {
    if (await hasStandings(ctx, game._id)) return;
    const clock = clockFrom(game, await clockDoc(ctx, game._id));
    if (!clock.scoreboard) return;
    await publishStandings(ctx, game, clock.scoreboard, { agentCount: clock.agentCount, objectCount: clock.objectCount });
  },
});

export const aiQuotas = migrations.define({
  table: "rooms",
  migrateOne: (_ctx, room) => {
    if (room.aiQuota !== undefined && room.assistantQuota !== undefined && room.aiBudget === undefined && room.assistantBudget === undefined) return;
    return {
      aiQuota: room.aiQuota ?? DEFAULT_AI_QUOTA, assistantQuota: room.assistantQuota ?? DEFAULT_ASSISTANT_QUOTA,
      aiBudget: undefined, assistantBudget: undefined,
    };
  },
});

/** A stored descriptor with today's params, or null when it already has them (or cannot be read on this game's board). */
function typedDescriptor(utility: unknown, settings: unknown): UtilityDescriptor | null {
  const d = utility as UtilityDescriptor | null;
  if (!d || typeof d.familyId !== "string" || !d.params) return null;
  let inst, next;
  // A row this cannot read (a retired family, a malformed descriptor) is left as it is rather than failing the deploy.
  try { inst = instantiationOf(settings as GameSettings); next = upgradeDescriptor(d, inst); } catch { return null; }
  return paramsKey(next) === paramsKey({ familyId: d.familyId, params: d.params, ...(d.penalty ? { penalty: d.penalty } : {}) }) ? null : next;
}

/** A god's stored descriptor (and card) with today's params; its game's replay file rebuilt when it changes. */
async function typedDeity(ctx: MutationCtx, deity: Doc<"deities">): Promise<void> {
  const game = await ctx.db.get(deity.gameId);
  if (!game) return;
  const utility = typedDescriptor(deity.utility, game.settings);
  if (!utility) return;
  const ctx2 = context(instantiationOf(game.settings as GameSettings));
  const stored = deity.card as { penalty?: object } | null, typed = cardParams(family(utility.familyId), utility.params, ctx2);
  const penaltyTyped = utility.penalty && stored?.penalty ? cardParams(family(utility.penalty.familyId), utility.penalty.params, ctx2) : undefined;
  await ctx.db.patch(deity._id, { utility, card: {
    ...stored, ...(typed ? { params: typed } : {}),
    ...(penaltyTyped && stored?.penalty ? { penalty: { ...stored.penalty, params: penaltyTyped } } : {}),
  } });
  // The stored replay embeds the old descriptor: drop it and build it again once this game's gods are migrated.
  if (game.phase === "ended" && game.replayStorageId) {
    await ctx.storage.delete(game.replayStorageId);
    await ctx.db.patch(game._id, { replayStorageId: undefined });
    await ctx.scheduler.runAfter(5_000 + Math.floor(Math.random() * 5_000), internal.replays.rebuildAfterMigration, { gameId: game._id });
  }
}

export const typedParamsDeities = migrations.define({ table: "deities", migrateOne: typedDeity });

/**
 * Picture Frame's redesign (2026-11-03) added a dealt symbol: the same rewrite again, for rows typedParams* already
 * migrated to `{ colour }` (they read with the first symbol, game-utilities picture_frame `legacy`).
 */
export const pictureFrameSymbolDeities = migrations.define({ table: "deities", migrateOne: typedDeity });

function typedPreparing(_ctx: MutationCtx, room: Doc<"rooms">) {
  if (!room.preparing) return;
  const deals = room.preparing.deals.map(d => ({ godId: d.godId, utility: typedDescriptor(d.utility, room.settings) ?? d.utility }));
  if (deals.every((d, i) => d.utility === room.preparing!.deals[i].utility)) return;
  return { preparing: { ...room.preparing, deals } };
}
export const typedParamsPreparing = migrations.define({ table: "rooms", migrateOne: typedPreparing });
export const pictureFrameSymbolPreparing = migrations.define({ table: "rooms", migrateOne: typedPreparing });

export const backfillObjectTimes = migrations.define({
  table: "objects",
  // An object stored before its public times gets `createdAt` (its spawn row's world time) and `lastMutatedAt` (its last
  // transformation's) from objectEvents; the mutation count is its `version`, already stored. An object whose game
  // predates objectEvents rows has no spawn row: it reads as created at 0 and without a last mutation time.
  migrateOne: async (ctx, o) => {
    if (o.createdAt !== undefined) return;
    const spawn = await ctx.db.query("objectEvents").withIndex("by_game_object_version", q => q.eq("gameId", o.gameId).eq("objectId", o._id).eq("version", 0)).first();
    const last = o.lastMutatedAt !== undefined || o.version === 0 ? null
      : await ctx.db.query("objectEvents").withIndex("by_game_object_world", q => q.eq("gameId", o.gameId).eq("objectId", o._id)).order("desc")
        .filter(q => q.eq(q.field("kind"), "transform")).first();
    return { createdAt: spawn?.world ?? 0, ...(last ? { lastMutatedAt: last.world } : {}) };
  },
});

/** Every component migration, in order: run by the deploy workflow (`npx convex run migrations:runAll`). Append only. */
// Annotated: this module's own `internal` references would otherwise make its exported types circular.
const RUN_ALL: FunctionReference<"mutation", "internal">[] = [internal.migrations.dropHaskellFromSetups, internal.migrations.dropHaskellFromRooms,
  internal.migrations.dropHaskellFromGames, internal.migrations.dropHaskellBundle, internal.migrations.dropHaskellCompiledPrograms,
  internal.migrations.splitGameHotFields, internal.migrations.backfillReplays, internal.migrations.backfillStandings, internal.migrations.aiQuotas,
  internal.migrations.typedParamsDeities, internal.migrations.typedParamsPreparing,
  internal.migrations.backfillObjectTimes, internal.migrations.pictureFrameSymbolDeities, internal.migrations.pictureFrameSymbolPreparing];
export const runAll = migrations.runner(RUN_ALL);
/** The state of each of runAll's migrations (scripts/run-migrations.mjs waits for all of them to succeed). */
export const status = internalQuery({
  args: {},
  handler: async (ctx): Promise<MigrationStatus[]> => migrations.getStatus(ctx, { migrations: RUN_ALL }),
});

const PAGE = 100;
export const PHASES = ["setups", "rooms", "games"] as const;
type Phase = (typeof PHASES)[number];
type Origin = { kind: string; id?: string; modified: boolean } | undefined;

async function setupFor(ctx: MutationCtx, origin: Origin): Promise<Doc<"gameSetups"> | null> {
  if (origin?.kind !== "setup" || !origin.id || origin.modified) return null;
  const id = ctx.db.normalizeId("gameSetups", origin.id);
  const doc = id ? await ctx.db.get(id) : null;
  return doc && !doc.deleted ? doc : null;
}

async function migrateRoom(ctx: MutationCtx, room: Doc<"rooms">, defence: ReadonlySet<string>): Promise<boolean> {
  const settings = (migrateSettings(room.settings, defence) ?? room.settings) as GameSettings;
  const changedSettings = settings !== room.settings;
  if (room.setupId && room.settingsOrigin === undefined) {
    if (changedSettings) await ctx.db.patch(room._id, { settings });
    return changedSettings;
  }
  let setup = await setupFor(ctx, room.settingsOrigin as Origin);
  if (!setup) {
    const own = await ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", room.ownerId)).collect();
    const name = freeName(`Room ${room.shortCode}`, "'s setup", new Set(own.map(s => s.name.toLowerCase())));
    const now = Date.now();
    const id = await ctx.db.insert("gameSetups", { ownerId: room.ownerId, name, settings, summary: setupSummary(settings), createdAt: now, updatedAt: now });
    setup = (await ctx.db.get(id))!;
  }
  await ctx.db.patch(room._id, { settings, setupId: setup._id, setupName: setup.name, settingsOrigin: undefined });
  return true;
}

async function migrateGame(ctx: MutationCtx, game: Doc<"games">, defence: ReadonlySet<string>): Promise<boolean> {
  const settings = migrateSettings(game.settings, defence);
  const summary = game.summary as Record<string, unknown> | undefined;
  const legacySummary = !!summary && ("settingsOrigin" in summary || !!migrateSettings(summary.settings, defence));
  if (!settings && game.settingsOrigin === undefined && !legacySummary) return false;
  const setup = game.settingsOrigin ? await setupFor(ctx, game.settingsOrigin) : null;
  const named = setup ? { id: setup._id, name: setup.name } : game.setupId ? { id: game.setupId, name: game.setupName ?? "" } : null;
  let nextSummary: Record<string, unknown> | undefined;
  if (summary && legacySummary) {
    const { settingsOrigin: _o, ...rest } = summary;
    nextSummary = { ...rest, settings: migrateSettings(summary.settings, defence) ?? summary.settings, setup: named };
  }
  await ctx.db.patch(game._id, {
    ...(settings ? { settings } : {}),
    ...(game.settingsOrigin !== undefined ? { settingsOrigin: undefined, ...(setup ? { setupId: setup._id, setupName: setup.name } : {}) } : {}),
    ...(nextSummary ? { summary: nextSummary } : {}),
  });
  return true;
}

/** One page of one phase; returns where to continue (null when every phase is done) and how many documents changed. */
export const setupsV2Page = internalMutation({
  args: { phase: v.union(...PHASES.map(p => v.literal(p))), cursor: v.union(v.string(), v.null()), defenceIds: v.array(v.string()) },
  handler: async (ctx, { phase, cursor, defenceIds }): Promise<{ next: { phase: Phase; cursor: string | null } | null; changed: number }> => {
    const defence = new Set(defenceIds);
    let changed = 0;
    let page: { page: Doc<"gameSetups" | "rooms" | "games">[]; isDone: boolean; continueCursor: string };
    if (phase === "setups") {
      page = await ctx.db.query("gameSetups").paginate({ cursor, numItems: PAGE });
      for (const doc of page.page as Doc<"gameSetups">[]) {
        const settings = migrateSettings(doc.settings, defence);
        if (settings) { await ctx.db.patch(doc._id, { settings }); changed++; }
      }
    } else if (phase === "rooms") {
      page = await ctx.db.query("rooms").paginate({ cursor, numItems: PAGE });
      for (const doc of page.page as Doc<"rooms">[]) if (await migrateRoom(ctx, doc, defence)) changed++;
    } else {
      page = await ctx.db.query("games").paginate({ cursor, numItems: PAGE });
      for (const doc of page.page as Doc<"games">[]) if (await migrateGame(ctx, doc, defence)) changed++;
    }
    if (!page.isDone) return { next: { phase, cursor: page.continueCursor }, changed };
    const following = PHASES[PHASES.indexOf(phase) + 1];
    return { next: following ? { phase: following, cursor: null } : null, changed };
  },
});

/** Rename one room's legacy AI seats (named after their template); returns how many seats were renamed. */
export async function renameAiSeats(ctx: MutationCtx, room: Doc<"rooms">): Promise<number> {
  const members = await ctx.db.query("members").withIndex("by_room", q => q.eq("roomId", room._id)).collect();
  const legacy = (m: Doc<"members">) => m.kind === "ai" && !!m.aiAgent && m.name.trim().toLowerCase() === m.aiAgent.name.trim().toLowerCase();
  if (!members.some(legacy)) return 0;
  const games = await ctx.db.query("games").withIndex("by_room", q => q.eq("roomId", room._id)).collect();
  if (games.some(g => g.phase !== "ended")) return 0;
  const roomId = room._id;
  const names = new Map<string, string>();
  for (const m of members) {
    if (!legacy(m)) continue;
    const taken = members.filter(o => o.godId !== m.godId && !(legacy(o) && !names.has(o.godId))).map(o => names.get(o.godId) ?? o.name);
    const name = aiSeatName(m.godId, taken, [m.aiAgent!.name]);
    names.set(m.godId, name);
    await ctx.db.patch(m._id, { name });
  }
  if (!names.size) return 0;
  for (const [godId, name] of names) {
    const said = await ctx.db.query("chat").withIndex("by_room_author", q => q.eq("roomId", roomId).eq("authorId", godId)).collect();
    for (const row of said) if (row.authorName !== name) await ctx.db.patch(row._id, { authorName: name });
  }
  for (const game of games) {
    if (!game.roster.some(r => names.has(r.id))) continue;
    await ctx.db.patch(game._id, {
      roster: game.roster.map(r => (names.has(r.id) ? { ...r, name: names.get(r.id)! } : r)),
      ...(game.summary ? { summary: renameInRecord(game.summary, names) } : {}),
    });
  }
  return names.size;
}

export const aiSeatNamesPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }): Promise<{ next: string | null; changed: number }> => {
    // Small pages: a renamed room also reads its games and its seats' chat.
    const page = await ctx.db.query("rooms").paginate({ cursor, numItems: 20 });
    let changed = 0;
    for (const room of page.page) changed += await renameAiSeats(ctx, room);
    return { next: page.isDone ? null : page.continueCursor, changed };
  },
});

/** Every page; returns how many AI seats were renamed (zero on a second run). */
export const aiSeatNames = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    let cursor: string | null = null, changed = 0;
    do {
      const result: { next: string | null; changed: number } = await ctx.runMutation(internal.migrations.aiSeatNamesPage, { cursor });
      changed += result.changed;
      cursor = result.next;
    } while (cursor);
    return changed;
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// assistant-per-game (`migrations:assistantPerGame`): the assistant's state keyed by (player, game)
// ---------------------------------------------------------------------------------------------------------------------
//  - threads: each gets `epoch`, the game that was the room's current one when it started (the latest game launched
//    before it, or "lobby"). A thread whose turns span games is split: its turns, messages and tool calls of each later
//    game move to a new thread of that game, so no game's conversation carries an earlier game's.
//  - codeObjects: saved scripts go to the player-wide partition (""); any other object to its run's game, else to its
//    room's current game, else to the human's latest run's game, else to "legacy" (a partition no game reads).
//  - codeObjectUsage: a human's total from before the partitions is replaced by per-partition counts.

export const ASSISTANT_PHASES = ["threads", "objects", "usage"] as const;
type AssistantPhase = (typeof ASSISTANT_PHASES)[number];
const LEGACY_PARTITION = "legacy";

/** The assistant epoch of a room at a time: its latest game launched by then, or "lobby" (ai/seats.ts assistantEpoch). */
async function assistantEpochAt(ctx: MutationCtx, roomId: Doc<"rooms">["_id"], at: number) {
  const game = await ctx.db.query("games").withIndex("by_room", q => q.eq("roomId", roomId).lte("_creationTime", at)).order("desc").first();
  return game ? String(game._id) : ASSISTANT_LOBBY;
}

async function migrateThread(ctx: MutationCtx, thread: Doc<"assistantThreads">): Promise<boolean> {
  if (thread.epoch !== undefined) return false;
  const turns = await ctx.db.query("assistantTurns").withIndex("by_thread", q => q.eq("threadId", thread._id)).collect();
  const byEpoch = new Map<string, Doc<"assistantTurns">[]>();
  for (const turn of turns) {
    const epoch = await assistantEpochAt(ctx, thread.roomId, turn._creationTime);
    byEpoch.set(epoch, [...(byEpoch.get(epoch) ?? []), turn]);
  }
  const [first, ...later] = byEpoch.size ? [...byEpoch.keys()] : [await assistantEpochAt(ctx, thread.roomId, thread._creationTime)];
  for (const epoch of later) {
    const moved = byEpoch.get(epoch)!;
    const threadId = await ctx.db.insert("assistantThreads", {
      roomId: thread.roomId, subject: thread.subject, title: thread.title, epoch, createdAt: moved[0].createdAt, updatedAt: Math.max(...moved.map(t => t.updatedAt)),
      ...(thread.activeTurnId && moved.some(t => t._id === thread.activeTurnId) ? { activeTurnId: thread.activeTurnId } : {}),
    });
    for (const turn of moved) {
      await ctx.db.patch(turn._id, { threadId });
      for (const m of await ctx.db.query("assistantMessages").withIndex("by_turn", q => q.eq("turnId", turn._id)).collect()) await ctx.db.patch(m._id, { threadId });
      for (const c of await ctx.db.query("assistantToolCalls").withIndex("by_turn", q => q.eq("turnId", turn._id)).collect()) await ctx.db.patch(c._id, { threadId });
    }
  }
  const kept = byEpoch.get(first) ?? [];
  const keepsActive = !thread.activeTurnId || kept.some(t => t._id === thread.activeTurnId);
  await ctx.db.patch(thread._id, { epoch: first, ...(keepsActive ? {} : { activeTurnId: undefined }),
    ...(later.length ? { updatedAt: Math.max(thread.createdAt, ...kept.map(t => t.updatedAt)) } : {}) });
  return true;
}

async function objectPartition(ctx: MutationCtx, row: Doc<"codeObjects">): Promise<string> {
  if (row.key.startsWith(PLAYER_PREFIX)) return PLAYER_PARTITION;
  const runRef = row.key.startsWith(RUNS_PREFIX) ? row.key.slice(RUNS_PREFIX.length) : row.runId;
  const runId = runRef ? ctx.db.normalizeId("codeRuns", runRef) : null;
  const run = runId ? await ctx.db.get(runId) : null;
  if (run) return run.epoch;
  const room = row.roomId ? await ctx.db.get(row.roomId) : null;
  if (room) return codeEpoch(room);
  // by_subject_room orders by room first: the latest run across rooms is the newest of them all.
  const runs = await ctx.db.query("codeRuns").withIndex("by_subject_room", q => q.eq("subject", row.subject)).take(1000);
  const latest = runs.reduce<Doc<"codeRuns"> | null>((a, r) => !a || r._creationTime > a._creationTime ? r : a, null);
  return latest?.epoch ?? LEGACY_PARTITION;
}

/** A human's counters from their objects, per partition (run results not counted). */
async function recountUsage(ctx: MutationCtx, subject: string) {
  // updatedAt: the partition's latest write, so pruning (code/objects.ts pruneOldGames) keeps the most recent games.
  const counts = new Map<string, { objects: number; bytes: number; updatedAt: number }>();
  for (const r of await ctx.db.query("codeObjects").withIndex("by_subject_key", q => q.eq("subject", subject)).collect()) {
    if (r.key.startsWith(RUNS_PREFIX)) continue;
    const c = counts.get(r.epoch ?? LEGACY_PARTITION) ?? { objects: 0, bytes: 0, updatedAt: 0 };
    counts.set(r.epoch ?? LEGACY_PARTITION, { objects: c.objects + 1, bytes: c.bytes + r.bytes, updatedAt: Math.max(c.updatedAt, r.updatedAt) });
  }
  for (const old of await ctx.db.query("codeObjectUsage").withIndex("by_subject", q => q.eq("subject", subject)).collect()) await ctx.db.delete(old._id);
  for (const [epoch, c] of counts) await ctx.db.insert("codeObjectUsage", { subject, epoch, ...c });
}

/** One page of one phase of assistant-per-game; returns where to continue (null when done) and how many documents changed. */
export const assistantPerGamePage = internalMutation({
  args: { phase: v.union(...ASSISTANT_PHASES.map(p => v.literal(p))), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { phase, cursor }): Promise<{ next: { phase: AssistantPhase; cursor: string | null } | null; changed: number }> => {
    let changed = 0;
    let page: { isDone: boolean; continueCursor: string };
    if (phase === "threads") {
      const p = await ctx.db.query("assistantThreads").paginate({ cursor, numItems: 20 });
      for (const t of p.page) if (await migrateThread(ctx, t)) changed++;
      page = p;
    } else if (phase === "objects") {
      const p = await ctx.db.query("codeObjects").paginate({ cursor, numItems: PAGE });
      for (const r of p.page) {
        if (r.epoch !== undefined) continue;
        const epoch = await objectPartition(ctx, r);
        // A write between the deploy and this migration may have made the key anew in its partition: the newer row wins.
        const newer = await ctx.db.query("codeObjects").withIndex("by_subject_epoch_key", q => q.eq("subject", r.subject).eq("epoch", epoch).eq("key", r.key)).first();
        if (newer) { if (r.storageId) await ctx.storage.delete(r.storageId); await ctx.db.delete(r._id); }
        else await ctx.db.patch(r._id, { epoch });
        changed++;
      }
      page = p;
    } else {
      const p = await ctx.db.query("codeObjectUsage").paginate({ cursor, numItems: 20 });
      for (const r of p.page) if (r.epoch === undefined && await ctx.db.get(r._id)) { await recountUsage(ctx, r.subject); changed++; }
      page = p;
    }
    if (!page.isDone) return { next: { phase, cursor: page.continueCursor }, changed };
    const following = ASSISTANT_PHASES[ASSISTANT_PHASES.indexOf(phase) + 1];
    return { next: following ? { phase: following, cursor: null } : null, changed };
  },
});

/** Run every page of every phase; returns how many documents of each phase changed (all zero on a second run). */
export const assistantPerGame = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const changed: Record<string, number> = { threads: 0, objects: 0, usage: 0 };
    let next: { phase: AssistantPhase; cursor: string | null } | null = { phase: "threads", cursor: null };
    while (next) {
      const result: { next: { phase: AssistantPhase; cursor: string | null } | null; changed: number } = await ctx.runMutation(internal.migrations.assistantPerGamePage, next);
      changed[next.phase] += result.changed;
      next = result.next;
    }
    return changed;
  },
});

