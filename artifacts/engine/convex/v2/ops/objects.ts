/** `objects.list`: the game's objects for the caller, in the caller's order (v1's sorts and filters: objectOrder.ts). */
import { disclosed } from "../disclose";
import { objectPage } from "../objectOrder";
import { defineOp, seated } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("objects.list", "query", async (env, a) => {
  const { game, member } = seated(env);
  const page = await objectPage(env.ctx, game, member._id, a.sort ?? "points", a.filter ?? "all", pageOf(a));
  // A knowledge row's points are already as told; a value row's are disclosed here (exact after the end).
  return { page: page.page.map(r => ({ objectId: r.objectId, number: r.number, bits: r.rarityBits, points: page.knowledge ? r.points : disclosed(game, r).points })), nextCursor: page.isDone ? null : page.continueCursor };
});
