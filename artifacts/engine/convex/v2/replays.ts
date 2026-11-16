/**
 * An ended game's stored replay (spec §9.2, integration plan §2.2): the whole record (every event, every player's
 * rule: after the end nothing is private) built once into a file, so the replay page fetches one file instead of
 * paging the log. Served by GET /api/v2/replay/<gameId> (convex/http.ts), which checks the caller's Convex JWT on every
 * request: never a storage URL, since sign-in is required everywhere (owner decision 2026-11-02).
 */
import { scopeOf } from "./world";
import { PAGE, PAGE_BYTES } from "./replayFormat";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query } from "../_generated/server";
import { requireGameMember } from "./access";
import { replayV } from "./validators";

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
      if (r) rules.push({ memberId: r.memberId, family: r.family, params: r.params, tieBreaker: r.tieBreaker, ruleKey: r.ruleKey, card: r.card, layers: r.layers, contentHash: r.contentHash, value: null, handicap: r.handicap ?? null,
        // A stored defence goal (refused since decision 50) without a table.
        defence: r.defence ? { ...r.defence, contentHash: null, value: null } : null });
    }
    const { _id, _creationTime, replayFile: _, noiseKey: _key, ...rest } = game;
    return { game: { gameId: _id, ...rest }, rules };
  },
});

/** Agents a programs page reads (each with its versions, each ≤ 16 KiB of source). */
const PROGRAM_AGENTS = 4;
/** Versions kept per agent in the file (an agent edited more often keeps its first ones). */
const PROGRAM_VERSIONS = 64;

/** A page of an ended game's agents (destroyed ones too) with every version of their programs, for the replay file. */
export const programs = internalQuery({
  args: { gameId: v.id("v2Games"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, cursor }) => {
    const page = await ctx.db.query("v2Agents").withIndex("by_game_live", q => q.eq("gameId", gameId)).paginate({ cursor, numItems: PROGRAM_AGENTS });
    const out = [];
    for (const a of page.page) {
      for (const p of await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", a._id)).take(PROGRAM_VERSIONS)) {
        out.push({ agentId: a._id, memberId: a.memberId, name: a.name, version: p.version, language: p.language, source: p.source, summonedAt: p.summonedAt });
      }
    }
    return { programs: out, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** The events after `after`: at most PAGE of them and about `maxBytes` (PAGE_BYTES) of data; `done` at the end. */
export const events = internalQuery({
  args: { gameId: v.id("v2Games"), after: v.number(), maxBytes: v.optional(v.number()) },
  handler: async (ctx, { gameId, after, maxBytes }) => {
    const budget = maxBytes ?? PAGE_BYTES, events: { seq: number; kind: string; data: unknown }[] = [];
    let bytes = 0;
    for await (const e of ctx.db.query("v2Events").withIndex("by_game_seq", q => q.eq("gameId", gameId).gt("seq", after))) {
      events.push({ seq: e.seq, kind: e.kind, data: e.data });
      bytes += JSON.stringify(e.data).length;
      if (events.length >= PAGE || bytes >= budget) return { events, done: false };
    }
    return { events, done: true };
  },
});


/** Scheduled by the end (loop.ts endGame). Idempotent: a game with its file is left alone; a losing race deletes its copy. */
export const attach = internalMutation({
  args: { gameId: v.id("v2Games"), file: v.id("_storage") },
  handler: async (ctx, { gameId, file }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.replayFile) return false;
    await ctx.db.patch(gameId, { replayFile: file });
    return true;
  },
});
