/**
 * Live queries a seated player's panes subscribe to (integration plan §2.2). Every answer is the caller's own: their
 * rule, account, values, agents and moves; another player's rule, score or value never leaves the server while the
 * game is live (v2-disclosure.test.ts). Each reads one document or one index page.
 */
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { slimKnots, valueFnIn, type ValueScope } from "./values";
import { seatRules } from "./loop";
import { decode, encode, scopeOf, typeOf, valuesOf, variantOf } from "./world";
import { callV } from "./tables";
import { applyCall, isInvalid } from "@workspace/v2-core";
import { agentIncome, energyCapacity, ownIncome, settle } from "@workspace/v2-economy";
import { fail, ownAccountNow, playerOf, requireGameMember, requireSeat, requireUser, worldNow } from "./access";
import {
  agentEnergyV, agentProgramsV, agentRowV, digestV, logPageV, tugsV, meV, movesPageV, myRuleV, objectIdsV, objectSortV, playObjectV,
} from "./validators";
import { pageOpts } from "./pages";
import { attributed, disclosed, disclosesNoise, objectReading, readingNoise } from "./disclose";
import { KNOWLEDGE_SORT, knownOf, listsKnowledge, readsKnowledge } from "./knowledge";

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
/** The sorts on the others' sum and on points read the disclosed values (the exact order would leak while live). */
const SHOWN_SORT_INDEX = { ...SORT_INDEX, points: "by_game_member_shownPoints", want: "by_game_member_shownWant" } as const;
/**
 * The index a sort reads, fixed for the game's lifetime: a paginated list re-runs its loaded pages with their cursors
 * when the game ends, and a cursor is only valid on the index it came from. At the end the disclosed fields become the
 * exact ones (loop.ts exactValues), so the same index gives the exact order. Games stored before the noise have no key
 * and no disclosed fields: they read the exact ones.
 */
export const sortIndexOf = (game: { noiseKey?: string }, sort: keyof typeof SORT_INDEX) => (game.noiseKey ? SHOWN_SORT_INDEX : SORT_INDEX)[sort];

/** The objects skeleton: a page of object ids in the caller's order; each row subscribes to `object`. */
export const objectIds = query({
  args: { gameId: v.string(), sort: objectSortV, paginationOpts: paginationOptsValidator },
  returns: objectIdsV,
  handler: async (ctx, { gameId, sort, paginationOpts }) => {
    const { game, member } = await requireSeat(ctx, gameId);
    // Paid observation: the same sorts, over what the player was told (knowledge.ts), for the game's lifetime.
    const page = listsKnowledge(game, member._id)
      ? await ctx.db.query("v2Knowledge").withIndex(KNOWLEDGE_SORT[sort], q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOpts(paginationOpts))
      : await ctx.db.query("v2ObjectValues").withIndex(sortIndexOf(game, sort), q => q.eq("gameId", game._id).eq("memberId", member._id))
        .order("desc").paginate(pageOpts(paginationOpts));
    return { ...page, page: page.page.map(r => ({ objectId: r.objectId, number: r.number })) };
  },
});

/** A move's value snapshot without a level stored before decision 23 (migrations:stripLevels). */
/** A move's value snapshot as a read discloses it (disclose.ts: the noisy others' sum while live, exact after). */
const snapIn = (game: Parameters<typeof disclosed>[0]) => (s: { score: (string | null)[] | null; rarityBits: number; want: number; points: number; shownWant?: number; shownPoints?: number }) =>
  ({ score: s.score, rarityBits: s.rarityBits, ...disclosed(game, s) });

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
    const { game, member } = await requireGameMember(ctx, object.gameId);
    // Paid observation (knowledge.ts): the object as the player was last told it; its activity (changes since) is public.
    if (readsKnowledge(game, member._id)) {
      const k = await knownOf(ctx, object._id, member._id);
      return {
        objectId: object._id, number: object.number, bornAt: object.bornAt, state: k?.state ?? "", version: k?.version ?? 0, changedAt: state.changedAt,
        value: k ? { score: k.score, rarityBits: k.rarityBits, want: k.want, points: k.points, version: k.version } : null,
        knownAt: k?.learnedAt ?? null, changesSince: state.version - (k?.version ?? 0),
      };
    }
    const value = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id).eq("memberId", member._id)).unique();
    return {
      objectId: object._id, number: object.number, bornAt: object.bornAt, state: state.state, version: state.version, changedAt: state.changedAt,
      // The others' sum and the points as disclosed while live (disclose.ts), exact after the end.
      value: value ? { score: value.score, rarityBits: value.rarityBits, ...disclosed(game, value), version: value.version } : null,
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
    // Paid observation (knowledge.ts): only the player's own agents' moves; another's move is content they did not pay for.
    if (readsKnowledge(game, member._id)) page.page = page.page.filter(m => m.mine);
    return {
      ...page,
      // Live, another player's move carries no mover, agent, calls or cost (attributed: v1's public log).
      page: page.page.map(m => {
        const open = attributed(game, m.mine);
        return {
          seq: m.seq, worldSeconds: m.worldSeconds, objectId: m.objectId, number: m.number, agentId: open ? m.agentId ?? null : null, mine: m.mine,
          calls: open ? m.calls : [], rep: open ? m.rep : "", stateBefore: m.stateBefore, stateAfter: m.stateAfter, before: snapIn(game)(m.before), after: snapIn(game)(m.after),
          charge: open ? m.charge ?? null : null,
          by: open && m.by ? { memberId: m.by, name: game.roster.find(r => r.memberId === m.by)?.name ?? "A player" } : null,
          notes: m.notes ?? [],
        };
      }),
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
      others: attributed(game, false) ? t.others.map(memberId => ({ memberId, name: nameOf(memberId) })) : [], from: t.from, to: t.to, best: t.best,
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
 * per read. Reads the object, its state, the caller's seat, the seated players' rules (≤ 16, cold) and, per candidate,
 * whether another object holds its state (objects are unique; ≤ 4 index reads of ≤ 2 rows): it re-runs when this object moves or
 * another object moves onto or off a candidate's state. An invalid call answers null.
 */
export const othersAt = query({
  args: { objectId: v.string(), calls: v.array(callV) },
  returns: v.object({ state: v.string(), after: v.array(v.union(v.object({ state: v.string(), want: v.number(), taken: v.union(v.number(), v.null()) }), v.null())) }),
  handler: async (ctx, { objectId, calls }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    if (calls.length > MAX_CANDIDATES) fail("BAD_REQUEST", `Ask for at most ${MAX_CANDIDATES} moves`);
    const { game, member } = await requireSeat(ctx, object.gameId);
    const seats = await seatRules(ctx, game);
    // Paid observation: candidates from the state the player was told, not the live one (knowledge.ts).
    const from = readsKnowledge(game, member._id) ? (await knownOf(ctx, object._id, member._id))?.state ?? state.state : state.state;
    const now = decode(from, game.variant), type = typeOf(game.variant), variant = variantOf(game.variant);
    const after = [];
    for (const call of calls) {
      const r = applyCall(type, variant, now, call);
      if (isInvalid(r)) { after.push(null); continue; }
      const wire = encode(r.result, game.variant);
      const exact = valuesOf(r.result, game.variant, seats, scopeOf(game).objects).find(x => x.memberId === member._id)?.want ?? 0;
      // The others' sum at the candidate as this player reads it while live (decision 32: their own reading of that
      // candidate from this version of the object, independent of everyone else's).
      // A candidate that changes nothing reads what the object shows (not a second measurement of it).
      const what = wire === state.state ? objectReading(object._id, state.version) : `quote:${object._id}:${state.version}:${wire}`;
      const want = exact + (disclosesNoise(game) ? readingNoise(game, member._id, what) : 0);
      // Objects are unique: a candidate onto a state another object holds is not available (its number says which).
      const holders = await ctx.db.query("v2ObjectStates").withIndex("by_game_state", q => q.eq("gameId", game._id).eq("state", wire)).take(2);
      const holder = holders.find(h => h.objectId !== object._id);
      const taken = holder ? (await ctx.db.get(holder.objectId))?.number ?? null : null;
      after.push({ state: wire, want, taken });
    }
    return { state: from, after };
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
