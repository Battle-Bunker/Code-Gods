/** `objects.list`: the game's objects for the caller, in the caller's order. */
import { disclosed } from "../disclose";
import { sortIndexOf } from "../play";
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("objects.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const index = sortIndexOf(game, a.sort === "recent" ? "recent" : a.sort === "rarity" ? "rarity" : "points");
  const page = await env.ctx.db.query("v2ObjectValues").withIndex(index, q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
  return { page: page.page.map(r => ({ objectId: r.objectId, number: r.number, bits: r.rarityBits, points: disclosed(game, r).points })), nextCursor: page.isDone ? null : page.continueCursor };
});
