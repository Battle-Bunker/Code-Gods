/**
 * Runs one directory affordance for a delegate (the in-client assistant, an AI seat) through the same internal twins an
 * MCP client or the CLI reaches: a server affordance by its declared kind, a view operation through `view:applyAs`.
 * Answers the result, or throws an Error whose message (with its fix) the model reads.
 */
import { AFFORDANCES, isAffordanceId, opKind, type OpOutcome } from "@workspace/v2-affordances";
import { opPath, outcomeOf, VIEW_OP_PATH, type Delegate } from "@workspace/v2-affordances/convex";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "../_generated/server";

export async function performAs(ctx: ActionCtx, delegate: Delegate, scope: { gameId?: string }, id: string, args: unknown): Promise<unknown> {
  const out = await outcomeAs(ctx, delegate, scope, id, args);
  if (!out.ok) throw new Error(`${out.error.message}${out.error.fix ? ` (${out.error.fix})` : ""}`);
  return out.result;
}

/** The same, answering the outcome (refusals and failures as values): what MCP's callTool needs. */
export async function outcomeAs(ctx: ActionCtx, delegate: Delegate, scope: { gameId?: string }, id: string, args: unknown): Promise<OpOutcome> {
  if (!isAffordanceId(id)) return { ok: false, error: { code: "unknown", message: `No tool ${id}` } };
  const a = AFFORDANCES[id];
  let out: OpOutcome;
  try {
    if (a.runs === "client") {
      out = await ctx.runMutation(makeFunctionReference<"mutation", Record<string, unknown>, OpOutcome>(VIEW_OP_PATH.internal), { id, args, delegate, ...scope });
    } else {
      const path = opPath(id).internal, input = { args, delegate, ...scope };
      const kind = opKind(a);
      out = kind === "query" ? await ctx.runQuery(makeFunctionReference<"query", typeof input, OpOutcome>(path), input)
        : kind === "mutation" ? await ctx.runMutation(makeFunctionReference<"mutation", typeof input, OpOutcome>(path), input)
        : await ctx.runAction(makeFunctionReference<"action", typeof input, OpOutcome>(path), input);
    }
  } catch (e) {
    const o = outcomeOf(e);
    if (!o) throw e;
    out = o as OpOutcome;
  }
  return out;
}
