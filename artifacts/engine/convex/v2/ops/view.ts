/**
 * View operations (client affordances, docs/engine-v2/affordances.md §3): one mutation applies any of them to the
 * human's view state, kept in their `v2Layouts` row for the room (`layout.view`), so an assistant or MCP credential
 * acting for the human changes what every open client of theirs shows. The browser applies the same reducer first for
 * an instant answer (player-web's affordance-runtime.ts).
 */
import { defineViewOps, type Caller } from "@workspace/v2-affordances/convex";
import { EMPTY_VIEW, OpFailure, type ViewState } from "@workspace/v2-affordances";
import type { DataModel } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { OP_HOST, type V2Caller } from "./define";

/** The caller's layout row in the room their context was resolved in. */
async function where(ctx: MutationCtx, caller: Caller) {
  const { records, userId } = caller as V2Caller;
  if (!userId) throw new OpFailure("Sign in first.");
  if (!records?.room) throw new OpFailure("No room in view.");
  if (!records.member) throw new OpFailure("Join the room first.");
  const roomId = records.room._id;
  const row = await ctx.db.query("v2Layouts").withIndex("by_user_room", q => q.eq("userId", userId).eq("roomId", roomId)).unique();
  return { userId, roomId, row };
}

export const { op: apply, as: applyAs } = defineViewOps<DataModel>({
  ...OP_HOST,
  loadView: async (ctx, caller) => {
    const { row } = await where(ctx as unknown as MutationCtx, caller);
    return (row?.layout as { view?: ViewState } | undefined)?.view ?? EMPTY_VIEW;
  },
  saveView: async (ctx, caller, _scope, view) => {
    const { db } = ctx as unknown as MutationCtx;
    const { userId, roomId, row } = await where(ctx as unknown as MutationCtx, caller);
    if (row) await db.patch(row._id, { layout: { ...(row.layout as object), view }, revision: row.revision + 1 });
    else await db.insert("v2Layouts", { userId, roomId, layout: { view }, revision: 1 });
  },
});
