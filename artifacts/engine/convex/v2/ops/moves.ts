/** `moves.list`: moves that concern the caller (the act log, plan §2.3). */
import { attributed, disclosed } from "../disclose";
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("moves.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const page = await env.ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
  return {
    page: page.page.map(m => ({
      seq: m.seq, objectId: m.objectId, number: m.number, agentId: attributed(game, m.mine) ? m.agentId ?? null : null, mine: m.mine,
      // Live, another player's move carries no calls (v1's public log).
      calls: attributed(game, m.mine) ? m.calls.map(c => ({ mutator: c.mutator, args: c.args, site: c.site })) : [],
      pointsBefore: disclosed(game, m.before).points, pointsAfter: disclosed(game, m.after).points, charge: attributed(game, m.mine) ? m.charge ?? null : null,
    })),
    nextCursor: page.isDone ? null : page.continueCursor,
  };
});
