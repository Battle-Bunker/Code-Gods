/**
 * The view operations (client affordances: open a pane, pin a representation, focus an object, drive a replay) on
 * the server, so an assistant or an MCP credential acting for a human changes what that human sees: one function
 * for all of them (`defineViewOps`), running the same reducer and checks the browser runs, over the human's
 * `v2Layouts` row for the room in view.
 */
import { defineViewOps } from "@workspace/v2-affordances/convex";
import { EMPTY_VIEW, type ViewState } from "@workspace/v2-affordances";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { callerOf, host } from "./define";

async function rowOf(ctx: MutationCtx, userId: string, roomId: Id<"v2Rooms"> | undefined) {
  return await ctx.db.query("v2Layouts").withIndex("by_user_room", q => q.eq("userId", userId).eq("roomId", roomId)).unique();
}
const roomOf = (caller: Parameters<typeof callerOf>[0]["caller"]) => callerOf({ caller }).records?.room?._id;

export const { op: apply, as: applyAs } = defineViewOps({
  ...host,
  async loadView(ctx, caller) {
    const c = callerOf({ caller });
    if (!c.userId) return EMPTY_VIEW;
    return ((await rowOf(ctx as MutationCtx, c.userId, roomOf(caller)))?.view as ViewState | undefined) ?? EMPTY_VIEW;
  },
  async saveView(ctx, caller, _scope, view) {
    const c = callerOf({ caller });
    if (!c.userId) return;
    const roomId = roomOf(caller), db = (ctx as MutationCtx).db, row = await rowOf(ctx as MutationCtx, c.userId, roomId);
    if (row) await db.patch(row._id, { view, revision: row.revision + 1 });
    else await db.insert("v2Layouts", { userId: c.userId, ...(roomId ? { roomId } : {}), layout: null, view, revision: 1 });
  },
});
