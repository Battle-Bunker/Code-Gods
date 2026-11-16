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

/** The object store's limits (v1's, simplified): per run and per (human, game). */
export const STORE_LIMITS = { scopes: 20, loadObjects: 200, loadBytes: 1024 * 1024, writes: 50, valueBytes: 64 * 1024, objects: 500, bytes: 4 * 1024 * 1024 } as const;
export const STORE_KEY = /^[A-Za-z0-9_.\/-]{1,128}$/;

/** A run's scopes, loaded: each a key, or a "prefix*" (every key it starts). Refused past the limits. */
export const loadObjects = internalQuery({
  args: { userId: v.string(), gameId: v.id("v2Games"), scopes: v.array(v.string()) },
  handler: async (ctx, { userId, gameId, scopes }) => {
    if (scopes.length > STORE_LIMITS.scopes) return { refused: `Load at most ${STORE_LIMITS.scopes} keys or prefixes.` };
    const out: Record<string, unknown> = {};
    let n = 0, bytes = 0;
    for (const s of scopes) {
      const prefix = s.endsWith("*") ? s.slice(0, -1) : null;
      if (!STORE_KEY.test(prefix ?? s) && !(prefix === "")) return { refused: `Not a store key or prefix: ${JSON.stringify(s)}.` };
      const rows = prefix === null
        ? await ctx.db.query("v2CodeObjects").withIndex("by_user_game_key", q => q.eq("userId", userId).eq("gameId", gameId).eq("key", s)).take(1)
        : await ctx.db.query("v2CodeObjects").withIndex("by_user_game_key", q => q.eq("userId", userId).eq("gameId", gameId).gte("key", prefix).lt("key", prefix + "\uffff")).take(STORE_LIMITS.loadObjects + 1);
      for (const r of rows) {
        if (r.key in out) continue;
        n++; bytes += r.bytes;
        if (n > STORE_LIMITS.loadObjects || bytes > STORE_LIMITS.loadBytes) return { refused: `That loads more than ${STORE_LIMITS.loadObjects} objects or ${STORE_LIMITS.loadBytes / 1024} KiB: name fewer keys or a narrower prefix.` };
        out[r.key] = JSON.parse(r.valueJson);
      }
    }
    return { objects: out };
  },
});

/** A good run's store writes, checked (keys, sizes, the quota) and applied all or none. */
export const commitWrites = internalMutation({
  args: { userId: v.string(), gameId: v.id("v2Games"), put: v.any(), delete: v.array(v.string()) },
  handler: async (ctx, a) => {
    const puts = Object.entries(a.put as Record<string, unknown>).map(([key, value]) => ({ key, valueJson: JSON.stringify(value) }));
    if (puts.length + a.delete.length > STORE_LIMITS.writes) return { refused: `A run writes at most ${STORE_LIMITS.writes} keys.` };
    for (const k of [...puts.map(p => p.key), ...a.delete]) if (!STORE_KEY.test(k)) return { refused: `Not a store key: ${JSON.stringify(k)} (letters, digits, _ . / -; at most 128).` };
    for (const p of puts) if (p.valueJson.length > STORE_LIMITS.valueBytes) return { refused: `${p.key} is over ${STORE_LIMITS.valueBytes / 1024} KiB.` };
    const all = await ctx.db.query("v2CodeObjects").withIndex("by_user_game_key", q => q.eq("userId", a.userId).eq("gameId", a.gameId)).take(STORE_LIMITS.objects + 1);
    const now = new Map(all.map(r => [r.key, r.bytes]));
    for (const k of a.delete) now.delete(k);
    for (const p of puts) now.set(p.key, p.valueJson.length);
    const total = [...now.values()].reduce((t, b) => t + b, 0);
    if (now.size > STORE_LIMITS.objects || total > STORE_LIMITS.bytes) return { refused: `That would hold more than ${STORE_LIMITS.objects} objects or ${STORE_LIMITS.bytes / 1048576} MiB in this game's store.` };
    const byKey = new Map(all.map(r => [r.key, r]));
    for (const k of a.delete) { const r = byKey.get(k); if (r) await ctx.db.delete(r._id); }
    for (const p of puts) {
      const r = byKey.get(p.key), row = { valueJson: p.valueJson, bytes: p.valueJson.length, updatedAt: Date.now() };
      if (r) await ctx.db.patch(r._id, row); else await ctx.db.insert("v2CodeObjects", { userId: a.userId, gameId: a.gameId, key: p.key, ...row });
    }
    return { written: puts.map(p => p.key), deleted: a.delete.filter(k => byKey.has(k)) };
  },
});
