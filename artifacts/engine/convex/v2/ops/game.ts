/** `game.*`: the game in view, its standings, the owner's lobby and game controls, ready and pause. */
import { membersOf, openBidding, rematchDeal, rotationFor, startGame } from "../lobby";
import { presetOf } from "../presets";
import { touchActivity } from "../activity";
import { OpFailure } from "@workspace/v2-affordances";
import { endGame, pauseGame, resumeGame, startWorld } from "../loop.ts";
import { makeFunctionReference } from "convex/server";
import { foldBoard, type BoardRow } from "../boardFold";
import { callerOf, defineOp, inGame, inRoom, seated } from "./define";

export const { op: get, as: getAs } = defineOp("game.get", "query", async env => {
  const { game, player } = inGame(env);
  const clock = await env.ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  return {
    gameId: game._id, phase: game.phase, worldSeconds: clock?.worldSeconds ?? 0, endsAt: game.endsAt ?? null,
    preset: game.preset, variant: game.variant, roster: game.roster.map(r => ({ memberId: r.memberId, name: r.name })),
    me: player ? { energy: player.energy, power: player.power, ready: player.ready, pauseUsed: player.pauseUsed } : null,
  };
});

export const { op: standings, as: standingsAs } = defineOp("game.standings", "query", async env => {
  const { game } = inGame(env);
  const s = await env.ctx.db.query("v2Standings").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  return { rows: (s?.rows ?? []).map(r => ({ memberId: r.memberId, name: r.name, points: r.total, handicap: r.handicap, net: r.net, rank: r.rank })) };
});

/** Who holds which family next: the rotated deal while the room is mid-rotation; empty when the next deal is fresh. */
export const { op: rotation, as: rotationAs } = defineOp("game.rotation", "query", async env => {
  const { room } = inRoom(env);
  const seats = (await membersOf(env.ctx, room._id)).filter(m => !m.spectator);
  const { rotated } = await rotationFor(env.ctx, room, seats);
  return { seats: rotated ? seats.map((m, i) => ({ memberId: m._id, name: m.name, family: rotated.rules[i]!.family })) : [] };
});

/** Deals and starts planning; on a preset with a bid phase, opens the phase instead (the deal follows it). */
export const { op: start, as: startAs } = defineOp("game.start", "mutation", async env => {
  const { room } = inRoom(env);
  await touchActivity(env.ctx);   // human activity: keeps the engine awake (activity.ts)
  if (presetOf(room.preset).bid) {
    await openBidding(env.ctx, room);
    return { gameId: null, bidPhase: true };
  }
  return { gameId: await startGame(env.ctx, room), bidPhase: false };
});
/** Deals the room's last game again: the same rule to each player and the same seed (lobby.ts `rematchDeal`). */
export const { op: rematch, as: rematchAs } = defineOp("game.rematch", "mutation", async env => {
  const { room } = inRoom(env);
  await touchActivity(env.ctx);
  return { gameId: await startGame(env.ctx, room, undefined, await rematchDeal(env.ctx, room)) };
});
export const { op: startWorldNow, as: startWorldNowAs } = defineOp("game.startWorldNow", "mutation", async env => {
  await startWorld(env.ctx, inGame(env).game);
  return { ok: true as const };
});

export const { op: resume, as: resumeAs } = defineOp("game.resume", "mutation", async env => {
  // Human activity resumes an idle-parked game (activity.ts); an owner's pause is resumed here.
  await touchActivity(env.ctx);
  const game = (await env.ctx.db.get(inGame(env).game._id))!;
  if (game.phase === "paused") await resumeGame(env.ctx, game);
  return { ok: true as const };
});

export const { op: end, as: endAs } = defineOp("game.end", "mutation", async env => {
  await endGame(env.ctx, inGame(env).game);
  return { ok: true as const };
});

/** Ready to leave planning; when every seated human is ready the world starts early (partners are always ready). */
export const { op: ready, as: readyAs } = defineOp("game.ready", "mutation", async (env, a) => {
  const { game, player } = seated(env);
  await env.ctx.db.patch(player._id, { ready: a.ready });
  const players = await env.ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
  if (a.ready && players.every(p => p._id === player._id || p.ready)) await startWorld(env.ctx, game);
  return { ok: true as const };
});

/** Each player may pause once; the owner resumes. */
export const { op: pause, as: pauseAs } = defineOp("game.pause", "mutation", async env => {
  const { game, player, member } = seated(env);
  if (player.pauseUsed) throw new OpFailure("You have used your one pause.");
  // v1: only a running world pauses (planning has no clock to stop; a paused game is already paused).
  if (game.phase !== "live") throw new OpFailure(game.phase === "paused" ? "The game is already paused." : "Only a running game can be paused.");
  await env.ctx.db.patch(player._id, { pauseUsed: true });
  await pauseGame(env.ctx, game, member._id);
  return { ok: true as const };
});
/**
 * The game's auction as its preset discloses it while the game runs: `none` (each player sees only their own win),
 * `handicaps` (everyone's handicap, own family only) or `all`; everything after the end.
 */
export const { op: auction, as: auctionAs } = defineOp("game.auction", "query", async env => {
  const { game, member } = inGame(env);
  const a = await env.ctx.db.query("v2Auctions").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  const disclosure = game.phase === "ended" || env.scope.replay ? "all" : a?.disclosure ?? "none";
  const name = (id: string) => game.roster.find(r => r.memberId === id)?.name ?? "";
  const wins = (a?.wins ?? []).filter(w => disclosure !== "none" || w.memberId === member._id)
    .map(w => ({ memberId: w.memberId, name: name(w.memberId), family: disclosure === "all" || w.memberId === member._id ? w.family : null, handicap: w.handicap }));
  return { disclosure, wins, bids: disclosure === "all" && a ? a.bids.map(b => ({ memberId: b.memberId, family: b.family, percent: b.percent })) : null };
});

type Chunk = { refused: string } | { rows: (BoardRow & { worldSeconds: number })[]; cursor: string | null };
const CHUNK = makeFunctionReference<"query", { userId: string; scope: unknown; cursor: string | null }, Chunk>("v2/boardAt:logChunk");
/** At most this many log pages a board reads (about 20,000 moves and births: far past a 10-minute game). */
const MAX_PAGES = 200;

/** `game.boardAt` (v1's get_board_at; call 36): every object as it was at a world time, as the caller saw it (boardAt.ts). */
export const { op: boardAt, as: boardAtAs } = defineOp("game.boardAt", "action", async (env, a) => {
  const c = callerOf(env);
  const board = new Map<string, BoardRow>();
  let cursor: string | null = null;
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const chunk: Chunk = await env.ctx.runQuery(CHUNK, { userId: c.userId!, scope: c.scope, cursor });
    if ("refused" in chunk) throw new OpFailure(chunk.refused);
    foldBoard(chunk.rows, a.world, board);
    if (chunk.cursor === null) { cursor = null; break; }
    cursor = chunk.cursor;
  }
  // Read newest first: a log longer than the cap would leave the oldest objects out, so refuse rather than half-answer.
  if (cursor !== null) throw new OpFailure("This game's log is too long to rebuild a board from; use log.list for its history.");
  const all = [...board.values()].sort((x, y) => x.number - y.number).filter(o => a.after === undefined || o.number > a.after);
  const objects = all.slice(0, a.limit);
  return { world: a.world, objects, nextAfter: all.length > a.limit ? objects.at(-1)!.number : null };
});
