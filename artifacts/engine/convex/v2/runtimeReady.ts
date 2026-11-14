/** The warm-up's record (readiness.ts): a mutation the Node warm action calls when the boot succeeded or failed. */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { readinessOf, settleReadiness } from "./readiness";

/** A language's readiness, for an action about to need its sandbox (agent.check). */
export const status = internalQuery({
  args: { language: v.union(v.literal("typescript"), v.literal("python")) },
  handler: async (ctx, { language }) => await readinessOf(ctx, language),
});

export const settle = internalMutation({
  args: { language: v.union(v.literal("typescript"), v.literal("python")), version: v.string(), ok: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, a) => { await settleReadiness(ctx, a.language, a.version, a.ok, a.reason); },
});
