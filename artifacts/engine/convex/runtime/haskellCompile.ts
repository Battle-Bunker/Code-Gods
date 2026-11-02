"use node";
/**
 * Haskell compilation, in an action of its own. MicroHs's compiler holds about 250 MiB while it runs (its heap and V8's
 * optimised code), which a 512 MiB Node action cannot hold beside the agent pools. Node actions run one at a time per
 * instance, so the actions that act or examine Haskell agents (engine/runtime.ts haskellProgram) call this one, which
 * runs on another instance, frees that instance's idle agent pools, compiles, and stores the outcome for every action:
 * the program, or the agent's own compile failure (COMPILE, LIMIT).
 *
 * A room's first compilation also writes the room's MicroHs compilation cache, stored gzip in file storage
 * (haskellRoomCaches), so any instance's compiler skips compiling the room's Room module. `prewarm` compiles a room's
 * empty agent when its settings allow Haskell (owner.ts: settings and start), so a player's first validation finds the
 * cache, and a warm compiler, ready.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import { LANGUAGE_SPECS, type GameSettings } from "@workspace/game-core";
import type { Compiled } from "@workspace/game-runtime";
import { actSettings } from "../engine/runtime";
import { HASKELL_PROGRAM_REFRESH_MS } from "../lib/haskellPrograms";
import { bindHaskell, haskellCompilePool, haskellKey, haskellRoomKey } from "./node";

export type CompileReply = ({ ok: true } & Compiled) | { ok: false; code: string; message: string };
/** The agent's own compile failures; any other is the host's (never stored, never blamed on the player). */
const AGENT_CODES = new Set(["COMPILE", "LIMIT"]);

/** This instance's room caches (uncompressed, about 12 MB each), by haskellRoomKey. */
const roomCaches = new Map<string, Uint8Array>();
const ROOM_CACHES_KEPT = 2;
function keepRoomCache(key: string, bytes: Uint8Array): void {
  roomCaches.delete(key);
  if (roomCaches.size >= ROOM_CACHES_KEPT) roomCaches.delete(roomCaches.keys().next().value!);
  roomCaches.set(key, bytes);
}
/** The room's cache: this instance's, else the stored one; undefined when the room has none yet. */
async function loadRoomCache(ctx: ActionCtx, key: string): Promise<Uint8Array | undefined> {
  const kept = roomCaches.get(key);
  if (kept) return kept;
  const row = await ctx.runQuery(internal.runtime.haskellPrograms.roomCache, { key });
  if (!row) return undefined;
  const blob = await ctx.storage.get(row.storageId);
  if (!blob) return undefined;
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(gunzipSync(new Uint8Array(await blob.arrayBuffer()), { maxOutputLength: 64 * 1024 * 1024 })); }
  catch { return undefined; }
  if (row.usedAt < Date.now() - HASKELL_PROGRAM_REFRESH_MS) await ctx.runMutation(internal.runtime.haskellPrograms.touchRoomCache, { key });
  keepRoomCache(key, bytes);
  return bytes;
}
/** Stores a cache the compiler wrote (`replace`: the one it was given could not be read). */
async function storeRoomCache(ctx: ActionCtx, key: string, bytes: Uint8Array, replace: boolean): Promise<void> {
  keepRoomCache(key, bytes);
  const storageId = await ctx.storage.store(new Blob([gzipSync(bytes)], { type: "application/gzip" }));
  const kept = await ctx.runMutation(internal.runtime.haskellPrograms.recordRoomCache, { key, storageId, size: bytes.length, replace });
  if (!kept) await ctx.storage.delete(storageId);
}

async function compileHaskell(ctx: ActionCtx, source: string, settings: GameSettings, { force = false } = {}): Promise<CompileReply> {
  const room = actSettings(settings, "haskell"), key = haskellKey(source, room);
  if (!force) {
    const stored = await ctx.runQuery(internal.runtime.haskellPrograms.get, { key });
    if (stored?.error) return { ok: false, ...stored.error };
    if (stored) return { ok: true, inspection: stored.inspection, js: stored.js };
  }
  await bindHaskell(ctx);
  const roomKey = haskellRoomKey(room), given = await loadRoomCache(ctx, roomKey);
  let compiled: Compiled & { roomCache?: Uint8Array };
  try { compiled = await haskellCompilePool().compile(source, room, given ? { roomCache: given } : { wantRoomCache: true }); }
  catch (error) {
    const code = String((error as { code?: unknown }).code ?? ""), message = String((error as Error)?.message ?? error).slice(0, 4000);
    if (!AGENT_CODES.has(code)) return { ok: false, code: code === "CAPACITY" || code === "CONFIG" ? code : "UNAVAILABLE", message };
    await ctx.runMutation(internal.runtime.haskellPrograms.put, { key, js: "", inspection: null, error: { code, message } });
    return { ok: false, code, message };
  }
  // A cache the compiler wrote or held while none is stored, or one written because the stored one could not be read.
  if (compiled.roomCache) {
    try { await storeRoomCache(ctx, roomKey, compiled.roomCache, !!given); }
    catch (error) { console.warn(`Haskell room cache not stored: ${(error as Error)?.message ?? error}`); }
  }
  await ctx.runMutation(internal.runtime.haskellPrograms.put, { key, js: compiled.js, inspection: compiled.inspection });
  return { ok: true, inspection: compiled.inspection, js: compiled.js };
}

export const compile = internalAction({
  args: { source: v.string(), settings: v.any() },
  handler: async (ctx, { source, settings }): Promise<CompileReply> => compileHaskell(ctx, source, settings),
});

/**
 * A room that allows Haskell (owner.ts, on its settings and its start): compile its empty agent unless the room's cache
 * is stored, so the cache exists before a player validates, and this instance's compiler is warm.
 */
export const prewarm = internalAction({
  args: { settings: v.any() },
  handler: async (ctx, { settings }): Promise<{ compiled: boolean; ms: number }> => {
    const started = performance.now();
    const room = actSettings(settings, "haskell");
    if (await ctx.runQuery(internal.runtime.haskellPrograms.roomCache, { key: haskellRoomKey(room) })) return { compiled: false, ms: 0 };
    const reply = await compileHaskell(ctx, LANGUAGE_SPECS.haskell.emptyAgent, settings, { force: true });
    if (!reply.ok) console.warn(`Haskell pre-warm failed: ${reply.code} ${reply.message.slice(0, 300)}`);
    return { compiled: true, ms: Math.round(performance.now() - started) };
  },
});
