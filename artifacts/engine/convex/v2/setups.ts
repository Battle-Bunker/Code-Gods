/**
 * The setup picker's reads. The presets this deployment plays (presets.ts), so the app never bundles its own copy;
 * `room.create` and `room.settings` refuse any other id. A preset that cannot deal yet (no value functions) is withheld.
 * Beside them, the viewer's own saved setups (v1's user setups, coordinator's call 35; table `v2Setups`): `mine` is a
 * list's skeleton (one index page, read-architecture R1) and `get` one setup, for that row's own subscription. Writes
 * are the `setups.*` affordances (ops/setups.ts); a setup is applied with `room.settings` `setupId` (lobby.ts).
 *
 * Setups are private: v1 shared every setup with everyone (owner-only edits), v2 keeps each human's to themselves
 * (the coordinator's brief for the restoration); another human's setup reads as absent, never as forbidden.
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

/** One page of `userId`'s setups by name (the by_owner_name index). */
export const setupsPage = (ctx: QueryCtx, userId: string, opts: { cursor: string | null; numItems: number }) =>
  ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId)).paginate(opts);

/** `userId`'s setup by id, or null (unknown, deleted, or someone else's: never told apart). */
export async function ownSetup(ctx: QueryCtx, userId: string, setupId: string): Promise<Doc<"v2Setups"> | null> {
  const id = ctx.db.normalizeId("v2Setups", setupId);
  const doc = id ? await ctx.db.get(id) : null;
  return doc && doc.ownerUserId === userId ? doc : null;
}

export const rowOf = (d: Doc<"v2Setups">) => ({ setupId: d._id, name: d.name, preset: d.preset, updatedAt: d.updatedAt });
export const viewOf = (d: Doc<"v2Setups">) => ({ ...rowOf(d), overrides: d.overrides, createdAt: d.createdAt });

const setupRowV = v.object({ setupId: v.id("v2Setups"), name: v.string(), preset: v.string(), updatedAt: v.number() });

/** The viewer's saved setups by name: a list's skeleton; each row's component subscribes to `get`. */
export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(setupRowV),
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireUser(ctx);
    const page = await setupsPage(ctx, user.userId, pageOpts(paginationOpts));
    return { ...page, page: page.page.map(rowOf) };
  },
});

/** One of the viewer's saved setups with its overrides; null for any other id. */
export const get = query({
  args: { setupId: v.string() },
  returns: v.union(setupRowV.extend({ overrides: overridesV, createdAt: v.number() }), v.null()),
  handler: async (ctx, { setupId }) => {
    const user = await requireUser(ctx);
    const doc = await ownSetup(ctx, user.userId, setupId);
    return doc ? viewOf(doc) : null;
  },
});
