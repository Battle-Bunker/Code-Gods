/** `game.*`: the game in view, its standings, the owner's lobby and game controls, ready and pause. */
import { membersOf, rotationFor, startGame } from "../lobby";
import { defineOp, inGame, inRoom, notYet } from "./define";

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

export const { op: start, as: startAs } = defineOp("game.start", "mutation", async env => {
  const { room } = inRoom(env);
  return { gameId: await startGame(env.ctx, room), bidPhase: false };
});
export const { op: startWorldNow, as: startWorldNowAs } = defineOp("game.startWorldNow", "mutation", () => notYet("W3-4"));
export const { op: resume, as: resumeAs } = defineOp("game.resume", "mutation", () => notYet("W3-4"));
export const { op: end, as: endAs } = defineOp("game.end", "mutation", () => notYet("W3-4"));
export const { op: ready, as: readyAs } = defineOp("game.ready", "mutation", () => notYet("W3-4"));
export const { op: pause, as: pauseAs } = defineOp("game.pause", "mutation", () => notYet("W3-4"));
export const { op: auction, as: auctionAs } = defineOp("game.auction", "query", () => notYet("W3-8"));
