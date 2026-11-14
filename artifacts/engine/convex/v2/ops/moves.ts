/** `moves.list`: moves that concern the caller (the act log, plan §2.3). */
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("moves.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const page = await env.ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
  return {
    page: page.page.map(m => ({
      seq: m.seq, objectId: m.objectId, agentId: m.agentId ?? null, mine: m.mine,
      calls: m.calls.map(c => ({ mutator: c.mutator, args: c.args, site: c.site })),
      pointsBefore: m.before.points, pointsAfter: m.after.points, charge: m.charge ?? null,
    })),
    nextCursor: page.isDone ? null : page.continueCursor,
  };
});
