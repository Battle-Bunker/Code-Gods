"use node";
/**
 * `agent.check`'s sandbox half (Node): the program runs once on up to three of the game's objects (newborn samples
 * during planning) against the caller's rule, spending nothing, and the summon price is reported (lib/v2-agents check).
 */
import { births, check as checkProgram } from "@workspace/v2-agents";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { sandboxFor } from "./runtime";
import { editPriceOf } from "./pricing";
import { decode, typeOf, variantOf } from "./world";

type Context = {
  variant: string; seed: string; energy: number; priceScale: number; rule: { family: string; params: Record<string, unknown>; tieBreaker: string | null };
  samples: { objectId: string; state: string }[]; current: { language: "typescript" | "python"; source: string } | null;
} | { refused: string } | null;
const CONTEXT = makeFunctionReference<"query", Record<string, unknown>, Context>("v2/checkData:context");

export const check = internalAction({
  args: { userId: v.string(), scope: v.any(), language: v.union(v.literal("typescript"), v.literal("python")), source: v.string(), agentId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const c = await ctx.runQuery(CONTEXT, { userId: a.userId, scope: a.scope, ...(a.agentId ? { agentId: a.agentId } : {}) });
    if (!c) throw new Error("agent.check: no seat");
    if ("refused" in c) return { refused: c.refused };
    const variant = variantOf(c.variant);
    const samples = c.samples.length > 0 ? c.samples.map(s => ({ objectId: s.objectId, state: decode(s.state, c.variant) }))
      : births(typeOf(c.variant), variant, `${c.seed}:check`, 3).map((state, i) => ({ objectId: `sample-${i + 1}`, state }));
    const report = await checkProgram(await sandboxFor(ctx, a.language), {
      type: typeOf(c.variant), variant, rule: c.rule, program: { language: a.language, source: a.source }, samples, energy: c.energy, priceScale: c.priceScale,
    });
    return {
      verdict: report.verdict, summary: report.summary, price: report.price, sample: report.sample,
      editPrice: c.current ? editPriceOf(c.current, a.language, a.source, c.priceScale) : null,
    };
  },
});
