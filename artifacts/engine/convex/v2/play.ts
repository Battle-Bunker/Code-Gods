/**
 * Live queries a seated player's panes subscribe to (integration plan §2.2). Every answer is the caller's own: their
 * rule, account, values, agents and moves; another player's rule, score or value never leaves the server while the
 * game is live (v2-disclosure.test.ts). Each reads one document or one index page.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { slimKnots, valueFnIn, type ValueScope } from "./values";
import { seatRules } from "./loop";
import { decode, encode, scopeOf, typeOf, valuesOf, variantOf } from "./world";
import { callV } from "./tables";
import { applyCall, isInvalid } from "@workspace/v2-core";
import { agentIncome, energyCapacity, ownIncome, settle } from "@workspace/v2-economy";
import { fail, ownAccountNow, playerOf, requireGameMember, requireSeat, requireUser, worldNow } from "./access";
import {
  agentEnergyV, agentProgramsV, agentRowV, digestV, tugsV, meV, movesPageV, myRuleV, objectIdsV, objectSortV, playObjectV,
} from "./validators";
import { pageOpts } from "./pages";

/** ≤ 20 agents per player (R3). */
export const MAX_AGENTS = 20;

/** The rule's value function, as valueLookup takes it (knots and tail), with the game's uniqueness correction. */
function valueFn(ruleKey: string, scope: ValueScope) {
  const f = valueFnIn(ruleKey, scope);
  if (!f) throw new Error(`No value function for ${ruleKey}`);
  return { ...f, knots: slimKnots(f.knots), tail: f.tail as unknown };
}

export const myRule = query({
  args: { gameId: v.string() },
  returns: myRuleV,
  handler: async (ctx, { gameId }) => {
    const { rule: r, game } = await requireSeat(ctx, gameId);
    return {
      family: r.family, title: r.title, params: r.params, layers: r.layers, tieBreaker: r.tieBreaker, card: r.card, depends: r.depends, primary: r.primary,
      ruleKey: r.ruleKey, contentHash: r.contentHash, value: valueFn(r.ruleKey, scopeOf(game)), bid: r.bid ?? null, handicap: r.handicap ?? null,
    };
  },
});

export const me = query({
  args: { gameId: v.string() },
  returns: meV,
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const player = await playerOf(ctx, game._id, member._id) ?? fail("NOT_FOUND", "No account in this game");
    const own = await ownAccountNow(ctx, game, player), ownPerSecond = ownIncome(player.power, player.allocated);
    return {
      memberId: player.memberId, energy: own.balance, power: player.power, ready: player.ready, pauseUsed: player.pauseUsed, agents: player.agents,
      ownPerSecond, capacity: energyCapacity(ownPerSecond, game.settings.economy.fullChargeSeconds), settledAt: own.settledWorldSeconds,
    };
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
      .order("desc").paginate(pageOpts(paginationOpts));
    return { ...page, page: page.page.map(r => ({ objectId: r.objectId, number: r.number })) };
  },
});

/** A move's value snapshot without a level stored before decision 23 (migrations:stripLevels). */
const snap = ({ score, rarityBits, want, points }: { score: (string | null)[] | null; rarityBits: number; want: number; points: number }) => ({ score, rarityBits, want, points });

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
      value: value ? { score: value.score, rarityBits: value.rarityBits, want: value.want, points: value.points, version: value.version } : null,
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
    // Settled to the world clock (the row holds the balance as of the agent's last act), so it grows between acts.
    const game = (await ctx.db.get(agent.gameId))!, world = await worldNow(ctx, game);
    const perSecond = agent.destroyedAt === undefined ? agentIncome(game.settings.economy.powerPerSecond, agent.share) : 0;
    const capacity = energyCapacity(perSecond, game.settings.economy.fullChargeSeconds);
    const now = world === null ? { balance: e.energy, settledWorldSeconds: e.settledAt } : settle({ balance: e.energy, settledWorldSeconds: e.settledAt }, Math.max(e.settledAt, world), perSecond, capacity);
    return {
      agentId: agent._id, energy: now.balance, acts: e.acts, skips: e.skips, failures: e.failures, spend: e.spend, pointsGained: e.pointsGained, lastActAt: e.lastActAt ?? null,
      perSecond, capacity, settledAt: now.settledWorldSeconds,
    };
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
    const page = await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOpts(paginationOpts));
    return {
      ...page,
      page: page.page.map(m => ({
        seq: m.seq, worldSeconds: m.worldSeconds, objectId: m.objectId, number: m.number, agentId: m.agentId ?? null, mine: m.mine,
        calls: m.calls, rep: m.rep, stateBefore: m.stateBefore, stateAfter: m.stateAfter, before: snap(m.before), after: snap(m.after), charge: m.charge ?? null,
        by: m.by ? { memberId: m.by, name: game.roster.find(r => r.memberId === m.by)?.name ?? "A player" } : null,
        notes: m.notes ?? [],
      })),
    };
  },
});

/** A tug-of-war: the line changed hands (the caller's agent, then another's, or back) at least this often. */
export const MIN_TUG_FLIPS = 2;
/** At most this many tugs, the most-flipped first (R8: one bounded index page). */
export const MAX_TUGS = 20;

/** The caller's tugs-of-war over the whole game (the tick folds them: loop.ts `foldTugs`), most-flipped first. */
export const tugs = query({
  args: { gameId: v.string() },
  returns: tugsV,
  handler: async (ctx, { gameId }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const rows = await ctx.db.query("v2Tugs").withIndex("by_game_member_flips", q => q.eq("gameId", game._id).eq("memberId", member._id).gte("flips", MIN_TUG_FLIPS))
      .order("desc").take(MAX_TUGS);
    const nameOf = (id: string) => game.roster.find(r => r.memberId === id)?.name ?? "A player";
    return rows.map(t => ({
      objectId: t.objectId, number: t.number, moves: t.moves, flips: t.flips, mySpend: t.mySpend,
      others: t.others.map(memberId => ({ memberId, name: nameOf(memberId) })), from: t.from, to: t.to, best: t.best,
    }));
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


/** At most this many candidate moves per read (the face lists a few candidates). */
export const MAX_CANDIDATES = 4;

/**
 * The others' total bits on an object after each candidate move (playtest round 8: a player may see the others' TOTAL
 * before and after a candidate, never one player's rule or bits). The server applies each call to the object's live
 * state itself, so only states one move from where the object is can be asked about, not any state at all; at most four
 * per read. Reads the object, its state, the caller's seat and the seated players' rules (≤ 16, cold): it re-runs only
 * when this object moves. An invalid call answers null.
 */
export const othersAt = query({
  args: { objectId: v.string(), calls: v.array(callV) },
  returns: v.object({ state: v.string(), after: v.array(v.union(v.object({ state: v.string(), want: v.number() }), v.null())) }),
  handler: async (ctx, { objectId, calls }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    if (calls.length > MAX_CANDIDATES) fail("BAD_REQUEST", `Ask for at most ${MAX_CANDIDATES} moves`);
    const { game, member } = await requireSeat(ctx, object.gameId);
    const seats = await seatRules(ctx, game);
    const now = decode(state.state, game.variant), type = typeOf(game.variant), variant = variantOf(game.variant);
    return {
      state: state.state,
      after: calls.map(call => {
        const r = applyCall(type, variant, now, call);
        if (isInvalid(r)) return null;
        const want = valuesOf(r.result, game.variant, seats, scopeOf(game).objects).find(x => x.memberId === member._id)?.want ?? 0;
        return { state: encode(r.result, game.variant), want };
      }),
    };
  },
});

/** The newest moves on one object an `objectMoves` read answers (one index page; a hold is found among them). */
export const MAX_OBJECT_MOVES = 50;

/**
 * The caller's own act-log rows for one object, by its number, newest first (≤ 50): the end summary finds a held deal
 * in them (when the object first reached the agent's TARGET, who put it back there, the caller's points before and
 * after) without paging the whole act log. One v2Objects row by number and one index page of v2Moves.
 */
export const objectMoves = query({
  args: { gameId: v.string(), number: v.number() },
  returns: v.array(v.object({
    seq: v.number(), number: v.number(), worldSeconds: v.number(), stateAfter: v.string(), mine: v.boolean(),
    before: v.object({ points: v.number() }), after: v.object({ points: v.number() }),
    by: v.union(v.object({ memberId: v.id("v2Members"), name: v.string() }), v.null()),
  })),
  handler: async (ctx, { gameId, number }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const object = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", game._id).eq("number", number)).unique();
    if (!object) return [];
    const rows = await ctx.db.query("v2Moves").withIndex("by_game_member_object", q => q.eq("gameId", game._id).eq("memberId", member._id).eq("objectId", object._id))
      .order("desc").take(MAX_OBJECT_MOVES);
    return rows.map(m => ({
      seq: m.seq, number: m.number, worldSeconds: m.worldSeconds, stateAfter: m.stateAfter, mine: m.mine,
      before: { points: m.before.points }, after: { points: m.after.points },
      by: m.by ? { memberId: m.by, name: game.roster.find(r => r.memberId === m.by)?.name ?? "A player" } : null,
    }));
  },
});
