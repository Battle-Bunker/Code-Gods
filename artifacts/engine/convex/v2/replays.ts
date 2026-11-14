/** An ended game's stored replay: the folded events as one file, written once at the end (spec §9.2). */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireGameMember } from "./access";
import { replayV } from "./validators";

export const stored = query({
  args: { gameId: v.string() },
  returns: replayV,
  handler: async (ctx, { gameId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    if (game.phase !== "ended" || !game.replayFile) return { stored: false, url: null };
    return { stored: true, url: await ctx.storage.getUrl(game.replayFile) };
  },
});
