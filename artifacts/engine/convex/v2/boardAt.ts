/**
 * `game.boardAt` (v1's get_board_at, restored; owner-decisions call 36): every object as it was at a world time, as
 * the caller saw it. Built from the caller's own view of the public log (play.ts `logPage`: their own bits exact, the
 * others' sum as disclosed to them, nothing attributed while live, paid observation's hidden moves hidden), newest
 * first: an object's state at t is its first row at or before t. Read in pages by a one-shot action, never a
 * subscription (docs/convex-read-architecture.md: a page query must not scan the log).
 */
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { resolveContext, userById } from "./access";
import { logPage } from "./play";
import { DEFAULT_PEER_NOISE_VARIANCE } from "./disclose";
import { valueObjects } from "./world";
export { foldBoard, type BoardRow } from "./boardFold";

/** One page of the caller's view of the log, newest first (the action folds them). */
export const logChunk = internalQuery({
  args: { userId: v.string(), scope: v.any(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, scope, cursor }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member) return { refused: "This needs a game you belong to." } as const;
    const page = await logPage(ctx, r.game, r.member._id, { numItems: 100, cursor });
    return {
      rows: page.page.map(x => ({ worldSeconds: x.worldSeconds, objectId: x.objectId as string, number: x.number, state: x.state, own: x.own, others: x.others, points: x.points })),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});


/**
 * What `rule.fit` needs about the caller's game (ops/rule.ts): the variant and its type, the preset (its dealable pool),
 * the set disclosure noise, how many others are seated, the caller's own family (nobody else holds it) and the
 * object count the values assume. Null fields refuse.
 */
export const fitContext = internalQuery({
  args: { userId: v.string(), scope: v.any() },
  handler: async (ctx, { userId, scope }) => {
    const r = await resolveContext(ctx, await userById(ctx, userId), scope);
    if (!r.game || !r.member) return { refused: "This needs a game you belong to." } as const;
    const g = r.game;
    const mine = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", g._id).eq("memberId", r.member!._id)).unique();
    return {
      variant: g.variant, preset: g.preset, noiseVariance: g.settings.peerNoiseVariance ?? DEFAULT_PEER_NOISE_VARIANCE,
      others: Math.max(1, g.roster.length - 1), ownFamily: mine?.family ?? null, objects: valueObjects(g.settings),
    };
  },
});
