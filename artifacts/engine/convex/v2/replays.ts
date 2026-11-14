/**
 * An ended game's stored replay (spec §9.2, integration plan §2.2): the whole record (every event, every player's
 * rule: after the end nothing is private) built once into a file, so the replay page fetches one file instead of
 * paging the log. Served by GET /api/v2/replay/<gameId> (convex/http.ts), which checks the caller's Convex JWT on every
 * request: never a storage URL, since sign-in is required everywhere (owner decision 2026-11-02).
 */
import { valueRecord } from "./values";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query } from "../_generated/server";
import { requireGameMember } from "./access";
import { replayV } from "./validators";

/** The stored file's shape; a reader that finds another version folds `v2Events` itself. */
/** A rule's value function for the replay file (what valueLookup takes), so a replay's faces show bits. */
const valueFnOf = (ruleKey: string) => {
  const r = valueRecord(ruleKey);
  return r ? { knots: r.knots.map(k => ({ u: k.u, bits: k.bits, lo: k.lo, hi: k.hi })), tail: r.tail ?? null } : null;
};

export const STORED_REPLAY_VERSION = 1;
const PAGE = 200;
/**
 * A pause between the build's pages: the build runs once a game ends, often while other games tick, and a build that
 * reads the whole record back to back starved their commits (8 builds at once held commits for 8–17 s on the local
 * backend, one timing out with "too many system operations").
 */
const PAGE_PAUSE_MS = 100;

/** Whether the file is stored (for any member of the game's room). */
export const stored = query({
  args: { gameId: v.string() },
  returns: replayV,
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    return { stored: game.phase === "ended" && !!game.replayFile };
  },
});

/** The download's check: the caller (the request's JWT) is a member of the game's room, and the file is there. */
export const fileFor = internalQuery({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    return game.phase === "ended" ? game.replayFile ?? null : null;
  },
});

/** What the file embeds besides the events: the header and every player's rule. */
export const header = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.phase !== "ended" || game.replayFile) return null;
    const rules = [];
    for (const s of game.roster) {
      const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", s.memberId)).unique();
      if (r) rules.push({ memberId: r.memberId, family: r.family, params: r.params, tieBreaker: r.tieBreaker, ruleKey: r.ruleKey, card: r.card, layers: r.layers, contentHash: r.contentHash, value: valueFnOf(r.ruleKey), handicap: r.handicap ?? null });
    }
    const { _id, _creationTime, replayFile: _, ...rest } = game;
    return { game: { gameId: _id, ...rest }, rules };
  },
});

export const events = internalQuery({
  args: { gameId: v.id("v2Games"), after: v.number() },
  handler: async (ctx, { gameId, after }) =>
    (await ctx.db.query("v2Events").withIndex("by_game_seq", q => q.eq("gameId", gameId).gt("seq", after)).take(PAGE)).map(e => ({ seq: e.seq, kind: e.kind, data: e.data })),
});

const HEADER = makeFunctionReference<"query", { gameId: Id<"v2Games"> }, unknown>("v2/replays:header");
const EVENTS = makeFunctionReference<"query", { gameId: Id<"v2Games">; after: number }, { seq: number }[]>("v2/replays:events");
const ATTACH = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; file: Id<"_storage"> }, boolean>("v2/replays:attach");

/** Scheduled by the end (loop.ts endGame). Idempotent: a game with its file is left alone; a losing race deletes its copy. */
export const build = internalAction({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }): Promise<{ stored: boolean }> => {
    const head = await ctx.runQuery(HEADER, { gameId });
    if (!head) return { stored: false };
    const events: { seq: number }[] = [];
    for (let after = -1; ;) {
      const page = await ctx.runQuery(EVENTS, { gameId, after });
      events.push(...page);
      if (page.length < PAGE) break;
      after = page.at(-1)!.seq;
      await new Promise(r => setTimeout(r, PAGE_PAUSE_MS));
    }
    const file = await ctx.storage.store(new Blob([JSON.stringify({ version: STORED_REPLAY_VERSION, ...(head as object), events })], { type: "application/json" }));
    const kept = await ctx.runMutation(ATTACH, { gameId, file });
    if (!kept) await ctx.storage.delete(file);
    return { stored: kept };
  },
});

export const attach = internalMutation({
  args: { gameId: v.id("v2Games"), file: v.id("_storage") },
  handler: async (ctx, { gameId, file }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.replayFile) return false;
    await ctx.db.patch(gameId, { replayFile: file });
    return true;
  },
});
