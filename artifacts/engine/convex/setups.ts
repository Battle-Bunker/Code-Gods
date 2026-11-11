/**
 * Game setups: one shared catalogue of complete, named next-game settings (docs/engine-api.md "setups").
 *
 *   page        read: one page of the catalogue (the system's in seed order, then everyone's by name; or a search over
 *               name, owner and summary): ids, names and summaries, the skeleton of a list (read-architecture R1)
 *   row         read: one setup as a list shows it, with its owner's name (one list row's own subscription)
 *   get         read: one setup with its complete settings
 *   save        write: a new setup of your own, or a change to one you own
 *   duplicate   write: a copy of any setup as a new one of your own, named "<name>'s copy"
 *   remove      write: delete one you own (rooms that run it keep their snapshot)
 *
 * Every setup is owned: by the human who created it, or by the system (`ownerId` null: game-core SEED_SETUPS). Only
 * the owner may change or delete one; system setups nobody can (admins included): the seed sync keeps them equal to
 * the code, and players duplicate one instead. Everyone sees every setup (intended: setups are shared), except the
 * system's administrator-only ones (game-core SeedSetup.adminOnly: experiments), which only administrators see, read,
 * duplicate or apply: to everyone else they do not exist (lib/setupAccess.ts `hiddenFrom`; every reader and `setupById`
 * apply it).
 * `owner.settings({setupId})` applies a setup to a room; `owner.settings({settings})` edits the room's setup through
 * `roomSetupWrite` below (convex/owner.ts).
 *
 * `save` checks the caller first, validates the settings in a Node action (convex/setups/node.ts: validateSettings,
 * the offered instantiations, the server's resource limits) and commits in a mutation that re-checks the caller.
 * Every function has an internal twin `<fn>As` taking `principal: {credentialId}` for the agent registry.
 */
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { DEFAULT_SETUP_SEED_ID, LANGUAGE_SPECS, SEED_SETUPS, allowedLanguages, SETUP_NAME_MAX, instantiationOf, sameSettings, seedSetupSettings, type GameSettings } from "@workspace/game-core";
import { instanceInfo } from "@workspace/game-types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { actsAsHuman, type Viewer } from "./auth/access";
import { fail } from "./lib/errors";
import { adminOnly, hiddenFrom } from "./lib/setupAccess";
import { displayName, principalV, viewerOf, type Principal } from "./lib/rooms";

type Ctx = QueryCtx | MutationCtx;
/** A human's own setups, at most. */
export const MAX_OWN_SETUPS = 50;
/** The most setups the agents' list_setups returns (listAs; see listImpl for which). */
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
    const listing = listingOf({ ownerId: null, name: s.name, summary: s.summary, seedId: s.seedId }, SYSTEM);
    if (!existing) {
      await ctx.db.insert("gameSetups", { ownerId: null, name: s.name, settings, summary: s.summary, seedId: s.seedId, createdAt: now, updatedAt: now, ...listing });
    } else if (existing.ownerId !== null || existing.name !== s.name || existing.summary !== s.summary || existing.deleted || !sameSettings(existing.settings, settings)) {
      await ctx.db.patch(existing._id, { ownerId: null, name: s.name, summary: s.summary, settings, deleted: undefined, updatedAt: now, ...listing });
    } else if (!listed(existing, listing)) {
      await ctx.db.patch(existing._id, listing);
    }
  }
}
export const ensureSeeded = internalMutation({ args: {}, handler: async (ctx) => { await seed(ctx); } });

/** The default system setup (Annotated basics) a new room starts on (a never-seeded deployment, e.g. a fresh local backend, is seeded here). */
export async function defaultSetup(ctx: MutationCtx): Promise<Doc<"gameSetups">> {
  const find = () => ctx.db.query("gameSetups").withIndex("by_seed", q => q.eq("seedId", DEFAULT_SETUP_SEED_ID)).first();
  let doc = await find();
  if (!doc || doc.deleted) { await seed(ctx); doc = await find(); }
  return doc!;
}

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------

const seedOrder = (d: Pick<Doc<"gameSetups">, "seedId">) => { const i = SEED_SETUPS.findIndex(s => s.seedId === d.seedId); return i < 0 ? SEED_SETUPS.length : i; };
const ownerNameOf = (ctx: Ctx, ownerId: string | null) => (ownerId === null ? Promise.resolve(SYSTEM) : displayName(ctx, ownerId));

/** Where everyone's setups start in the catalogue's order (the system's take their seed position before it). */
export const OTHERS_ORDER = 1_000_000;
/** A name as the catalogue sorts it: case and accents folded (as the old in-memory sort's base-sensitivity compare). */
export const nameKeyOf = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/**
 * A setup's catalogue fields: `order` and `nameKey` (the by_order index: the system's in seed order, then everyone's by
 * name) and `searchText` (the search index: name, owner and summary; the owner's name as it was when the setup was last
 * written). Every writer sets them; the setupListing migration fills older rows.
 */
export function listingOf(d: Pick<Doc<"gameSetups">, "ownerId" | "name" | "summary" | "seedId">, ownerName: string) {
  return { order: d.ownerId === null ? seedOrder(d) : OTHERS_ORDER, nameKey: nameKeyOf(d.name), searchText: `${d.name} ${ownerName} ${d.summary}` };
}
/** Whether a row's catalogue fields are what `listingOf` gives. */
export const listed = (d: Doc<"gameSetups">, want: ReturnType<typeof listingOf>) =>
  d.order === want.order && d.nameKey === want.nameKey && d.searchText === want.searchText;
/** `listingOf` with the owner's current name. */
export const listingFor = async (ctx: Ctx, d: Pick<Doc<"gameSetups">, "ownerId" | "name" | "summary" | "seedId">) => listingOf(d, await ownerNameOf(ctx, d.ownerId));

/** A setup as a list row shows it: who owns it and what it is, without its settings. */
function rowOf(d: Doc<"gameSetups">, viewer: Viewer, ownerName: string) {
  const mine = d.ownerId !== null && d.ownerId === viewer.subject;
  return {
    id: d._id, name: d.name, summary: d.summary,
    /** Owned by the system (a seed setup): nobody may change it. */
    system: d.ownerId === null, ...(d.seedId ? { seedId: d.seedId } : {}),
    /** Shown to administrators only (only they ever receive such a row). */
    ...(adminOnly(d) ? { adminOnly: true } : {}),
    ownerName, mine, editable: mine, updatedAt: d.updatedAt,
  };
}
export type SetupRow = ReturnType<typeof rowOf>;
/** A setup with its complete settings (get, and every write's result). */
const view = (d: Doc<"gameSetups">, viewer: Viewer, ownerName: string) => ({ ...rowOf(d, viewer, ownerName), settings: d.settings as GameSettings });
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
  const rows = [...fixed, ...others].filter(d => !d.deleted && !hiddenFrom(d, viewer));
  const owners = [...new Set(rows.map(d => d.ownerId))];
  const names = new Map(await Promise.all(owners.map(async o => [o, await ownerNameOf(ctx, o)] as const)));
  const system = rows.filter(d => d.ownerId === null).sort((a, b) => seedOrder(a) - seedOrder(b) || a.createdAt - b.createdAt);
  const owned = rows.filter(d => d.ownerId !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.createdAt - b.createdAt);
  return [...system, ...owned].map(d => rowOf(d, viewer, names.get(d.ownerId)!));
}

/**
 * The catalogue for an agent's list_setups (one point-in-time read inside Convex, read-architecture R7): the system's
 * in seed order, then everyone's by name, each with its owner's name. The app pages it instead (`page` and `row`).
 */
export const listAs = internalQuery({ args: { principal: principalV }, handler: async (ctx, { principal }): Promise<SetupRow[]> => listImpl(ctx, await viewerOf(ctx, principal)) });

/** A setup as a list's skeleton has it: its own small fields (no owner: `row` has it; no settings: `get`). */
const entry = (d: Doc<"gameSetups">, viewer: Viewer) => ({
  id: d._id, name: d.name, summary: d.summary, system: d.ownerId === null, ...(d.seedId ? { seedId: d.seedId } : {}),
  ...(adminOnly(d) ? { adminOnly: true } : {}),
  mine: d.ownerId !== null && d.ownerId === viewer.subject,
});
export type SetupEntry = ReturnType<typeof entry>;
/** The most setups one page of the catalogue holds (read-architecture R2). */
export const PAGE_MAX = 30;
/** The longest search the catalogue takes: characters, and words (Convex's search takes at most 16 terms). */
const SEARCH_MAX = 100, SEARCH_TERMS = 16;

/**
 * One page of the shared catalogue, the skeleton of a setup list (read-architecture R1; `row` is one setup with its
 * owner's name): the system's in seed order, then everyone's by name (the by_order index); with `search`, the setups
 * whose name, owner or summary match it, best first (the search index). At most PAGE_MAX a page.
 */
export const page = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, { paginationOpts, search }) => {
    const viewer = await viewerOf(ctx);
    const opts = { ...paginationOpts, numItems: Math.max(1, Math.min(PAGE_MAX, Math.floor(paginationOpts.numItems))) };
    const text = search?.trim().slice(0, SEARCH_MAX).split(/\s+/).slice(0, SEARCH_TERMS).join(" ");
    const result = text
      ? await ctx.db.query("gameSetups").withSearchIndex("search", q => q.search("searchText", text)).paginate(opts)
      : await ctx.db.query("gameSetups").withIndex("by_order").paginate(opts);
    return { ...result, page: result.page.filter(d => !d.deleted && !hiddenFrom(d, viewer)).map(d => entry(d, viewer)) };
  },
});

/** One setup as a list row shows it, with its owner's name; null once it is deleted (or for an unknown id). */
export const row = query({
  args: { setupId: v.string() },
  handler: async (ctx, { setupId }): Promise<SetupRow | null> => {
    const viewer = await viewerOf(ctx);
    const id = ctx.db.normalizeId("gameSetups", setupId);
    const doc = id ? await ctx.db.get(id) : null;
    return doc && !doc.deleted && !hiddenFrom(doc, viewer) ? rowOf(doc, viewer, await ownerNameOf(ctx, doc.ownerId)) : null;
  },
});

/** A setup by id as this viewer may see it (every setup but another's view of an administrator-only one), else NOT_FOUND. */
async function setupById(ctx: Ctx, viewer: Viewer, setupId: string): Promise<Doc<"gameSetups">> {
  const id = ctx.db.normalizeId("gameSetups", setupId);
  const doc = id ? await ctx.db.get(id) : null;
  if (!doc || doc.deleted || hiddenFrom(doc, viewer)) return fail("NOT_FOUND", "No such setup: list_setups names them all");
  return doc;
}

async function getImpl(ctx: Ctx, viewer: Viewer, setupId: string): Promise<SetupView> {
  const doc = await setupById(ctx, viewer, setupId);
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

/** owner.settings({setupId}): the setup's complete settings, for the caller applying it (NOT_FOUND for one hidden from them). */
export const resolve = internalQuery({
  args: { setupId: v.string(), principal: v.optional(principalV) },
  handler: async (ctx, { setupId, principal }): Promise<{ id: Id<"gameSetups">; name: string; settings: GameSettings }> => {
    const doc = await setupById(ctx, await viewerOf(ctx, principal), setupId);
    return { id: doc._id, name: doc.name, settings: doc.settings as GameSettings };
  },
});

// ------------------------------------------------------------------------------------------------
// writes
// ------------------------------------------------------------------------------------------------

function requireWriter(viewer: Viewer): void {
  if (actsAsHuman(viewer)) return;
  if (viewer.permission !== "act" && viewer.permission !== "owner") fail("FORBIDDEN", "A read-only credential cannot change setups");
}
/** The refusal for changing a setup someone else (or the system) owns. */
export const notYours = (ownerName: string) => (ownerName === SYSTEM
  ? "System setups cannot be edited: duplicate it" : `Only ${ownerName} can edit this setup: duplicate it`);
/** A setup the viewer owns, else FORBIDDEN naming its owner. */
async function ownSetup(ctx: Ctx, viewer: Viewer, setupId: string): Promise<Doc<"gameSetups">> {
  const doc = await setupById(ctx, viewer, setupId);
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
  const doc = { ownerId, name, settings, summary, createdAt: now, updatedAt: now, ...await listingFor(ctx, { ownerId, name, summary }) };
  const id = await ctx.db.insert("gameSetups", doc);
  return { _id: id, _creationTime: now, ...doc };
}
const takenNames = async (ctx: Ctx, ownerId: string, except?: Id<"gameSetups">) =>
  new Set((await ownSetups(ctx, ownerId)).filter(s => s._id !== except).map(s => s.name.toLowerCase()));

/** `uniqueName`: a new setup takes the first of `name`, `name 2`, `name 3`… free among the caller's own, instead of CONFLICT. */
const saveArgs = { setupId: v.optional(v.string()), name: v.string(), settings: v.any(), summary: v.optional(v.string()), uniqueName: v.optional(v.boolean()) };
type SaveArgs = { setupId?: string; name: string; settings: unknown; summary?: string; uniqueName?: boolean };

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
  args: { principal: v.optional(principalV), ...saveArgs },
  handler: async (ctx, { principal, setupId, name: rawName, settings, summary: rawSummary, uniqueName }): Promise<SetupView> => {
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
      const listing = await listingFor(ctx, { ...doc, name, summary });
      await ctx.db.patch(doc._id, { name, settings, summary, updatedAt, ...listing });
      return view({ ...doc, name, settings, summary, updatedAt, ...listing }, viewer, viewer.name);
    }
    const taken = await takenNames(ctx, viewer.subject);
    if (uniqueName) return view(await insertOwn(ctx, viewer.subject, freeName(name, "", taken), settings as GameSettings, summary), viewer, viewer.name);
    if (taken.has(name.toLowerCase())) fail("CONFLICT", `You already have a setup named "${name}": edit that one instead`);
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
  const source = await setupById(ctx, viewer, setupId);
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
    const summary = setupSummary(settings);
    await ctx.db.patch(live._id, { settings, summary, updatedAt: Date.now(), ...await listingFor(ctx, { ...live, summary }) });
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
