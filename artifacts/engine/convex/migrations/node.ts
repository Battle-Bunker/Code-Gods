"use node";
/** The Node half of the setups-v2 migration (convex/migrations.ts): the defence family ids come from game-utilities. */
import { familiesFor } from "@workspace/game-utilities";
import { OBJECT_TYPES } from "@workspace/game-types";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

/** Run every page of every phase; returns how many documents of each phase changed (all zero on a second run). */
export const setupsV2 = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const defenceIds = OBJECT_TYPES.flatMap(T => familiesFor(T.id, "penalty").map(f => f.id));
    const changed: Record<string, number> = { setups: 0, rooms: 0, games: 0 };
    type Step = { phase: "setups" | "rooms" | "games"; cursor: string | null };
    let next: Step | null = { phase: "setups", cursor: null };
    while (next) {
      const result: { next: Step | null; changed: number } = await ctx.runMutation(internal.migrations.setupsV2Page, { ...next, defenceIds });
      changed[next.phase] += result.changed;
      next = result.next;
    }
    return changed;
  },
});
