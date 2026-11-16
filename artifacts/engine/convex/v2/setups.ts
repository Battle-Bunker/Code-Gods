/**
 * The setup picker's reads. The presets this deployment plays (presets.ts), so the app never bundles its own copy;
 * `room.create` and `room.settings` refuse any other id. A preset that cannot deal yet (no value functions) is withheld.
 * Beside them, the saved setups (v1's user setups, coordinator's call 35; table `v2Setups`): `shared` (everyone's) and
 * `mine` (the viewer's) are a list's skeleton (one index page each, read-architecture R1) and `get` one setup, for
 * that row's own subscription. Writes are the `setups.*` affordances (ops/setups.ts); a setup is applied with
 * `room.settings` `setupId` (lobby.ts). As in v1 (the coordinator, 16 Nov) every setup is shared: anyone lists, reads,
 * copies and applies it; only its owner saves over it or removes it.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireUser } from "./access";
import { PRESETS } from "./presets";
import { playable } from "./deal";
import { pageOpts } from "./pages";
import { overridesV } from "./tables";

const presetRowV = v.object({
  id: v.string(), title: v.string(), variant: v.string(), families: v.array(v.string()), minPlayers: v.number(),
  planningSeconds: v.number(), worldSeconds: v.number(), startingEnergy: v.number(), startingObjects: v.number(),
  bid: v.union(v.object({ pricing: v.union(v.literal("first"), v.literal("second")), disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")), seconds: v.number() }), v.null()),
});

export const presets = query({
  args: {},
  returns: v.array(presetRowV),
  handler: async ctx => {
    await requireUser(ctx);
    return PRESETS.filter(playable).map(p => ({
      id: p.id, title: p.title, variant: p.variant, families: [...p.families], minPlayers: p.minPlayers, planningSeconds: p.planningSeconds,
      worldSeconds: p.worldSeconds, startingEnergy: p.startingEnergy, startingObjects: p.startingObjects, bid: p.bid ?? null,
    }));
  },
});

// ---------------------------------------------------------------- saved setups

/** A setup name as the uniqueness check and the by-name order see it. */
export const nameKeyOf = (name: string) => name.toLowerCase();

/** One page of setups by name: `userId`'s (the by_owner_name index), or everyone's (by_name). */
export const setupsPage = (ctx: QueryCtx, userId: string | null, opts: { cursor: string | null; numItems: number }) =>
  (userId === null ? ctx.db.query("v2Setups").withIndex("by_name") : ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId)))
    .paginate(opts);

/** A setup by id, or null (unknown or deleted). */
export async function setupById(ctx: QueryCtx, setupId: string): Promise<Doc<"v2Setups"> | null> {
  const id = ctx.db.normalizeId("v2Setups", setupId);
  return id ? await ctx.db.get(id) : null;
}

/** A row as `viewerId` sees it: `mine` when it is theirs to save over or remove. */
export const rowOf = (viewerId: string) => (d: Doc<"v2Setups">) =>
  ({ setupId: d._id, name: d.name, preset: d.preset, updatedAt: d.updatedAt, ownerName: d.ownerName ?? "a player", mine: d.ownerUserId === viewerId });
export const viewOf = (viewerId: string, d: Doc<"v2Setups">) => ({ ...rowOf(viewerId)(d), overrides: d.overrides, createdAt: d.createdAt });

const setupRowV = v.object({ setupId: v.id("v2Setups"), name: v.string(), preset: v.string(), updatedAt: v.number(), ownerName: v.string(), mine: v.boolean() });

const listArgs = { paginationOpts: paginationOptsValidator }, listReturns = paginationResultValidator(setupRowV);
async function listed(ctx: QueryCtx, own: boolean, paginationOpts: { cursor: string | null; numItems: number }) {
  const user = await requireUser(ctx);
  const page = await setupsPage(ctx, own ? user.userId : null, pageOpts(paginationOpts));
  return { ...page, page: page.page.map(rowOf(user.userId)) };
}
/** Everyone's saved setups by name: a list's skeleton; each row's component subscribes to `get`. */
export const shared = query({ args: listArgs, returns: listReturns, handler: (ctx, { paginationOpts }) => listed(ctx, false, paginationOpts) });
/** The viewer's own saved setups by name: the same, for "Your setups". */
export const mine = query({ args: listArgs, returns: listReturns, handler: (ctx, { paginationOpts }) => listed(ctx, true, paginationOpts) });

/** A saved setup (anyone's) with its overrides; null for an unknown id. */
export const get = query({
  args: { setupId: v.string() },
  returns: v.union(setupRowV.extend({ overrides: overridesV, createdAt: v.number() }), v.null()),
  handler: async (ctx, { setupId }) => {
    const user = await requireUser(ctx);
    const doc = await setupById(ctx, setupId);
    return doc ? viewOf(user.userId, doc) : null;
  },
});

/**
 * Everyone's saved setups whose name matches `q`, best match first, a page at a time (v1's setup combobox searched every
 * setup; read-architecture R1: one search-index page). Each row's component subscribes to `get`, as in the lists.
 */
export const search = query({
  args: { q: v.string(), paginationOpts: paginationOptsValidator },
  returns: listReturns,
  handler: async (ctx, { q, paginationOpts }) => {
    const user = await requireUser(ctx);
    const page = await ctx.db.query("v2Setups").withSearchIndex("search_name", s => s.search("name", q.slice(0, 64))).paginate(pageOpts(paginationOpts));
    return { ...page, page: page.page.map(rowOf(user.userId)) };
  },
});
