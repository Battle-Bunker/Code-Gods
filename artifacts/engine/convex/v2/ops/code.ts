/** `code.*`: run a read-only script over a game's data (v1's run_code, A15), and read the caller's own runs back. */
import { OpFailure } from "@workspace/v2-affordances";
import { makeFunctionReference } from "convex/server";
import { callerOf, defineOp } from "./define";
import { pageOf } from "./paging";

const RUN = makeFunctionReference<"action", Record<string, unknown>, Record<string, unknown> & { refused?: string }>("v2/codeRun:run");

export const { op: run, as: runAs } = defineOp("code.run", "action", async (env, a) => {
  const c = callerOf(env);
  const out = await env.ctx.runAction(RUN, { userId: c.userId!, scope: c.scope, language: a.language, source: a.source, dataset: a.dataset, ...(a.params !== undefined ? { params: a.params } : {}), ...(a.title ? { title: a.title } : {}) });
  if (out.refused) throw new OpFailure(out.refused);
  return out as never;
});

/** One of the caller's runs, whole (its result's JSON, its output and its source): one document. */
export const { op: get, as: getAs } = defineOp("code.get", "query", async (env, a) => {
  const id = env.ctx.db.normalizeId("v2CodeRuns", a.runId);
  const row = id ? await env.ctx.db.get(id) : null;
  if (!row || row.userId !== callerOf(env).userId) throw new OpFailure("No such run of yours.");
  return {
    runId: row._id, title: row.title, language: row.language, source: row.source, dataset: row.dataset, gameId: row.gameId ?? null,
    status: row.status, result: row.resultJson !== undefined ? JSON.parse(row.resultJson) : null, error: row.error ?? null, output: row.output, ms: row.ms, at: row.at,
  };
});

/** The caller's runs, newest first: one index page of titles and outcomes (code.get for one whole). */
export const { op: list, as: listAs } = defineOp("code.list", "query", async (env, a) => {
  const userId = callerOf(env).userId!;
  const page = await env.ctx.db.query("v2CodeRuns").withIndex("by_user_at", q => q.eq("userId", userId)).order("desc").paginate(pageOf(a));
  return {
    page: page.page.map(r => ({ runId: r._id, title: r.title, language: r.language, dataset: r.dataset, status: r.status, ms: r.ms, at: r.at })),
    nextCursor: page.isDone ? null : page.continueCursor,
  };
});
