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
import { nameKeyOf, rowOf, setupById, setupsPage, viewOf } from "../setups";
import { callerOf, defineOp, scoped } from "./define";
import { pageOf } from "./paging";

/** A setup by id (anyone's: read, duplicate, room.settings), or the failure for an unknown one. */
export async function requireSetup(ctx: QueryCtx, setupId: string): Promise<Doc<"v2Setups">> {
  return await setupById(ctx, setupId) ?? (() => { throw new OpFailure("No such setup.", "setups.page"); })();
}
/** The caller's own setup by id (save over it, remove it): another human's is refused, as in v1. */
async function requireOwnSetup(ctx: QueryCtx, userId: string, setupId: string): Promise<Doc<"v2Setups">> {
  const doc = await requireSetup(ctx, setupId);
  if (doc.ownerUserId !== userId) throw new OpFailure(`"${doc.name}" is ${doc.ownerName ?? "another player"}'s: only its owner changes or deletes it.`, "setups.duplicate");
  return doc;
}

/** The caller's name, shown as a setup's owner. */
const nameOfCaller = (env: Parameters<typeof scoped>[0]) => scoped(env).user?.name ?? "Someone";

/** At most MAX_OWN_SETUPS: the cap is read from one index page one longer than it. */
async function ownNames(ctx: MutationCtx, userId: string) {
  return await ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId)).take(MAX_OWN_SETUPS + 1);
}
async function requireRoom(ctx: MutationCtx, userId: string) {
  if ((await ownNames(ctx, userId)).length >= MAX_OWN_SETUPS) throw new OpFailure(`At most ${MAX_OWN_SETUPS} setups each; delete one first.`, "setups.remove");
}

export const { op: page, as: pageAs } = defineOp("setups.page", "query", async (env, a) => {
  const userId = callerOf(env).userId!;
  const result = await setupsPage(env.ctx, a.mine ? userId : null, pageOf(a));
  return { page: result.page.map(rowOf(userId)), nextCursor: result.isDone ? null : result.continueCursor };
});

// A setup holds only overrides the affordance's schema accepted (save), narrower than the stored validator.
export const { op: get, as: getAs } = defineOp("setups.get", "query", async (env, a) =>
  viewOf(callerOf(env).userId!, await requireSetup(env.ctx, a.setupId)) as never);

export const { op: save, as: saveAs } = defineOp("setups.save", "mutation", async (env, a) => {
  const { ctx } = env, userId = callerOf(env).userId!;
  checkPreset(a.preset);
  const nameKey = nameKeyOf(a.name), overrides = a.overrides ?? {}, now = Date.now(), ownerName = nameOfCaller(env);
  const same = await ctx.db.query("v2Setups").withIndex("by_owner_name", q => q.eq("ownerUserId", userId).eq("nameKey", nameKey)).first();
  const target = a.setupId !== undefined ? await requireOwnSetup(ctx, userId, a.setupId) : same;
  if (target && same && same._id !== target._id) throw new OpFailure(`You already have a setup named "${same.name}".`, "Pick another name, or save over that one by its name.");
  if (target) {
    await ctx.db.patch(target._id, { name: a.name, nameKey, ownerName, preset: a.preset, overrides, updatedAt: now });
    return { setupId: target._id, name: a.name, created: false };
  }
  await requireRoom(ctx, userId);
  const setupId = await ctx.db.insert("v2Setups", { ownerUserId: userId, ownerName, name: a.name, nameKey, preset: a.preset, overrides, createdAt: now, updatedAt: now });
  return { setupId, name: a.name, created: true };
});

export const { op: duplicate, as: duplicateAs } = defineOp("setups.duplicate", "mutation", async (env, a) => {
  const { ctx } = env, userId = callerOf(env).userId!;
  const source = await requireSetup(ctx, a.setupId), ownerName = nameOfCaller(env);
  await requireRoom(ctx, userId);
  const taken = new Set((await ownNames(ctx, userId)).map(s => s.nameKey));
  const name = a.name === undefined ? freeSetupName(source.name, "'s copy", taken) : freeSetupName(a.name, "", taken);
  const now = Date.now();
  const setupId = await ctx.db.insert("v2Setups", { ownerUserId: userId, ownerName, name, nameKey: nameKeyOf(name), preset: source.preset, overrides: source.overrides, createdAt: now, updatedAt: now });
  return { setupId, name };
});

export const { op: remove, as: removeAs } = defineOp("setups.remove", "mutation", async (env, a) => {
  const doc = await requireOwnSetup(env.ctx, callerOf(env).userId!, a.setupId);
  await env.ctx.db.delete(doc._id);
  return { ok: true as const };
});
