/**
 * A seat's calibration tables over HTTP (docs/convex-read-architecture.md R6): GET
 * /api/calibration/<roomId>/<gameId>/<godId>, checked on every request against the caller's Convex JWT
 * (`Authorization: Bearer`, the token the app's Convex client holds). The caller's own tables in a game they may read;
 * another god's only once the game ended, for a caller its replay admits (they name that god's goal, which the replay
 * reveals and a live game hides). The game and the god are in the path, so the answer for a path never changes (a
 * seat's draws are fixed) once its hold correction is in (`hold`, docs/energy-model.md §8; not cached while it is
 * computing): `Cache-Control: private, immutable`, cached by the browser per path, never by a shared cache. The app
 * finds the path in player.myUtility (live, or as a replay answers it), which it subscribes to.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { httpAction, internalQuery } from "../_generated/server";
import { requireViewer } from "../auth/access";
import { BEARER_CORS } from "../auth/routes";
import { json, pathSegments, refusal } from "../lib/http";
import { fail } from "../lib/errors";
import { deityOf } from "../lib/load";
import { gameFor, replayableGame } from "../player";

/**
 * The draws of `godId`'s seat in a game of the room, if the caller may have its tables: their own seat in any game
 * they may read; another god's only in an ended game whose replay the caller may watch (the replay reveals every goal).
 */
export const seat = internalQuery({
  args: { roomId: v.string(), gameId: v.string(), godId: v.string() },
  handler: async (ctx, { roomId, gameId, godId }) => {
    const viewer = await requireViewer(ctx);
    const { game } = await gameFor(ctx, viewer, roomId, gameId);
    if (!game) return fail("NOT_FOUND", "Game not found in this room");
    if (godId !== viewer.subject) {
      if (game.phase !== "ended") fail("FORBIDDEN", "Only your own calibration tables while the game runs");
      await replayableGame(ctx, viewer, roomId, gameId);
    }
    const deity = await deityOf(ctx, game._id, godId);
    if (!deity) return fail("NOT_FOUND", godId === viewer.subject ? "You have no seat in this game" : "No such player in this game");
    const u = deity.utility as { familyId: string; params: unknown; penalty?: { familyId: string; params: unknown } };
    // Hold rarity (docs/energy-model.md §8): the reward's correction at this game's m, once computed.
    const hold = game.holdState === "ready" ? { m: game.roster.length - 1 } : game.holdState === "computing" ? { pending: true } : undefined;
    return { settings: game.settings, draws: [{ familyId: u.familyId, params: u.params }, ...(u.penalty ? [{ familyId: u.penalty.familyId, params: u.penalty.params }] : [])], ...(hold ? { hold } : {}) };
  },
});

const reply = (body: unknown, status: number) => json(body, status, BEARER_CORS);
const USAGE = "GET /api/calibration/<roomId>/<gameId>/<godId>";

export const download = httpAction(async (ctx, request) => {
  const parts = pathSegments(request);
  if (!parts || parts.length !== 3 || parts.some(p => !p)) return reply({ error: USAGE }, 400);
  const [roomId, gameId, godId] = parts;
  try {
    const seat = await ctx.runQuery(internal.calibration.mine.seat, { roomId, gameId, godId });
    const [reward, penalty] = JSON.parse(await ctx.runAction(internal.calibration.node.tablesOf, { settings: seat.settings, draws: seat.draws })) as unknown[];
    const m = seat.hold && "m" in seat.hold ? seat.hold.m : undefined;
    const hold = m === undefined ? null : await ctx.runAction(internal.engine.hold.cachedFor, { settings: seat.settings, draw: seat.draws[0] as { familyId: string; params: unknown }, m });
    // While the correction is computing the answer will change: not cached until it is in.
    const cache = seat.hold && "pending" in seat.hold ? "private, no-store" : "private, max-age=31536000, immutable";
    return json({ reward, ...(penalty ? { penalty } : {}), ...(hold ? { hold } : {}) }, 200, { ...BEARER_CORS, "Cache-Control": cache });
  } catch (error) {
    const refused = refusal(error);
    if (refused) return reply(refused.body, refused.status);
    console.error("calibration download failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Internal error" }, 500);
  }
});
export const preflight = httpAction(async () => new Response(null, { status: 204, headers: BEARER_CORS }));
