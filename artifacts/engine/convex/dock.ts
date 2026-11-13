/**
 * The dock's narrow queries (docs/convex-read-architecture.md §4.3, §6 PR 5): each SDK hook reads only what it renders,
 * instead of every panel reading the whole-world player.observation. The observation stays for agents and MCP tools.
 *
 *   dock.state            the observation's header, clock, self, economy and instance: no collections (≈ 10 docs)
 *   dock.agents           the viewer's own agents (as the observation shows them)
 *   dock.transformations  the viewer's own recent transformations (one page of objectEvents.by_game_owner_seq)
 *   dock.agentSeries      the viewer's agents' energy over the game, written by the tick (game/agentSeries.ts)
 *
 * The standings, their history, chat and objects come from games.standings, games.standingsHistory, rooms.chat and
 * the per-god object read model (player.objectIds / object / objectsPage / totals). Every answer is the viewer's own
 * projection or public: the same disclosure as the observation's (lib/projection.ts).
 */
import { v } from "convex/values";
import { allowedLanguages, type GameSettings } from "@workspace/game-core";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireViewer } from "./auth/access";
import { currentGame, deityOf } from "./lib/load";
import { agentView, observation } from "./lib/projection";
import { requireMemberAs, requireRoom } from "./lib/rooms";
import { withClock } from "./game/state";
import { sandboxViews } from "./runtime/readiness";

/** The room, the viewer as a member, and the room's current game with its clock (or null). */
async function seat(ctx: QueryCtx, roomId: string) {
  const viewer = await requireViewer(ctx);
  const room = await requireRoom(ctx, roomId);
  const { member } = await requireMemberAs(ctx, viewer, room, "read");
  const header = await currentGame(ctx, room);
  const game = header && await withClock(ctx, header);
  return { viewer, room, member, game };
}

/**
 * The observation without its collections (objects, agents, transformations, chat, leaderboard): phase, codes, clocks,
 * notice, languages, sandboxes, hold rarity, instance, economy and self. The own score is the read model's total
 * (godTotals: the sum of the payoffs as disclosed, as the observation computes it). Re-runs with each commit (the clock).
 */
export const state = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const { viewer, room, member, game } = await seat(ctx, roomId);
    const deity = game ? await deityOf(ctx, game._id, viewer.subject) : null;
    const [sandboxes, totals] = await Promise.all([
      sandboxViews(ctx, allowedLanguages((game?.settings ?? room.settings) as GameSettings)),
      game && deity ? ctx.db.query("godTotals").withIndex("by_game_god", q => q.eq("gameId", game._id).eq("godId", viewer.subject)).first() : null,
    ]);
    const { objects: _o, agents: _a, transformations: _t, chat: _c, leaderboard: _l, leaderboardWorldSeconds: _w, ...rest } = observation({
      room, game, deity, sandboxes, objects: [], agents: [], chat: [], transformations: [],
      self: { godId: viewer.subject, name: member.name, kind: member.kind, ready: member.ready },
    });
    // `roster`: the game's gods in roster order (the order of games.standingsHistory's totals).
    // `objectCount`: the live number of objects (public, on the clock): what a look at everything is priced by.
    return { ...rest, roster: game ? game.roster.map(m => m.id) : [], ...(game ? { objectCount: game.objectCount } : {}), self: { ...rest.self, ...(game && deity ? { score: totals?.score ?? 0 } : {}) } };
  },
});

/** The viewer's own agents in the room's current game (energy settled now, as the observation shows them). */
export const agents = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const { viewer, game } = await seat(ctx, roomId);
    if (!game) return [];
    // bounded: one god's agents (game-core MAX_AGENTS_PER_GOD, 200; as the observation reads them). A game's usual few.
    const own = await ctx.db.query("agents").withIndex("by_game_owner", q => q.eq("gameId", game._id).eq("ownerId", viewer.subject)).take(200);
    const now = Date.now();
    return own.map((a, i) => agentView(game, a, now, i));
  },
});

/** The most transformations one page returns (R2: one index page). */
export const TRANSFORMATIONS_MAX = 90;

/**
 * The viewer's own most recent transformations (at most TRANSFORMATIONS_MAX), oldest first, id `<seq>:<position in its
 * batch>` as in the observation: one page of the viewer's objectEvents rows.
 */
export const transformations = query({
  args: { roomId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { roomId, limit }) => {
    const { viewer, game } = await seat(ctx, roomId);
    if (!game) return [];
    const n = Math.max(1, Math.min(TRANSFORMATIONS_MAX, Math.floor(limit ?? TRANSFORMATIONS_MAX)));
    const rows = await ctx.db.query("objectEvents").withIndex("by_game_owner_seq", q => q.eq("gameId", game._id as Id<"games">).eq("ownerId", viewer.subject))
      .order("desc").take(n);
    return rows.reverse().map(r => ({
      id: `${r.seq}:${r.index}`, agentId: r.agentId!, before: r.before!, after: r.value,
      ...(Array.isArray(r.calls) ? { calls: (r.calls as unknown[]).slice(0, 16) } : {}), ...(r.cost !== undefined ? { cost: r.cost } : {}),
    }));
  },
});

export const SERIES_PAGE = 90;

/**
 * The viewer's agents' energy over the game: the samples after world time `after` (all from the start when omitted),
 * oldest first, at most SERIES_PAGE; a client pages on with the last row's `world`.
 */
export const agentSeries = query({
  args: { gameId: v.id("games"), after: v.optional(v.number()) },
  handler: async (ctx, { gameId, after }) => {
    const viewer = await requireViewer(ctx);
    const rows = await ctx.db.query("agentSamples")
      .withIndex("by_game_god_world", q => (after === undefined ? q.eq("gameId", gameId).eq("godId", viewer.subject) : q.eq("gameId", gameId).eq("godId", viewer.subject).gt("world", after)))
      .take(SERIES_PAGE);
    return { rows: rows.map(r => ({ world: r.world, agents: r.agents })), more: rows.length === SERIES_PAGE };
  },
});
