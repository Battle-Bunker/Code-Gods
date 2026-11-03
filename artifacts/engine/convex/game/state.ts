/**
 * A game's state lives in three documents (read-architecture R3, §4.1):
 *   games       the cold header every page reads: codes, settings, roster, phase, deadlines, summary;
 *   gameClocks  what changes on every tick commit and clock readers need (world time, counts, the scoreboard);
 *   gameEngine  the loop's own state (lease, spawn and batch counters, stats): internal, never a public query.
 * A tick commit writes only the two hot documents, so a query that reads only `games` stays cached while the game runs.
 *
 * Games stored before the split carry the hot fields on `games` (legacy): readers fall back to them, and the first
 * write through `writeGame` (or migrations:splitGameHotFields) moves them to the new documents and clears them there.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publishStandings } from "./readModel";

export type Scoreboard = NonNullable<Doc<"gameClocks">["scoreboard"]>;
export type Clock = Omit<Doc<"gameClocks">, "_id" | "_creationTime" | "gameId">;
export type Engine = Omit<Doc<"gameEngine">, "_id" | "_creationTime" | "gameId">;
/** A game with its clock: what a public reader of world time sees. */
export type ClockedGame = Doc<"games"> & Clock;
/** A game with its clock and engine state: what the loop and commands work with. */
export type LiveGame = ClockedGame & Engine;

export const CLOCK_KEYS = ["worldSeconds", "lastTick", "objectCount", "agentCount", "scoreboard"] as const satisfies readonly (keyof Clock)[];
export const ENGINE_KEYS = ["tick", "nextSpawn", "nextBatch", "stats"] as const satisfies readonly (keyof Engine)[];
const HOT_KEYS = [...CLOCK_KEYS, ...ENGINE_KEYS] as const;

const NO_STATS = { acts: 0, commits: 0, discarded: 0, opportunities: 0 };

/** The clock of a game from its gameClocks doc, or (legacy) from its own fields. */
export function clockFrom(game: Doc<"games">, doc: Doc<"gameClocks"> | null): Clock {
  if (doc) return { worldSeconds: doc.worldSeconds, lastTick: doc.lastTick, objectCount: doc.objectCount, agentCount: doc.agentCount, ...(doc.scoreboard ? { scoreboard: doc.scoreboard } : {}) };
  return {
    worldSeconds: game.worldSeconds ?? 0, lastTick: game.lastTick ?? game.createdAt, objectCount: game.objectCount ?? 0, agentCount: game.agentCount ?? 0,
    ...(game.scoreboard ? { scoreboard: game.scoreboard } : {}),
  };
}
/** The engine state of a game from its gameEngine doc, or (legacy) from its own fields. */
export function engineFrom(game: Doc<"games">, doc: Doc<"gameEngine"> | null): Engine {
  if (doc) return { tick: doc.tick, nextSpawn: doc.nextSpawn, nextBatch: doc.nextBatch, stats: doc.stats };
  return { tick: game.tick ?? { seq: 0, leaseUntil: 0 }, nextSpawn: game.nextSpawn ?? 0, nextBatch: game.nextBatch ?? 0, stats: game.stats ?? NO_STATS };
}

export const clockDoc = (ctx: QueryCtx, gameId: Id<"games">) => ctx.db.query("gameClocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
export const engineDoc = (ctx: QueryCtx, gameId: Id<"games">) => ctx.db.query("gameEngine").withIndex("by_game", q => q.eq("gameId", gameId)).unique();

/** The game with its clock (reads the hot gameClocks doc: only for readers that show world time or counts). */
export async function withClock(ctx: QueryCtx, game: Doc<"games">): Promise<ClockedGame> {
  return { ...game, ...clockFrom(game, await clockDoc(ctx, game._id)) };
}
/** The game with its clock and engine state (the loop, the watchdog and commands only). */
export async function withEngine(ctx: QueryCtx, game: Doc<"games">): Promise<LiveGame> {
  const [clock, engine] = await Promise.all([clockDoc(ctx, game._id), engineDoc(ctx, game._id)]);
  return { ...game, ...clockFrom(game, clock), ...engineFrom(game, engine) };
}
export async function liveGame(ctx: QueryCtx, gameId: Id<"games">): Promise<LiveGame | null> {
  const game = await ctx.db.get(gameId);
  return game && withEngine(ctx, game);
}

/** The legacy hot fields a stored game still carries (none once split). */
export const legacyHotFields = (game: Doc<"games">) => HOT_KEYS.filter(k => game[k] !== undefined);

/**
 * Create a game's gameClocks and gameEngine docs from `state` where missing, and clear any legacy hot fields left on
 * `games`. Idempotent: a split game is left alone. Returns whether anything changed.
 */
export async function splitHotFields(ctx: MutationCtx, game: Doc<"games">, state: Clock & Engine = { ...clockFrom(game, null), ...engineFrom(game, null) }) {
  let changed = false;
  if (!await clockDoc(ctx, game._id)) {
    await ctx.db.insert("gameClocks", { gameId: game._id, ...pick(state, CLOCK_KEYS) as Clock });
    changed = true;
  }
  if (!await engineDoc(ctx, game._id)) {
    await ctx.db.insert("gameEngine", { gameId: game._id, ...pick(state, ENGINE_KEYS) as Engine });
    changed = true;
  }
  const legacy = legacyHotFields(game);
  if (legacy.length) {
    await ctx.db.patch(game._id, Object.fromEntries(legacy.map(k => [k, undefined])));
    changed = true;
  }
  return changed;
}

function pick<T extends object, K extends keyof T>(from: T, keys: readonly K[]): Partial<Pick<T, K>> {
  return Object.fromEntries(keys.filter(k => from[k] !== undefined).map(k => [k, from[k]])) as Partial<Pick<T, K>>;
}

/**
 * Write a change to a game: header fields to `games` (only when there are any: a tick commit leaves it alone), clock
 * fields to gameClocks and engine fields to gameEngine. A legacy game is split first. `game` is the state the change
 * applies to (as read by liveGame); the returned game is the state after it.
 */
export async function writeGame(ctx: MutationCtx, game: LiveGame, patch: Partial<LiveGame>): Promise<LiveGame> {
  const next = { ...game, ...patch } as LiveGame;
  const clock = pick(patch as Clock, CLOCK_KEYS), engine = pick(patch as Engine, ENGINE_KEYS);
  let [stored, clockRow, engineRow] = await Promise.all([ctx.db.get(game._id), clockDoc(ctx, game._id), engineDoc(ctx, game._id)]);
  // Header fields that actually change only: a commit that restates the phase must not touch the doc every page reads.
  const header = Object.fromEntries(Object.entries(patch).filter(([k, value]) =>
    !(HOT_KEYS as readonly string[]).includes(k) && JSON.stringify(value) !== JSON.stringify((stored as Record<string, unknown> | null)?.[k])));
  if (stored && (!clockRow || !engineRow || legacyHotFields(stored).length)) {
    await splitHotFields(ctx, stored, next);
    [clockRow, engineRow] = await Promise.all([clockDoc(ctx, game._id), engineDoc(ctx, game._id)]);
  }
  if (Object.keys(header).length) await ctx.db.patch(game._id, header);
  if (clockRow && Object.keys(clock).length) await ctx.db.patch(clockRow._id, clock);
  if (engineRow && Object.keys(engine).length) await ctx.db.patch(engineRow._id, engine);
  // A newly published scoreboard reaches the standings read model in the same commit (game/readModel.ts).
  if (patch.scoreboard && JSON.stringify(patch.scoreboard) !== JSON.stringify(game.scoreboard)) {
    await publishStandings(ctx, next, patch.scoreboard, { agentCount: next.agentCount, objectCount: next.objectCount });
  }
  return next;
}
