/**
 * The deployment-wide cap on background work (lib/background.ts): a job takes a slot (a `workSlots` row) before it
 * starts and gives it back when it ends. At most BACKGROUND_LIMITS[kind] rows of a kind are live; a row whose action died expires.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type ActionCtx } from "../_generated/server";
import { BACKGROUND_LIMITS, BACKGROUND_SLOT_MS, slotAttemptDelays, slotFree, type BackgroundKind } from "../lib/background";

const kindV = v.union(v.literal("examination"), v.literal("hold"), v.literal("turn"));

/** Take a slot, or null when the kind's cap of jobs is running. Expired rows are removed on the way. */
export const acquire = internalMutation({
  args: { kind: kindV },
  handler: async (ctx, { kind }): Promise<Id<"workSlots"> | null> => {
    const now = Date.now();
    const rows = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", kind)).take(BACKGROUND_LIMITS[kind] * 4);
    for (const row of rows) if (row.expiresAt <= now) await ctx.db.delete(row._id);
    if (!slotFree(rows.map(r => r.expiresAt), now, BACKGROUND_LIMITS[kind])) return null;
    return ctx.db.insert("workSlots", { kind, expiresAt: now + BACKGROUND_SLOT_MS });
  },
});

export const release = internalMutation({
  args: { slot: v.id("workSlots") },
  handler: async (ctx, { slot }) => { if (await ctx.db.get(slot)) await ctx.db.delete(slot); },
});

/**
 * Run `job` holding a background slot, asking again a few times within `waitMs` (lib/background.ts slotAttemptDelays:
 * a bounded wait inside one action, never a client's). Returns `{ busy: true }` when none came free in time.
 */
export async function withBackgroundSlot<T>(ctx: ActionCtx, kind: BackgroundKind, waitMs: number, job: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  let slot: Id<"workSlots"> | null = await ctx.runMutation(internal.engine.background.acquire, { kind });
  for (const delay of slot ? [] : slotAttemptDelays(waitMs)) {
    await new Promise(resolve => setTimeout(resolve, delay));
    slot = await ctx.runMutation(internal.engine.background.acquire, { kind });
    if (slot) break;
  }
  if (!slot) return { busy: true };
  try { return { busy: false, value: await job() }; }
  finally { await ctx.runMutation(internal.engine.background.release, { slot }).catch(() => { /* it expires */ }); }
}
