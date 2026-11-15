/** `objects.list`: the game's objects for the caller, in the caller's order. */
import { disclosed } from "../disclose";
import { sortIndexOf } from "../play";
import { KNOWLEDGE_SORT, readsKnowledge } from "../knowledge";
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("objects.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const sort = a.sort === "recent" ? "recent" : a.sort === "rarity" ? "rarity" : "points";
  // Paid observation (knowledge.ts): the same sorts over what the player was told.
  if (readsKnowledge(game, member._id)) {
    const known = await env.ctx.db.query("v2Knowledge").withIndex(KNOWLEDGE_SORT[sort], q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
    return { page: known.page.map(r => ({ objectId: r.objectId, number: r.number, bits: r.rarityBits, points: r.points })), nextCursor: known.isDone ? null : known.continueCursor };
  }
  const index = sortIndexOf(game, sort);
  const page = await env.ctx.db.query("v2ObjectValues").withIndex(index, q => q.eq("gameId", game._id).eq("memberId", member._id)).order("desc").paginate(pageOf(a));
  return { page: page.page.map(r => ({ objectId: r.objectId, number: r.number, bits: r.rarityBits, points: disclosed(game, r).points })), nextCursor: page.isDone ? null : page.continueCursor };
});
