/** `objects.list`: the game's objects for the caller, in the caller's order. */
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("objects.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const index = a.sort === "recent" ? "by_game_member_changed" : a.sort === "level" ? "by_game_member_rarity" : "by_game_member_points";
  const page = await env.ctx.db.query("v2ObjectValues").withIndex(index, q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
  return { page: page.page.map(r => ({ objectId: r.objectId, level: r.level, points: r.points })), nextCursor: page.isDone ? null : page.continueCursor };
});
