/**
 * A seated player's state and history that values nothing: their account, agents, act log, the public log, tugs, the
 * others-care digest and the object skeletons. Split from play.ts (the queries that value a score: my rule, an object's
 * worth, What if) so these never load valuation (test/unit/v2-values-load.test.ts): under a game's load they answered in
 * about a second from a cold isolate, and a page stopped hearing that its game had ended.
 */
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { dealablePool, familyOf } from "./deal";
import { presetOf } from "./presets";
import { agentIncome, energyCapacity, ownIncome, settle } from "@workspace/v2-economy";
import { fail, ownAccountNow, playerOf, requireGameMember, requireSeat, requireUser, worldNow } from "./access";
import {
  agentEnergyV, agentProgramsV, agentsPageV, digestV, logPageV, tugsV, meV, movesPageV, objectIdsV, objectSortV, objectFilterV,
} from "./validators";
import { pageOpts } from "./pages";
import { attributed, disclosed, disclosesNoise, objectReading, readingNoise } from "./disclose";
import { readsKnowledge } from "./knowledge";
import { objectPage } from "./objectOrder";

/**
 * At most 200 live agents per player per game (v1's MAX_AGENTS_PER_GOD, restored by the coordinator's call 35). Every
 * public list of them is a page (`agents`, R1); internal reads that need them all take at most this many a player.
 */
export const MAX_AGENTS = 200;
/** An agent's programs a list shows, newest first (one agent's versions; not bounded by the agent cap). */
export const MAX_PROGRAMS = 20;

/** A player's live agents, by the live index (a destroyed agent is never read). */
export const liveAgentsOf = (ctx: QueryCtx, gameId: Id<"v2Games">, memberId: Id<"v2Members">) =>
  ctx.db.query("v2Agents").withIndex("by_game_member_live", q => q.eq("gameId", gameId).eq("memberId", memberId).eq("destroyedAt", undefined));
/**
 * Every rule this game's dealer could deal (v1's "Possible gods"; the same pool as rule.candidates): the other players'
 * rules are among these, and nothing says who holds which. Cold: the preset's pool, in code.
 */
export const candidates = query({
  args: { gameId: v.string() },
  returns: v.array(v.object({ family: v.string(), title: v.string(), tieBreaker: v.union(v.string(), v.null()), card: v.string() })),
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    return dealablePool(presetOf(game.preset)).map(r => {
      const f = familyOf(r.family);
      return { family: r.family, title: f.title, tieBreaker: r.tieBreaker ?? null, card: f.card(r.params, r.tieBreaker as never) };
    });
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

/** The objects skeleton: a page of object ids in the caller's order; each row subscribes to `object`. */
export const objectIds = query({
  args: { gameId: v.string(), sort: objectSortV, filter: v.optional(objectFilterV), paginationOpts: paginationOptsValidator },
  returns: objectIdsV,
  handler: async (ctx, { gameId, sort, filter, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    // v1's sorts and filters (objectOrder.ts); paid observation reads what the player was told (knowledge.ts).
    const { knowledge: _, ...page } = await objectPage(ctx, game, member._id, sort, filter ?? "all", pageOpts(paginationOpts));
    return { ...page, page: page.page.map(r => ({ objectId: r.objectId, number: r.number })) };
  },
});

/**
 * The retired lines' skeleton (turnover, retirement-design.md): a page of the caller's retired lines, the latest first;
 * each row subscribes to `object`, which carries its final state, its retirement and the points it banked. One index
 * page; empty when the game has no turnover.
 */
export const banked = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: objectIdsV,
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const page = await ctx.db.query("v2ObjectValues").withIndex("by_game_member_born", q => q.eq("gameId", game._id).eq("memberId", member._id).eq("retired", true))
      .order("desc").paginate(pageOpts(paginationOpts));
    return { ...page, page: page.page.map(r => ({ objectId: r.objectId, number: r.number })) };
  },
});

/** A move's value snapshot without a level stored before decision 23 (migrations:stripLevels). */
/** A move's value snapshot as a read discloses it (disclose.ts: the noisy others' sum while live, exact after). */
const snapIn = (game: Parameters<typeof disclosed>[0]) => (s: { score: (string | null)[] | null; rarityBits: number; want: number; points: number; shownWant?: number; shownPoints?: number }) =>
  ({ score: s.score, rarityBits: s.rarityBits, ...disclosed(game, s) });
/** The agents skeleton: a page (≤ 50) of the caller's live agents, oldest first; each row subscribes to `agentEnergy`. */
export const agents = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: agentsPageV,
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const page = await liveAgentsOf(ctx, game._id, member._id).paginate(pageOpts(paginationOpts));
    return { ...page, page: page.page.map(a => ({ agentId: a._id, name: a.name, language: a.language, version: a.version, share: a.share, createdAt: a.createdAt })) };
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
      agentId: agent._id, energy: now.balance, acts: e.acts, skips: e.skips, failures: e.failures, spend: e.spend, spendRead: e.spendRead ?? 0, spendChange: e.spendChange ?? 0, lastAct: e.lastAct ?? null, pointsGained: e.pointsGained, lastActAt: e.lastActAt ?? null,
      perSecond, capacity, settledAt: now.settledWorldSeconds, history: e.history ?? [],
      // The current program's estimate (checkNode.ts estimate): one more document, cold (written once a program).
      estimate: (await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", agent.version)).unique())?.estimate ?? null,
    };
  },
});

/** An agent's programs, newest first (≤ MAX_PROGRAMS: one agent's versions, a per-item read). */
export const agentPrograms = query({
  args: { agentId: v.string() },
  returns: agentProgramsV,
  handler: async (ctx, { agentId }) => {
    const agent = await ownAgent(ctx, agentId);
    const rows = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id)).order("desc").take(MAX_PROGRAMS);
    return rows.map(p => ({ version: p.version, language: p.language, source: p.source, price: p.price, summonedAt: p.summonedAt, acts: p.acts, pointsGained: p.pointsGained }));
  },
});

/** An act-log row as its player reads it: live, another player's move carries no mover, agent, calls or cost (v1's public log). */
export const moveView = (game: Doc<"v2Games">) => (m: Doc<"v2Moves">) => {
  const open = attributed(game, m.mine);
  return {
    seq: m.seq, worldSeconds: m.worldSeconds, objectId: m.objectId, number: m.number, agentId: open ? m.agentId ?? null : null, mine: m.mine,
    calls: open ? m.calls : [], rep: open ? m.rep : "", stateBefore: m.stateBefore, stateAfter: m.stateAfter, before: snapIn(game)(m.before), after: snapIn(game)(m.after),
    charge: open ? m.charge ?? null : null,
    by: open && m.by ? { memberId: m.by, name: game.roster.find(r => r.memberId === m.by)?.name ?? "A player" } : null,
    notes: m.notes ?? [],
  };
};

/** The act log: moves that concern the caller, newest first. */
export const moves = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: movesPageV,
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const page = await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOpts(paginationOpts));
    // Paid observation (knowledge.ts): only the player's own agents' moves; another's move is content they did not pay for.
    if (readsKnowledge(game, member._id)) page.page = page.page.filter(m => m.mine);
    return {
      ...page,
      // Live, another player's move carries no mover, agent, calls or cost (attributed: v1's public log).
      page: page.page.map(moveView(game)),
    };
  },
});

/**
 * The public log (v1's, docs/public-log-design.md §1–§2): every birth and move of the game, newest first, one index page.
 * A seated player reads their own bits, the others' summed bits (with the disclosure noise while live) and their points,
 * after and before; a member not seated reads the rows without bits. While live another player's move says nothing of
 * who made it; an ended game attributes every move and shows exact sums.
 */
/**
 * One page of the public log as `member` sees it (v1's public log): every born and move event, newest first; the
 * caller's own bits, the others' sum (noisy while live) and points; the mover, agent, calls and charge only on the
 * caller's own moves while live, on every move after the end. `play:log` and the `log.list` affordance share it.
 */
export async function logPage(ctx: QueryCtx, game: Doc<"v2Games">, memberId: Id<"v2Members">, paginationOpts: PaginationOptions) {
  const i = game.roster.findIndex(r => r.memberId === memberId), live = disclosesNoise(game), paid = readsKnowledge(game, memberId);
  const page = await ctx.db.query("v2Log").withIndex("by_game_seq", q => q.eq("gameId", game._id)).order("desc").paginate(pageOpts(paginationOpts));
  // The others' sum as this reader read the object at that version (decision 32: their own reading, the one their
  // value row carries), exact after the end.
  const view = (bits: readonly number[] | undefined, objectId: string, version: number) => {
    if (i < 0 || !bits) return { own: null, others: null, points: null };
    const noise = live ? readingNoise(game, memberId, objectReading(objectId, version)) : 0;
    const own = bits[i] ?? 0, others = bits.reduce((t, b) => t + b, 0) - own + noise;
    return { own, others, points: own * Math.max(0, others) };
  };
  return {
    ...page,
    page: page.page.map(r => {
      const mine = !!r.by && r.by === memberId, open = r.kind === "move" && attributed(game, mine);
      // Paid observation (knowledge.ts): another player's move shows only that it happened ("activity is public;
      // content is paid"); a birth is public.
      const hidden = paid && r.kind === "move" && !mine;
      const none = { own: null, others: null, points: null };
      const now = hidden ? none : view(r.bits, r.objectId, r.version), was = hidden ? none : view(r.bitsBefore, r.objectId, r.version - 1);
      return {
        seq: r.seq, worldSeconds: r.worldSeconds, kind: r.kind, objectId: r.objectId, number: r.number, version: r.version,
        stateBefore: hidden ? null : r.stateBefore ?? null, state: hidden ? null : r.state, mine, ...now, ownBefore: was.own, othersBefore: was.others, pointsBefore: was.points,
        by: open && r.by ? { memberId: r.by, name: game.roster.find(x => x.memberId === r.by)?.name ?? "A player" } : null,
        agentId: open ? r.agentId ?? null : null, calls: open ? r.calls ?? null : null, charge: open ? r.charge ?? null : null,
      };
    }),
  };
}

export const log = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: logPageV,
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game, member } = await requireGameMember(ctx, gameId);
    return await logPage(ctx, game, member._id, paginationOpts);
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
    if (readsKnowledge(game, member._id)) return [];   // paid observation: built on others' moves' content
    const rows = await ctx.db.query("v2Tugs").withIndex("by_game_member_flips", q => q.eq("gameId", game._id).eq("memberId", member._id).gte("flips", MIN_TUG_FLIPS))
      .order("desc").take(MAX_TUGS);
    const nameOf = (id: string) => game.roster.find(r => r.memberId === id)?.name ?? "A player";
    return rows.map(t => ({
      objectId: t.objectId, number: t.number, moves: t.moves, flips: t.flips, mySpend: t.mySpend,
      // Live, a tug names nobody on the other side (v1's public log); an ended game does.
      others: attributed(game, false) ? t.others.map(memberId => ({ memberId, name: nameOf(memberId) })) : [], from: t.from, to: t.to, best: t.best, cycle: t.cycle ?? null,
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
/** The newest moves on one object an `objectMoves` read answers (one index page). */
export const MAX_OBJECT_MOVES = 50;

/**
 * The caller's own act-log rows for one object, by its number, newest first (≤ 50): who moved it lately and whether
 * each move went up or down for the caller (bits) and for the others (their total), so the face shows the climb and the
 * end summary says whether the players climbed together or undid each other, without paging the whole act log. Live,
 * another player's move carries no name (v1's public log); an ended game names who moved it. One v2Objects row by number and one index page of v2Moves.
 */
export const objectMoves = query({
  args: { gameId: v.string(), number: v.number() },
  returns: v.array(v.object({
    seq: v.number(), number: v.number(), worldSeconds: v.number(), stateAfter: v.string(), mine: v.boolean(),
    before: v.object({ rarityBits: v.number(), want: v.number(), points: v.number() }), after: v.object({ rarityBits: v.number(), want: v.number(), points: v.number() }),
    by: v.union(v.object({ memberId: v.id("v2Members"), name: v.string() }), v.null()),
  })),
  handler: async (ctx, { gameId, number }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    const object = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", game._id).eq("number", number)).unique();
    if (!object) return [];
    const all = await ctx.db.query("v2Moves").withIndex("by_game_member_object", q => q.eq("gameId", game._id).eq("memberId", member._id).eq("objectId", object._id))
      .order("desc").take(MAX_OBJECT_MOVES);
    // Paid observation: only the player's own agents' moves (knowledge.ts).
    const rows = readsKnowledge(game, member._id) ? all.filter(m => m.mine) : all;
    return rows.map(m => ({
      seq: m.seq, number: m.number, worldSeconds: m.worldSeconds, stateAfter: m.stateAfter, mine: m.mine,
      // The others' sum and the points as disclosed while live (disclose.ts), exact after the end.
      before: { rarityBits: m.before.rarityBits, ...disclosed(game, m.before) },
      after: { rarityBits: m.after.rarityBits, ...disclosed(game, m.after) },
      // Live, another player's move is unattributed (v1's public log, #587): only an ended game names who moved it.
      by: m.by && attributed(game, m.mine) ? { memberId: m.by, name: game.roster.find(r => r.memberId === m.by)?.name ?? "A player" } : null,
    }));
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
