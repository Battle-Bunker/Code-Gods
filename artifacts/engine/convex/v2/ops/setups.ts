/**
 * `setups.*`: the caller's saved setups (v1's user setups, coordinator's call 35; reads and helpers in ../setups.ts).
 * A save is checked as room.settings checks a change: the same overrides schema (the affordance's) and a deployed,
 * playable preset. Applying one to a room is `room.settings` with `setupId` (ops/room.ts, lobby.ts `applySetup`).
 */
import { OpFailure, freeSetupName, MAX_OWN_SETUPS } from "@workspace/v2-affordances";
import type { MutationCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { checkPreset } from "../lobby";
import { nameKeyOf, ownSetup, rowOf, setupsPage, viewOf } from "../setups";
import { callerOf, defineOp } from "./define";
import { pageOf } from "./paging";

/** The caller's setup by id, or the failure every setup operation gives for one they cannot see (also room.settings). */
export async function requireOwnSetup(ctx: QueryCtx, userId: string, setupId: string): Promise<Doc<"v2Setups">> {
  const doc = await ownSetup(ctx, userId, setupId);
  if (!doc) throw new OpFailure("No such setup of yours.", "setups.page");
  return doc;
}

/** At most MAX_OWN_SETUPS: the cap is read from one index page one longer than it. */
async function ownNames(ctx: MutationCtx, userId: string) {
  return await ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId)).take(MAX_OWN_SETUPS + 1);
}
async function requireRoom(ctx: MutationCtx, userId: string) {
  if ((await ownNames(ctx, userId)).length >= MAX_OWN_SETUPS) throw new OpFailure(`At most ${MAX_OWN_SETUPS} setups each; delete one first.`, "setups.remove");
}

export const { op: page, as: pageAs } = defineOp("setups.page", "query", async (env, a) => {
  const result = await setupsPage(env.ctx, callerOf(env).userId!, pageOf(a));
  return { page: result.page.map(rowOf), nextCursor: result.isDone ? null : result.continueCursor };
});

// A setup holds only overrides the affordance's schema accepted (save), narrower than the stored validator.
export const { op: get, as: getAs } = defineOp("setups.get", "query", async (env, a) =>
  viewOf(await requireOwnSetup(env.ctx, callerOf(env).userId!, a.setupId)) as never);

export const { op: save, as: saveAs } = defineOp("setups.save", "mutation", async (env, a) => {
  const { ctx } = env, userId = callerOf(env).userId!;
  checkPreset(a.preset);
  const nameKey = nameKeyOf(a.name), overrides = a.overrides ?? {}, now = Date.now();
  const same = await ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId).eq("nameKey", nameKey)).first();
  const target = a.setupId !== undefined ? await requireOwnSetup(ctx, userId, a.setupId) : same;
  if (target && same && same._id !== target._id) throw new OpFailure(`You already have a setup named "${same.name}".`, "Pick another name, or save over that one by its name.");
  if (target) {
    await ctx.db.patch(target._id, { name: a.name, nameKey, preset: a.preset, overrides, updatedAt: now });
    return { setupId: target._id, name: a.name, created: false };
  }
  await requireRoom(ctx, userId);
  const setupId = await ctx.db.insert("v2Setups", { ownerUserId: userId, name: a.name, nameKey, preset: a.preset, overrides, createdAt: now, updatedAt: now });
  return { setupId, name: a.name, created: true };
});

export const { op: duplicate, as: duplicateAs } = defineOp("setups.duplicate", "mutation", async (env, a) => {
  const { ctx } = env, userId = callerOf(env).userId!;
  const source = await requireOwnSetup(ctx, userId, a.setupId);
  await requireRoom(ctx, userId);
  const taken = new Set((await ownNames(ctx, userId)).map(s => s.nameKey));
  const name = a.name === undefined ? freeSetupName(source.name, "'s copy", taken) : freeSetupName(a.name, "", taken);
  const now = Date.now();
  const setupId = await ctx.db.insert("v2Setups", { ownerUserId: userId, name, nameKey: nameKeyOf(name), preset: source.preset, overrides: source.overrides, createdAt: now, updatedAt: now });
  return { setupId, name };
});

export const { op: remove, as: removeAs } = defineOp("setups.remove", "mutation", async (env, a) => {
  const doc = await requireOwnSetup(env.ctx, callerOf(env).userId!, a.setupId);
  await env.ctx.db.delete(doc._id);
  return { ok: true as const };
});
