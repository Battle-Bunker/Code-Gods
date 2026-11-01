/**
 * One-off data migrations, run by the deploy workflow after `setups:ensureSeeded` (.github/workflows/deploy.yml) and
 * idempotent, so every deploy may run them again (assistant-per-game is at the end of the file).
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
import type { GameSettings } from "@workspace/game-core";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { ASSISTANT_LOBBY } from "./ai/seats";
import { PLAYER_PARTITION, PLAYER_PREFIX, RUNS_PREFIX, codeEpoch } from "./code/keys";
import { aiSeatName, renameInRecord } from "./lib/aiNames";
import { migrateSettings } from "./lib/migrateSetups";
import { freeName, setupSummary } from "./setups";

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
