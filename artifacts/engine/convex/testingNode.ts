"use node";
/**
 * Test fixtures that need Node (the sandbox): internal functions, refused unless DEV or TEST_FIXTURES is set, like
 * convex/testing.ts.
 */
import { v } from "convex/values";
import type { GameSettings, Language, ObjectValue } from "@workspace/game-core";
import { internalAction } from "./_generated/server";
import { ExaminationUnfinished, examineAgent } from "./engine/pricing";
import { bindRuntime } from "./engine/runtime";
import { fail } from "./lib/errors";

const dev = () => {
  if (process.env.DEV !== "1" && process.env.TEST_FIXTURES !== "1") fail("FORBIDDEN", "Testing functions need DEV=1 or TEST_FIXTURES=1");
};

/** One examination as a player's (the human lane), given `deadlineMs` from now: its estimate, or how far it got. */
export const examineWithin = internalAction({
  args: { settings: v.any(), language: v.string(), source: v.string(), live: v.array(v.union(v.number(), v.string())), deadlineMs: v.number() },
  handler: async (ctx, { settings, language, source, live, deadlineMs }) => {
    dev();
    await bindRuntime(ctx);
    try {
      const e = await examineAgent(ctx, settings as GameSettings, language as Language, source, live as ObjectValue[], { lane: "human", deadline: Date.now() + deadlineMs });
      return { finished: true as const, expectedActCost: e.expectedActCost, cost: e.cost };
    } catch (error) {
      if (error instanceof ExaminationUnfinished) return { finished: false as const, remembered: error.remembered };
      throw error;
    }
  },
});
