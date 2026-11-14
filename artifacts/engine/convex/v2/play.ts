/**
 * Live queries a seated player's panes subscribe to (integration plan §2.2). Every answer is the caller's own: their
 * rule, account, values, agents and moves; another player's rule, score or value never leaves the server while the
 * game is live (v2-disclosure.test.ts). Each reads one document or one index page.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { fail, ownEnergyNow, playerOf, requireGameMember, requireSeat, requireUser } from "./access";
import {
  agentEnergyV, agentProgramsV, agentRowV, digestV, meV, movesPageV, myRuleV, objectIdsV, objectSortV, playObjectV,
} from "./validators";

/** ≤ 20 agents per player (R3). */
export const MAX_AGENTS = 20;

export const myRule = query({
  args: { gameId: v.string() },
  returns: myRuleV,
  handler: async (ctx, { gameId }) => {
    const { rule: r } = await requireSeat(ctx, gameId);
    return {
      family: r.family, title: r.title, params: r.params, layers: r.layers, tieBreaker: r.tieBreaker, card: r.card, depends: r.depends, primary: r.primary,
      ladder: r.ladder, ruleKey: r.ruleKey, bid: r.bid ?? null, handicap: r.handicap ?? null,
    };
  },
});

export const me = query({
  args: { gameId: v.string() },
  returns: meV,
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const player = await playerOf(ctx, game._id, member._id) ?? fail("NOT_FOUND", "No account in this game");
    return { memberId: player.memberId, energy: await ownEnergyNow(ctx, game, player), power: player.power, ready: player.ready, pauseUsed: player.pauseUsed, agents: player.agents };
  },
});

const SORT_INDEX = {
  points: "by_game_member_points", rarity: "by_game_member_rarity", want: "by_game_member_want",
  born: "by_game_member_born", recent: "by_game_member_changed",
} as const;

/** The objects skeleton: a page of object ids in the caller's order; each row subscribes to `object`. */
export const objectIds = query({
  args: { gameId: v.string(), sort: objectSortV, paginationOpts: paginationOptsValidator },
  returns: objectIdsV,
  handler: async (ctx, { gameId, sort, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const page = await ctx.db.query("v2ObjectValues").withIndex(SORT_INDEX[sort], q => q.eq("gameId", game._id).eq("memberId", member._id))
      .order("desc").paginate(paginationOpts);
    return { ...page, page: page.page.map(r => ({ objectId: r.objectId, number: r.number })) };
  },
});

/** An object and its state; sign-in first, so a signed-out caller learns nothing, not even whether it exists. */
export async function objectAndState(ctx: QueryCtx, objectId: string) {
  await requireUser(ctx);
  const id = ctx.db.normalizeId("v2Objects", objectId);
  const object = id ? await ctx.db.get(id) : null;
  if (!object) fail("NOT_FOUND", "No such object");
  const state = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique()
    ?? fail("NOT_FOUND", "That object has no state yet");
  return { object, state };
}

/** One object: its shared state, and the caller's value of it when seated (null for a spectator). */
export const object = query({
  args: { objectId: v.string() },
  returns: playObjectV,
  handler: async (ctx, { objectId }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    const { member } = await requireGameMember(ctx, object.gameId);
    const value = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
    return {
      objectId: object._id, number: object.number, bornAt: object.bornAt, state: state.state, version: state.version, changedAt: state.changedAt,
      value: value ? { score: value.score, level: value.level, rarityBits: value.rarityBits, want: value.want, points: value.points, version: value.version } : null,
    };
  },
});

export const agents = query({
  args: { gameId: v.string() },
  returns: v.array(agentRowV),
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const rows = await ctx.db.query("v2Agents").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).take(MAX_AGENTS);
    return rows.filter(a => a.destroyedAt === undefined)
      .map(a => ({ agentId: a._id, name: a.name, language: a.language, version: a.version, share: a.share, createdAt: a.createdAt }));
  },
});

/** The caller's own agent, or a refusal (another player's agents are private). */
export async function ownAgent(ctx: QueryCtx, agentId: string): Promise<Doc<"v2Agents">> {
  const id = ctx.db.normalizeId("v2Agents", agentId);
  const agent = id ? await ctx.db.get(id) : null;
  if (!agent) fail("NOT_FOUND", "No such agent");
  const { member } = await requireGameMember(ctx, agent.gameId);
  if (member._id !== agent.memberId) fail("FORBIDDEN", "That agent is not yours");
  return agent;
}

export const agentEnergy = query({
  args: { agentId: v.string() },
  returns: agentEnergyV,
  handler: async (ctx, { agentId }) => {
    const agent = await ownAgent(ctx, agentId);
    const e = await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", agent._id)).unique() ?? fail("NOT_FOUND", "No energy row");
    return { agentId: agent._id, energy: e.energy, acts: e.acts, skips: e.skips, failures: e.failures, spend: e.spend, pointsGained: e.pointsGained, lastActAt: e.lastActAt ?? null };
  },
});

/** An agent's programs, newest first (≤ 20). */
export const agentPrograms = query({
  args: { agentId: v.string() },
  returns: agentProgramsV,
  handler: async (ctx, { agentId }) => {
    const agent = await ownAgent(ctx, agentId);
    const rows = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id)).order("desc").take(MAX_AGENTS);
    return rows.map(p => ({ version: p.version, language: p.language, source: p.source, price: p.price, summonedAt: p.summonedAt, acts: p.acts, pointsGained: p.pointsGained }));
  },
});

/** The act log: moves that concern the caller, newest first. */
export const moves = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: movesPageV,
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const page = await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map(m => ({
        seq: m.seq, worldSeconds: m.worldSeconds, objectId: m.objectId, number: m.number, agentId: m.agentId ?? null, mine: m.mine,
        calls: m.calls, rep: m.rep, stateBefore: m.stateBefore, stateAfter: m.stateAfter, before: m.before, after: m.after, charge: m.charge ?? null,
      })),
    };
  },
});

/** The others-care scatter: every object's own rarity and want, packed. Null before the first commit. */
export const digest = query({
  args: { gameId: v.string() },
  returns: v.union(digestV, v.null()),
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const d = await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", member._id)).unique();
    return d ? { version: d.version, packed: d.packed } : null;
  },
});

