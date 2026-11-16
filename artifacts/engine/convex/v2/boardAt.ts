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

