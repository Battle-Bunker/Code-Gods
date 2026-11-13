/**
 * The deployment-wide cap on background work (lib/background.ts): a job takes a slot (a `workSlots` row) before it
 * starts and gives it back when it ends. At most BACKGROUND_LIMITS[kind] rows of a kind are live; a row whose action
 * died expires. Scheduled jobs (an AI seat's turn, a hold computation) past the cap are queued here and run when a
 * slot is released: nothing polls, so waiting jobs cost the scheduler nothing.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type ActionCtx, type MutationCtx } from "../_generated/server";
import { BACKGROUND_LIMITS, BACKGROUND_SLOT_MS, QUEUE_MS, slotAttemptDelays, slotFree, type BackgroundKind } from "../lib/background";

const QUEUE_OF = { turn: "turnQueue", hold: "holdQueue" } as const;
type Queued = keyof typeof QUEUE_OF;

/** The kind's live slots (expired rows are removed on the way). */
async function liveSlots(ctx: MutationCtx, kind: BackgroundKind, now: number): Promise<Doc<"workSlots">[]> {
  const rows = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", kind)).take(BACKGROUND_LIMITS[kind] * 4);
  for (const row of rows) if (row.expiresAt <= now) await ctx.db.delete(row._id);
  return rows.filter(row => row.expiresAt > now);
}

/** Take a slot for an examination, or null when the cap of them is running. */
export const acquire = internalMutation({
  args: { kind: v.literal("examination") },
  handler: async (ctx, { kind }): Promise<Id<"workSlots"> | null> => {
    const now = Date.now();
    if (!slotFree((await liveSlots(ctx, kind, now)).map(r => r.expiresAt), now, BACKGROUND_LIMITS[kind])) return null;
    return ctx.db.insert("workSlots", { kind, expiresAt: now + BACKGROUND_SLOT_MS });
  },
});

export const release = internalMutation({
  args: { slot: v.id("workSlots") },
  handler: async (ctx, { slot }) => {
    const row = await ctx.db.get(slot);
    if (!row) return;
    await ctx.db.delete(slot);
    if (row.kind === "turn" || row.kind === "hold") await promote(ctx, row.kind);
  },
});

/** Give the kind's free slots to its oldest waiting jobs: each runs now, holding its slot (its action's `slot`). */
async function promote(ctx: MutationCtx, kind: Queued) {
  const now = Date.now();
  let free = BACKGROUND_LIMITS[kind] - (await liveSlots(ctx, kind, now)).length;
  if (free <= 0) return;
  for (const waiting of await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", QUEUE_OF[kind])).take(free + 8)) {
    const stale = waiting.expiresAt <= now || (kind === "turn" ? !waiting.turn : !waiting.hold);
    if (!stale && free <= 0) break;
    await ctx.db.delete(waiting._id);
    if (stale) continue;
    free--;
    const slot = await ctx.db.insert("workSlots", { kind, expiresAt: now + BACKGROUND_SLOT_MS });
    if (kind === "turn") await ctx.scheduler.runAfter(0, internal.ai.turn.run, { ...waiting.turn!, slot });
    else await ctx.scheduler.runAfter(0, internal.engine.hold.computeOne, { ...waiting.hold!, slot });
  }
}

const turnV = v.object({ gameId: v.id("games"), godId: v.string(), chain: v.number() });
const holdV = v.object({ gameId: v.id("games"), key: v.string(), draw: v.object({ familyId: v.string(), params: v.any() }), m: v.number() });

/**
 * A scheduled job asks for a slot of its kind: the slot when one is free and nobody waits, else null and the job is
 * queued (once) and run when a slot is released (`promote`).
 */
async function takeOrQueue(ctx: MutationCtx, kind: Queued, same: (row: Doc<"workSlots">) => boolean, payload: Partial<Doc<"workSlots">>): Promise<Id<"workSlots"> | null> {
  const now = Date.now();
  const queue = await ctx.db.query("workSlots").withIndex("by_kind", q => q.eq("kind", QUEUE_OF[kind])).take(400);
  if (!queue.some(r => r.expiresAt > now) && (await liveSlots(ctx, kind, now)).length < BACKGROUND_LIMITS[kind]) {
    return ctx.db.insert("workSlots", { kind, expiresAt: now + BACKGROUND_SLOT_MS });
  }
  if (!queue.some(r => r.expiresAt > now && same(r))) await ctx.db.insert("workSlots", { kind: QUEUE_OF[kind], expiresAt: now + QUEUE_MS, ...payload });
  // A slot whose job died is free again only when someone looks: this is where waiting jobs get it.
  await promote(ctx, kind);
  return null;
}

/** An AI seat's turn (ai/turn.ts): its slot, or null when it was queued. */
export const takeTurn = internalMutation({
  args: { turn: turnV },
  handler: (ctx, { turn }) => takeOrQueue(ctx, "turn", r => r.turn?.gameId === turn.gameId && r.turn.godId === turn.godId && r.turn.chain === turn.chain, { turn }),
});

/** A hold computation (engine/hold.ts computeOne): its slot, or null when it was queued. */
export const takeHold = internalMutation({
  args: { hold: holdV },
  handler: (ctx, { hold }) => takeOrQueue(ctx, "hold", r => r.hold?.gameId === hold.gameId && r.hold.key === hold.key, { hold }),
});

/**
 * Run a player's examination holding a slot, asking again a few times within `waitMs` (lib/background.ts
 * slotAttemptDelays: a bounded wait inside one action, never a client's). Returns `{ busy: true }` when none came
 * free in time; a slot request that fails (many asking at once can exhaust the mutation's retries) is "busy" too.
 */
export async function withBackgroundSlot<T>(ctx: ActionCtx, kind: "examination", waitMs: number, job: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  const ask = () => ctx.runMutation(internal.engine.background.acquire, { kind }).catch(() => null);
  let slot: Id<"workSlots"> | null = await ask();
  for (const delay of slot ? [] : slotAttemptDelays(waitMs)) {
    await new Promise(resolve => setTimeout(resolve, delay));
    slot = await ask();
    if (slot) break;
  }
  if (!slot) return { busy: true };
  try { return { busy: false, value: await job() }; }
  finally { await ctx.runMutation(internal.engine.background.release, { slot }).catch(() => { /* it expires */ }); }
}
