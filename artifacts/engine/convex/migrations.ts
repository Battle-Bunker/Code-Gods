/**
 * One-off data migrations, run by the deploy workflow after `setups:ensureSeeded` (.github/workflows/deploy.yml) and
 * idempotent, so every deploy may run them again.
 *
 * setups-v2 (`migrations/node:setupsV2`, which pages through `setupsV2Page`):
 *  - settings on game setups, rooms and games: `defenceRate` becomes `defenceGoals` + `excludedDefenceFamilies`
 *    (lib/migrateSetups.ts);
 *  - rooms: `settingsOrigin` becomes `setupId` (+ `setupName`). A room on an unmodified setup that still exists keeps
 *    it; any other room (custom, a legacy preset, modified, or its setup gone) gets a new setup of its owner's named
 *    "Room <code>'s setup" holding its settings, which it then runs;
 *  - games (and an ended game's stored `summary`): an unmodified setup origin becomes `setupId`/`setupName` (the
 *    summary's `setup`); `settingsOrigin` is cleared.
 */
import { v } from "convex/values";
import type { GameSettings } from "@workspace/game-core";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
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
