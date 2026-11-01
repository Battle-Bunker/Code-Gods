/**
 * Game setups: one shared catalogue of complete, named next-game settings (docs/engine-api.md "setups").
 *
 *   list        read: EVERY setup, the system's (seed order) then everyone's (by name), each with its owner's name and
 *               summary but not its settings (the catalogue is shared and may be long)
 *   get         read: one setup with its complete settings
 *   save        write: a new setup of your own, or a change to one you own
 *   duplicate   write: a copy of any setup as a new one of your own, named "<name>'s copy"
 *   remove      write: delete one you own (rooms that run it keep their snapshot)
 *
 * Every setup is owned: by the human who created it, or by the system (`ownerId` null: game-core SEED_SETUPS). Only
 * the owner may change or delete one; system setups nobody can (admins included): the seed sync keeps them equal to
 * the code, and players duplicate one instead. Everyone sees every setup (intended: setups are shared).
 * `owner.settings({setupId})` applies a setup to a room; `owner.settings({settings})` edits the room's setup through
 * `roomSetupWrite` below (convex/owner.ts).
 *
 * `save` checks the caller first, validates the settings in a Node action (convex/setups/node.ts: validateSettings,
 * the offered instantiations, the server's resource limits) and commits in a mutation that re-checks the caller.
 * Every function has an internal twin `<fn>As` taking `principal: {credentialId}` for the agent registry.
 */
import { v } from "convex/values";
import { FIRST_STEPS_SEED_ID, LANGUAGE_SPECS, SEED_SETUPS, allowedLanguages, SETUP_NAME_MAX, instantiationOf, sameSettings, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { instanceInfo } from "@workspace/game-types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { displayName, principalV, viewerOf, type Principal } from "./lib/rooms";

type Ctx = QueryCtx | MutationCtx;
/** A human's own setups, at most. */
export const MAX_OWN_SETUPS = 50;
/** The most setups `list` returns (the client searches them all; see listImpl for which). */
export const LIST_CAP = 500;
const SUMMARY_MAX = 160;
const SYSTEM = "System";

// ------------------------------------------------------------------------------------------------
// the system setups
// ------------------------------------------------------------------------------------------------

/**
 * Keep the system setups equal to game-core SEED_SETUPS: insert a missing one, and put back the shipped name, summary
 * and settings of one that differs (an edit from before setups were immutable, a legacy tombstone, or a seed changed
 * in code). Idempotent; deploys run it (ensureSeeded).
 */
export async function seed(ctx: MutationCtx) {
  const now = Date.now();
  for (const s of SEED_SETUPS) {
    const settings = seedSetupSettings(s.seedId);
    const [existing, ...extra] = await ctx.db.query("gameSetups").withIndex("by_seed", q => q.eq("seedId", s.seedId)).collect();
    // One row per seed: a duplicate (two first-ever seedings racing) would be a system setup nobody could fix.
    for (const row of extra) await ctx.db.delete(row._id);
    if (!existing) {
      await ctx.db.insert("gameSetups", { ownerId: null, name: s.name, settings, summary: s.summary, seedId: s.seedId, createdAt: now, updatedAt: now });
    } else if (existing.ownerId !== null || existing.name !== s.name || existing.summary !== s.summary || existing.deleted || !sameSettings(existing.settings, settings)) {
      await ctx.db.patch(existing._id, { ownerId: null, name: s.name, summary: s.summary, settings, deleted: undefined, updatedAt: now });
    }
  }
}
export const ensureSeeded = internalMutation({ args: {}, handler: async (ctx) => { await seed(ctx); } });

/** The First steps system setup a new room starts on (a never-seeded deployment, e.g. a fresh local backend, is seeded here). */
export async function firstSteps(ctx: MutationCtx): Promise<Doc<"gameSetups">> {
  const find = () => ctx.db.query("gameSetups").withIndex("by_seed", q => q.eq("seedId", FIRST_STEPS_SEED_ID)).first();
  let doc = await find();
  if (!doc || doc.deleted) { await seed(ctx); doc = await find(); }
  return doc!;
}

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------

const seedOrder = (d: Doc<"gameSetups">) => { const i = SEED_SETUPS.findIndex(s => s.seedId === d.seedId); return i < 0 ? SEED_SETUPS.length : i; };
const ownerNameOf = (ctx: Ctx, ownerId: string | null) => (ownerId === null ? Promise.resolve(SYSTEM) : displayName(ctx, ownerId));

/** A setup as `list` shows it: who owns it and what it is, without its settings. */
function row(d: Doc<"gameSetups">, viewer: Viewer, ownerName: string) {
  const mine = d.ownerId !== null && d.ownerId === viewer.subject;
  return {
    id: d._id, name: d.name, summary: d.summary,
    /** Owned by the system (a seed setup): nobody may change it. */
    system: d.ownerId === null, ...(d.seedId ? { seedId: d.seedId } : {}),
    ownerName, mine, editable: mine, updatedAt: d.updatedAt,
  };
}
export type SetupRow = ReturnType<typeof row>;
/** A setup with its complete settings (get, and every write's result). */
const view = (d: Doc<"gameSetups">, viewer: Viewer, ownerName: string) => ({ ...row(d, viewer, ownerName), settings: d.settings as GameSettings });
export type SetupView = ReturnType<typeof view>;

/**
 * The system's setups and the viewer's own always; everyone else's, most recently created first, up to LIST_CAP in all
 * (so a large catalogue drops the oldest strangers' setups, never the viewer's or the system's).
 */
async function listImpl(ctx: Ctx, viewer: Viewer): Promise<SetupRow[]> {
  const byOwner = (ownerId: string | null) => ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(MAX_OWN_SETUPS + 200);
  const fixed = [...await byOwner(null), ...await byOwner(viewer.subject)];
  const others = (await ctx.db.query("gameSetups").order("desc").take(LIST_CAP + fixed.length))
    .filter(d => d.ownerId !== null && d.ownerId !== viewer.subject).slice(0, Math.max(0, LIST_CAP - fixed.length));
  const rows = [...fixed, ...others].filter(d => !d.deleted);
  const owners = [...new Set(rows.map(d => d.ownerId))];
  const names = new Map(await Promise.all(owners.map(async o => [o, await ownerNameOf(ctx, o)] as const)));
  const system = rows.filter(d => d.ownerId === null).sort((a, b) => seedOrder(a) - seedOrder(b) || a.createdAt - b.createdAt);
  const owned = rows.filter(d => d.ownerId !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.createdAt - b.createdAt);
  return [...system, ...owned].map(d => row(d, viewer, names.get(d.ownerId)!));
}

/** Every setup: the system's in seed order, then everyone's by name, each with its owner's name and whether it is the caller's. */
export const list = query({ args: {}, handler: async (ctx): Promise<SetupRow[]> => listImpl(ctx, await viewerOf(ctx)) });
/** Internal twin of `list` for a principal (the registry's list_setups). */
export const listAs = internalQuery({ args: { principal: principalV }, handler: async (ctx, { principal }): Promise<SetupRow[]> => listImpl(ctx, await viewerOf(ctx, principal)) });

/** A setup by id (every setup is visible to everyone), else NOT_FOUND. */
async function setupById(ctx: Ctx, setupId: string): Promise<Doc<"gameSetups">> {
  const id = ctx.db.normalizeId("gameSetups", setupId);
  const doc = id ? await ctx.db.get(id) : null;
  if (!doc || doc.deleted) return fail("NOT_FOUND", "No such setup: list_setups names them all");
  return doc;
}

async function getImpl(ctx: Ctx, viewer: Viewer, setupId: string): Promise<SetupView> {
  const doc = await setupById(ctx, setupId);
  return view(doc, viewer, await ownerNameOf(ctx, doc.ownerId));
}
/** One setup with its complete settings (any setup: they are shared), else NOT_FOUND. */
export const get = query({ args: { setupId: v.string() }, handler: async (ctx, { setupId }): Promise<SetupView> => getImpl(ctx, await viewerOf(ctx), setupId) });
/** Internal twin of `get` for a principal (the registry's get_setup). */
export const getAs = internalQuery({
  args: { principal: principalV, setupId: v.string() },
  handler: async (ctx, { principal, setupId }): Promise<SetupView> => getImpl(ctx, await viewerOf(ctx, principal), setupId),
});

/**
 * owner.settings({settings}): the settings a change starts from. The room's setup as it is now when its owner owns it
 * (so a change never reverts edits made to that setup since it was applied), with its `updatedAt` for the commit's
 * check; else null (the change starts from the room's snapshot and becomes a copy).
 */
export const ownedBase = internalQuery({
  args: { setupId: v.optional(v.id("gameSetups")), ownerId: v.string() },
  handler: async (ctx, { setupId, ownerId }): Promise<{ settings: GameSettings; updatedAt: number } | null> => {
    const doc = setupId ? await ctx.db.get(setupId) : null;
    return doc && !doc.deleted && doc.ownerId === ownerId ? { settings: doc.settings as GameSettings, updatedAt: doc.updatedAt } : null;
  },
});

/** owner.settings({setupId}): the setup's complete settings. */
export const resolve = internalQuery({
  args: { setupId: v.string() },
  handler: async (ctx, { setupId }): Promise<{ id: Id<"gameSetups">; name: string; settings: GameSettings }> => {
    const doc = await setupById(ctx, setupId);
    return { id: doc._id, name: doc.name, settings: doc.settings as GameSettings };
  },
});

// ------------------------------------------------------------------------------------------------
// writes
// ------------------------------------------------------------------------------------------------

function requireWriter(viewer: Viewer): void {
  if (viewer.scope === "browser") return;
  if (viewer.permission !== "act" && viewer.permission !== "owner") fail("FORBIDDEN", "A read-only credential cannot change setups");
}
/** The refusal for changing a setup someone else (or the system) owns. */
export const notYours = (ownerName: string) => (ownerName === SYSTEM
  ? "System setups cannot be edited: duplicate it" : `Only ${ownerName} can edit this setup: duplicate it`);
/** A setup the viewer owns, else FORBIDDEN naming its owner. */
async function ownSetup(ctx: Ctx, viewer: Viewer, setupId: string): Promise<Doc<"gameSetups">> {
  const doc = await setupById(ctx, setupId);
  if (doc.ownerId === null || doc.ownerId !== viewer.subject) fail("FORBIDDEN", notYours(await ownerNameOf(ctx, doc.ownerId)));
  return doc;
}
function checkName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > SETUP_NAME_MAX) fail("BAD_REQUEST", `A setup name is 1–${SETUP_NAME_MAX} characters`);
  return name;
}
const ownSetups = (ctx: Ctx, ownerId: string) => ctx.db.query("gameSetups").withIndex("by_owner", q => q.eq("ownerId", ownerId)).take(MAX_OWN_SETUPS + 200);

/**
 * The first free name (case-insensitive, among `taken`) of the form `<stem><tail>`, then `<stem><tail> 2`, ` 3`…,
 * the stem shortened so that every candidate fits SETUP_NAME_MAX. Pure; unit-tested.
 */
export function freeName(stem: string, tail: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const suffix = `${tail}${n > 1 ? ` ${n}` : ""}`;
    const candidate = `${stem.slice(0, SETUP_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
/** The name of a copy of `name`: "<name>'s copy", deduplicated among the owner's own. */
export const copyName = (name: string, taken: ReadonlySet<string>) => freeName(name, "'s copy", taken);

/** The menu line of a human's setup: its world, languages, size and pace. */
export function setupSummary(s: GameSettings): string {
  let world: string;
  try { world = instanceInfo(instantiationOf(s)).label; } catch { world = s.objectType; }
  return `${world} · ${allowedLanguages(s).map(l => LANGUAGE_SPECS[l].label).join(" or ")} · ${s.startingObjectCount} objects · ${s.interactionRateHz} acts/s`;
}

/**
 * Insert a new setup of `ownerId`'s; `name` must already be free among theirs. The cap applies to setups a human
 * makes on purpose (save, duplicate), not to the copy a room's change needs (that would block changing the room).
 */
async function insertOwn(ctx: MutationCtx, ownerId: string, name: string, settings: GameSettings, summary: string, capped = true): Promise<Doc<"gameSetups">> {
  if (capped && (await ownSetups(ctx, ownerId)).length >= MAX_OWN_SETUPS) fail("BAD_REQUEST", `At most ${MAX_OWN_SETUPS} setups each; delete one first`);
  const now = Date.now();
  const doc = { ownerId, name, settings, summary, createdAt: now, updatedAt: now };
  const id = await ctx.db.insert("gameSetups", doc);
  return { _id: id, _creationTime: now, ...doc };
}
const takenNames = async (ctx: Ctx, ownerId: string, except?: Id<"gameSetups">) =>
  new Set((await ownSetups(ctx, ownerId)).filter(s => s._id !== except).map(s => s.name.toLowerCase()));

const saveArgs = { setupId: v.optional(v.string()), name: v.string(), settings: v.any(), summary: v.optional(v.string()) };
type SaveArgs = { setupId?: string; name: string; settings: unknown; summary?: string };

/** Before the Node validation: who may write which setup (re-checked by the commit). */
export const preflight = internalQuery({
  args: { setupId: v.optional(v.string()), principal: v.optional(principalV) },
  handler: async (ctx, { setupId, principal }) => {
    const viewer = await viewerOf(ctx, principal);
    requireWriter(viewer);
    if (setupId) await ownSetup(ctx, viewer, setupId);
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
    const summary = summaryGiven ?? setupSummary(settings as GameSettings);
    if (setupId) {
      const doc = await ownSetup(ctx, viewer, setupId);
      if ((await takenNames(ctx, viewer.subject, doc._id)).has(name.toLowerCase())) fail("CONFLICT", `You already have a setup named "${name}"`);
      const updatedAt = Date.now();
      await ctx.db.patch(doc._id, { name, settings, summary, updatedAt });
      return view({ ...doc, name, settings, summary, updatedAt }, viewer, viewer.name);
    }
    if ((await takenNames(ctx, viewer.subject)).has(name.toLowerCase())) fail("CONFLICT", `You already have a setup named "${name}": edit that one instead`);
    return view(await insertOwn(ctx, viewer.subject, name, settings as GameSettings, summary), viewer, viewer.name);
  },
});

async function saveImpl(ctx: ActionCtx, args: SaveArgs, principal?: Principal): Promise<SetupView> {
  await ctx.runQuery(internal.setups.preflight, { setupId: args.setupId, principal });
  const settings: GameSettings = await ctx.runAction(internal.setups.node.check, { settings: args.settings });
  return ctx.runMutation(internal.setups.commitSave, { principal, ...args, settings });
}
/** Save complete settings as a new setup of yours, or over one you own (`setupId`). Names are unique among yours. */
export const save = action({ args: saveArgs, handler: async (ctx, args): Promise<SetupView> => saveImpl(ctx, args) });
/** Internal twin of `save` for a principal (the registry's save_setup). */
export const saveAs = internalAction({
  args: { principal: principalV, ...saveArgs },
  handler: async (ctx, { principal, ...args }): Promise<SetupView> => saveImpl(ctx, args, principal),
});

async function duplicateImpl(ctx: MutationCtx, viewer: Viewer, setupId: string, rawName?: string): Promise<SetupView> {
  requireWriter(viewer);
  const source = await setupById(ctx, setupId);
  const taken = await takenNames(ctx, viewer.subject);
  const name = rawName === undefined ? copyName(source.name, taken) : freeName(checkName(rawName), "", taken);
  return view(await insertOwn(ctx, viewer.subject, name, source.settings as GameSettings, source.summary), viewer, viewer.name);
}
/** Copy any setup (the system's, anyone's, yours) as a new one of yours: "<name>'s copy" (then " 2", " 3"…), or `name`. */
export const duplicate = mutation({
  args: { setupId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { setupId, name }) => duplicateImpl(ctx, await viewerOf(ctx), setupId, name),
});
/** Internal twin of `duplicate` for a principal (the registry's duplicate_setup). */
export const duplicateAs = internalMutation({
  args: { principal: principalV, setupId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { principal, setupId, name }) => duplicateImpl(ctx, await viewerOf(ctx, principal), setupId, name),
});

async function removeImpl(ctx: MutationCtx, viewer: Viewer, setupId: string) {
  requireWriter(viewer);
  const doc = await ownSetup(ctx, viewer, setupId);
  await ctx.db.delete(doc._id);
  return { removed: doc._id, name: doc.name };
}
/** Delete one of your setups. Rooms that run it keep their settings and show it as deleted. */
export const remove = mutation({ args: { setupId: v.string() }, handler: async (ctx, { setupId }) => removeImpl(ctx, await viewerOf(ctx), setupId) });
/** Internal twin of `remove` for a principal (the registry's delete_setup). */
export const removeAs = internalMutation({
  args: { principal: principalV, setupId: v.string() },
  handler: async (ctx, { principal, setupId }) => removeImpl(ctx, await viewerOf(ctx, principal), setupId),
});

// ------------------------------------------------------------------------------------------------
// a room's setup (owner.settings)
// ------------------------------------------------------------------------------------------------

/** What owner.settings did to the room's setup; `note` says it in one sentence for the caller. */
export type RoomSetupChange = { id: Id<"gameSetups">; name: string; created: boolean; note: string };

/**
 * Edit a room's setup to `settings` for its owner `ownerId` (owner.settings with changed fields): in place when they
 * own it; otherwise (the system's, someone else's, deleted, or none) as a new setup of theirs named "<name>'s copy"
 * (a legacy room without one: "Room <code>'s setup"), which the room then runs.
 */
export async function roomSetupWrite(ctx: MutationCtx, room: Doc<"rooms">, ownerId: string, settings: GameSettings, baseUpdatedAt?: number): Promise<RoomSetupChange> {
  const current = room.setupId ? await ctx.db.get(room.setupId) : null;
  const live = current && !current.deleted ? current : null;
  if (live && live.ownerId === ownerId) {
    // The change was computed from this setup's settings at `baseUpdatedAt` (ownedBase): saved since, it would revert that save.
    if (baseUpdatedAt !== undefined && live.updatedAt !== baseUpdatedAt) fail("CONFLICT", `"${live.name}" was changed meanwhile; try again`);
    await ctx.db.patch(live._id, { settings, summary: setupSummary(settings), updatedAt: Date.now() });
    return { id: live._id, name: live.name, created: false, note: `Saved the change to your setup "${live.name}"` };
  }
  const taken = await takenNames(ctx, ownerId);
  const sourceName = live?.name ?? room.setupName;
  const name = sourceName ? copyName(sourceName, taken) : freeName(`Room ${room.shortCode}`, "'s setup", taken);
  const doc = await insertOwn(ctx, ownerId, name, settings, setupSummary(settings), false);
  const why = !sourceName ? "the room had no setup" : !live ? `"${sourceName}" was deleted`
    : live.ownerId === null ? `"${sourceName}" is a system setup` : `"${sourceName}" belongs to ${await ownerNameOf(ctx, live.ownerId)}`;
  return { id: doc._id, name, created: true, note: `Created your setup "${name}" with the change, because ${why}; the room now runs it` };
}
