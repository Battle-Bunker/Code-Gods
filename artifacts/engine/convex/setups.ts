/**
 * Game setups: a catalogue of complete next-game settings with a name (docs/engine-api.md "setups").
 *
 *   list            read: the seeded defaults (game-core SEED_SETUPS), then the caller's own setups
 *   save, remove    write: browser sessions and act/owner credentials; a seeded default only by an admin (browser)
 *
 * Defaults are seeded once by `seedId` (the aiTemplates pattern): an admin's edits are kept, and a removed default
 * stays as a tombstone so a re-seed never recreates it. A human's own setups are visible to them only; another
 * human's setup is NOT_FOUND. `owner.settings({setupId})` applies a setup's settings to a room (convex/owner.ts).
 *
 * `save` checks the caller first, validates the settings in a Node action (convex/setups/node.ts: validateSettings,
 * the offered instantiations, the server's resource limits) and commits in a mutation that re-checks the caller.
 * Every function has an internal twin `<fn>As` taking `principal: {credentialId}` for the agent registry.
 */
import { v } from "convex/values";
import { FIRST_STEPS_SEED_ID, SEED_SETUPS, SETUP_NAME_MAX, instantiationOf, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { instanceInfo } from "@workspace/game-types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { principalV, viewerOf, type Principal } from "./lib/rooms";

type Ctx = QueryCtx | MutationCtx;
/** A human's own setups, at most. */
export const MAX_OWN_SETUPS = 50;
const SUMMARY_MAX = 160;

// ------------------------------------------------------------------------------------------------
// seeding
// ------------------------------------------------------------------------------------------------

/** Insert every seed setup never inserted before (edited or removed ones stay as they are). */
export async function seed(ctx: MutationCtx) {
  for (const s of SEED_SETUPS) {
    const existing = await ctx.db.query("gameSetups").withIndex("by_seed", q => q.eq("seedId", s.seedId)).first();
    if (existing) continue;
    const now = Date.now();
    await ctx.db.insert("gameSetups", { ownerId: null, name: s.name, settings: seedSetupSettings(s.seedId), summary: s.summary, seedId: s.seedId, createdAt: now, updatedAt: now });
  }
}
export const ensureSeeded = internalMutation({ args: {}, handler: async (ctx) => { await seed(ctx); } });

/** The seeded First steps setup a new room starts on (seeding first), or null when an admin removed it. */
export async function firstSteps(ctx: MutationCtx): Promise<Doc<"gameSetups"> | null> {
  await seed(ctx);
  const doc = await ctx.db.query("gameSetups").withIndex("by_seed", q => q.eq("seedId", FIRST_STEPS_SEED_ID)).first();
  return doc && !doc.deleted ? doc : null;
}

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------

const seedOrder = (d: Doc<"gameSetups">) => { const i = SEED_SETUPS.findIndex(s => s.seedId === d.seedId); return i < 0 ? SEED_SETUPS.length : i; };
function view(d: Doc<"gameSetups">, viewer: Viewer) {
  const seeded = d.ownerId === null;
  return {
    id: d._id, name: d.name, summary: d.summary, settings: d.settings as GameSettings, seeded, ...(d.seedId ? { seedId: d.seedId } : {}),
    mine: d.ownerId === viewer.subject, editable: seeded ? viewer.isAdmin : d.ownerId === viewer.subject, updatedAt: d.updatedAt,
  };
}
export type SetupView = ReturnType<typeof view>;

async function listImpl(ctx: Ctx, viewer: Viewer): Promise<SetupView[]> {
  const defaults = (await ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", null)).take(200)).filter(d => !d.deleted)
    .sort((a, b) => seedOrder(a) - seedOrder(b) || a.createdAt - b.createdAt);
  const own = (await ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", viewer.subject)).take(MAX_OWN_SETUPS + 8))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.createdAt - b.createdAt);
  return [...defaults, ...own].map(d => view(d, viewer));
}

/** The seeded defaults, then the caller's own setups (by name). */
export const list = query({ args: {}, handler: async (ctx): Promise<SetupView[]> => listImpl(ctx, await viewerOf(ctx)) });
/** Internal twin of `list` for a principal (the registry's list_setups). */
export const listAs = internalQuery({ args: { principal: principalV }, handler: async (ctx, { principal }): Promise<SetupView[]> => listImpl(ctx, await viewerOf(ctx, principal)) });

/** A setup the viewer may see (a live default, or their own), else NOT_FOUND. */
async function visibleSetup(ctx: Ctx, viewer: Viewer, setupId: string): Promise<Doc<"gameSetups">> {
  const id = ctx.db.normalizeId("gameSetups", setupId);
  const doc = id ? await ctx.db.get(id) : null;
  if (!doc || doc.deleted || (doc.ownerId !== null && doc.ownerId !== viewer.subject)) return fail("NOT_FOUND", "No such setup: list_setups names the ones you can use");
  return doc;
}

/** owner.settings({setupId}): the setup's complete settings, if the caller may see it. */
export const resolve = internalQuery({
  args: { setupId: v.string(), principal: v.optional(principalV) },
  handler: async (ctx, { setupId, principal }): Promise<{ id: Id<"gameSetups">; settings: GameSettings }> => {
    const doc = await visibleSetup(ctx, await viewerOf(ctx, principal), setupId);
    return { id: doc._id, settings: doc.settings as GameSettings };
  },
});
/** The current settings of the setup a room's origin names (null when it is gone), to tell whether the room still matches it. */
export const settingsOf = internalQuery({
  args: { setupId: v.string() },
  handler: async (ctx, { setupId }): Promise<GameSettings | null> => {
    const id = ctx.db.normalizeId("gameSetups", setupId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && !doc.deleted ? doc.settings as GameSettings : null;
  },
});

// ------------------------------------------------------------------------------------------------
// writes
// ------------------------------------------------------------------------------------------------

function requireWriter(viewer: Viewer): void {
  if (viewer.scope === "browser") return;
  if (viewer.permission !== "act" && viewer.permission !== "owner") fail("FORBIDDEN", "A read-only credential cannot change setups");
}
/** The setup the viewer may change: their own, or a default when they are an admin. */
async function writableSetup(ctx: Ctx, viewer: Viewer, setupId: string): Promise<Doc<"gameSetups">> {
  const doc = await visibleSetup(ctx, viewer, setupId);
  if (doc.ownerId === null && !viewer.isAdmin) fail("FORBIDDEN", "Only an admin can change a default setup; save your own copy instead");
  return doc;
}
function checkName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > SETUP_NAME_MAX) fail("BAD_REQUEST", `A setup name is 1–${SETUP_NAME_MAX} characters`);
  return name;
}
/** The menu line of a human's own setup: its world, language, size and pace. */
export function setupSummary(s: GameSettings): string {
  let world: string;
  try { world = instanceInfo(instantiationOf(s)).label; } catch { world = s.objectType; }
  return `${world} · ${s.language === "python" ? "Python" : "TypeScript"} · ${s.startingObjectCount} objects · ${s.interactionRateHz} acts/s`;
}

const saveArgs = { setupId: v.optional(v.string()), name: v.string(), settings: v.any(), summary: v.optional(v.string()) };
type SaveArgs = { setupId?: string; name: string; settings: unknown; summary?: string };

/** Before the Node validation: who may write which setup (re-checked by the commit). */
export const preflight = internalQuery({
  args: { setupId: v.optional(v.string()), principal: v.optional(principalV) },
  handler: async (ctx, { setupId, principal }) => {
    const viewer = await viewerOf(ctx, principal);
    requireWriter(viewer);
    if (setupId) await writableSetup(ctx, viewer, setupId);
    return null;
  },
});

export const commitSave = internalMutation({
  args: { principal: v.optional(principalV), setupId: v.optional(v.string()), name: v.string(), settings: v.any(), summary: v.optional(v.string()) },
  handler: async (ctx, { principal, setupId, name: rawName, settings, summary: rawSummary }): Promise<SetupView> => {
    const viewer = await viewerOf(ctx, principal);
    requireWriter(viewer);
    const name = checkName(rawName);
    const summaryGiven = rawSummary?.trim().replace(/\s+/g, " ");
    if (summaryGiven !== undefined && (!summaryGiven || summaryGiven.length > SUMMARY_MAX)) fail("BAD_REQUEST", `A setup summary is 1–${SUMMARY_MAX} characters`);
    const now = Date.now();
    if (setupId) {
      const doc = await writableSetup(ctx, viewer, setupId);
      const siblings = await ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", doc.ownerId)).take(MAX_OWN_SETUPS + 200);
      if (siblings.some(s => s._id !== doc._id && !s.deleted && s.name.toLowerCase() === name.toLowerCase())) fail("CONFLICT", `There is already a setup named "${name}"`);
      const summary = summaryGiven ?? (doc.ownerId === null ? doc.summary : setupSummary(settings as GameSettings));
      await ctx.db.patch(doc._id, { name, settings, summary, updatedAt: now });
      return view({ ...doc, name, settings, summary, updatedAt: now }, viewer);
    }
    const own = await ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", viewer.subject)).take(MAX_OWN_SETUPS + 1);
    if (own.length >= MAX_OWN_SETUPS) fail("BAD_REQUEST", `At most ${MAX_OWN_SETUPS} setups each; remove one first`);
    if (own.some(s => s.name.toLowerCase() === name.toLowerCase())) fail("CONFLICT", `You already have a setup named "${name}": save over it instead`);
    const doc = { ownerId: viewer.subject, name, settings, summary: summaryGiven ?? setupSummary(settings as GameSettings), createdAt: now, updatedAt: now };
    const id = await ctx.db.insert("gameSetups", doc);
    return view({ _id: id, _creationTime: now, ...doc }, viewer);
  },
});

async function saveImpl(ctx: ActionCtx, args: SaveArgs, principal?: Principal): Promise<SetupView> {
  await ctx.runQuery(internal.setups.preflight, { setupId: args.setupId, principal });
  const settings: GameSettings = await ctx.runAction(internal.setups.node.check, { settings: args.settings });
  return ctx.runMutation(internal.setups.commitSave, { principal, ...args, settings });
}
/** Save complete settings as a named setup: a new one of yours, or over one you may change (`setupId`). */
export const save = action({ args: saveArgs, handler: async (ctx, args): Promise<SetupView> => saveImpl(ctx, args) });
/** Internal twin of `save` for a principal (the registry's save_setup). */
export const saveAs = internalAction({
  args: { principal: principalV, ...saveArgs },
  handler: async (ctx, { principal, ...args }): Promise<SetupView> => saveImpl(ctx, args, principal),
});

async function removeImpl(ctx: MutationCtx, viewer: Viewer, setupId: string) {
  requireWriter(viewer);
  const doc = await writableSetup(ctx, viewer, setupId);
  if (doc.ownerId === null) await ctx.db.patch(doc._id, { deleted: true, updatedAt: Date.now() });
  else await ctx.db.delete(doc._id);
  return { removed: doc._id, name: doc.name };
}
/** Remove one of your setups (an admin may remove a default; it is never re-seeded). Rooms keep their settings. */
export const remove = mutation({ args: { setupId: v.string() }, handler: async (ctx, { setupId }) => removeImpl(ctx, await viewerOf(ctx), setupId) });
/** Internal twin of `remove` for a principal (the registry's delete_setup). */
export const removeAs = internalMutation({
  args: { principal: principalV, setupId: v.string() },
  handler: async (ctx, { principal, setupId }) => removeImpl(ctx, await viewerOf(ctx, principal), setupId),
});
