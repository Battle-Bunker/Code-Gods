/**
 * Stop means stop: an in-client assistant turn's operations carry its id (Delegate.turnId), and every one checks, in
 * its own transaction, that the turn still runs. A Stop marks the turn "cancelling" first, so no write of that turn
 * can land after it, whatever was in flight. Light: no imports beyond the two packages and the data model.
 */
import { OpFailure } from "@workspace/v2-affordances";
import type { QueryCtx } from "../_generated/server";

export async function assertTurnRuns(ctx: QueryCtx, turnId: string | undefined | null) {
  if (!turnId) return;
  const id = ctx.db.normalizeId("v2AssistantTurns", turnId);
  const turn = id ? await ctx.db.get(id) : null;
  if (!turn || turn.status !== "running") throw new OpFailure("Stopped by the player.");
}
