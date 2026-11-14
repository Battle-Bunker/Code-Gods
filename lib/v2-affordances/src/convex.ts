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
import { AFFORDANCES, opKind, type ServerAffordanceId } from "./directory.ts";
import { runOp, type Handler, type OpOutcome, type ReceiptStore } from "./server.ts";
import type { AffordanceContext, Grant } from "./types.ts";
import { applyView, type ViewState } from "./layout.ts";

/** query for reads; mutation for writes; action where the declaration says `action` (the sandbox or a model runs). */
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
    if (kind !== opKind(a)) throw new Error(`defineOp: ${id} is declared as a Convex ${opKind(a)}, not a ${kind}`);
    const run = async (ctx: CtxOf<DM, K>, who: { session: true } | { delegate: Delegate }, input: OpScope & { args: unknown }) => {
      const { args, ...scope } = input;
      const caller = await host.resolve(ctx as GenericQueryCtx<DM>, who, scope);
      const out = await runOp(a, handler as never, args, {
        ctx: caller.ctx, via: "delegate" in who ? who.delegate.via : "app", callerKey: caller.callerKey,
        env: { ctx, caller, scope }, receipts: kind === "query" ? undefined : host.receipts?.(ctx as GenericMutationCtx<DM>),
      });
      // A mutation is a transaction only if it throws: a handler's domain failure must undo what it wrote before it.
      // The client reads the outcome back from the error's data (`outcomeOf`).
      if (kind === "mutation" && !out.ok && out.error.code === "failed") throw new ConvexError(out as never);
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

/** What W3 supplies for view operations besides `OpHost`: where the human's view state lives (`v2Layouts`). */
export interface ViewHost<DM extends GenericDataModel> extends OpHost<DM> {
  loadView(ctx: GenericMutationCtx<DM>, caller: Caller, scope: OpScope): Promise<ViewState>;
  saveView(ctx: GenericMutationCtx<DM>, caller: Caller, scope: OpScope, view: ViewState): Promise<void>;
}

/**
 * The one server function for every view operation, so an assistant or MCP credential can change what the human sees:
 *   // convex/v2/ops/view.ts
 *   export const { op: apply, as: applyAs } = defineViewOps(host);
 * `op` takes `{id, args, roomId?, gameId?, replay?}` (a browser that wants its other clients to follow); `as` adds
 * `delegate`. Both run `applyView` (the same reducer and checks the browser runs) and save the result.
 */
export function defineViewOps<DM extends GenericDataModel>(host: ViewHost<DM>) {
  const run = async (ctx: GenericMutationCtx<DM>, who: { session: true } | { delegate: Delegate }, input: OpScope & { id: string; args: unknown }) => {
    const { id, args, ...scope } = input;
    const caller = await host.resolve(ctx, who, scope);
    const { outcome, view } = applyView(await host.loadView(ctx, caller, scope), id, args, caller.ctx, "delegate" in who ? who.delegate.via : "app");
    if (outcome.ok) await host.saveView(ctx, caller, scope, view);
    return outcome;
  };
  const args = { id: v.string(), args: v.any(), ...scopeArgs };
  return {
    op: mutationGeneric({ args, handler: (ctx: GenericMutationCtx<DM>, input: OpScope & { id: string; args: unknown }) => run(ctx, { session: true }, input) } as never),
    as: internalMutationGeneric({
      args: { ...args, delegate: delegateArg },
      handler: (ctx: GenericMutationCtx<DM>, { delegate, ...input }: OpScope & { id: string; args: unknown; delegate: Delegate }) => run(ctx, { delegate }, input),
    } as never),
  };
}

/** Where the view operations' functions live (`defineViewOps` under the layout convention). */
export const VIEW_OP_PATH = { public: "v2/ops/view:apply", internal: "v2/ops/view:applyAs" } as const;
