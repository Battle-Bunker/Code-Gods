/** `receipt.*`: a command's receipt. */
import { callerOf, defineOp } from "./define";

/**
 * A command's receipt (v1's "Check a command's status…"): the caller's own only, by the requestId the command was sent
 * with (define.ts receiptRow; one index point read). Only a completed write leaves one: "not applied" means it never
 * arrived, was refused or failed, and the same command may be sent again with the same requestId.
 */
export const { op: get, as: getAs } = defineOp("receipt.get", "query", async (env, a) => {
  const callerKey = callerOf(env).callerKey;
  const row = await env.ctx.db.query("v2Receipts").withIndex("by_caller_request", q => q.eq("callerKey", callerKey).eq("requestId", a.id)).first();
  const outcome = row?.outcome as { ok: boolean; result?: unknown } | undefined;
  return outcome?.ok ? { applied: true, operation: row!.operation ?? null, result: outcome.result ?? null } : { applied: false, operation: null, result: null };
});
