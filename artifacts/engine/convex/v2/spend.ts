/**
 * Who may spend AI tokens and how much (v2/ai.ts runs the calls): the quotas, ceilings and rate limits, and the
 * owner's quotas. No model package here, so the light page queries (rooms, the assistant's status) can read it.
 */
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { userById } from "./access";

/**
 * The spending rules (the owner's, 2026-11-03, kept for v2): AI runs only in rooms whose owner is an administrator,
 * checked when tokens are spent; each room has two per-game token quotas the owner sets (`room.aiQuotas`): `ai` for
 * all its AI players together and `assistant` for each player's assistant (a pitch draft is the player's assistant
 * too), 0 turning it off; a USD ceiling per game per pool and per UTC day per pool; and call-rate limits per minute.
 */
export const QUOTA_DEFAULT = 300_000;
/**
 * USD per game per pool and per UTC day per pool, as v1. The call rates are abuse limits, not pacing: an assistant
 * turn takes up to 12 model steps and an AI seat up to 6 every 20 s, so v1's 8 and 6 a minute cut ordinary turns short.
 */
export const CEILINGS = {
  ai: { gameUsd: 2, dailyUsd: 5, memberCalls: 20, poolCalls: 120 },
  assistant: { gameUsd: 2, dailyUsd: 5, memberCalls: 30, poolCalls: 120 },
} as const;
export const AI_ADMIN_ONLY = "AI is only available in rooms run by an administrator for now.";
export type Pool = "ai" | "assistant";
export type SpendKey = { roomId: Id<"v2Rooms">; gameId?: Id<"v2Games">; memberId: Id<"v2Members">; pool: Pool };
export const keyV = { roomId: v.id("v2Rooms"), gameId: v.optional(v.id("v2Games")), memberId: v.id("v2Members"), pool: v.union(v.literal("ai"), v.literal("assistant")) };

const today = () => new Date().toISOString().slice(0, 10);
const lastMinute = (times: readonly number[] | undefined, now: number) => (times ?? []).filter(t => t > now - 60_000);
/** Between games a room's spend is counted per UTC day, so the lobby's quota and ceiling come back each day. */
const lobbyDayOf = (k: { gameId?: Id<"v2Games"> }) => k.gameId ? undefined : today();
const SHARDS = 8;
const shardOf = (roomId: string) => { let h = 0; for (const c of roomId) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SHARDS; };

const quotaRow = (ctx: QueryCtx, roomId: Id<"v2Rooms">) => ctx.db.query("v2RoomQuotas").withIndex("by_room", q => q.eq("roomId", roomId)).unique();
const quotasFrom = (row: { ai: number; assistant: number } | null) => ({ ai: row?.ai ?? QUOTA_DEFAULT, assistant: row?.assistant ?? QUOTA_DEFAULT });
export const quotasOf = async (ctx: QueryCtx, roomId: Id<"v2Rooms">) => quotasFrom(await quotaRow(ctx, roomId));

/** Sets the owner's quotas (room.aiQuotas); either omitted keeps its value. */
export async function setQuotas(ctx: MutationCtx, roomId: Id<"v2Rooms">, a: { ai?: number; assistant?: number }) {
  const row = await quotaRow(ctx, roomId), now = quotasFrom(row), next = { ai: a.ai ?? now.ai, assistant: a.assistant ?? now.assistant };
  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("v2RoomQuotas", { roomId, ...next });
  return next;
}

const memberRow = (ctx: QueryCtx, k: SpendKey) =>
  ctx.db.query("v2AiUsage").withIndex("by_member_game", q => q.eq("memberId", k.memberId).eq("gameId", k.gameId).eq("lobbyDay", lobbyDayOf(k))).unique();
const poolRow = (ctx: QueryCtx, k: Omit<SpendKey, "memberId">) =>
  ctx.db.query("v2AiPools").withIndex("by_room_game_pool", q => q.eq("roomId", k.roomId).eq("gameId", k.gameId).eq("lobbyDay", lobbyDayOf(k)).eq("pool", k.pool)).unique();
const dailyRow = (ctx: QueryCtx, pool: Pool, shard: number) =>
  ctx.db.query("v2AiDaily").withIndex("by_day_pool_shard", q => q.eq("day", today()).eq("pool", pool).eq("shard", shard)).unique();
async function dailyUsd(ctx: QueryCtx, pool: Pool) {
  let usd = 0;
  for (let s = 0; s < SHARDS; s++) usd += (await dailyRow(ctx, pool, s))?.usd ?? 0;
  return usd;
}

/** Why AI cannot run in this room at all (not an administrator's room, or the quota is 0), or null. */
export async function aiOffIn(ctx: QueryCtx, room: { ownerId: string; _id: Id<"v2Rooms"> }, pool: Pool): Promise<string | null> {
  if (!(await userById(ctx, room.ownerId))?.admin) return AI_ADMIN_ONLY;
  if ((await quotasOf(ctx, room._id))[pool] === 0) return `The room's ${pool === "ai" ? "AI players'" : "assistant"} quota is 0 tokens per game, so it is off here; the room owner can raise it.`;
  return null;
}

/**
 * What one run may spend now (the tightest of every rule), or why it may spend nothing. The rate limit is an abuse
 * limit and approximate: a run's calls are counted when it is recorded, so runs that start together share a minute's
 * calls between them only roughly.
 */
export async function limitsIn(ctx: QueryCtx, k: SpendKey): Promise<{ tokens: number; usd: number; calls: number } | { refused: string }> {
  const room = await ctx.db.get(k.roomId);
  if (!room) return { refused: "No such room." };
  const off = await aiOffIn(ctx, room, k.pool);
  if (off) return { refused: off };
  const quota = (await quotasOf(ctx, k.roomId))[k.pool];
  const who = k.pool === "ai" ? "AI players'" : "assistant";
  const c = CEILINGS[k.pool], now = Date.now();
  const [mine, pool, daily] = [await memberRow(ctx, k), await poolRow(ctx, k), await dailyUsd(ctx, k.pool)];
  // The ai quota is the AI players' together; the assistant quota is each player's own.
  const tokens = quota - (k.pool === "ai" ? pool?.tokens ?? 0 : mine?.tokens ?? 0);
  if (tokens <= 0) return { refused: k.pool === "ai" ? "The room's AI players have used their quota for this game." : "Your assistant quota for this game is used up." };
  if ((pool?.usd ?? 0) >= c.gameUsd) return { refused: `The room's ${who} spending ceiling for this game (USD ${c.gameUsd}) is reached.` };
  if (daily >= c.dailyUsd) return { refused: `This deployment's daily ${who} ceiling (USD ${c.dailyUsd}) is reached; it resets at 00:00 UTC.` };
  const calls = Math.min(c.memberCalls - lastMinute(mine?.recent, now).length, c.poolCalls - lastMinute(pool?.recent, now).length);
  if (calls <= 0) return { refused: "Too many model calls in the last minute; try again shortly." };
  return { tokens, usd: Math.min(c.gameUsd - (pool?.usd ?? 0), c.dailyUsd - daily), calls };
}

export const limitsOf = internalQuery({ args: keyV, handler: (ctx, k) => limitsIn(ctx, k) });

export const record = internalMutation({
  args: { ...keyV, tokens: v.number(), usd: v.number(), calls: v.number() },
  handler: async (ctx, { tokens, usd, calls, ...k }) => {
    const now = Date.now(), times = Array.from({ length: calls }, () => now), lobbyDay = lobbyDayOf(k);
    const at = { ...(k.gameId ? { gameId: k.gameId } : {}), ...(lobbyDay ? { lobbyDay } : {}) };
    const mine = await memberRow(ctx, k);
    if (mine) await ctx.db.patch(mine._id, { tokens: mine.tokens + tokens, usd: mine.usd + usd, calls: mine.calls + calls, recent: [...lastMinute(mine.recent, now), ...times] });
    else await ctx.db.insert("v2AiUsage", { ...at, memberId: k.memberId, tokens, usd, calls, recent: times });
    const pool = await poolRow(ctx, k);
    if (pool) await ctx.db.patch(pool._id, { tokens: pool.tokens + tokens, usd: pool.usd + usd, recent: [...lastMinute(pool.recent, now), ...times] });
    else await ctx.db.insert("v2AiPools", { roomId: k.roomId, ...at, pool: k.pool, tokens, usd, recent: times });
    const shard = shardOf(k.roomId), daily = await dailyRow(ctx, k.pool, shard);
    if (daily) await ctx.db.patch(daily._id, { usd: daily.usd + usd });
    else await ctx.db.insert("v2AiDaily", { day: today(), pool: k.pool, shard, usd });
  },
});

/** A member's spend in the room's current game (or today's lobby), for the assistant's meter. */
export const usageIn = (ctx: QueryCtx, memberId: Id<"v2Members">, gameId: Id<"v2Games"> | undefined) =>
  memberRow(ctx, { memberId, ...(gameId ? { gameId } : {}), roomId: "" as Id<"v2Rooms">, pool: "assistant" });

