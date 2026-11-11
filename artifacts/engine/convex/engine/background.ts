/**
 * The deployment-wide cap on background work (lib/background.ts): a job takes a slot (a `workSlots` row) before it
 * starts and gives it back when it ends. At most BACKGROUND_LIMITS[kind] rows of a kind are live; a row whose action died expires.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx } from "../_generated/server";
import { BACKGROUND_LIMITS, BACKGROUND_SLOT_MS, slotAttemptDelays, slotFree } from "../lib/background";

const kindV = v.union(v.literal("examination"), v.literal("hold"));

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
  handler: async (ctx, { slot }) => {
    const row = await ctx.db.get(slot);
    if (!row) return;
    await ctx.db.delete(slot);
    if (row.kind === "turn") await promoteTurns(ctx);
  },
});

const turnV = v.object({ gameId: v.id("games"), godId: v.string(), chain: v.number() });
/** How long a seat's turn may wait in the queue; past it the row is dropped and the seat watchdog restarts the chain. */
const TURN_QUEUE_MS = 5 * 60_000;

/** Give free `turn` slots to the oldest waiting turns: each runs now, holding its slot (ai/turn.ts `slot`). */
async function promoteTurns(ctx: MutationCtx) {
  const now = Date.now();
  const held = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", "turn")).take(BACKGROUND_LIMITS.turn * 4);
  for (const row of held) if (row.expiresAt <= now) await ctx.db.delete(row._id);
  let free = BACKGROUND_LIMITS.turn - held.filter(r => r.expiresAt > now).length;
  if (free <= 0) return;
  for (const waiting of await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", "turnQueue")).take(free + 8)) {
    const stale = waiting.expiresAt <= now || !waiting.turn;
    if (!stale && free <= 0) break;
    await ctx.db.delete(waiting._id);
    if (stale) continue;
    free--;
    const slot = await ctx.db.insert("workSlots", { kind: "turn", expiresAt: now + BACKGROUND_SLOT_MS });
    await ctx.scheduler.runAfter(0, internal.ai.turn.run, { ...waiting.turn!, slot });
  }
}

/**
 * A seat's turn asks for a `turn` slot: the slot when one is free and nobody waits, else null and the turn is queued
 * (once per seat and chain) and run when a slot is released: no seat asks again, so waiting seats cost the scheduler
 * nothing.
 */
export const takeTurn = internalMutation({
  args: { turn: turnV },
  handler: async (ctx, { turn }): Promise<Id<"workSlots"> | null> => {
    const now = Date.now();
    const queue = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", "turnQueue")).take(400);
    if (!queue.some(r => r.expiresAt > now)) {
      const held = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", "turn")).take(BACKGROUND_LIMITS.turn * 4);
      for (const row of held) if (row.expiresAt <= now) await ctx.db.delete(row._id);
      if (slotFree(held.map(r => r.expiresAt), now, BACKGROUND_LIMITS.turn)) return ctx.db.insert("workSlots", { kind: "turn", expiresAt: now + BACKGROUND_SLOT_MS });
    }
    if (!queue.some(r => r.turn?.gameId === turn.gameId && r.turn.godId === turn.godId && r.turn.chain === turn.chain)) {
      await ctx.db.insert("workSlots", { kind: "turnQueue", expiresAt: now + TURN_QUEUE_MS, turn });
    }
    // A slot whose turn died is free again only when someone looks: this is where waiting turns get it.
    await promoteTurns(ctx);
    return null;
  },
});

/**
 * Run `job` holding a background slot, asking again a few times within `waitMs` (lib/background.ts slotAttemptDelays:
 * a bounded wait inside one action, never a client's). Returns `{ busy: true }` when none came free in time.
 */
export async function withBackgroundSlot<T>(ctx: ActionCtx, kind: "examination" | "hold", waitMs: number, job: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
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
