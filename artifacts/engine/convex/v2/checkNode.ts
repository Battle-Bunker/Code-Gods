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
import { readCharge } from "@workspace/v2-economy";

/**
 * v1's "estimate" (My agents: estimated against actual): what the program spent a turn on the check's sample acts, on
 * average, with the reading and the changing parts (as the commit splits an act's charge). Null with no sample act.
 */
export function estimateOf(acts: readonly { charge: number; readBits: number }[]): { perAct: number; read: number; change: number } | null {
  if (acts.length === 0) return null;
  const read = acts.reduce((t, a) => t + Math.min(a.charge, readCharge(a.readBits)), 0) / acts.length;
  const perAct = acts.reduce((t, a) => t + a.charge, 0) / acts.length;
  return { perAct, read, change: perAct - read };
}

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
      estimate: estimateOf(report.acts),
    };
  },
});

type EstimateContext = Omit<Exclude<Context, { refused: string } | null>, "current"> & { language: "typescript" | "python"; source: string };
const ESTIMATE_CONTEXT = makeFunctionReference<"query", { programId: string }, EstimateContext | null>("v2/checkData:estimateContext");
const SET_ESTIMATE = makeFunctionReference<"mutation", { programId: string; estimate: { perAct: number; read: number; change: number } | null }>("v2/checkData:setEstimate");

/**
 * After a human's summon or replace (agents.ts schedules it): the program's check, run in the background on the game's
 * objects against its owner's rule, stored on the program as its estimate. Nothing is charged.
 */
export const estimate = internalAction({
  args: { programId: v.string() },
  handler: async (ctx, { programId }) => {
    const c = await ctx.runQuery(ESTIMATE_CONTEXT, { programId });
    if (!c) return;
    const variant = variantOf(c.variant);
    const samples = c.samples.length > 0 ? c.samples.map(s => ({ objectId: s.objectId, state: decode(s.state, c.variant) }))
      : births(typeOf(c.variant), variant, `${c.seed}:check`, 3).map((state, i) => ({ objectId: `sample-${i + 1}`, state }));
    const report = await checkProgram(await sandboxFor(ctx, c.language), {
      type: typeOf(c.variant), variant, rule: c.rule, program: { language: c.language, source: c.source }, samples, energy: c.energy, priceScale: c.priceScale,
    });
    await ctx.runMutation(SET_ESTIMATE, { programId, estimate: estimateOf(report.acts) });
  },
});
