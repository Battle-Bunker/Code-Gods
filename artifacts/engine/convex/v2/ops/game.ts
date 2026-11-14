/** `game.*`: the game in view, its standings, the owner's lobby and game controls, ready and pause. */
import { defineOp, inGame, notYet } from "./define";

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

export const { op: rotation, as: rotationAs } = defineOp("game.rotation", "query", () => notYet("W3-3"));
export const { op: start, as: startAs } = defineOp("game.start", "mutation", () => notYet("W3-3"));
export const { op: startWorldNow, as: startWorldNowAs } = defineOp("game.startWorldNow", "mutation", () => notYet("W3-4"));
export const { op: resume, as: resumeAs } = defineOp("game.resume", "mutation", () => notYet("W3-4"));
export const { op: end, as: endAs } = defineOp("game.end", "mutation", () => notYet("W3-4"));
export const { op: ready, as: readyAs } = defineOp("game.ready", "mutation", () => notYet("W3-4"));
export const { op: pause, as: pauseAs } = defineOp("game.pause", "mutation", () => notYet("W3-4"));
export const { op: auction, as: auctionAs } = defineOp("game.auction", "query", () => notYet("W3-8"));
