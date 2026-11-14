/**
 * `defineOp`: the only way to make a public v2 mutation or action (parity check 2). It binds one server affordance to
 * a Convex function and its internal twin:
 * - the public function (`op`) takes `{args, roomId?, gameId?, replay?}`; the app calls it through `useAffordance`
 *   with the room or game in view, and the caller is the signed-in session;
 * - the internal twin (`as`) takes the same plus `delegate`, the human an assistant or MCP credential acts for.
 * Both resolve the caller's context from the server's own records (the host's `resolve`, W3), validate the args with
 * the affordance's zod schema, apply `refusal`, answer a repeated `requestId` from the host's receipts, and check the
 * result against the declaration (`runOp`). Each returns an `OpOutcome`; refusals are values. A mutation whose handler
 * fails (`OpFailure`) throws a `ConvexError` carrying the outcome, so its writes roll back (`outcomeOf` reads it).
 *
 * Layout convention: `convex/v2/ops/<namespace>.ts` holds the affordances `<namespace>.*`, each as
 *   export const { op: <verb>, as: <verb>As } = defineOp("<namespace>.<verb>", "<kind>", handler);
 * so `opPath(id)` names its functions without a hand-written table.
 */
import {
  actionGeneric, internalActionGeneric, internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric,
  type GenericActionCtx, type GenericDataModel, type GenericMutationCtx, type GenericQueryCtx,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { AFFORDANCES, type ServerAffordanceId } from "./directory.ts";
import { runOp, type Handler, type OpOutcome, type ReceiptStore } from "./server.ts";
import type { AffordanceContext, Grant } from "./types.ts";

/** query for reads; mutation for writes; action where the sandbox or a model runs (check, summon, replace, pitch). */
export type OpKind = "query" | "mutation" | "action";
export type CtxOf<DM extends GenericDataModel, K extends OpKind> =
  K extends "query" ? GenericQueryCtx<DM> : K extends "mutation" ? GenericMutationCtx<DM> : GenericActionCtx<DM>;

/** What the app sends besides the args: the room or game in view. */
export interface OpScope { roomId?: string; gameId?: string; replay?: boolean }
/** The human an assistant or a credential acts for (the twin's caller). */
export interface Delegate { userId: string; roomId: string | null; grant?: Grant; via: "assistant" | "mcp" | "cli" }
/** The caller as the server resolved it. `callerKey` keys receipts (user id, or credential id). */
export interface Caller { ctx: AffordanceContext; callerKey: string; userId: string | null }

/** What W3 supplies: how to resolve a caller from the session or a delegate, and where receipts live. */
export interface OpHost<DM extends GenericDataModel> {
  resolve(ctx: GenericQueryCtx<DM> | GenericActionCtx<DM>, who: { session: true } | { delegate: Delegate }, scope: OpScope): Promise<Caller>;
  receipts?(ctx: GenericMutationCtx<DM> | GenericActionCtx<DM>): ReceiptStore;
}
export interface OpEnv<DM extends GenericDataModel, K extends OpKind> { ctx: CtxOf<DM, K>; caller: Caller; scope: OpScope }

/** The outcome of a defineOp call: its return value, or the failed outcome a rolled-back mutation threw. */
export function outcomeOf(e: unknown): OpOutcome | null {
  return e instanceof ConvexError && typeof e.data === "object" && e.data !== null && "ok" in e.data ? e.data as OpOutcome : null;
}

/** The public and internal function paths of an affordance under the layout convention. */
export function opPath(id: string): { public: string; internal: string } {
  const [ns, verb] = id.split(".") as [string, string];
  return { public: `v2/ops/${ns}:${verb}`, internal: `v2/ops/${ns}:${verb}As` };
}

const scopeArgs = { roomId: v.optional(v.string()), gameId: v.optional(v.string()), replay: v.optional(v.boolean()) };
const delegateArg = v.object({
  userId: v.string(), roomId: v.union(v.string(), v.null()),
  grant: v.optional(v.union(v.literal("read"), v.literal("act"), v.literal("owner"))),
  via: v.union(v.literal("assistant"), v.literal("mcp"), v.literal("cli")),
});

export function makeDefineOp<DM extends GenericDataModel>(host: OpHost<DM>) {
  return function defineOp<Id extends ServerAffordanceId, K extends OpKind>(id: Id, kind: K, handler: Handler<Id, OpEnv<DM, K>>) {
    const a = AFFORDANCES[id];
    if (!a || a.runs !== "server") throw new Error(`defineOp: ${id} is not a server affordance in the directory`);
    const run = async (ctx: CtxOf<DM, K>, who: { session: true } | { delegate: Delegate }, input: OpScope & { args: unknown }) => {
      const { args, ...scope } = input;
      const caller = await host.resolve(ctx as GenericQueryCtx<DM>, who, scope);
      const out = await runOp(a, handler as never, args, {
        ctx: caller.ctx, via: "delegate" in who ? who.delegate.via : "app", callerKey: caller.callerKey,
        env: { ctx, caller, scope }, receipts: kind === "query" ? undefined : host.receipts?.(ctx as GenericMutationCtx<DM>),
      });
      // A mutation is a transaction only if it throws: a handler's domain failure must undo what it wrote before it.
      // The client reads the outcome back from the error's data (`outcomeOf`).
      if (kind === "mutation" && !out.ok && out.error.code === "failed") throw new ConvexError(out);
      return out;
    };
    const pub = { args: { args: v.any(), ...scopeArgs }, handler: (ctx: CtxOf<DM, K>, input: OpScope & { args: unknown }) => run(ctx, { session: true }, input) };
    const twin = {
      args: { args: v.any(), ...scopeArgs, delegate: delegateArg },
      handler: (ctx: CtxOf<DM, K>, { delegate, ...input }: OpScope & { args: unknown; delegate: Delegate }) => run(ctx, { delegate }, input),
    };
    switch (kind) {
      case "query": return { id, kind, op: queryGeneric(pub as never), as: internalQueryGeneric(twin as never) };
      case "mutation": return { id, kind, op: mutationGeneric(pub as never), as: internalMutationGeneric(twin as never) };
      default: return { id, kind, op: actionGeneric(pub as never), as: internalActionGeneric(twin as never) };
    }
  };
}
