/**
 * The server's binding of the affordance directory (docs/engine-v2/affordances.md §3): `defineOp(id, kind, handler)`
 * makes the one public Convex function of a server affordance and its internal twin (`<verb>As`, for the assistant,
 * MCP and CLI acting as a human). The caller's context comes from v2's own records (access.ts `resolveContext`), and
 * write receipts live in `v2Receipts`.
 *
 * `scoped(env)` gives a handler the room, game, member and player its context was derived from, read again in the
 * handler's own transaction.
 */
import { makeDefineOp, type Caller, type Delegate, type OpHost, type OpEnv, type OpKind, type OpScope } from "@workspace/v2-affordances/convex";
import { OpFailure, type OpOutcome, type ReceiptStore } from "@workspace/v2-affordances";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { DataModel } from "../../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../../_generated/server";
import { currentUser, resolveContext, userById, type Resolved } from "../access";

type Who = { session: true } | { delegate: Delegate };

/**
 * The caller as v2 resolves it: besides the directory's `Caller`, the scope it was resolved in (a bound credential's
 * room replaces whatever room it names) and, inside a query or mutation, the records that context came from, so a
 * handler acts on exactly what was checked, in the same transaction.
 */
export interface V2Caller extends Caller {
  scope: OpScope;
  /** The room a delegated credential is bound to (it acts there only), or null. */
  boundRoom: string | null;
  records?: Resolved;
}

async function resolveIn(ctx: QueryCtx, who: Who, scope: OpScope): Promise<V2Caller> {
  const user = "session" in who ? await currentUser(ctx) : await userById(ctx, who.delegate.userId);
  const boundRoom = "delegate" in who ? who.delegate.roomId : null;
  // A credential bound to one room acts in that room only, whatever it names.
  const bound = boundRoom ? { ...scope, roomId: boundRoom } : scope;
  const records = await resolveContext(ctx, user, bound, "delegate" in who ? who.delegate.grant : undefined);
  return { ctx: records.ctx, callerKey: user?.userId ?? "signed-out", userId: user?.userId ?? null, scope: bound, boundRoom, records };
}

const scopeV = v.object({ roomId: v.optional(v.string()), gameId: v.optional(v.string()), replay: v.optional(v.boolean()) });
const whoV = v.union(v.object({ session: v.literal(true) }), v.object({ delegate: v.any() }));

/** Actions have no database: they resolve through this query (the caller's auth identity carries over). */
export const resolveCaller = internalQuery({
  args: { who: whoV, scope: scopeV },
  handler: async (ctx, { who, scope }) => {
    const { records: _, ...caller } = await resolveIn(ctx, who as Who, scope);
    return caller;
  },
});

export const receiptGet = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<OpOutcome | null> => (await ctx.db.query("v2Receipts").withIndex("by_key", q => q.eq("key", key)).first())?.outcome ?? null,
});
export const receiptPut = internalMutation({
  args: { key: v.string(), outcome: v.any() },
  handler: async (ctx, { key, outcome }) => { await ctx.db.insert("v2Receipts", { key, outcome, at: Date.now() }); },
});

function receiptsIn(ctx: MutationCtx): ReceiptStore {
  return {
    get: async key => (await ctx.db.query("v2Receipts").withIndex("by_key", q => q.eq("key", key)).first())?.outcome as OpOutcome ?? null,
    put: async (key, outcome) => { await ctx.db.insert("v2Receipts", { key, outcome, at: Date.now() }); },
  };
}

// Referenced by path, not through the generated `internal`, whose type depends on every module that calls defineOp.
const RESOLVE = makeFunctionReference<"query", { who: Who; scope: OpScope }, V2Caller>("v2/ops/define:resolveCaller");
const RECEIPT_GET = makeFunctionReference<"query", { key: string }, OpOutcome | null>("v2/ops/define:receiptGet");
const RECEIPT_PUT = makeFunctionReference<"mutation", { key: string; outcome: OpOutcome }, null>("v2/ops/define:receiptPut");

export const host: OpHost<DataModel> = {
  resolve: async (ctx, who, scope) =>
    "db" in ctx ? resolveIn(ctx as QueryCtx, who, scope) : ctx.runQuery(RESOLVE, { who, scope }),
  receipts: ctx => "db" in ctx ? receiptsIn(ctx as MutationCtx) : {
    get: key => ctx.runQuery(RECEIPT_GET, { key }),
    put: async (key, outcome) => { await ctx.runMutation(RECEIPT_PUT, { key, outcome }); },
  },
};
export const defineOp = makeDefineOp<DataModel>(host);

export const callerOf = (env: { caller: Caller }) => env.caller as V2Caller;

/** The records a query or mutation handler's context was derived from (read in its own transaction). */
export function scoped<K extends "query" | "mutation">(env: OpEnv<DataModel, K>): Resolved {
  const records = callerOf(env).records;
  if (!records) throw new Error("scoped: a query or mutation resolves its caller in its own transaction");
  return records;
}
/** `scoped`, insisting on a room the caller is a member of / a game in it / a seat in that game. */
export function inRoom<K extends "query" | "mutation">(env: OpEnv<DataModel, K>) {
  const r = scoped(env);
  if (!r.room || !r.user) throw new OpFailure("No room in view.");
  if (!r.member) throw new OpFailure("Join the room first.");
  return { ...r, room: r.room, user: r.user, member: r.member };
}
export function inGame<K extends "query" | "mutation">(env: OpEnv<DataModel, K>) {
  const r = inRoom(env);
  if (!r.game) throw new OpFailure("No game in view.");
  return { ...r, game: r.game };
}
export function seated<K extends "query" | "mutation">(env: OpEnv<DataModel, K>) {
  const r = inGame(env);
  if (!r.player) throw new OpFailure("Only players with a seat in this game can do this.");
  return { ...r, member: r.member, player: r.player };
}

/** A server affordance whose handler lands in a later pull request (W3-3 … W3-8). */
export function notYet(pr: string): never {
  throw new OpFailure(`Not built yet: the server implements this in ${pr}.`);
}

export type { OpKind };
