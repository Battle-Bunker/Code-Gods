/**
 * `code.run`'s reads and writes (codeRun.ts runs the script): the dataset a run may read, resolved for the caller as the
 * app would show it (the read rules hold: nothing a page could not show the caller), and the run's row.
 *
 *   replay     an ended game's stored record (replays.ts: every event and every rule; after the end nothing is private)
 *   my-moves   the caller's act log in the game (≤ MY_MOVES rows, newest first), as v2/play:moves discloses it
 *   none       no data (a script over its params)
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { resolveContext, userById } from "./access";
import { readsKnowledge } from "./knowledge";
import { moveView } from "./play";

/** At most this many act-log rows in a my-moves dataset (newest first). */
export const MY_MOVES = 2000;
export const DATASETS = ["replay", "my-moves", "none"] as const;
export type Dataset = (typeof DATASETS)[number];

export const dataset = internalQuery({
  args: { userId: v.string(), scope: v.any(), dataset: v.union(v.literal("replay"), v.literal("my-moves"), v.literal("none")) },
  handler: async (ctx, { userId, scope, dataset }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member) return { refused: "Run code from inside a game." };
    const game = r.game, member = r.member;
    if (dataset === "none") return { gameId: game._id, file: null, rows: null };
    if (dataset === "replay") {
      if (game.phase !== "ended") return { refused: "A game's replay is there once it has ended: use my-moves while it runs." };
      if (!game.replayFile) return { refused: "This game's replay is still being stored: try again in a moment." };
      return { gameId: game._id, file: game.replayFile, rows: null };
    }
    if (!game.roster.some(s => s.memberId === member._id)) return { refused: "my-moves is a seated player's own act log." };
    let rows = await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").take(MY_MOVES);
    // Paid observation: only the player's own agents' moves, as their act log shows (play.ts moves).
    if (readsKnowledge(game, member._id)) rows = rows.filter(m => m.mine);
    return { gameId: game._id, file: null, rows: rows.map(moveView(game)) };
  },
});

export const record = internalMutation({
  args: {
    userId: v.string(), gameId: v.optional(v.id("v2Games")), title: v.string(), language: v.string(), source: v.string(), dataset: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")), resultJson: v.optional(v.string()), output: v.string(), error: v.optional(v.string()), ms: v.number(),
  },
  handler: async (ctx, a) => await ctx.db.insert("v2CodeRuns", { ...a, at: Date.now() }),
});

/** At most this many saved scripts per human (v1's object quota, simplified). */
export const MAX_SCRIPTS = 100;

/** One of the human's saved scripts, by name, or null. */
export const script = internalQuery({
  args: { userId: v.string(), name: v.string() },
  handler: async (ctx, { userId, name }) => {
    const row = await ctx.db.query("v2CodeScripts").withIndex("by_user_name", q => q.eq("userId", userId).eq("name", name)).unique();
    return row ? { language: row.language, source: row.source, title: row.title } : null;
  },
});

/** Saves (or replaces) a script under its name; refused past MAX_SCRIPTS. */
export const saveScript = internalMutation({
  args: { userId: v.string(), name: v.string(), language: v.string(), source: v.string(), title: v.string() },
  handler: async (ctx, a) => {
    const old = await ctx.db.query("v2CodeScripts").withIndex("by_user_name", q => q.eq("userId", a.userId).eq("name", a.name)).unique();
    if (old) { await ctx.db.patch(old._id, { language: a.language, source: a.source, title: a.title, updatedAt: Date.now() }); return { saved: true }; }
    const count = (await ctx.db.query("v2CodeScripts").withIndex("by_user_name", q => q.eq("userId", a.userId)).take(MAX_SCRIPTS)).length;
    if (count >= MAX_SCRIPTS) return { saved: false, reason: `You have ${MAX_SCRIPTS} saved scripts: delete one first.` };
    await ctx.db.insert("v2CodeScripts", { ...a, updatedAt: Date.now() });
    return { saved: true };
  },
});
