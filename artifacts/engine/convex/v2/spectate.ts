/**
 * Spectators' queries (integration plan §2.2): every object's shared state, no rules, scores or values. Any member may
 * read them (a seated player's panes use `play.*`).
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireGameMember } from "./access";
import { objectAndState } from "./play";
import { spectateObjectV } from "./validators";

export const objectIds = query({
  args: { gameId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ objectId: v.id("v2Objects"), number: v.number() })),
  handler: async (ctx, { gameId, paginationOpts }) => {
    const { game } = await requireGameMember(ctx, gameId);
    const page = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", game._id)).paginate(paginationOpts);
    return { ...page, page: page.page.map(o => ({ objectId: o._id, number: o.number })) };
  },
});

export const object = query({
  args: { objectId: v.string() },
  returns: spectateObjectV,
  handler: async (ctx, { objectId }) => {
    const { object, state } = await objectAndState(ctx, objectId);
    await requireGameMember(ctx, object.gameId);
    return { objectId: object._id, number: object.number, bornAt: object.bornAt, state: state.state, version: state.version, changedAt: state.changedAt };
  },
});
