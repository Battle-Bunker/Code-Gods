/**
 * A game's state lives in three documents (read-architecture R3, §4.1):
 *   games       the cold header every page reads: codes, settings, roster, phase, deadlines, summary;
 *   gameClocks  what changes on every tick commit and clock readers need (world time, counts, the scoreboard);
 *   gameEngine  the loop's own state (lease, spawn and batch counters, stats): internal, never a public query.
 * A tick commit writes only the two hot documents, so a query that reads only `games` stays cached while the game runs.
 * Every game has both: game/lobby.ts creates them with the game (migrations:splitGameHotFields moved the games stored
 * before the split, and was retired once every deployment reported it done).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { publishStandings, recountAgents } from "./readModel";

export type Scoreboard = NonNullable<Doc<"gameClocks">["scoreboard"]>;
export type Clock = Omit<Doc<"gameClocks">, "_id" | "_creationTime" | "gameId">;
export type Engine = Omit<Doc<"gameEngine">, "_id" | "_creationTime" | "gameId">;
/** A game with its clock: what a public reader of world time sees. */
export type ClockedGame = Doc<"games"> & Clock;
/** A game with its clock and engine state: what the loop and commands work with. */
export type LiveGame = ClockedGame & Engine;

export const CLOCK_KEYS = ["worldSeconds", "lastTick", "objectCount", "agentCount", "scoreboard"] as const satisfies readonly (keyof Clock)[];
export const ENGINE_KEYS = ["tick", "nextSpawn", "nextBatch", "stats", "tickFailures"] as const satisfies readonly (keyof Engine)[];
const HOT_KEYS: readonly string[] = [...CLOCK_KEYS, ...ENGINE_KEYS];

/** A game's clock as stored on its gameClocks doc. */
export function clockOf(doc: Doc<"gameClocks">): Clock {
  return { worldSeconds: doc.worldSeconds, lastTick: doc.lastTick, objectCount: doc.objectCount, agentCount: doc.agentCount, ...(doc.scoreboard ? { scoreboard: doc.scoreboard } : {}) };
}
function engineOf(doc: Doc<"gameEngine">): Engine {
  return { tick: doc.tick, nextSpawn: doc.nextSpawn, nextBatch: doc.nextBatch, stats: doc.stats, ...(doc.tickFailures ? { tickFailures: doc.tickFailures } : {}) };
}
function missing(gameId: Id<"games">, table: "gameClocks" | "gameEngine"): never {
  throw new Error(`game ${gameId} has no ${table} document`);
}

export const clockDoc = (ctx: QueryCtx, gameId: Id<"games">) => ctx.db.query("gameClocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
export const engineDoc = (ctx: QueryCtx, gameId: Id<"games">) => ctx.db.query("gameEngine").withIndex("by_game", q => q.eq("gameId", gameId)).unique();

/** The game with its clock (reads the hot gameClocks doc: only for readers that show world time or counts). */
export async function withClock(ctx: QueryCtx, game: Doc<"games">): Promise<ClockedGame> {
  return { ...game, ...clockOf(await clockDoc(ctx, game._id) ?? missing(game._id, "gameClocks")) };
}
/** The game with its clock and engine state (the loop, the watchdog and commands only). */
export async function withEngine(ctx: QueryCtx, game: Doc<"games">): Promise<LiveGame> {
  const [clock, engine] = await Promise.all([clockDoc(ctx, game._id), engineDoc(ctx, game._id)]);
  return { ...game, ...clockOf(clock ?? missing(game._id, "gameClocks")), ...engineOf(engine ?? missing(game._id, "gameEngine")) };
}
export async function liveGame(ctx: QueryCtx, gameId: Id<"games">): Promise<LiveGame | null> {
  const game = await ctx.db.get(gameId);
  return game && withEngine(ctx, game);
}

function pick<T extends object, K extends keyof T>(from: T, keys: readonly K[]): Partial<Pick<T, K>> {
  return Object.fromEntries(keys.filter(k => from[k] !== undefined).map(k => [k, from[k]])) as Partial<Pick<T, K>>;
}

/**
 * Write a change to a game: header fields to `games` (only when there are any: a tick commit leaves it alone), clock
 * fields to gameClocks and engine fields to gameEngine. `game` is the state the change applies to (as read by
 * liveGame); the returned game is the state after it.
 */
export async function writeGame(ctx: MutationCtx, game: LiveGame, patch: Partial<LiveGame>): Promise<LiveGame> {
  const next = { ...game, ...patch } as LiveGame;
  const clock = pick(patch as Clock, CLOCK_KEYS), engine = pick(patch as Engine, ENGINE_KEYS);
  const [stored, clockRow, engineRow] = await Promise.all([ctx.db.get(game._id), clockDoc(ctx, game._id), engineDoc(ctx, game._id)]);
  // Header fields that actually change only: a commit that restates the phase must not touch the doc every page reads.
  const header = Object.fromEntries(Object.entries(patch).filter(([k, value]) =>
    !HOT_KEYS.includes(k) && JSON.stringify(value) !== JSON.stringify((stored as Record<string, unknown> | null)?.[k])));
  if (Object.keys(header).length) await ctx.db.patch(game._id, header);
  if (Object.keys(clock).length) await ctx.db.patch((clockRow ?? missing(game._id, "gameClocks"))._id, clock);
  if (Object.keys(engine).length) await ctx.db.patch((engineRow ?? missing(game._id, "gameEngine"))._id, engine);
  // A newly published scoreboard (unlike the one stored before this write: the caller's `game` may already carry it)
  // reaches the standings read model in the same commit (game/readModel.ts).
  if (patch.scoreboard && JSON.stringify(patch.scoreboard) !== JSON.stringify(clockRow?.scoreboard)) {
    await publishStandings(ctx, next, patch.scoreboard, { agentCount: next.agentCount, objectCount: next.objectCount });
  } else if (patch.agentCount !== undefined && patch.agentCount !== game.agentCount) {
    // A summon or a destroy between publications: the spectator's agent count (games.standings) follows at once.
    await recountAgents(ctx, game._id, patch.agentCount);
  }
  return next;
}
