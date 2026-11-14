/** `log.list`: the public log of every move in the game (v1's), for players and their assistants (play.ts `logPage`). */
import { logPage } from "../play";
import { defineOp, inGame } from "./define";
import { pageOf } from "./paging";

export const { op: list, as: listAs } = defineOp("log.list", "query", async (env, a) => {
  const { game, member } = inGame(env);
  const page = await logPage(env.ctx, game, member._id, pageOf(a));
  return { page: page.page, nextCursor: page.isDone ? null : page.continueCursor };
});
